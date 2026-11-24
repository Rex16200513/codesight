/**
 * CodeSight Canonical Schema v1
 *
 * Designed as a host-agnostic, zero-dependency protocol contract.
 * Any renderer (Browser HUD, Codex/Orca Webview, VS Code Extension, MCP App ui://)
 * consumes this exact DiagnosticBundle structure.
 */

export type Severity = 'critical' | 'warning' | 'info';

export type CardKind = 'ripple' | 'silent_regression' | 'mental_model';

export interface SourceLocation {
  file: string;
  line?: number;
  column?: number;
  symbol?: string;
}

export interface ImpactNode {
  id: string;
  file: string;
  symbol: string;
  line?: number;
  role: 'root' | 'downstream' | 'upstream';
  reason: string;
  severity: Severity;
}

export interface ActionOption {
  id: string;
  label: string;
  strategy: string;
  tradeoff: string;
  recommended?: boolean;
  /** Surgical instruction fragment assembled into the final agent fix prompt */
  promptDirective: string;
}

export interface RippleCardData {
  id: string;
  kind: 'ripple';
  severity: Severity;
  badge: string;
  title: string;
  plainSummary: string;
  origin: SourceLocation;
  contractDiff: {
    label: string;
    expected: string;
    actual: string;
  };
  ripples: ImpactNode[];
  actions: ActionOption[];
}

export interface SilentRegressionCardData {
  id: string;
  kind: 'silent_regression';
  severity: Severity;
  badge: string;
  title: string;
  plainSummary: string;
  location: SourceLocation;
  patternTag:
    | 'REMOVED_GUARD'
    | 'SWALLOWED_ERROR'
    | 'HARDCODED_FALLBACK'
    | 'TYPE_ESCAPE_HATCH'
    | 'ASYNC_RACE';
  behaviorShift: {
    before: string;
    after: string;
  };
  evidenceSnippet: string;
  riskImpact: string;
  actions: ActionOption[];
}

export interface TopologyNode {
  id: string;
  label: string;
  sublabel: string;
  file: string;
  line?: number;
  status: 'healthy' | 'fault' | 'affected' | 'guard_removed';
}

export interface MentalModelCardData {
  id: string;
  kind: 'mental_model';
  badge: string;
  title: string;
  narrative: string;
  flow: TopologyNode[];
  keyTakeaway: string;
}

export type DiagnosticCard =
  | RippleCardData
  | SilentRegressionCardData
  | MentalModelCardData;

export interface TokenTelemetry {
  rawInputTokens: number;
  staticPrunedTokens: number;
  llmPromptTokens: number;
  llmCompletionTokens: number;
  savedPercent: number;
  engineMode: 'static-only' | 'static+byok-llm' | 'preset-demo';
  modelName?: string;
  latencyMs: number;
}

export interface DiagnosticBundle {
  schemaVersion: '1.0';
  id: string;
  createdAt: string;
  sourceAgent: string;
  headline: string;
  rawError: string;
  rawDiff: string;
  cards: DiagnosticCard[];
  telemetry: TokenTelemetry;
}

export interface AnalyzeInput {
  rawError?: string;
  rawDiff?: string;
  sourceAgent?: string;
  projectFiles?: Record<string, string>;
}

export interface LLMConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface DemoScenario {
  id: string;
  tag: string;
  title: string;
  subtitle: string;
  sourceAgent: string;
  rawError: string;
  rawDiff: string;
  bundle: DiagnosticBundle;
}
