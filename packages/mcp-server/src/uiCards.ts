import type {
  CodeSightConfig,
  SymbolTraceReport,
  VisualProjectMapPayload,
} from '@codesight/core/engine';
import { DEFAULT_CODESIGHT_CONFIG } from '@codesight/core/engine';
import { UI_BOARD_CLIENT_JS } from './uiBoardClient.ts';
import { UI_SHEETS_CLIENT_JS } from './uiSheetsClient.ts';
import { APPLE_CSS, CHEVRON_SVG, esc, GEAR_SVG, LOGO_SVG, SPARKLE_SVG } from './uiStyles.ts';
import { UI_SVG_CLIENT_JS } from './uiSvgClient.ts';

export function renderVisualProjectMapHtml(
  payload: VisualProjectMapPayload,
  config: CodeSightConfig = DEFAULT_CODESIGHT_CONFIG
): string {
  const safeData = JSON.stringify(payload).replace(/</g, '\\u003c');
  const safeCfg = JSON.stringify({
    language: config.language,
    dashedLines: config.dashedLines,
    collapsedByDefault: config.collapsedByDefault,
    autoOpenBrowser: config.autoOpenBrowser,
    silentRegressionGuard: config.silentRegressionGuard,
    architectureMode: config.architectureMode,
    llm: {
      enabled: config.llm.enabled,
      baseUrl: config.llm.baseUrl,
      model: config.llm.model,
      hasApiKey: Boolean(config.llm.apiKey && config.llm.apiKey.trim().length > 0),
    },
  }).replace(/</g, '\\u003c');

  const diag = payload.activeDiagnosis;
  const isEn = config.language === 'en';

  const script = `
    const DATA = ${safeData};
    const CFG = ${safeCfg};
    const nodeMap = new Map(DATA.nodes.map(n => [n.id, n]));
    const shellEl = document.getElementById('cs-shell');
    const stageEl = document.getElementById('cs-stage');
    const svgEl = document.getElementById('cs-svg');
    const colsEl = document.getElementById('cs-cols');
    const footHintEl = document.getElementById('cs-foot-hint');
    const legendUpEl = document.getElementById('cs-leg-up');
    const legendDownEl = document.getElementById('cs-leg-down');
    const legendWarnEl = document.getElementById('cs-leg-warn');
    const faultTextEl = document.getElementById('cs-fault-text');
    const collapsedPillEl = document.getElementById('cs-collapsed-pill');
    const backdropEl = document.getElementById('cs-backdrop');
    const sheetEl = document.getElementById('cs-sheet');

    const MAX_PER_GROUP = 5;
    const expandedGroups = new Set();
    let isCollapsed = Boolean(CFG.collapsedByDefault);
    let hoveredId = DATA.activeDiagnosis?.targetNodeId || null;
    let activeModalId = null;
    let settingsOpen = false;
    let isRefreshingProtos = false;
${UI_SVG_CLIENT_JS}
${UI_BOARD_CLIENT_JS}
${UI_SHEETS_CLIENT_JS}
  `;

  return `<!doctype html>
<html lang="${isEn ? 'en' : 'zh-CN'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>CodeSight · ${esc(payload.repoName)}</title>
  <style>${APPLE_CSS}</style>
</head>
<body>
  <div class="cs-shell${config.collapsedByDefault ? ' is-collapsed' : ''}" id="cs-shell">
    <header class="cs-bar">
      <div class="cs-brand" id="cs-brand-toggle" title="Click to collapse or expand">
        <span class="cs-mark">${LOGO_SVG}</span>
        <span class="cs-brand-name">CodeSight</span>
        <span class="cs-brand-repo">· ${esc(payload.repoName)}</span>
        <span class="cs-collapsed-pill" id="cs-collapsed-pill"></span>
      </div>
      <div class="cs-bar-right">
        <button type="button" class="cs-action-pill" id="cs-refresh-proto" title="${isEn ? 'Generate or refresh UI component wireframes with LLM' : '使用 LLM 为所有 UI 组件生成或刷新示意图'}">
          ${SPARKLE_SVG}<span id="cs-refresh-lbl">${isEn ? 'AI UI' : 'AI 原型'}</span>
        </button>
        <div class="cs-seg" role="group" aria-label="Language">
          <button type="button" data-lang-btn="zh" class="${!isEn ? 'is-on' : ''}">中文</button>
          <button type="button" data-lang-btn="en" class="${isEn ? 'is-on' : ''}">EN</button>
        </div>
        <button type="button" class="cs-icon-btn" id="cs-open-settings" title="Settings">${GEAR_SVG}</button>
        <button type="button" class="cs-icon-btn" id="cs-toggle-collapse" title="Collapse / Expand">${CHEVRON_SVG}</button>
      </div>
    </header>

    <div class="cs-body-wrap">
      ${
        diag
          ? `<div class="cs-fault-strip">
              <div class="cs-fault-msg">
                <span class="cs-fault-dot"></span>
                <span class="cs-fault-text" id="cs-fault-text">${esc(isEn ? diag.headlineEn : diag.headline)}</span>
              </div>
              <button type="button" class="cs-fault-act" id="cs-open-fault">${isEn ? 'Inspect fix' : '查看修复'}</button>
            </div>`
          : ''
      }

      <div class="cs-stage" id="cs-stage">
        <svg class="cs-svg" id="cs-svg"></svg>
        <div class="cs-cols" id="cs-cols"></div>
      </div>

      <footer class="cs-foot">
        <span class="cs-foot-hint" id="cs-foot-hint"></span>
        <span class="cs-foot-legend">
          <span id="cs-leg-warn" style="color:var(--cs-amber);align-items:center"></span>
          <span id="cs-leg-up" style="color:var(--cs-blue)"></span>
          <span id="cs-leg-down" style="color:var(--cs-amber)"></span>
        </span>
      </footer>
    </div>
  </div>

  <div class="cs-backdrop" id="cs-backdrop">
    <div class="cs-sheet" id="cs-sheet" role="dialog" aria-modal="true"></div>
  </div>

  <script>${script}</script>
</body>
</html>`;
}

