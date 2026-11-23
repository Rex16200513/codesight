import type {
  ProblemProjectionReport,
  RepoComprehensionMap,
  SymbolTraceReport,
} from '@glassbox/core/engine';

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const BASE_CSS = `
  :root { color-scheme: light dark; --bg: #faf9f6; --card: #ffffff; --ink: #1c1917; --muted: #66605a; --border: rgba(28,25,23,0.09); --accent: #0a84ff; --red: #d92d20; --amber: #d97706; --green: #059669; }
  @media (prefers-color-scheme: dark) { :root { --bg: #1c1c1e; --card: #2c2c2e; --ink: #f5f5f7; --muted: #a1a1a6; --border: rgba(255,255,255,0.1); --accent: #0a84ff; --red: #ff6961; --amber: #fbbf24; --green: #34d399; } }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 14px; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif; background: var(--bg); color: var(--ink); -webkit-font-smoothing: antialiased; }
  .cs-stack { display: flex; flex-direction: column; gap: 10px; max-width: 680px; }
  .cs-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px; box-shadow: 0 2px 10px rgba(0,0,0,0.04); }
  .cs-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
  .cs-title { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 7px; }
  .cs-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .cs-pill { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .cs-text { margin: 0; font-size: 13px; line-height: 1.6; color: var(--ink); }
  .cs-muted { font-size: 12px; color: var(--muted); line-height: 1.5; }
  .cs-row { padding: 8px 0; border-top: 1px solid var(--border); }
  .cs-row:first-child { border-top: none; padding-top: 0; }
  .cs-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; font-weight: 600; }
  .cs-btn { appearance: none; border: none; border-radius: 10px; padding: 9px 14px; width: 100%; background: var(--accent); color: #fff; font-size: 12.5px; font-weight: 600; cursor: pointer; margin-top: 10px; }
  .cs-opt { display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--border); margin-top: 6px; cursor: pointer; }
  .cs-opt input { margin-top: 3px; }
`;

