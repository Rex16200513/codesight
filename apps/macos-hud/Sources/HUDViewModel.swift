import AppKit
import Foundation
import SwiftUI

enum HUDTab: String, CaseIterable, Identifiable {
    case map = "map"
    case ask = "ask"
    case diagnose = "diagnose"

    var id: String { rawValue }

    func title(english: Bool) -> String {
        switch self {
        case .map: return english ? "Map" : "地图"
        case .ask: return english ? "Ask" : "问代码"
        case .diagnose: return english ? "Diagnose" : "排错"
        }
    }

    var symbol: String {
        switch self {
        case .map: return "map"
        case .ask: return "magnifyingglass"
        case .diagnose: return "waveform.path.ecg"
        }
    }
}

@MainActor
final class HUDViewModel: ObservableObject {
    let bridge = EngineBridge()

    @Published var repoDir: String
    @Published var activeTab: HUDTab = .map
    @Published var showSettings: Bool = false
    @Published var isCollapsed: Bool = false
    @Published var isLoading: Bool = false
    @Published var sidecarOnline: Bool = false
    @Published var errorMessage: String?

    // Unified Settings (~/.codesight/config.json — synced with Agent MCP plugins & CLI)
    @Published var config: UnifiedCodeSightConfig {
        didSet {
            saveUnifiedConfig()
            onWindowSettingsChanged?(config.hud.alwaysOnTop, config.hud.opacity)
        }
    }

    var isEnglish: Bool { config.language == "en" }

    var llmConfig: BYOKLLMConfig {
        get { config.llm }
        set { config.llm = newValue }
    }

    // Map state
    @Published var repoMap: RepoMapDTO?
    @Published var expandedLayers: Set<String> = ["core-logic"]
    @Published var isRefreshingPrototypes: Bool = false
    @Published var prototypeStatusMessage: String?

    // Ask & Trace state
    @Published var askQuery: String = ""
    @Published var askResult: AskResultDTO?
    @Published var traceResult: SymbolTraceDTO?

    // Diagnose state
    @Published var diagnoseInput: String = ""
    @Published var showManualInput: Bool = false
    @Published var diagnoseReport: DiagnoseReportDTO?
    @Published var selectedDirectionId: String?
    @Published var copiedToast: Bool = false

    var onCollapseChanged: ((Bool) -> Void)?
    var onCloseRequested: (() -> Void)?
    var onWindowSettingsChanged: ((Bool, Double) -> Void)?

