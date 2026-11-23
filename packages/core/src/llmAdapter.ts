import type { DiagnosticCard, LLMConfig } from './schema.ts';
import type { StaticExtractionResult } from './staticAnalyzer.ts';

export interface LLMEnrichmentResult {
  headline: string;
  cards: DiagnosticCard[];
  promptTokens: number;
  completionTokens: number;
}

const SYSTEM_PROMPT = `You are GlassBox, an ultra-concise Information Design diagnostic engine for developers doing Vibe Coding.
You receive a PRE-PRUNED static analysis slice (noise already removed).
Return ONLY valid JSON matching this structure:
{
  "headline": "1 short Chinese sentence summarizing what really broke or shifted",
  "cards": [ ...DiagnosticCard objects... ]
}
Rules:
1. Keep language crisp, high-signal Chinese (keep code identifiers in English).
2. Prefer 2-3 cards max: "ripple" (contract/error + downstream impact), "silent_regression" (removed guards / swallowed errors / type escapes), and "mental_model" (3-4 node flow explaining context).
3. Every "ripple" and "silent_regression" card MUST include 2 distinct, concrete "actions" with surgical English "promptDirective" so the user can 1-click fix via any coding agent.
4. Output raw JSON only, no markdown fences.`;

/**
 * BYOK OpenAI-compatible adapter.
 * Works seamlessly with OpenAI, DeepSeek, Gemini OpenAI endpoint, OpenRouter, or local Ollama.
 */
export async function enrichWithBYOKLLM(
  extracted: StaticExtractionResult,
  fallbackCards: DiagnosticCard[],
  config: LLMConfig
): Promise<LLMEnrichmentResult | null> {
  if (!config.enabled || !config.baseUrl || !config.model) {
    return null;
  }

  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey.trim()) {
    headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
  }

  const userPayload = `Static pre-analysis slice:\n${extracted.prunedContextForLLM}\n\nReference static cards schema:\n${JSON.stringify(
    fallbackCards.slice(0, 2)
  )}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPayload },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`LLM request failed (${response.status}): ${errText.slice(0, 180)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const rawContent = data.choices?.[0]?.message?.content?.trim();
  if (!rawContent) {
    throw new Error('LLM returned an empty response');
  }

  const cleanedJson = rawContent.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed = JSON.parse(cleanedJson) as {
    headline?: string;
    cards?: DiagnosticCard[];
  };

  if (!Array.isArray(parsed.cards) || parsed.cards.length === 0) {
    throw new Error('LLM JSON missing valid cards array');
  }

  return {
    headline: parsed.headline || 'AI 诊断卡片已生成',
    cards: parsed.cards,
    promptTokens: data.usage?.prompt_tokens ?? extracted.prunedTokenEstimate,
    completionTokens: data.usage?.completion_tokens ?? 320,
  };
}
