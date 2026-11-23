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

/**
 * Clean, single-card editorial information design:
 * - Zero technical jargon ("爆炸半径", "核心枢纽", "AST符号" -> plain human language!)
 * - Clear 3-zone visual hierarchy (1. What happened -> 2. Visual Flow Diagram -> 3. Pick a Fix)
 * - Scoped --cs-* CSS tokens that inherit host Light/Dark themes seamlessly.
 */
const BASE_CSS = `
  .cs-shell {
    --cs-card: var(--card, #ffffff);
    --cs-subtle: var(--muted, rgba(120, 118, 114, 0.08));
    --cs-ink: var(--foreground, #1c1917);
    --cs-muted: var(--muted-foreground, #6b6560);
    --cs-border: var(--border, rgba(28, 25, 23, 0.1));
    --cs-accent: var(--primary, #111827);
    --cs-accent-fg: var(--primary-foreground, #ffffff);
    --cs-red: #dc2626;
    --cs-red-soft: rgba(220, 38, 38, 0.1);
    --cs-amber: #d97706;
    --cs-amber-soft: rgba(217, 119, 6, 0.11);
    --cs-green: #059669;
    --cs-green-soft: rgba(5, 150, 105, 0.1);
    --cs-blue: #2563eb;
    --cs-blue-soft: rgba(37, 99, 235, 0.1);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 8px;
    font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif);
    background: var(--background, transparent);
    color: var(--foreground, #1c1917);
    -webkit-font-smoothing: antialiased;
  }
  .cs-shell {
    max-width: 680px;
    background: var(--cs-card);
    border: 1px solid var(--cs-border);
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
  }
  .cs-zone {
    padding: 18px 20px;
  }
  .cs-zone + .cs-zone {
    border-top: 1px solid var(--cs-border);
  }
  .cs-zone-muted {
    background: var(--cs-subtle);
  }
  .cs-meta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }
  .cs-kicker {
    font-size: 12px;
    font-weight: 500;
    color: var(--cs-muted);
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .cs-mono {
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  }
  .cs-badge {
    font-size: 11.5px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .cs-headline {
    margin: 0;
    font-size: 16.5px;
    font-weight: 650;
    line-height: 1.45;
    letter-spacing: -0.01em;
    color: var(--cs-ink);
  }
  .cs-sub {
    margin: 6px 0 0;
    font-size: 13px;
    line-height: 1.6;
    color: var(--cs-muted);
  }
  .cs-sec-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--cs-muted);
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  /* 3-Step Visual Causal Flow Diagram */
  .cs-flow {
    display: grid;
    grid-template-columns: 1fr auto 1.15fr auto 1fr;
    align-items: stretch;
    gap: 8px;
  }
  @media (max-width: 520px) {
    .cs-flow { grid-template-columns: 1fr; }
    .cs-arrow { transform: rotate(90deg); justify-self: center; }
  }
  .cs-node {
    padding: 11px 12px;
    border-radius: 12px;
    border: 1px solid var(--cs-border);
    background: var(--cs-card);
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .cs-node-fault {
    border-color: rgba(220, 38, 38, 0.35);
    background: var(--cs-red-soft);
  }
  .cs-node-tag {
    font-size: 10.5px;
    font-weight: 600;
    color: var(--cs-muted);
  }
  .cs-node-fault .cs-node-tag {
    color: var(--cs-red);
  }
  .cs-node-name {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--cs-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cs-node-desc {
    font-size: 11.5px;
    color: var(--cs-muted);
    line-height: 1.4;
  }
  .cs-arrow {
    display: flex;
    align-items: center;
    color: var(--cs-muted);
    opacity: 0.65;
  }
  .cs-safe-bar {
    margin-top: 12px;
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--cs-green);
  }

  /* Warning Box */
  .cs-warn-box {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--cs-amber-soft);
    border: 1px solid rgba(217, 119, 6, 0.22);
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--cs-ink);
  }

  /* Fix Choice Cards */
  .cs-choices {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .cs-choice {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid var(--cs-border);
    background: var(--cs-card);
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .cs-choice:has(input:checked) {
    border-color: var(--cs-blue);
    background: var(--cs-blue-soft);
  }
  .cs-choice input {
    margin-top: 3px;
    accent-color: var(--cs-blue);
  }
  .cs-choice-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--cs-ink);
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .cs-rec {
    font-size: 10.5px;
    font-weight: 600;
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--cs-green-soft);
    color: var(--cs-green);
  }
  .cs-choice-desc {
    font-size: 12px;
    color: var(--cs-muted);
    margin-top: 3px;
    line-height: 1.5;
  }
  .cs-cta-row {
    margin-top: 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .cs-btn {
    appearance: none;
    border: none;
    border-radius: 11px;
    padding: 10px 18px;
    background: var(--cs-accent);
    color: var(--cs-accent-fg);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    flex: 1;
    transition: opacity 0.15s ease;
  }
  .cs-btn:hover { opacity: 0.9; }
  .cs-foot-note {
    font-size: 11.5px;
    color: var(--cs-muted);
    white-space: nowrap;
  }

  /* Project Map Visual Bars & Module Grid */
  .cs-bar-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .cs-bar-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .cs-bar-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .cs-bar-track {
    height: 6px;
    border-radius: 999px;
    background: var(--cs-subtle);
    overflow: hidden;
  }
  .cs-bar-fill {
    height: 100%;
    border-radius: 999px;
    background: var(--cs-blue);
  }
  .cs-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  @media (max-width: 480px) {
    .cs-grid { grid-template-columns: 1fr; }
  }
  .cs-mod-card {
    padding: 12px 13px;
    border-radius: 12px;
    border: 1px solid var(--cs-border);
    background: var(--cs-card);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .cs-mod-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--cs-ink);
  }
  .cs-file-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .cs-file-pill {
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 6px;
    background: var(--cs-subtle);
    color: var(--cs-muted);
  }
`;

