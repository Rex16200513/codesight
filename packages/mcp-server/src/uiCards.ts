import type {
  SymbolTraceReport,
  VisualProjectMapPayload,
} from '@glassbox/core/engine';

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const INTERACTIVE_MAP_CSS = `
  .cs-app {
    --cs-card: var(--card, #ffffff);
    --cs-canvas: var(--muted, rgba(120, 118, 114, 0.06));
    --cs-ink: var(--foreground, #1c1917);
    --cs-muted: var(--muted-foreground, #6b6560);
    --cs-border: var(--border, rgba(28, 25, 23, 0.1));
    --cs-border-strong: rgba(28, 25, 23, 0.22);
    --cs-accent: var(--primary, #111827);
    --cs-accent-fg: var(--primary-foreground, #ffffff);
    --cs-blue: #2563eb;
    --cs-blue-soft: rgba(37, 99, 235, 0.1);
    --cs-red: #dc2626;
    --cs-red-soft: rgba(220, 38, 38, 0.11);
    --cs-amber: #d97706;
    --cs-amber-soft: rgba(217, 119, 6, 0.11);
    --cs-green: #059669;
    --cs-green-soft: rgba(5, 150, 105, 0.1);
  }
  @media (prefers-color-scheme: dark) {
    .cs-app {
      --cs-border-strong: rgba(255, 255, 255, 0.22);
      --cs-blue: #60a5fa;
      --cs-blue-soft: rgba(96, 165, 250, 0.15);
      --cs-red: #f87171;
      --cs-red-soft: rgba(248, 113, 113, 0.16);
      --cs-amber: #fbbf24;
      --cs-amber-soft: rgba(251, 191, 36, 0.15);
      --cs-green: #34d399;
      --cs-green-soft: rgba(52, 211, 153, 0.14);
    }
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
  .cs-app {
    max-width: 860px;
    background: var(--cs-card);
    border: 1px solid var(--cs-border);
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 6px 26px rgba(0, 0, 0, 0.06);
  }

  /* Top Serene Header */
  .cs-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--cs-border);
    flex-wrap: wrap;
  }
  .cs-brand {
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .cs-logo {
    width: 24px;
    height: 24px;
    border-radius: 7px;
    background: var(--cs-blue-soft);
    color: var(--cs-blue);
    display: grid;
    place-items: center;
  }
  .cs-title {
    font-size: 14px;
    font-weight: 650;
    letter-spacing: -0.01em;
    color: var(--cs-ink);
  }
  .cs-subtitle {
    font-size: 12px;
    color: var(--cs-muted);
  }
  .cs-legend {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 11.5px;
    color: var(--cs-muted);
    flex-wrap: wrap;
  }
  .cs-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .cs-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }

  /* Interactive Architecture Map Canvas */
  .cs-canvas-wrap {
    position: relative;
    padding: 16px 18px 18px;
    background: var(--cs-canvas);
    overflow-x: auto;
  }
  .cs-canvas-stage {
    position: relative;
    min-width: 620px;
  }
  .cs-edges-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
    z-index: 1;
  }
  .cs-edge {
    fill: none;
    stroke: var(--cs-muted);
    stroke-width: 1.2;
    opacity: 0.14;
    transition: opacity 0.18s ease, stroke 0.18s ease, stroke-width 0.18s ease;
  }
  .cs-edge.is-dim {
    opacity: 0.04;
  }
  .cs-edge.is-upstream {
    stroke: var(--cs-blue);
    stroke-width: 2;
    opacity: 0.85;
  }
  .cs-edge.is-downstream {
    stroke: var(--cs-amber);
    stroke-width: 2;
    opacity: 0.9;
  }
  .cs-edge.is-fault-path {
    stroke: var(--cs-red);
    stroke-width: 2.2;
    opacity: 0.92;
  }

  .cs-lanes {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: repeat(var(--lane-count, 4), minmax(138px, 1fr));
    gap: 14px;
    align-items: start;
  }
  .cs-lane {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .cs-lane-head {
    padding: 0 2px 4px;
  }
  .cs-lane-title {
    font-size: 12px;
    font-weight: 650;
    color: var(--cs-ink);
  }
  .cs-lane-sub {
    font-size: 10.5px;
    color: var(--cs-muted);
    margin-top: 1px;
  }

  /* Individual Map Node Pill */
  .cs-node {
    appearance: none;
    width: 100%;
    text-align: left;
    padding: 9px 11px;
    border-radius: 12px;
    border: 1px solid var(--cs-border);
    background: var(--cs-card);
    color: var(--cs-ink);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 3px;
    transition: transform 0.15s ease, border-color 0.15s ease, opacity 0.18s ease, box-shadow 0.15s ease;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
  }
  .cs-node:hover {
    transform: translateY(-1px);
    border-color: var(--cs-border-strong);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  }
  .cs-node.is-dim {
    opacity: 0.28;
  }
  .cs-node.is-selected {
    border-color: var(--cs-blue);
    box-shadow: 0 0 0 2.5px var(--cs-blue-soft);
    opacity: 1;
  }
  .cs-node.is-fault {
    border-color: var(--cs-red);
    background: var(--cs-red-soft);
    box-shadow: 0 0 0 2.5px var(--cs-red-soft);
    opacity: 1;
  }
  .cs-node.is-upstream {
    border-color: var(--cs-blue);
    background: var(--cs-blue-soft);
    opacity: 1;
  }
  .cs-node.is-downstream {
    border-color: var(--cs-amber);
    background: var(--cs-amber-soft);
    opacity: 1;
  }
  .cs-node-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 5px;
  }
  .cs-node-name {
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 11.5px;
    font-weight: 600;
    color: var(--cs-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cs-node-reach {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--cs-amber-soft);
    color: var(--cs-amber);
    flex-shrink: 0;
  }
  .cs-node.is-fault .cs-node-reach {
    background: var(--cs-red);
    color: #fff;
  }
  .cs-node-role {
    font-size: 11px;
    color: var(--cs-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Contextual Action Card (Directly Below the Map — Updates Instantly on Node Click!) */
  .cs-action-card {
    border-top: 1px solid var(--cs-border);
    padding: 18px 20px;
    background: var(--cs-card);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .cs-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .cs-card-kicker {
    font-size: 11.5px;
    color: var(--cs-muted);
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .cs-card-title {
    margin: 0;
    font-size: 15.5px;
    font-weight: 650;
    line-height: 1.45;
    color: var(--cs-ink);
  }
  .cs-card-desc {
    margin: 4px 0 0;
    font-size: 13px;
    line-height: 1.6;
    color: var(--cs-muted);
  }
  .cs-pill {
    font-size: 11.5px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .cs-impact-strip {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    padding: 10px 13px;
    border-radius: 12px;
    background: var(--cs-canvas);
    font-size: 12px;
    color: var(--cs-ink);
  }
  .cs-impact-kv {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .cs-warn-box {
    padding: 10px 13px;
    border-radius: 11px;
    background: var(--cs-amber-soft);
    border: 1px solid rgba(217, 119, 6, 0.25);
    font-size: 12px;
    line-height: 1.55;
    color: var(--cs-ink);
  }
  .cs-choices {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
  }
  @media (max-width: 560px) {
    .cs-choices { grid-template-columns: 1fr; }
  }
  .cs-choice {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding: 11px 13px;
    border-radius: 12px;
    border: 1px solid var(--cs-border);
    background: var(--cs-card);
    cursor: pointer;
    transition: border-color 0.14s ease, background 0.14s ease;
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
    font-size: 12.5px;
    font-weight: 600;
    color: var(--cs-ink);
    line-height: 1.4;
  }
  .cs-choice-sub {
    font-size: 11.5px;
    color: var(--cs-muted);
    margin-top: 3px;
    line-height: 1.45;
  }
  .cs-cta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
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
    min-width: 180px;
    transition: opacity 0.15s ease;
  }
  .cs-btn:hover { opacity: 0.9; }
  .cs-btn-ghost {
    appearance: none;
    border: 1px solid var(--cs-border);
    border-radius: 11px;
    padding: 10px 14px;
    background: transparent;
    color: var(--cs-muted);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }
  .cs-btn-ghost:hover { color: var(--cs-ink); border-color: var(--cs-border-strong); }
`;

