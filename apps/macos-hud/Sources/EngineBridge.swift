import Foundation

enum EngineBridgeError: LocalizedError {
    case cliNotFound(String)
    case nodeNotFound
    case executionFailed(String)
    case invalidJSON(String)

    var errorDescription: String? {
        switch self {
        case .cliNotFound(let p): return "找不到 CodeSight CLI：\(p)"
        case .nodeNotFound: return "未找到 Node.js 运行环境（需要 Node >= 20）"
        case .executionFailed(let msg): return "引擎执行失败：\(msg)"
        case .invalidJSON(let msg): return "响应解析失败：\(msg)"
        }
    }
}

/// Sidecar-First + Isolated CLI Fallback Bridge.
/// 1. Prefers local CodeSight Sidecar (`http://127.0.0.1:4317`) — 5ms warm response, zero macOS TCC permission popups!
/// 2. Falls back cleanly to isolated CLI if Sidecar is not running.
final class EngineBridge: Sendable {
    let nodeExecutable: String
    let cliScriptPath: String
    let defaultRepoRoot: String
    let sidecarBaseURL: String

    init() {
        let info = Bundle.main.infoDictionary ?? [:]
        let env = ProcessInfo.processInfo.environment

        let candidatesNode = [
            env["CODESIGHT_NODE"],
            info["CodeSightNodePath"] as? String,
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node",
        ].compactMap { $0 }

        self.nodeExecutable = candidatesNode.first { FileManager.default.isExecutableFile(atPath: $0) }
            ?? "/opt/homebrew/bin/node"

        let configuredRoot =
            env["CODESIGHT_ENGINE_ROOT"]
            ?? (info["CodeSightEngineRoot"] as? String)
            ?? FileManager.default.currentDirectoryPath

        self.defaultRepoRoot = configuredRoot
        self.cliScriptPath = (configuredRoot as NSString).appendingPathComponent("packages/cli/src/cli.ts")
        self.sidecarBaseURL = env["CODESIGHT_SIDECAR_URL"] ?? "http://127.0.0.1:4317"
    }

    // MARK: - Sidecar HTTP Transport (Zero TCC, Warm Memory)

