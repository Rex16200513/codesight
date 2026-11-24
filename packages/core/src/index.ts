import { enrichWithBYOKLLM } from './llmAdapter.ts';
import type { AnalyzeInput, DiagnosticBundle, LLMConfig } from './schema.ts';
import { buildStaticCards, runStaticAnalysis } from './staticAnalyzer.ts';

export * from './schema.ts';
export * from './staticAnalyzer.ts';
export * from './llmAdapter.ts';
export * from './promptBuilder.ts';
export * from './scenarios.ts';

/**
 * Main host-agnostic CodeSight analysis pipeline:
 * Step 1: 0-Token Static Analysis (noise stripping, type diff, silent regression heuristics, context pruning)
 * Step 2: Deterministic Card Synthesis (instant baseline)
 * Step 3: Optional BYOK Lightweight LLM enrichment (consumes only the tiny pruned slice)
 */
export async function analyzeDiagnostic(
  input: AnalyzeInput,
  llmConfig?: LLMConfig
): Promise<DiagnosticBundle> {
  const startedAt = Date.now();
  const extracted = runStaticAnalysis(input);
  const staticCards = buildStaticCards(extracted);

  let finalCards = staticCards;
  let headline =
    staticCards[0]?.title ||
    '未检测到明显错误或风险变更，当前代码切片状态正常';
  let engineMode: DiagnosticBundle['telemetry']['engineMode'] = 'static-only';
  let llmPromptTokens = 0;
  let llmCompletionTokens = 0;
  let modelName = '0-Token Static Engine';

  if (llmConfig?.enabled && llmConfig.baseUrl && llmConfig.model) {
    try {
      const enriched = await enrichWithBYOKLLM(extracted, staticCards, llmConfig);
      if (enriched) {
        finalCards = enriched.cards;
        headline = enriched.headline;
        engineMode = 'static+byok-llm';
        llmPromptTokens = enriched.promptTokens;
        llmCompletionTokens = enriched.completionTokens;
        modelName = llmConfig.model;
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'LLM unavailable';
      modelName = `Static Fallback (${reason.slice(0, 42)})`;
    }
  }

  const savedPercent =
    extracted.rawTokenEstimate > 0
      ? Math.max(
          0,
          Math.min(
            99.5,
            Number(
              (
                ((extracted.rawTokenEstimate - extracted.prunedTokenEstimate) /
                  extracted.rawTokenEstimate) *
                100
              ).toFixed(1)
            )
          )
        )
      : 0;

  return {
    schemaVersion: '1.0',
    id: `gb-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    sourceAgent: input.sourceAgent || 'Any Coding Agent',
    headline,
    rawError: input.rawError ?? '',
    rawDiff: input.rawDiff ?? '',
    cards: finalCards,
    telemetry: {
      rawInputTokens: extracted.rawTokenEstimate,
      staticPrunedTokens: extracted.prunedTokenEstimate,
      llmPromptTokens,
      llmCompletionTokens,
      savedPercent,
      engineMode,
      modelName,
      latencyMs: Math.max(4, Date.now() - startedAt),
    },
  };
}