const LOGO_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="3.5" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/></svg>`;

/**
 * Unified Live Interactive Architecture Map + Contextual Action Card HTML Renderer.
 * Serves BOTH Project Overview (`codesight_map`) AND Error/Diff Projection (`codesight_diagnose`):
 * - Every file is an interactive node arranged in clean architectural lanes
 * - Curved SVG dependency edges light up on click/hover (upstream = blue, downstream = amber/red, safe files dim)
 * - Clicking any node immediately updates the Contextual Action Card below with plain-Chinese role, impact, and 1-click AI adjustment prompts!
 */
export function renderVisualProjectMapHtml(payload: VisualProjectMapPayload): string {
  const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  const isDiag = Boolean(payload.activeDiagnosis);

  const lanesHtml = payload.lanes
    .map((lane) => {
      const nodesHtml = lane.nodeIds
        .map((id) => {
          const n = payload.nodes.find((item) => item.id === id);
          if (!n) return '';
          const reachBadge =
            n.status === 'fault'
              ? '<span class="cs-node-reach">报错</span>'
              : n.downstreamReach >= 3
              ? `<span class="cs-node-reach">${n.downstreamReach}处用</span>`
              : '';
          return `
            <button type="button" class="cs-node" data-node-id="${esc(n.id)}" title="${esc(n.path)}">
              <div class="cs-node-top">
                <span class="cs-node-name">${esc(n.name)}</span>
                ${reachBadge}
              </div>
              <div class="cs-node-role">${esc(n.roleLabel)}</div>
            </button>`;
        })
        .join('');

      return `
        <div class="cs-lane" data-lane="${esc(lane.id)}">
          <div class="cs-lane-head">
            <div class="cs-lane-title">${esc(lane.title)}</div>
            <div class="cs-lane-sub">${esc(lane.subtitle)}</div>
          </div>
          ${nodesHtml}
        </div>`;
    })
    .join('');

  const script = `
    const DATA = ${safeJson};
    const nodeMap = new Map(DATA.nodes.map(n => [n.id, n]));
    const stageEl = document.getElementById('cs-stage');
    const svgEl = document.getElementById('cs-svg');
    const cardEl = document.getElementById('cs-action-card');
    const nodeEls = new Map();
    document.querySelectorAll('.cs-node').forEach(el => nodeEls.set(el.dataset.nodeId, el));

    let selectedId = DATA.activeDiagnosis?.targetNodeId || (DATA.nodes.find(n => n.isHub)?.id ?? DATA.nodes[0]?.id);
    let mode = DATA.activeDiagnosis ? 'diagnosis' : 'explore';

    function drawEdges() {
      const stageRect = stageEl.getBoundingClientRect();
      svgEl.setAttribute('viewBox', '0 0 ' + stageRect.width + ' ' + stageRect.height);
      const sel = nodeMap.get(selectedId);
      const upSet = new Set(sel ? sel.upstreamPaths : []);
      const downSet = new Set(sel ? sel.allDownstreamPaths : []);
      const isFaultMode = mode === 'diagnosis' && DATA.activeDiagnosis?.targetNodeId === selectedId;

      const paths = [];
      for (const e of DATA.edges) {
        const fromEl = nodeEls.get(e.from);
        const toEl = nodeEls.get(e.to);
        if (!fromEl || !toEl) continue;
        const r1 = fromEl.getBoundingClientRect();
        const r2 = toEl.getBoundingClientRect();

        const x1 = r1.right - stageRect.left;
        const y1 = r1.top + r1.height / 2 - stageRect.top;
        const x2 = r2.left - stageRect.left;
        const y2 = r2.top + r2.height / 2 - stageRect.top;
        const sameCol = Math.abs(r1.left - r2.left) < 20;

        let d;
        if (sameCol) {
          const sx = r1.right - stageRect.left;
          const tx = r2.right - stageRect.left;
          const curveX = Math.max(sx, tx) + 18;
          d = 'M ' + sx + ' ' + y1 + ' C ' + curveX + ' ' + y1 + ', ' + curveX + ' ' + y2 + ', ' + tx + ' ' + y2;
        } else {
          const startX = r1.left < r2.left ? x1 : r1.left - stageRect.left;
          const endX = r1.left < r2.left ? x2 : r2.right - stageRect.left;
          const dx = Math.max(24, Math.abs(endX - startX) * 0.45);
          const c1x = r1.left < r2.left ? startX + dx : startX - dx;
          const c2x = r1.left < r2.left ? endX - dx : endX + dx;
          d = 'M ' + startX + ' ' + y1 + ' C ' + c1x + ' ' + y1 + ', ' + c2x + ' ' + y2 + ', ' + endX + ' ' + y2;
        }

        let cls = 'cs-edge';
        if (selectedId) {
          if (e.from === selectedId && upSet.has(e.to)) {
            cls += ' is-upstream';
          } else if (e.to === selectedId || (downSet.has(e.from) && (e.to === selectedId || downSet.has(e.to)))) {
            cls += isFaultMode ? ' is-fault-path' : ' is-downstream';
          } else {
            cls += ' is-dim';
          }
        }
        paths.push('<path class="' + cls + '" d="' + d + '" />');
      }
      svgEl.innerHTML = paths.join('');
    }

    function updateNodeHighlights() {
      const sel = nodeMap.get(selectedId);
      const upSet = new Set(sel ? sel.upstreamPaths : []);
      const downSet = new Set(sel ? sel.allDownstreamPaths : []);
      const isFaultTarget = mode === 'diagnosis' && DATA.activeDiagnosis?.targetNodeId === selectedId;

      nodeEls.forEach((el, id) => {
        el.classList.remove('is-selected', 'is-fault', 'is-upstream', 'is-downstream', 'is-dim');
        if (!selectedId) return;
        if (id === selectedId) {
          el.classList.add(isFaultTarget ? 'is-fault' : 'is-selected');
        } else if (upSet.has(id)) {
          el.classList.add('is-upstream');
        } else if (downSet.has(id)) {
          el.classList.add('is-downstream');
        } else {
          el.classList.add('is-dim');
        }
      });
    }

    function escHtml(s) {
      return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function buildExploreDirections(node) {
      const impactCount = node.allDownstreamPaths.length;
      if (impactCount >= 3) {
        return [
          {
            id: 'adj-safe',
            label: '只调整内部实现，不破坏其他文件',
            strategy: '保持 ' + node.name + ' 对外输入输出不变，避免牵连用到它的 ' + impactCount + ' 个文件。',
            surgicalPrompt: '[CodeSight Adjustment: Safe Internal Change]\\nModify \`' + node.path + '\` while strictly keeping its exported interface and behavior backward-compatible so none of its ' + impactCount + ' dependent files break.'
          },
          {
            id: 'adj-refactor',
            label: '连同依赖它的 ' + impactCount + ' 个文件一起调整',
            strategy: '如果需要改数据结构或函数签名，让 AI 顺着地图把相关文件同步改齐。',
            surgicalPrompt: '[CodeSight Adjustment: Coordinated Update]\\nUpdate \`' + node.path + '\` AND synchronously update all ' + impactCount + ' dependent files (' + node.allDownstreamPaths.slice(0, 5).join(', ') + '). Run typecheck & tests to verify.'
          }
        ];
      }
      return [
        {
          id: 'adj-leaf',
          label: '放心直接调整 ' + node.name + '（影响极小）',
          strategy: impactCount === 0 ? '没有其他文件依赖它，直接在这里改功能或修样式很安全。' : '只影响 ' + impactCount + ' 个直接关联文件，改动可控。',
          surgicalPrompt: '[CodeSight Adjustment: Scoped Edit]\\nUpdate \`' + node.path + '\` cleanly. Keep changes minimal and verify ' + (impactCount > 0 ? node.directDownstreamPaths.join(', ') : 'local tests/build') + '.'
        },
        {
          id: 'adj-explain',
          label: '让 AI 结合上下游详细讲讲这段代码',
          strategy: '只把这 1 个文件和它的直接关联发给 AI，不浪费 Token 就能听懂来龙去脉。',
          surgicalPrompt: '[CodeSight Explain]\\nExplain how \`' + node.path + '\` works in plain language, focusing on how it uses (' + (node.upstreamPaths.join(', ') || 'none') + ') and serves (' + (node.directDownstreamPaths.join(', ') || 'top-level entry') + ').'
        }
      ];
    }

    function renderActionCard() {
      const node = nodeMap.get(selectedId);
      if (!node) return;
      const isFaultView = mode === 'diagnosis' && DATA.activeDiagnosis && DATA.activeDiagnosis.targetNodeId === node.id;
      const impactCount = node.allDownstreamPaths.length;
      const safeCount = Math.max(0, DATA.totalFiles - 1 - impactCount);

      const badgeStyle = isFaultView
        ? 'color:var(--cs-red);background:var(--cs-red-soft)'
        : impactCount >= 3
        ? 'color:var(--cs-amber);background:var(--cs-amber-soft)'
        : 'color:var(--cs-green);background:var(--cs-green-soft)';

      const badgeLabel = isFaultView
        ? '报错位置 · 关联 ' + impactCount + ' 个文件'
        : impactCount >= 3
        ? '基础文件 · 被 ' + impactCount + ' 处用到'
        : impactCount > 0
        ? '关联 ' + impactCount + ' 个文件'
        : '独立文件 · 放心修改';

      const title = isFaultView ? DATA.activeDiagnosis.headline : node.name + ' — ' + node.roleLabel;
      const desc = isFaultView ? DATA.activeDiagnosis.subtext : node.summary;
      const dirs = isFaultView ? DATA.activeDiagnosis.directions : buildExploreDirections(node);
      const warns = isFaultView ? (DATA.activeDiagnosis.silentRegressions || []) : [];

      const callerText = node.callers.length > 0
        ? node.callers.slice(0, 2).map(c => c.callerName + ' (' + c.callerFile.split('/').pop() + ':' + c.callerLine + ')').join('、')
        : (node.directDownstreamPaths.slice(0, 2).map(p => p.split('/').pop()).join('、') || '无');

      const upstreamText = node.upstreamPaths.slice(0, 2).map(p => p.split('/').pop()).join('、') || '无';

      cardEl.innerHTML =
        '<div class="cs-card-head">' +
          '<div>' +
            '<div class="cs-card-kicker">' +
              '<span>' + (isFaultView ? '当前报错处理卡' : '文件透视与调整卡') + '</span>' +
              '<span>·</span>' +
              '<span style="font-family:var(--font-mono,monospace)">' + escHtml(node.path) + (isFaultView && DATA.activeDiagnosis.targetLine ? ':' + DATA.activeDiagnosis.targetLine : '') + '</span>' +
            '</div>' +
            '<h3 class="cs-card-title">' + escHtml(title) + '</h3>' +
            (desc ? '<p class="cs-card-desc">' + escHtml(desc) + '</p>' : '') +
          '</div>' +
          '<span class="cs-pill" style="' + badgeStyle + '">' + escHtml(badgeLabel) + '</span>' +
        '</div>' +
        '<div class="cs-impact-strip">' +
          '<span class="cs-impact-kv"><span class="cs-dot" style="background:var(--cs-blue)"></span>用到：<strong>' + escHtml(upstreamText) + '</strong></span>' +
          '<span class="cs-impact-kv"><span class="cs-dot" style="background:var(--cs-amber)"></span>影响：<strong>' + escHtml(callerText) + '</strong></span>' +
          '<span class="cs-impact-kv" style="color:var(--cs-green)"><span class="cs-dot" style="background:var(--cs-green)"></span>其余 ' + safeCount + ' 个文件不受影响</span>' +
        '</div>' +
        (warns.length > 0
          ? '<div class="cs-warn-box"><strong>发现 ' + warns.length + ' 处隐蔽隐患：</strong>' + warns.map(w => escHtml(w.title)).join('；') + '</div>'
          : '') +
        '<div class="cs-choices">' +
          dirs.map((d, idx) =>
            '<label class="cs-choice">' +
              '<input type="radio" name="cs_action" value="' + escHtml(d.id) + '" ' + (idx === 0 ? 'checked' : '') + ' />' +
              '<div>' +
                '<div class="cs-choice-title">' + escHtml(d.label) + '</div>' +
                '<div class="cs-choice-sub">' + escHtml(d.strategy) + '</div>' +
              '</div>' +
            '</label>'
          ).join('') +
        '</div>' +
        '<div class="cs-cta-row">' +
          '<button type="button" class="cs-btn" id="cs-copy-btn">' + (isFaultView ? '复制修改指令给 AI' : '复制调整指令给 AI') + '</button>' +
          (DATA.activeDiagnosis && !isFaultView
            ? '<button type="button" class="cs-btn-ghost" id="cs-back-fault">回到报错文件</button>'
            : '<span class="cs-subtitle">点击上方任意文件，实时切换关联路线与操作卡</span>') +
        '</div>';

      const copyBtn = document.getElementById('cs-copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          const checked = cardEl.querySelector('input[name="cs_action"]:checked');
          const chosen = dirs.find(d => d.id === checked?.value) || dirs[0];
          try { await navigator.clipboard.writeText(chosen.surgicalPrompt); } catch {}
          window.parent?.postMessage({ type: 'codesight:actionPrompt', nodeId: node.id, prompt: chosen.surgicalPrompt }, '*');
          const old = copyBtn.textContent;
          copyBtn.textContent = '已复制，直接发给 AI 即可';
          setTimeout(() => { copyBtn.textContent = old; }, 1600);
        });
      }

      const backBtn = document.getElementById('cs-back-fault');
      if (backBtn && DATA.activeDiagnosis?.targetNodeId) {
        backBtn.addEventListener('click', () => {
          mode = 'diagnosis';
          selectNode(DATA.activeDiagnosis.targetNodeId);
        });
      }
    }

    function selectNode(id) {
      selectedId = id;
      if (DATA.activeDiagnosis && id === DATA.activeDiagnosis.targetNodeId) {
        mode = 'diagnosis';
      } else {
        mode = 'explore';
      }
      updateNodeHighlights();
      drawEdges();
      renderActionCard();
    }

    nodeEls.forEach((el, id) => {
      el.addEventListener('click', () => selectNode(id));
    });

    window.addEventListener('resize', drawEdges);
    requestAnimationFrame(() => {
      updateNodeHighlights();
      drawEdges();
      renderActionCard();
    });
  `;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>CodeSight · ${esc(payload.repoName)}</title>
  <style>${INTERACTIVE_MAP_CSS}</style>
</head>
<body>
  <div class="cs-app">
    <header class="cs-header">
      <div class="cs-brand">
        <span class="cs-logo">${LOGO_SVG}</span>
        <div>
          <div class="cs-title">${esc(payload.repoName)} · 活架构地图</div>
          <div class="cs-subtitle">${isDiag ? '已标红当前报错位置，点任意文件可看影响路线与修改方案' : `共 ${payload.totalFiles} 个文件（已展示 ${payload.shownFiles} 个核心文件）· 点任意文件查看用途与调整`}</div>
        </div>
      </div>
      <div class="cs-legend">
        ${isDiag ? '<span class="cs-legend-item"><span class="cs-dot" style="background:var(--cs-red)"></span>报错点</span>' : '<span class="cs-legend-item"><span class="cs-dot" style="background:var(--cs-blue)"></span>当前/依赖</span>'}
        <span class="cs-legend-item"><span class="cs-dot" style="background:var(--cs-amber)"></span>会受影响</span>
        <span class="cs-legend-item"><span class="cs-dot" style="background:var(--cs-muted);opacity:0.35"></span>不受影响</span>
      </div>
    </header>

    <div class="cs-canvas-wrap">
      <div class="cs-canvas-stage" id="cs-stage">
        <svg class="cs-edges-svg" id="cs-svg"></svg>
        <div class="cs-lanes" style="--lane-count:${Math.max(1, payload.lanes.length)}">
          ${lanesHtml}
        </div>
      </div>
    </div>

    <section class="cs-action-card" id="cs-action-card"></section>
  </div>
  <script>${script}</script>
</body>
</html>`;
}

