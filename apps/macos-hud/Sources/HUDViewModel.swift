import AppKit
import Foundation
import SwiftUI

enum HUDTab: String, CaseIterable, Identifiable {
    case map = "地图"
    case ask = "问代码"
    case diagnose = "排错"
    var id: String { rawValue }
}

@MainActor
final class HUDViewModel: ObservableObject {
    let bridge = EngineBridge()

    @Published var repoDir: String
    @Published var activeTab: HUDTab = .map
    @Published var isCollapsed: Bool = false
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    // Map state
    @Published var repoMap: RepoMapDTO?
    @Published var expandedLayers: Set<String> = ["core-logic"]

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

    // Callback hooked by HUDPanelController to smoothly animate window frame resize
    var onCollapseChanged: ((Bool) -> Void)?

    init() {
        self.repoDir = bridge.defaultRepoRoot
        Task {
            await loadMap()
        }
    }

    var repoDisplayName: String {
        repoMap?.repoName ?? URL(fileURLWithPath: repoDir).lastPathComponent
    }

    func toggleCollapsed() {
        isCollapsed.toggle()
        onCollapseChanged?(isCollapsed)
    }

    func pickRepositoryFolder() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.prompt = "选择项目目录"
        panel.message = "选择一个本地代码仓库，GlassBox 将用 GraphRAG 秒级建立人话地图"
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
        do {
            repoMap = try await bridge.fetchMap(repoDir: repoDir)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
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
                askResult = try await bridge.ask(repoDir: repoDir, question: q)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func runTrace(symbol: String) async {
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
            let report = try await bridge.diagnoseError(repoDir: repoDir, errorText: payload)
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
            let report = try await bridge.diagnoseGitDiff(repoDir: repoDir)
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
