import Foundation

enum EngineBridgeError: LocalizedError {
    case cliNotFound(String)
    case nodeNotFound
    case executionFailed(String)
    case invalidJSON(String)

    var errorDescription: String? {
        switch self {
        case .cliNotFound(let p): return "找不到 GlassBox CLI：\(p)"
        case .nodeNotFound: return "未找到 Node.js 运行环境（需要 Node >= 20）"
        case .executionFailed(let msg): return "引擎执行失败：\(msg)"
        case .invalidJSON(let msg): return "引擎输出解析失败：\(msg)"
        }
    }
}

/// Thin async bridge to `@glassbox/cli --json`.
/// Zero parsing or GraphRAG logic lives in Swift — upgrades to `@glassbox/core/engine` flow straight into this HUD.
final class EngineBridge: Sendable {
    let nodeExecutable: String
    let cliScriptPath: String
    let defaultRepoRoot: String

    init() {
        let info = Bundle.main.infoDictionary ?? [:]
        let env = ProcessInfo.processInfo.environment

        let candidatesNode = [
            env["GLASSBOX_NODE"],
            info["GlassBoxNodePath"] as? String,
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node",
        ].compactMap { $0 }

        self.nodeExecutable = candidatesNode.first { FileManager.default.isExecutableFile(atPath: $0) }
            ?? "/opt/homebrew/bin/node"

        let configuredRoot =
            env["GLASSBOX_ENGINE_ROOT"]
            ?? (info["GlassBoxEngineRoot"] as? String)
            ?? FileManager.default.currentDirectoryPath

        self.defaultRepoRoot = configuredRoot
        self.cliScriptPath = (configuredRoot as NSString).appendingPathComponent("packages/cli/src/cli.ts")
    }

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
                let preview = String(data: outData.prefix(240), encoding: .utf8) ?? ""
                throw EngineBridgeError.invalidJSON("\(error.localizedDescription) | \(preview)")
            }
        }.value
    }

    func fetchMap(repoDir: String) async throws -> RepoMapDTO {
        try await runCLI(arguments: ["map", repoDir], as: RepoMapDTO.self)
    }

    func ask(repoDir: String, question: String) async throws -> AskResultDTO {
        try await runCLI(arguments: ["ask", question, repoDir], as: AskResultDTO.self)
    }

    func trace(repoDir: String, symbol: String) async throws -> SymbolTraceDTO {
        try await runCLI(arguments: ["trace", symbol, repoDir], as: SymbolTraceDTO.self)
    }

    func diagnoseError(repoDir: String, errorText: String) async throws -> DiagnoseReportDTO {
        try await runCLI(arguments: ["diagnose", repoDir], stdinText: errorText, as: DiagnoseReportDTO.self)
    }

    func diagnoseGitDiff(repoDir: String) async throws -> DiagnoseReportDTO {
        try await runCLI(arguments: ["diagnose", "--git", repoDir], as: DiagnoseReportDTO.self)
    }
}