export function renderTraceCardHtml(trace: SymbolTraceReport): string {
  const rows = trace.matches
    .map(
      (m) => `
      <div style="padding:14px 18px;border-top:1px solid var(--cs-border)">
        <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:4px">
          <strong style="font-family:var(--font-mono,monospace);font-size:13px">${esc(m.symbol.name)}</strong>
          <span style="font-size:12px;color:var(--cs-muted);font-family:var(--font-mono,monospace)">${esc(m.symbol.file.split('/').pop() ?? m.symbol.file)} 第 ${m.symbol.startLine} 行</span>
        </div>
        <div style="font-size:12.5px;color:var(--cs-muted)">
          被以下地方用到（${m.calledBy.length} 处）：${esc(
            m.calledBy.map((e) => `${e.callerName}（${e.callerFile.split('/').pop()} 第 ${e.callerLine} 行）`).join('、') || '暂无其他文件直接调用'
          )}
        </div>
      </div>`
    )
    .join('');

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CodeSight Trace</title><style>${INTERACTIVE_MAP_CSS}</style></head><body><div class="cs-app"><div class="cs-header"><div class="cs-title">函数调用追踪 · ${esc(trace.querySymbol)}</div><div class="cs-subtitle">${trace.traceMs}ms</div></div>${rows || '<div style="padding:16px;font-size:13px;color:var(--cs-muted)">未找到对应函数或组件。</div>'}</div></body></html>`;
}
