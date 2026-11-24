import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  buildSurgicalFixPrompt,
  type ActionOption,
  type DiagnosticBundle,
  type DiagnosticCard,
  type LLMConfig,
} from '@codesight/core';
import { MentalModelCard } from './MentalModelCard.tsx';
import { RippleCard } from './RippleCard.tsx';
import { SilentRegressionCard } from './SilentRegressionCard.tsx';

export type HUDTheme = 'light' | 'dark';

export interface CodeSightHUDProps {
  bundle: DiagnosticBundle;
  theme?: HUDTheme;
  onToggleTheme?: () => void;
  llmConfig: LLMConfig;
  sidecarConnected?: boolean;
  isAnalyzing?: boolean;
  customError?: string;
  customDiff?: string;
  onChangeCustomError?: (val: string) => void;
  onChangeCustomDiff?: (val: string) => void;
  onRunCustomAnalyze?: () => void;
  onChangeLLMConfig: (next: LLMConfig) => void;
  onHighlightFile?: (file: string | null) => void;
  /**
   * Host Integration Hook:
   * Standalone HUD -> copies Surgical Prompt to clipboard.
   * Codex / Orca / Cursor / MCP Apps -> intercepts & dispatches directly to the coding agent.
   */
  onDispatchPrompt?: (prompt: string) => void;
}

type ActiveView = 'cards' | 'paste' | 'settings';

const LLM_PRESETS = [
  { name: 'OpenAI mini', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'Gemini Flash', baseUrl: 'https://openrouter.ai/api/v1', model: 'google/gemini-2.5-flash' },
  { name: '本地 Ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5-coder:7b' },
];

function getCardTabMeta(card: DiagnosticCard, idx: number) {
  if (card.kind === 'ripple') {
    return { label: '报错根因', tone: 'danger' as const };
  }
  if (card.kind === 'silent_regression') {
    return { label: idx > 0 ? '隐蔽隐患' : '静默风险', tone: 'warn' as const };
  }
  return { label: '链路地图', tone: 'calm' as const };
}