const ARROW_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9m0 0-3.2-3.2M12 8l-3.2 3.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CHECK_SVG = `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4"/><path d="M5.3 8.2 7.2 10l3.6-3.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function wrapHtml(title: string, body: string, script = ''): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${BASE_CSS}</style></head><body><div class="cs-shell">${body}</div>${script ? `<script>${script}</script>` : ''}</body></html>`;
}

/**
 * Single Unified, Crystal-Clear Diagnose Card (Plain Chinese, Visual Flow Diagram, Zero Jargon).
 */
export function renderDiagnoseCardHtml(report: ProblemProjectionReport): string {
  const br = report.blastRadius;
  const totalImpact = br ? br.directImpact.length + br.indirectImpact.length : 0;
  const targetName = report.primaryTarget?.file.name ?? '当前项目';
  const targetLine = report.primaryTarget?.line ? `第 ${report.primaryTarget.line} 行` : '';
  const targetRole = report.primaryTarget?.file.roleLabel ?? '';
  const targetFn = report.primaryTarget?.symbol?.name;

  const badgeStyle =
    totalImpact >= 5
      ? 'color:var(--cs-red);background:var(--cs-red-soft)'
      : totalImpact >= 1
      ? 'color:var(--cs-amber);background:var(--cs-amber-soft)'
      : 'color:var(--cs-green);background:var(--cs-green-soft)';

  const badgeText =
    totalImpact >= 5
      ? `改动影响较大（关联 ${totalImpact} 个文件）`
      : totalImpact >= 1
      ? `关联 ${totalImpact} 个文件`
      : '只影响这 1 个文件（放心改）';

  // Split plainDiagnosis into crisp headline + concise explanation
  const rawDiag = report.aiSummary || report.plainDiagnosis;
  const sentences = rawDiag.split('。').filter((s) => s.trim().length > 0);
  const headline = (sentences[0] || rawDiag).trim();
  const subtext = sentences.slice(1).join('。') + (sentences.length > 1 ? '。' : '');

  // Zone 1: What Happened
  const zone1 = `
    <div class="cs-zone">
      <div class="cs-meta-row">
        <span class="cs-kicker">
          <span class="cs-mono" style="color:var(--cs-ink);font-weight:600">${esc(targetName)}</span>
          ${targetLine ? `<span>· ${esc(targetLine)}</span>` : ''}
          ${targetRole ? `<span>· ${esc(targetRole)}</span>` : ''}
        </span>
        <span class="cs-badge" style="${badgeStyle}">${esc(badgeText)}</span>
      </div>
      <h2 class="cs-headline">${esc(headline)}</h2>
      ${subtext ? `<p class="cs-sub">${esc(subtext)}</p>` : ''}
    </div>`;

  // Zone 2: Visual Impact Flow (Upstream -> Broken File -> Who Uses It)
  const upstreamLabel = br && br.upstreamDependencies.length > 0
    ? br.upstreamDependencies.slice(0, 2).map((u) => u.name).join('、')
    : '无内部依赖';
  const upstreamDesc = br && br.upstreamDependencies.length > 0
    ? br.upstreamDependencies[0].roleLabel
    : '最底层独立文件';

  const callerNames =
    report.symbolCallers.length > 0
      ? report.symbolCallers.slice(0, 2).map((c) => `${c.callerFile.split('/').pop()}`).join('、')
      : br && br.directImpact.length > 0
      ? br.directImpact.slice(0, 2).map((d) => d.name).join('、')
      : '无其他文件用到';
  const callerDesc =
    totalImpact > 0
      ? `共 ${totalImpact} 个文件直接或间接用到它`
      : '改这里不会连累别的文件';

  const zone2 = br
    ? `
    <div class="cs-zone cs-zone-muted">
      <div class="cs-sec-label">
        <span>关联关系一眼看懂</span>
      </div>
      <div class="cs-flow">
        <div class="cs-node">
          <span class="cs-node-tag">它用到的数据/文件</span>
          <span class="cs-node-name cs-mono">${esc(upstreamLabel)}</span>
          <span class="cs-node-desc">${esc(upstreamDesc)}</span>
        </div>
        <div class="cs-arrow">${ARROW_SVG}</div>
        <div class="cs-node cs-node-fault">
          <span class="cs-node-tag">出错在这里</span>
          <span class="cs-node-name cs-mono">${esc(targetName)}</span>
          <span class="cs-node-desc">${esc(targetFn ? `函数 ${targetFn}()` : targetRole || '定位文件')}</span>
        </div>
        <div class="cs-arrow">${ARROW_SVG}</div>
        <div class="cs-node">
          <span class="cs-node-tag">改动会影响谁</span>
          <span class="cs-node-name cs-mono">${esc(callerNames)}</span>
          <span class="cs-node-desc">${esc(callerDesc)}</span>
        </div>
      </div>
      <div class="cs-safe-bar">
        ${CHECK_SVG}
        <span>项目里另外 ${br.safeZoneCount} 个文件完全不受影响，不用管</span>
      </div>
    </div>`
    : '';

  // Optional Silent Regression Alert Zone
  const zoneWarn =
    report.silentRegressions.length > 0
      ? `
    <div class="cs-zone">
      <div class="cs-warn-box">
        <strong>注意：发现 ${report.silentRegressions.length} 处隐蔽隐患</strong><br/>
        ${report.silentRegressions.map((r) => `• ${esc(r.title)}（${esc(r.riskImpact)}）`).join('<br/>')}
      </div>
    </div>`
      : '';

  // Zone 3: Pick a Fix Direction
  const promptsJson = JSON.stringify(
    Object.fromEntries(report.directions.map((d) => [d.id, d.surgicalPrompt]))
  ).replace(/</g, '\\u003c');

  const zone3 =
    report.directions.length > 0
      ? `
    <div class="cs-zone">
      <div class="cs-sec-label">
        <span>你想让 AI 怎么修？（选一个方案）</span>
      </div>
      <div class="cs-choices">
        ${report.directions
          .map(
            (d, i) => `
          <label class="cs-choice">
            <input type="radio" name="cs_dir" value="${esc(d.id)}" ${i === 0 ? 'checked' : ''} />
            <div>
              <div class="cs-choice-title">
                <span>${esc(d.label)}</span>
                ${d.recommended ? '<span class="cs-rec">推荐</span>' : ''}
              </div>
              <div class="cs-choice-desc">${esc(d.strategy)}</div>
            </div>
          </label>`
          )
          .join('')}
      </div>
      <div class="cs-cta-row">
        <button class="cs-btn" id="cs-copy-btn">复制修改指令给 AI</button>
        <span class="cs-foot-note">本地分析 ${report.tokenEconomy.retrievalMs}ms</span>
      </div>
    </div>`
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
        btn.textContent = '已复制，直接发给 AI 即可';
        setTimeout(() => { btn.textContent = '复制修改指令给 AI'; }, 1800);
      });
    }
  `;

  return wrapHtml(`CodeSight · ${report.repoName}`, `${zone1}${zone2}${zoneWarn}${zone3}`, script);
}

/**
 * Clean Project Blueprint Map Card (Plain Chinese, Visual Dependency Bars + 2-Column Module Grid).
 */
export function renderMapCardHtml(map: RepoComprehensionMap): string {
  const maxReach = Math.max(1, ...map.hubs.map((h) => h.downstreamReach));

  const zoneHeader = `
    <div class="cs-zone">
      <div class="cs-meta-row">
        <span class="cs-kicker">项目结构速览</span>
        <span class="cs-badge" style="color:var(--cs-blue);background:var(--cs-blue-soft)">共 ${map.totalFiles} 个文件 · ${map.scanMs}ms</span>
      </div>
      <h2 class="cs-headline">${esc(map.repoName)} 项目里最重要的文件与模块</h2>
      <p class="cs-sub">先看下面这几个被引用最多的基础文件，改它们时最容易牵一发而动全身。</p>
    </div>`;

  const barsHtml = map.hubs
    .slice(0, 4)
    .map((h) => {
      const pct = Math.max(18, Math.round((h.downstreamReach / maxReach) * 100));
      const baseName = h.path.split('/').pop() ?? h.path;
      return `
        <div class="cs-bar-item">
          <div class="cs-bar-top">
            <div>
              <span class="cs-mono" style="font-size:13px;font-weight:600">${esc(baseName)}</span>
              <span class="cs-muted" style="margin-left:6px">${esc(h.roleLabel)}</span>
            </div>
            <span style="font-size:12px;font-weight:600;color:var(--cs-amber)">被 ${h.downstreamReach} 个文件用到</span>
          </div>
          <div class="cs-bar-track"><div class="cs-bar-fill" style="width:${pct}%"></div></div>
          <div class="cs-muted">${esc(h.summary)}</div>
        </div>`;
    })
    .join('');

  const zoneHubs = `
    <div class="cs-zone cs-zone-muted">
      <div class="cs-sec-label"><span>改动最需要小心的基础文件</span></div>
      <div class="cs-bar-list">${barsHtml || '<div class="cs-muted">各文件相互独立，改动风险低。</div>'}</div>
    </div>`;

  const gridHtml = map.sections
    .filter((s) => s.layer !== 'config' && s.layer !== 'style-asset')
    .slice(0, 6)
    .map(
      (sec) => `
      <div class="cs-mod-card">
        <div class="cs-mod-head">
          <span>${esc(sec.layerTitle)}</span>
          <span class="cs-muted">${sec.files.length} 个</span>
        </div>
        <div class="cs-file-pills">
          ${sec.files
            .slice(0, 4)
            .map((f) => `<span class="cs-file-pill cs-mono">${esc(f.name)}</span>`)
            .join('')}
          ${sec.files.length > 4 ? `<span class="cs-file-pill">+${sec.files.length - 4}</span>` : ''}
        </div>
      </div>`
    )
    .join('');

  const zoneGrid = `
    <div class="cs-zone">
      <div class="cs-sec-label"><span>项目按用途分成哪几块</span></div>
      <div class="cs-grid">${gridHtml}</div>
    </div>`;

  return wrapHtml(`CodeSight 项目速览 · ${map.repoName}`, `${zoneHeader}${zoneHubs}${zoneGrid}`);
}

export function renderTraceCardHtml(trace: SymbolTraceReport): string {
  const rows = trace.matches
    .map(
      (m) => `
      <div class="cs-zone">
        <div class="cs-meta-row">
          <span class="cs-mono" style="font-size:13.5px;font-weight:600">${esc(m.symbol.name)}</span>
          <span class="cs-muted cs-mono">${esc(m.symbol.file.split('/').pop() ?? m.symbol.file)} 第 ${m.symbol.startLine} 行</span>
        </div>
        <div class="cs-sub" style="margin-top:0">
          被以下地方用到（${m.calledBy.length} 处）：${esc(
            m.calledBy.map((e) => `${e.callerName}（${e.callerFile.split('/').pop()} 第 ${e.callerLine} 行）`).join('、') || '暂无其他文件直接调用'
          )}
        </div>
      </div>`
    )
    .join('');

  return wrapHtml(
    `CodeSight 调用追踪 · ${trace.querySymbol}`,
    rows || `<div class="cs-zone"><p class="cs-sub">没有找到名为 ${esc(trace.querySymbol)} 的函数或组件。</p></div>`
  );
}