    private static var configFileURL: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".codesight", isDirectory: true)
            .appendingPathComponent("config.json")
    }

    init() {
        self.repoDir = bridge.defaultRepoRoot
        if let data = try? Data(contentsOf: Self.configFileURL),
           let decoded = try? JSONDecoder().decode(UnifiedCodeSightConfig.self, from: data) {
            self.config = decoded
        } else {
            self.config = .default
        }

        Task {
            sidecarOnline = await bridge.checkSidecarHealth()
            await loadMap()
        }
    }

    private func saveUnifiedConfig() {
        let url = Self.configFileURL
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        if let data = try? encoder.encode(config) {
            try? data.write(to: url, options: .atomic)
        }
    }

    func openInteractiveBoardInBrowser() {
        let encoded = repoDir.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        if let url = URL(string: "http://127.0.0.1:4317/?repo=\(encoded)") {
            NSWorkspace.shared.open(url)
        }
    }

    var repoDisplayName: String {
        repoMap?.repoName ?? URL(fileURLWithPath: repoDir).lastPathComponent
    }

    func toggleCollapsed() {
        isCollapsed.toggle()
        onCollapseChanged?(isCollapsed)
    }

    func requestClose() {
        onCloseRequested?()
    }

    func pickRepositoryFolder() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.prompt = "选择项目"
        panel.message = "选择本地代码仓库，CodeSight 将秒级建立人话结构地图"
        panel.directoryURL = URL(fileURLWithPath: repoDir)

        NSApp.activate(ignoringOtherApps: true)
        if panel.runModal() == .OK, let url = panel.url {
            repoDir = url.path
            askResult = nil
            traceResult = nil
            diagnoseReport = nil
            Task { await loadMap() }
        }
    }

    func loadMap() async {
        isLoading = true
        errorMessage = nil
        sidecarOnline = await bridge.checkSidecarHealth()
        do {
            repoMap = try await bridge.fetchMap(repoDir: repoDir)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func refreshUIPrototypesWithLLM() async {
        guard !isRefreshingPrototypes else { return }
        isRefreshingPrototypes = true
        errorMessage = nil
        prototypeStatusMessage = nil
        sidecarOnline = await bridge.checkSidecarHealth()
        do {
            guard let res = try await bridge.refreshPrototypes(repoDir: repoDir) else {
                errorMessage = isEnglish
                    ? "Start local Sidecar (`codesight serve`) first to refresh UI prototypes."
                    : "请先启动本地 Sidecar（codesight serve），即可一键用 LLM 刷新 UI 原型。"
                isRefreshingPrototypes = false
                return
            }
            if res.needsLlmConfig == true {
                showSettings = true
                errorMessage = res.error ?? (isEnglish ? "Enable BYOK LLM in Settings first." : "请先在设置中启用小模型（BYOK）。")
            } else if res.ok {
                let count = res.prototypeCount ?? 0
                let model = res.modelName ?? config.llm.model
                prototypeStatusMessage = isEnglish
                    ? "Refreshed \(count) UI wireframes via \(model)"
                    : "已用 \(model) 生成 / 刷新 \(count) 个 UI 原型示意图"
                await loadMap()
            } else {
                errorMessage = res.error ?? (isEnglish ? "Failed to refresh UI prototypes." : "UI 原型刷新失败，请检查模型配置。")
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isRefreshingPrototypes = false
    }

    func submitAsk(_ overrideQuery: String? = nil) async {
        let q = (overrideQuery ?? askQuery).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        askQuery = q
        isLoading = true
        errorMessage = nil
        traceResult = nil
        do {
            if q.lowercased().hasPrefix("trace ") {
                let sym = String(q.dropFirst(6)).trimmingCharacters(in: .whitespaces)
                traceResult = try await bridge.trace(repoDir: repoDir, symbol: sym)
                askResult = nil
            } else {
                askResult = try await bridge.ask(repoDir: repoDir, question: q, llmConfig: llmConfig)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func runTrace(symbol: String) async {
        showSettings = false
        activeTab = .ask
        askQuery = "trace \(symbol)"
        isLoading = true
        errorMessage = nil
        do {
            traceResult = try await bridge.trace(repoDir: repoDir, symbol: symbol)
            askResult = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func diagnoseFromClipboard() async {
        let text = NSPasteboard.general.string(forType: .string)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !text.isEmpty else {
            errorMessage = "剪贴板为空，请先复制一段终端报错或代码栈"
            return
        }
        diagnoseInput = text
        await runDiagnose(errorText: text)
    }

    func runDiagnose(errorText: String? = nil) async {
        let payload = (errorText ?? diagnoseInput).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !payload.isEmpty else { return }
        isLoading = true
        errorMessage = nil
        do {
            let report = try await bridge.diagnoseError(repoDir: repoDir, errorText: payload, llmConfig: llmConfig)
            diagnoseReport = report
            selectedDirectionId = report.directions.first(where: { $0.recommended == true })?.id ?? report.directions.first?.id
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func runDiagnoseGitDiff() async {
        isLoading = true
        errorMessage = nil
        do {
            let report = try await bridge.diagnoseGitDiff(repoDir: repoDir, llmConfig: llmConfig)
            diagnoseReport = report
            selectedDirectionId = report.directions.first(where: { $0.recommended == true })?.id ?? report.directions.first?.id
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func copySelectedPrompt() {
        guard let report = diagnoseReport else { return }
        let chosen = report.directions.first(where: { $0.id == selectedDirectionId }) ?? report.directions.first
        let prompt = chosen?.surgicalPrompt ?? report.plainDiagnosis
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(prompt, forType: .string)
        copiedToast = true
        Task {
            try? await Task.sleep(for: .seconds(1.8))
            copiedToast = false
        }
    }
}
