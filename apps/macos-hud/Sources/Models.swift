import Foundation

// MARK: - Unified Settings (~/.codesight/config.json, shared with Agent MCP Plugins & CLI)

struct BYOKLLMConfig: Codable, Sendable, Equatable {
    var enabled: Bool
    var baseUrl: String
    var apiKey: String
    var model: String

    static let `default` = BYOKLLMConfig(
        enabled: false,
        baseUrl: "https://api.openai.com/v1",
        apiKey: "",
        model: "gpt-4o-mini"
    )
}

struct HUDWindowConfig: Codable, Sendable, Equatable {
    var alwaysOnTop: Bool
    var opacity: Double

    static let `default` = HUDWindowConfig(alwaysOnTop: true, opacity: 0.96)
}

struct UnifiedCodeSightConfig: Codable, Sendable, Equatable {
    var schemaVersion: String
    var language: String
    var dashedLines: String
    var collapsedByDefault: Bool?
    var autoOpenBrowser: Bool
    var silentRegressionGuard: Bool
    var architectureMode: String
    var llm: BYOKLLMConfig
    var hud: HUDWindowConfig

    static let `default` = UnifiedCodeSightConfig(
        schemaVersion: "1.0",
        language: "zh",
        dashedLines: "always",
        collapsedByDefault: false,
        autoOpenBrowser: false,
        silentRegressionGuard: true,
        architectureMode: "auto",
        llm: .default,
        hud: .default
    )
}

// MARK: - Repo Map (`map`)

struct RepoMapDTO: Codable, Sendable {
    let repoName: String
    let rootDir: String
    let providerName: String
    let totalFiles: Int
    let totalSymbols: Int
    let reindexedFiles: Int
    let cachedFiles: Int
    let scanMs: Int
    let embeddingMode: String
    let hubs: [HubItemDTO]
    let sections: [MapSectionDTO]
}

struct HubItemDTO: Codable, Sendable, Identifiable {
    var id: String { path }
    let path: String
    let roleLabel: String
    let summary: String
    let downstreamReach: Int
}

struct MapSectionDTO: Codable, Sendable, Identifiable {
    var id: String { layer }
    let layer: String
    let layerTitle: String
    let files: [MapFileDTO]
}

struct MapFileDTO: Codable, Sendable, Identifiable {
    var id: String { path }
    let path: String
    let name: String
    let roleLabel: String
    let summary: String
    let inDegree: Int
    let outDegree: Int
    let downstreamReach: Int
    let isHub: Bool
    let exports: [String]
    let symbolCount: Int
}

// MARK: - Ask (`ask`)

struct AskResultDTO: Codable, Sendable {
    let repoName: String
    let question: String
    let aiAnswer: String?
    let llmUsed: Bool?
    let llmModel: String?
    let hits: [RetrievalHitDTO]
    let primaryBlastRadius: BlastRadiusDTO?
    let retrievalMs: Int
    let wholeRepoTokens: Int
    let retrievedSliceTokens: Int
    let savedPercent: Double
    let embeddingMode: String
}

struct RetrievalHitDTO: Codable, Sendable, Identifiable {
    var id: String { file.path }
    let file: IndexedFileDTO
    let totalScore: Double
    let bm25Score: Double
    let vectorScore: Double
    let graphBoost: Double
    let exactBoost: Double
    let matchReasons: [String]
}

struct IndexedFileDTO: Codable, Sendable, Identifiable {
    var id: String { path }
    let path: String
    let name: String
    let roleLabel: String
    let summary: String
    let exports: [String]
}

// MARK: - Trace (`trace`)

struct SymbolTraceDTO: Codable, Sendable {
    let repoName: String
    let querySymbol: String
    let matches: [SymbolMatchDTO]
    let traceMs: Int
}

struct SymbolMatchDTO: Codable, Sendable, Identifiable {
    var id: String { symbol.id }
    let symbol: ParsedSymbolDTO
    let fileRole: String
    let calledBy: [SymbolCallEdgeDTO]
    let callsOut: [SymbolCallEdgeDTO]
}

struct ParsedSymbolDTO: Codable, Sendable, Identifiable {
    let id: String
    let name: String
    let kind: String
    let file: String
    let startLine: Int
    let endLine: Int
    let exported: Bool
    let signature: String
}

struct SymbolCallEdgeDTO: Codable, Sendable, Identifiable {
    var id: String { "\(callerSymbolId)->\(calleeSymbolId):\(callerLine)" }
    let callerSymbolId: String
    let callerName: String
    let callerFile: String
    let callerLine: Int
    let calleeSymbolId: String
    let calleeName: String
    let calleeFile: String
    let calleeLine: Int
}

// MARK: - Diagnose (`diagnose`)

struct DiagnoseReportDTO: Codable, Sendable {
    let repoName: String
    let rootDir: String
    let providerName: String
    let querySummary: String
    let primaryTarget: PrimaryTargetDTO?
    let plainDiagnosis: String
    let aiSummary: String?
    let blastRadius: BlastRadiusDTO?
    let symbolCallers: [SymbolCallEdgeDTO]
    let silentRegressions: [SilentRegressionDTO]
    let directions: [FixDirectionDTO]
    let tokenEconomy: TokenEconomyDTO
}

struct PrimaryTargetDTO: Codable, Sendable {
    let file: IndexedFileDTO
    let line: Int?
    let symbol: ParsedSymbolDTO?
    let reason: String
}

struct BlastRadiusDTO: Codable, Sendable {
    let origin: String
    let originNode: IndexedFileDTO
    let directImpact: [IndexedFileDTO]
    let indirectImpact: [IndexedFileDTO]
    let upstreamDependencies: [IndexedFileDTO]
    let safeZoneCount: Int
    let riskLevel: String
}

struct SilentRegressionDTO: Codable, Sendable, Identifiable {
    var id: String { "\(patternTag)-\(file)-\(title)" }
    let patternTag: String
    let file: String
    let title: String
    let before: String
    let after: String
    let riskImpact: String
}

struct FixDirectionDTO: Codable, Sendable, Identifiable {
    let id: String
    let label: String
    let strategy: String
    let affectedFilesCount: Int
    let tradeoff: String
    let recommended: Bool?
    let surgicalPrompt: String
}

struct TokenEconomyDTO: Codable, Sendable {
    let wholeRepoTokens: Int
    let retrievedSliceTokens: Int
    let savedPercent: Double
    let retrievalMs: Int
    let embeddingMode: String
    let llmUsed: Bool?
    let llmModel: String?
}

struct RefreshPrototypesResponseDTO: Codable, Sendable {
    let ok: Bool
    let needsLlmConfig: Bool?
    let source: String?
    let modelName: String?
    let prototypeCount: Int?
    let error: String?
}