/**
 * Dedicated Apple-style interactive Settings Card for the `codesight_settings` MCP tool.
 */
export function renderSettingsCardHtml(config: CodeSightConfig, configPath: string): string {
  const isEn = config.language === 'en';
  return `<!doctype html>
<html lang="${isEn ? 'en' : 'zh-CN'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>CodeSight Settings</title>
  <style>${APPLE_CSS}</style>
</head>
<body>
  <div class="cs-shell">
    <header class="cs-bar">
      <div class="cs-brand">
        <span class="cs-mark">${LOGO_SVG}</span>
        <span class="cs-brand-name">CodeSight</span>
        <span class="cs-brand-repo">· ${isEn ? 'Settings' : '设置'}</span>
      </div>
      <span style="font-size:11px;color:var(--cs-faint);font-family:ui-monospace,monospace">${esc(configPath.replace(/^\/Users\/[^/]+/, '~'))}</span>
    </header>
    <div style="padding:14px 16px;background:var(--cs-canvas);display:flex;flex-direction:column;gap:10px">
      <div class="cs-set-group">
        <div class="cs-set-row">
          <span class="cs-set-lbl">${isEn ? 'Language' : '界面语言'}</span>
          <span style="font-size:12px;color:var(--cs-muted)">${config.language === 'en' ? 'English' : '中文'}</span>
        </div>
        <div class="cs-set-row">
          <span class="cs-set-lbl">${isEn ? 'Flow Lines' : '关联虚线'}</span>
          <span style="font-size:12px;color:var(--cs-muted)">${config.dashedLines === 'always' ? (isEn ? 'Always' : '常显') : (isEn ? 'Hover only' : '仅悬停')}</span>
        </div>
        <div class="cs-set-row">
          <span class="cs-set-lbl">${isEn ? 'Silent Regression Guard' : '静默回归拦截'}</span>
          <span style="font-size:12px;color:${config.silentRegressionGuard ? 'var(--cs-green)' : 'var(--cs-muted)'}">${config.silentRegressionGuard ? (isEn ? 'On' : '已开启') : (isEn ? 'Off' : '已关闭')}</span>
        </div>
        <div class="cs-set-row">
          <span class="cs-set-lbl">${isEn ? 'Architecture' : '架构分层'}</span>
          <span style="font-size:12px;color:var(--cs-muted)">${esc(config.architectureMode)}</span>
        </div>
        <div class="cs-set-row">
          <span class="cs-set-lbl">${isEn ? 'BYOK Model' : '小模型增强'}</span>
          <span style="font-size:12px;color:var(--cs-muted);font-family:ui-monospace,monospace">${config.llm.enabled ? esc(config.llm.model) : (isEn ? 'Local (0-token)' : '纯本地（0 Token）')}</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function renderTraceCardHtml(trace: SymbolTraceReport): string {
  const rows = trace.matches
    .map(
      (m) => `
      <div style="padding:12px 16px;border-top:1px solid var(--cs-hairline)">
        <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:4px">
          <strong style="font-family:ui-monospace,monospace;font-size:12.5px">${esc(m.symbol.name)}</strong>
          <span style="font-size:11.5px;color:var(--cs-muted);font-family:ui-monospace,monospace">${esc(m.symbol.file.split('/').pop() ?? m.symbol.file)}:${m.symbol.startLine}</span>
        </div>
        <div style="font-size:12px;color:var(--cs-muted)">
          ${esc(
            m.calledBy.map((e) => `${e.callerName} (${e.callerFile.split('/').pop()}:${e.callerLine})`).join(' · ') || 'No direct callers'
          )}
        </div>
      </div>`
    )
    .join('');

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CodeSight Trace</title><style>${APPLE_CSS}</style></head><body><div class="cs-shell"><div class="cs-bar"><div class="cs-brand"><span class="cs-mark">${LOGO_SVG}</span><span class="cs-brand-name">${esc(trace.querySymbol)}</span></div><span style="font-size:11px;color:var(--cs-faint)">${trace.traceMs}ms</span></div>${rows || '<div style="padding:14px 16px;font-size:12px;color:var(--cs-muted)">No matching symbol.</div>'}</div></body></html>`;
}