export function CodeSightHUD({
  bundle,
  theme = 'light',
  onToggleTheme,
  llmConfig,
  sidecarConnected = false,
  isAnalyzing = false,
  customError = '',
  customDiff = '',
  onChangeCustomError,
  onChangeCustomDiff,
  onRunCustomAnalyze,
  onChangeLLMConfig,
  onHighlightFile,
  onDispatchPrompt,
}: CodeSightHUDProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>('cards');
  const [activeCardIdx, setActiveCardIdx] = useState(0);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedActions, setSelectedActions] = useState<Record<string, ActionOption>>({});

  // Floating Window Drag Position (defaults to right side of screen, floating over editor)
  const [pos, setPos] = useState<{ right: number; top: number }>({ right: 28, top: 74 });
  const dragRef = useRef<{ startX: number; startY: number; origRight: number; origTop: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Reset card tab & select recommended defaults when bundle changes
  useEffect(() => {
    setActiveCardIdx(0);
    setShowPromptPreview(false);
    const defaults: Record<string, ActionOption> = {};
    for (const card of bundle.cards) {
      if (card.kind === 'ripple' || card.kind === 'silent_regression') {
        const rec = card.actions.find((a) => a.recommended) ?? card.actions[0];
        if (rec) defaults[card.id] = rec;
      }
    }
    setSelectedActions(defaults);
  }, [bundle]);

  const surgicalPrompt = useMemo(
    () =>
      buildSurgicalFixPrompt(bundle, selectedActions, [
        'no-type-escape',
        'preserve-guards',
        'minimal-diff',
      ]),
    [bundle, selectedActions]
  );

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origRight: pos.right,
      origTop: pos.top,
    };
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const nextRight = Math.max(12, Math.min(window.innerWidth - 360, dragRef.current.origRight - dx));
    const nextTop = Math.max(12, Math.min(window.innerHeight - 120, dragRef.current.origTop + dy));
    setPos({ right: nextRight, top: nextTop });
  };

  const handlePointerUp = () => {
    dragRef.current = null;
    setIsDragging(false);
  };

  const handleSelectAction = (cardId: string, action: ActionOption) => {
    setSelectedActions((prev) => ({ ...prev, [cardId]: action }));
  };

  const handleCopyPrompt = async () => {
    onDispatchPrompt?.(surgicalPrompt);
    try {
      await navigator.clipboard.writeText(surgicalPrompt);
    } catch {
      // ignore restricted clipboard
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const issueCount = bundle.cards.filter((c) => c.kind !== 'mental_model').length;
  const activeCard = bundle.cards[activeCardIdx] ?? bundle.cards[0];

  if (collapsed) {
    return (
      <div className={`gb-hud-shell gb-theme-${theme}`}>
        <button
          type="button"
          className="gb-floating-pill"
          onClick={() => setCollapsed(false)}
          title="展开 CodeSight 悬浮诊断 HUD"
        >
          <span className="gb-pill-dot" />
          <span>CodeSight</span>
          <span className="gb-pill-count">
            {issueCount > 0 ? `${issueCount} 项待确认` : '运行正常'} · 展开
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={`gb-hud-shell gb-theme-${theme}`}>
      <aside
        className={`gb-floating-window ${isDragging ? 'is-dragging' : ''}`}
        style={{ right: `${pos.right}px`, top: `${pos.top}px` }}
        aria-label="CodeSight Floating HUD"
      >
        {/* Minimal Draggable Header */}
        <header
          className="gb-hud-topbar"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div className="gb-hud-identity">
            <span className="gb-hud-mark">G</span>
            <span className="gb-hud-name">CodeSight</span>
            <span className="gb-hud-agent-tag">{bundle.sourceAgent}</span>
          </div>

          <div className="gb-icon-actions">
            <button
              type="button"
              className="gb-icon-btn"
              title="粘贴报错 / Diff 实时诊断"
              onClick={() => setActiveView(activeView === 'paste' ? 'cards' : 'paste')}
            >
              {activeView === 'paste' ? '✕' : '＋'}
            </button>
            <button
              type="button"
              className="gb-icon-btn"
              title="切换浅色 (Claude) / 深色 (ChatGPT) 风格"
              onClick={onToggleTheme}
            >
              {theme === 'light' ? '☾' : '☀'}
            </button>
            <button
              type="button"
              className="gb-icon-btn"
              title="绑定自己的轻量 LLM"
              onClick={() => setActiveView(activeView === 'settings' ? 'cards' : 'settings')}
            >
              ⚙
            </button>
            <button
              type="button"
              className="gb-icon-btn"
              title="收起为悬浮胶囊"
              onClick={() => setCollapsed(true)}
            >
              —
            </button>
          </div>
        </header>

        {/* Calm Body Content */}
        <div className="gb-hud-body">
          {activeView === 'paste' && (
            <div className="gb-sandbox-panel">
              <div className="gb-summary-title">粘贴任意报错或 AI Diff</div>
              <p className="gb-plain-explain">
                先在本地 0-Token 剥离框架噪音与扫描隐患，再生成直观卡片。
              </p>
              <textarea
                className="gb-textarea-clean"
                value={customError}
                onChange={(e) => onChangeCustomError?.(e.target.value)}
                placeholder="粘贴终端报错或 Stack Trace..."
              />
              <textarea
                className="gb-textarea-clean"
                value={customDiff}
                onChange={(e) => onChangeCustomDiff?.(e.target.value)}
                placeholder="粘贴 Git Diff（可选，用于抓取删守卫 / 空 catch 等静默风险）..."
              />
              <button
                type="button"
                className="gb-primary-cta"
                disabled={isAnalyzing}
                onClick={() => {
                  onRunCustomAnalyze?.();
                  setActiveView('cards');
                }}
              >
                {isAnalyzing ? '解析中…' : '生成诊断卡片'}
              </button>
            </div>
          )}

          {activeView === 'settings' && (
            <div className="gb-settings-sheet">
              <div className="gb-summary-title">绑定轻量模型 (BYOK)</div>
              <p className="gb-plain-explain">
                不配置也能用内置静态引擎；绑定小模型后，仅发送剪枝后的最小代码切片（通常不到 500 Tokens）。
              </p>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={llmConfig.enabled}
                  onChange={(e) =>
                    onChangeLLMConfig({ ...llmConfig, enabled: e.target.checked })
                  }
                />
                <span>开启 BYOK 语义增强</span>
              </label>

              <div className="gb-chip-row">
                {LLM_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className={`gb-soft-chip ${llmConfig.model === p.model ? 'active' : ''}`}
                    onClick={() =>
                      onChangeLLMConfig({
                        ...llmConfig,
                        enabled: true,
                        baseUrl: p.baseUrl,
                        model: p.model,
                      })
                    }
                  >
                    {p.name}
                  </button>
                ))}
              </div>

              <input
                className="gb-input-clean"
                value={llmConfig.baseUrl}
                onChange={(e) => onChangeLLMConfig({ ...llmConfig, baseUrl: e.target.value })}
                placeholder="Base URL (OpenAI 兼容)"
              />
              <input
                className="gb-input-clean"
                value={llmConfig.model}
                onChange={(e) => onChangeLLMConfig({ ...llmConfig, model: e.target.value })}
                placeholder="Model ID (如 gpt-4o-mini)"
              />
              <input
                className="gb-input-clean"
                type="password"
                value={llmConfig.apiKey}
                onChange={(e) => onChangeLLMConfig({ ...llmConfig, apiKey: e.target.value })}
                placeholder="API Key（仅存在本地浏览器，Ollama 可留空）"
              />

              <div className="gb-calm-callout">
                {sidecarConnected
                  ? '● 本地 Sidecar 已连接：任意终端/Agent 推送报错会自动浮现到本 HUD。'
                  : '○ 当前为独立 Demo 模式，支持无缝嵌入 Codex / Orca / MCP Apps。'}
              </div>

              <button
                type="button"
                className="gb-primary-cta"
                onClick={() => setActiveView('cards')}
              >
                完成并返回卡片
              </button>
            </div>
          )}

          {activeView === 'cards' && (
            <>
              {/* 1-Line Human Headline */}
              <div className="gb-summary-block">
                <div className="gb-summary-kicker">
                  <span>刚刚发生了什么</span>
                  <span className="gb-token-whisper">
                    仅 {bundle.telemetry.staticPrunedTokens} tok · 省 {bundle.telemetry.savedPercent}%
                  </span>
                </div>
                <h2 className="gb-summary-title">{bundle.headline}</h2>
              </div>

              {/* Clean Segmented Card Switcher — 1 card at a time for calm focus */}
              {bundle.cards.length > 1 && (
                <div className="gb-card-tabs" role="tablist">
                  {bundle.cards.map((card, idx) => {
                    const meta = getCardTabMeta(card, idx);
                    return (
                      <button
                        key={card.id}
                        type="button"
                        role="tab"
                        aria-selected={activeCardIdx === idx}
                        className={`gb-card-tab ${activeCardIdx === idx ? 'active' : ''}`}
                        onClick={() => setActiveCardIdx(idx)}
                      >
                        <span className={`gb-tab-dot ${meta.tone}`} />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Focused Single Card */}
              {activeCard && activeCard.kind === 'ripple' && (
                <RippleCard
                  card={activeCard}
                  selectedActionId={selectedActions[activeCard.id]?.id}
                  onSelectAction={handleSelectAction}
                  onHighlightFile={(f) => onHighlightFile?.(f)}
                />
              )}

              {activeCard && activeCard.kind === 'silent_regression' && (
                <SilentRegressionCard
                  card={activeCard}
                  selectedActionId={selectedActions[activeCard.id]?.id}
                  onSelectAction={handleSelectAction}
                  onHighlightFile={(f) => onHighlightFile?.(f)}
                />
              )}

              {activeCard && activeCard.kind === 'mental_model' && (
                <MentalModelCard
                  card={activeCard}
                  onHighlightFile={(f) => onHighlightFile?.(f)}
                />
              )}
            </>
          )}
        </div>

        {/* Calm Single-Action Footer */}
        {activeView === 'cards' && (
          <footer className="gb-hud-footer">
            {showPromptPreview && <pre className="gb-code-drawer">{surgicalPrompt}</pre>}

            <button type="button" className="gb-primary-cta" onClick={handleCopyPrompt}>
              {copied
                ? '✓ 已复制精确修复指令'
                : onDispatchPrompt
                ? '发送修复指令给 Agent'
                : '复制修复指令给 Agent'}
            </button>

            <div className="gb-footer-meta">
              <button
                type="button"
                className="gb-disclosure-toggle"
                onClick={() => setShowPromptPreview((v) => !v)}
              >
                {showPromptPreview ? '收起指令预览' : '预览生成的修复指令 ›'}
              </button>
              <span>可拖动顶栏移动 HUD</span>
            </div>
          </footer>
        )}
      </aside>
    </div>
  );
}