    private func postSidecar<Req: Encodable, Res: Decodable>(
        path: String,
        body: Req,
        as type: Res.Type
    ) async throws -> Res? {
        guard let url = URL(string: "\(sidecarBaseURL)\(path)") else { return nil }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 15
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(body)

        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                return nil
            }
            return try JSONDecoder().decode(Res.self, from: data)
        } catch {
            // Sidecar not reachable -> let caller fall back smoothly to CLI
            return nil
        }
    }

    func checkSidecarHealth() async -> Bool {
        guard let url = URL(string: "\(sidecarBaseURL)/api/health") else { return false }
        var req = URLRequest(url: url)
        req.timeoutInterval = 1.2
        do {
            let (_, resp) = try await URLSession.shared.data(for: req)
            return (resp as? HTTPURLResponse)?.statusCode == 200
        } catch {
            return false
        }
    }

    // MARK: - Isolated CLI Fallback Transport

    private func runCLI<T: Decodable & Sendable>(
        arguments: [String],
        stdinText: String? = nil,
        as type: T.Type
    ) async throws -> T {
        guard FileManager.default.isExecutableFile(atPath: nodeExecutable) else {
            throw EngineBridgeError.nodeNotFound
        }
        guard FileManager.default.fileExists(atPath: cliScriptPath) else {
            throw EngineBridgeError.cliNotFound(cliScriptPath)
        }

        let nodePath = self.nodeExecutable
        let scriptPath = self.cliScriptPath

        return try await Task.detached(priority: .userInitiated) {
            let proc = Process()
            proc.executableURL = URL(fileURLWithPath: nodePath)
            proc.arguments = ["--experimental-strip-types", scriptPath] + arguments + ["--json"]

            let outPipe = Pipe()
            let errPipe = Pipe()
            proc.standardOutput = outPipe
            proc.standardError = errPipe

            if let input = stdinText {
                let inPipe = Pipe()
                proc.standardInput = inPipe
                try proc.run()
                if let data = input.data(using: .utf8) {
                    inPipe.fileHandleForWriting.write(data)
                }
                inPipe.fileHandleForWriting.closeFile()
            } else {
                try proc.run()
            }

            let outData = outPipe.fileHandleForReading.readDataToEndOfFile()
            let errData = errPipe.fileHandleForReading.readDataToEndOfFile()
            proc.waitUntilExit()

            if proc.terminationStatus != 0 {
                let errStr = String(data: errData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "exit \(proc.terminationStatus)"
                throw EngineBridgeError.executionFailed(errStr)
            }

            do {
                return try JSONDecoder().decode(T.self, from: outData)
            } catch {
                let preview = String(data: outData.prefix(220), encoding: .utf8) ?? ""
                throw EngineBridgeError.invalidJSON("\(error.localizedDescription) | \(preview)")
            }
        }.value
    }

    // MARK: - Public Operations

    func fetchMap(repoDir: String) async throws -> RepoMapDTO {
        struct MapReq: Encodable { let repoDir: String }
        if let res = try await postSidecar(path: "/api/map", body: MapReq(repoDir: repoDir), as: RepoMapDTO.self) {
            return res
        }
        return try await runCLI(arguments: ["map", repoDir], as: RepoMapDTO.self)
    }

    func ask(repoDir: String, question: String, llmConfig: BYOKLLMConfig) async throws -> AskResultDTO {
        struct AskReq: Encodable {
            let repoDir: String
            let question: String
            let llmConfig: BYOKLLMConfig
        }
        if let res = try await postSidecar(
            path: "/api/ask",
            body: AskReq(repoDir: repoDir, question: question, llmConfig: llmConfig),
            as: AskResultDTO.self
        ) {
            return res
        }
        return try await runCLI(arguments: ["ask", question, repoDir], as: AskResultDTO.self)
    }

    func trace(repoDir: String, symbol: String) async throws -> SymbolTraceDTO {
        struct TraceReq: Encodable { let repoDir: String; let symbol: String }
        if let res = try await postSidecar(path: "/api/trace", body: TraceReq(repoDir: repoDir, symbol: symbol), as: SymbolTraceDTO.self) {
            return res
        }
        return try await runCLI(arguments: ["trace", symbol, repoDir], as: SymbolTraceDTO.self)
    }

    func diagnoseError(repoDir: String, errorText: String, llmConfig: BYOKLLMConfig) async throws -> DiagnoseReportDTO {
        struct DiagReq: Encodable {
            let repoDir: String
            let rawError: String
            let useGit: Bool
            let llmConfig: BYOKLLMConfig
        }
        if let res = try await postSidecar(
            path: "/api/diagnose",
            body: DiagReq(repoDir: repoDir, rawError: errorText, useGit: false, llmConfig: llmConfig),
            as: DiagnoseReportDTO.self
        ) {
            return res
        }
        return try await runCLI(arguments: ["diagnose", repoDir], stdinText: errorText, as: DiagnoseReportDTO.self)
    }

    func diagnoseGitDiff(repoDir: String, llmConfig: BYOKLLMConfig) async throws -> DiagnoseReportDTO {
        struct DiagReq: Encodable {
            let repoDir: String
            let useGit: Bool
            let llmConfig: BYOKLLMConfig
        }
        if let res = try await postSidecar(
            path: "/api/diagnose",
            body: DiagReq(repoDir: repoDir, useGit: true, llmConfig: llmConfig),
            as: DiagnoseReportDTO.self
        ) {
            return res
        }
        return try await runCLI(arguments: ["diagnose", "--git", repoDir], as: DiagnoseReportDTO.self)
    }
}