function wrapHtml(title: string, body: string, script = ''): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${BASE_CSS}</style></head><body><div class="cs-stack">${body}</div>${script ? `<script>${script}</script>` : ''}</body></html>`;
}

/**
 * Self-contained Apple-styled MCP App interactive HTML card for `codesight_diagnose`.
 * Renders cleanly inside Antigravity, ChatGPT Apps, Claude Desktop, and VS Code MCP App iframes.
 */
export function renderDiagnoseCardHtml(report: ProblemProjectionReport): string {
  const br = report.blastRadius;
  const riskColor =
    br?.riskLevel === 'high-hub'
      ? 'var(--red)'
      : br?.riskLevel === 'medium-bridge'
      ? 'var(--amber)'
      : 'var(--green)';
  const riskLabel =
    br?.riskLevel === 'high-hub'
      ? '高风险核心枢纽'
      : br?.riskLevel === 'medium-bridge'
      ? '中游桥接节点'
      : '低风险末梢节点';

  const diagCard = `
    <section class="cs-card">
      <div class="cs-head">
        <span class="cs-title"><span class="cs-dot" style="background:var(--red)"></span>CodeSight 问题诊断</span>
        <span class="cs-pill" style="color:var(--green);background:rgba(5,150,105,0.12)">省 ${report.tokenEconomy.savedPercent}% · ${report.tokenEconomy.retrievalMs}ms</span>
      </div>
      <p class="cs-text">${esc(report.aiSummary || report.plainDiagnosis)}</p>
    </section>`;

  const blastCard = br
    ? `<section class="cs-card">
        <div class="cs-head">
          <span class="cs-title"><span class="cs-dot" style="background:${riskColor}"></span>爆炸半径与安全区</span>
          <span class="cs-pill" style="color:${riskColor};background:rgba(128,128,128,0.12)">${riskLabel}</span>
        </div>
        <div class="cs-muted" style="color:var(--green);font-weight:500">其余 ${br.safeZoneCount} 个业务文件完全不受影响，无需去读</div>
        ${
          br.directImpact.length > 0
            ? `<div class="cs-muted" style="margin-top:6px">直接波及：${esc(br.directImpact.map((d) => d.name).join('、'))}</div>`
            : ''
        }
        ${
          report.symbolCallers.length > 0
            ? `<div class="cs-mono cs-muted" style="margin-top:6px">函数调用方：${esc(
                report.symbolCallers
                  .slice(0, 4)
                  .map((e) => `${e.callerName} (${e.callerFile.split('/').pop()}:${e.callerLine})`)
                  .join(' · ')
              )}</div>`
            : ''
        }
      </section>`
    : '';

  const regCard =
    report.silentRegressions.length > 0
      ? `<section class="cs-card">
          <div class="cs-head">
            <span class="cs-title"><span class="cs-dot" style="background:var(--amber)"></span>AI 静默退化预警</span>
            <span class="cs-pill" style="color:var(--amber);background:rgba(217,119,6,0.12)">${report.silentRegressions.length} 处</span>
          </div>
          ${report.silentRegressions
            .map(
              (r) =>
                `<div class="cs-row"><div class="cs-mono">${esc(r.title)}</div><div class="cs-muted">${esc(r.riskImpact)}</div></div>`
            )
            .join('')}
        </section>`
      : '';

  const promptsJson = JSON.stringify(
    Object.fromEntries(report.directions.map((d) => [d.id, d.surgicalPrompt]))
  ).replace(/</g, '\\u003c');

  const dirCard =
    report.directions.length > 0
      ? `<section class="cs-card">
          <div class="cs-head">
            <span class="cs-title"><span class="cs-dot" style="background:var(--accent)"></span>修复方向决策</span>
            <span class="cs-pill" style="color:var(--muted);background:rgba(128,128,128,0.1)">选 1 个方向</span>
          </div>
          ${report.directions
            .map(
              (d, i) => `
            <label class="cs-opt">
              <input type="radio" name="cs_dir" value="${esc(d.id)}" ${i === 0 ? 'checked' : ''} />
              <div>
                <div style="font-size:12.5px;font-weight:600">${esc(d.label)}</div>
                <div class="cs-muted">${esc(d.strategy)}</div>
              </div>
            </label>`
            )
            .join('')}
          <button class="cs-btn" id="cs-copy-btn">复制精确修复指令</button>
        </section>`
      : '';

  const script = `
    const prompts = ${promptsJson};
    const btn = document.getElementById('cs-copy-btn');
    if (btn) {
      btn.addEventListener('click', async () => {
        const sel = document.querySelector('input[name="cs_dir"]:checked');
        const text = sel ? prompts[sel.value] : '';
        try { await navigator.clipboard.writeText(text); } catch {}
        window.parent?.postMessage({ type: 'codesight:selectDirection', prompt: text }, '*');
        btn.textContent = '已复制修复指令';
        setTimeout(() => { btn.textContent = '复制精确修复指令'; }, 1600);
      });
    }
  `;

  return wrapHtml(`CodeSight Diagnose · ${report.repoName}`, `${diagCard}${blastCard}${regCard}${dirCard}`, script);
}

export function renderMapCardHtml(map: RepoComprehensionMap): string {
  const hubsHtml = map.hubs
    .slice(0, 5)
    .map(
      (h) => `
      <div class="cs-row">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="cs-mono">${esc(h.path)}</span>
          <span class="cs-pill" style="color:var(--amber);background:rgba(217,119,6,0.12)">波及 ${h.downstreamReach}</span>
        </div>
        <div class="cs-muted">${esc(h.roleLabel)}：${esc(h.summary)}</div>
      </div>`
    )
    .join('');

  const body = `
    <section class="cs-card">
      <div class="cs-head">
        <span class="cs-title"><span class="cs-dot" style="background:var(--accent)"></span>CodeSight 仓库地图 · ${esc(map.repoName)}</span>
        <span class="cs-pill" style="color:var(--muted);background:rgba(128,128,128,0.1)">${map.totalFiles} 文件 · ${map.totalSymbols} AST 符号 · ${map.scanMs}ms</span>
      </div>
      ${hubsHtml || '<div class="cs-muted">未发现高扇入枢纽文件。</div>'}
    </section>`;

  return wrapHtml(`CodeSight Map · ${map.repoName}`, body);
}

export function renderTraceCardHtml(trace: SymbolTraceReport): string {
  const rows = trace.matches
    .map(
      (m) => `
      <div class="cs-row">
        <div style="display:flex;justify-content:space-between">
          <span class="cs-mono">${esc(m.symbol.name)} (${esc(m.symbol.kind)})</span>
          <span class="cs-muted">${esc(m.symbol.file)}:${m.symbol.startLine}</span>
        </div>
        <div class="cs-muted" style="margin-top:4px">被调用 (${m.calledBy.length})：${esc(
          m.calledBy.map((e) => `${e.callerName} (${e.callerFile.split('/').pop()}:${e.callerLine})`).join(' · ') || '无跨文件调用方'
        )}</div>
      </div>`
    )
    .join('');

  const body = `
    <section class="cs-card">
      <div class="cs-head">
        <span class="cs-title"><span class="cs-dot" style="background:var(--accent)"></span>AST 调用图追踪 · ${esc(trace.querySymbol)}</span>
        <span class="cs-pill" style="color:var(--muted);background:rgba(128,128,128,0.1)">${trace.traceMs}ms</span>
      </div>
      ${rows || '<div class="cs-muted">未匹配到对应符号。</div>'}
    </section>`;

  return wrapHtml(`CodeSight Trace · ${trace.querySymbol}`, body);
}
