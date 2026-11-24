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

/**
 * Single-Screen Master-Detail Architecture Cockpit:
 * - Left: Compact Horizontal Swimlane Map (full filenames, zero truncation, fits in 1 screen)
 * - Right: Pinned Contextual Action Card (updates immediately on node click, zero scrolling!)
 * - SVG Flow: Draws ONLY clean 1-hop direct connections for the selected node across generous vertical gaps (zero spaghetti noodles!)
 */
const COCKPIT_CSS = `
  .cs-app {
    --cs-card: var(--card, #ffffff);
    --cs-canvas: var(--muted, rgba(120, 118, 114, 0.055));
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
      --cs-blue-soft: rgba(96, 165, 250, 0.16);
      --cs-red: #f87171;
      --cs-red-soft: rgba(248, 113, 113, 0.17);
      --cs-amber: #fbbf24;
      --cs-amber-soft: rgba(251, 191, 36, 0.15);
      --cs-green: #34d399;
      --cs-green-soft: rgba(52, 211, 153, 0.14);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 6px;
    font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif);
    background: var(--background, transparent);
    color: var(--foreground, #1c1917);
    -webkit-font-smoothing: antialiased;
  }
  .cs-app {
    max-width: 920px;
    background: var(--cs-card);
    border: 1px solid var(--cs-border);
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 6px 26px rgba(0, 0, 0, 0.05);
  }

  /* Compact Header */
  .cs-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--cs-border);
    flex-wrap: wrap;
  }
  .cs-brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .cs-logo {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: var(--cs-blue-soft);
    color: var(--cs-blue);
    display: grid;
    place-items: center;
  }
  .cs-title {
    font-size: 13.5px;
    font-weight: 650;
    color: var(--cs-ink);
  }
  .cs-sub {
    font-size: 11.5px;
    color: var(--cs-muted);
  }
  .cs-legend {
    display: flex;
    align-items: center;
    gap: 11px;
    font-size: 11px;
    color: var(--cs-muted);
  }
  .cs-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .cs-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
  }

  /* Single-Screen Left-Right Cockpit Split */
  .cs-cockpit {
    display: grid;
    grid-template-columns: minmax(0, 1.32fr) minmax(290px, 0.92fr);
    align-items: stretch;
  }
  @media (max-width: 680px) {
    .cs-cockpit {
      grid-template-columns: 1fr;
    }
    .cs-inspector {
      border-left: none !important;
      border-top: 1px solid var(--cs-border);
    }
  }

  /* Left: Horizontal Layered Swimlane Map */
  .cs-map-pane {
    position: relative;
    padding: 14px 16px 16px;
    background: var(--cs-canvas);
  }
  .cs-stage {
    position: relative;
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
    stroke-linecap: round;
    transition: opacity 0.16s ease;
  }
  .cs-edge-up {
    stroke: var(--cs-blue);
    stroke-width: 1.6;
    opacity: 0.78;
  }
  .cs-edge-down {
    stroke: var(--cs-amber);
    stroke-width: 1.75;
    opacity: 0.85;
  }
  .cs-edge-fault {
    stroke: var(--cs-red);
    stroke-width: 1.85;
    opacity: 0.88;
  }

  .cs-rows {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 24px; /* Generous horizontal gap so vertical curves breathe cleanly! */
  }
  .cs-row-block {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .cs-row-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 600;
    color: var(--cs-muted);
    padding: 0 2px;
  }
  .cs-row-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    align-items: center;
  }

  /* Crisp Single-Line Auto-Width File Pills (ZERO truncated names!) */
  .cs-chip {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 10px;
    border: 1px solid var(--cs-border);
    background: var(--cs-card);
    color: var(--cs-ink);
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 11.5px;
    font-weight: 550;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
    transition: transform 0.14s ease, border-color 0.14s ease, opacity 0.16s ease, box-shadow 0.14s ease;
  }
  .cs-chip:hover {
    transform: translateY(-1px);
    border-color: var(--cs-border-strong);
  }
  .cs-chip.is-dim {
    opacity: 0.3;
  }
  .cs-chip.is-selected {
    border-color: var(--cs-blue);
    background: var(--cs-blue-soft);
    box-shadow: 0 0 0 2px var(--cs-blue-soft);
    opacity: 1;
    font-weight: 650;
  }
  .cs-chip.is-fault {
    border-color: var(--cs-red);
    background: var(--cs-red-soft);
    box-shadow: 0 0 0 2px var(--cs-red-soft);
    opacity: 1;
    font-weight: 650;
  }
  .cs-chip.is-upstream {
    border-color: var(--cs-blue);
    background: var(--cs-blue-soft);
    opacity: 1;
  }
  .cs-chip.is-direct-down {
    border-color: var(--cs-amber);
    background: var(--cs-amber-soft);
    opacity: 1;
  }
  .cs-chip.is-indirect-down {
    border-style: dashed;
    border-color: rgba(217, 119, 6, 0.45);
    background: var(--cs-card);
    opacity: 0.82;
  }
  .cs-chip-tag {
    font-family: var(--font-sans, -apple-system, sans-serif);
    font-size: 10px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 999px;
    background: var(--cs-amber-soft);
    color: var(--cs-amber);
  }
  .cs-chip.is-fault .cs-chip-tag {
    background: var(--cs-red);
    color: #fff;
  }
  .cs-more-btn {
    appearance: none;
    border: 1px dashed var(--cs-border-strong);
    background: transparent;
    color: var(--cs-muted);
    font-size: 11px;
    padding: 5px 9px;
    border-radius: 9px;
    cursor: pointer;
  }
  .cs-more-btn:hover {
    color: var(--cs-ink);
  }

  /* Right: Pinned Contextual Inspector / Action Card (Always Visible!) */
  .cs-inspector {
    border-left: 1px solid var(--cs-border);
    padding: 16px 18px;
    background: var(--cs-card);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .cs-ins-kicker {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 11px;
    color: var(--cs-muted);
  }
  .cs-pill {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .cs-ins-title {
    margin: 0;
    font-size: 15px;
    font-weight: 650;
    line-height: 1.42;
    color: var(--cs-ink);
  }
  .cs-ins-desc {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.58;
    color: var(--cs-muted);
  }
  .cs-rel-box {
    padding: 10px 12px;
    border-radius: 11px;
    background: var(--cs-canvas);
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
    color: var(--cs-ink);
  }
  .cs-rel-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .cs-rel-key {
    color: var(--cs-muted);
    flex-shrink: 0;
    font-size: 11.5px;
  }
  .cs-rel-val {
    font-family: var(--font-mono, ui-monospace, Menlo, monospace);
    font-size: 11.5px;
    font-weight: 500;
    word-break: break-word;
  }
  .cs-warn-box {
    padding: 9px 11px;
    border-radius: 10px;
    background: var(--cs-amber-soft);
    border: 1px solid rgba(217, 119, 6, 0.24);
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--cs-ink);
  }
  .cs-choices {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .cs-choice {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 9px 11px;
    border-radius: 11px;
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
    margin-top: 2px;
    accent-color: var(--cs-blue);
  }
  .cs-choice-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--cs-ink);
    line-height: 1.38;
  }
  .cs-choice-sub {
    font-size: 11px;
    color: var(--cs-muted);
    margin-top: 2px;
    line-height: 1.42;
  }
  .cs-cta-col {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .cs-btn {
    appearance: none;
    border: none;
    border-radius: 10px;
    padding: 10px 14px;
    width: 100%;
    background: var(--cs-accent);
    color: var(--cs-accent-fg);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }
  .cs-btn:hover { opacity: 0.9; }
  .cs-btn-link {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--cs-blue);
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
    padding: 2px 0;
    align-self: center;
  }
`;

const LOGO_SVG = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="3.5" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/></svg>`;

/**
 * Single-Screen Architecture Cockpit Renderer:
 * Left = Horizontal Layered Swimlane Map (compact, zero truncation, ONLY direct 1-hop curves!)
 * Right = Pinned Contextual Action Card (updates immediately beside the map with zero scrolling!)
 */
export function renderVisualProjectMapHtml(payload: VisualProjectMapPayload): string {
  const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  const isDiag = Boolean(payload.activeDiagnosis);

  const script = `
    const DATA = ${safeJson};
    const nodeMap = new Map(DATA.nodes.map(n => [n.id, n]));
    const rowsEl = document.getElementById('cs-rows');
    const stageEl = document.getElementById('cs-stage');
    const svgEl = document.getElementById('cs-svg');
    const inspectorEl = document.getElementById('cs-inspector');

    const MAX_PER_ROW = 5;
    const expandedLanes = new Set();
    let selectedId = DATA.activeDiagnosis?.targetNodeId || (DATA.nodes.find(n => n.isHub)?.id ?? DATA.nodes[0]?.id);
    let mode = DATA.activeDiagnosis ? 'diagnosis' : 'explore';

    function escHtml(s) {
      return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function renderMapRows() {
      const sel = nodeMap.get(selectedId);
      const upSet = new Set(sel ? sel.upstreamPaths : []);
      const directDownSet = new Set(sel ? sel.directDownstreamPaths : []);
      const allDownSet = new Set(sel ? sel.allDownstreamPaths : []);
      const isFaultSelected = mode === 'diagnosis' && DATA.activeDiagnosis?.targetNodeId === selectedId;

      rowsEl.innerHTML = DATA.lanes.map(lane => {
        const isExpanded = expandedLanes.has(lane.id);
        // Always ensure selected/fault/direct-connected nodes stay visible in compact row
        const orderedIds = [...lane.nodeIds].sort((a, b) => {
          const score = (id) =>
            id === selectedId ? 4 :
            id === DATA.activeDiagnosis?.targetNodeId ? 3 :
            (upSet.has(id) || directDownSet.has(id)) ? 2 : 0;
          return score(b) - score(a);
        });
        const visibleIds = isExpanded ? orderedIds : orderedIds.slice(0, MAX_PER_ROW);
        const hiddenCount = orderedIds.length - visibleIds.length;

        const chips = visibleIds.map(id => {
          const n = nodeMap.get(id);
          if (!n) return '';
          const cls = ['cs-chip'];
          if (id === selectedId) {
            cls.push(isFaultSelected ? 'is-fault' : 'is-selected');
          } else if (upSet.has(id)) {
            cls.push('is-upstream');
          } else if (directDownSet.has(id)) {
            cls.push('is-direct-down');
          } else if (allDownSet.has(id)) {
            cls.push('is-indirect-down');
          } else {
            cls.push('is-dim');
          }

          const tag = id === DATA.activeDiagnosis?.targetNodeId
            ? '<span class="cs-chip-tag">报错</span>'
            : n.downstreamReach >= 5
            ? '<span class="cs-chip-tag">' + n.downstreamReach + '处用</span>'
            : '';

          return '<button type="button" class="' + cls.join(' ') + '" data-node-id="' + escHtml(n.id) + '" title="' + escHtml(n.path + ' · ' + n.roleLabel) + '">' +
            '<span>' + escHtml(n.name) + '</span>' + tag +
          '</button>';
        }).join('');

        const moreBtn = hiddenCount > 0
          ? '<button type="button" class="cs-more-btn" data-expand-lane="' + escHtml(lane.id) + '">+' + hiddenCount + ' 更多</button>'
          : (isExpanded && orderedIds.length > MAX_PER_ROW
              ? '<button type="button" class="cs-more-btn" data-expand-lane="' + escHtml(lane.id) + '">收起</button>'
              : '');

        return '<div class="cs-row-block">' +
          '<div class="cs-row-label"><span>' + escHtml(lane.title) + '</span><span style="font-weight:400">' + escHtml(lane.subtitle) + '</span></div>' +
          '<div class="cs-row-chips">' + chips + moreBtn + '</div>' +
        '</div>';
      }).join('');

      rowsEl.querySelectorAll('.cs-chip').forEach(btn => {
        btn.addEventListener('click', () => selectNode(btn.dataset.nodeId));
      });
      rowsEl.querySelectorAll('.cs-more-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const lid = btn.dataset.expandLane;
          if (expandedLanes.has(lid)) expandedLanes.delete(lid);
          else expandedLanes.add(lid);
          renderAll();
        });
      });
    }

    /**
     * Draw ONLY clean direct 1-hop curves connected to selectedId!
     * Zero tangled spaghetti bundles: indirect nodes are communicated cleanly via dashed chip styling.
     */
    function drawCleanDirectEdges() {
      const stageRect = stageEl.getBoundingClientRect();
      svgEl.setAttribute('viewBox', '0 0 ' + stageRect.width + ' ' + stageRect.height);

      const chipEls = new Map();
      rowsEl.querySelectorAll('.cs-chip').forEach(el => chipEls.set(el.dataset.nodeId, el));

      const selEl = chipEls.get(selectedId);
      const selNode = nodeMap.get(selectedId);
      if (!selEl || !selNode) {
        svgEl.innerHTML = '';
        return;
      }

      const defs =
        '<defs>' +
          '<marker id="arr-blue" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse"><path d="M1 1.5 L6.5 4 L1 6.5" fill="none" stroke="var(--cs-blue)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker>' +
          '<marker id="arr-amber" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse"><path d="M1 1.5 L6.5 4 L1 6.5" fill="none" stroke="var(--cs-amber)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker>' +
          '<marker id="arr-red" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse"><path d="M1 1.5 L6.5 4 L1 6.5" fill="none" stroke="var(--cs-red)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker>' +
        '</defs>';

      const isFaultMode = mode === 'diagnosis' && DATA.activeDiagnosis?.targetNodeId === selectedId;
      const selRect = selEl.getBoundingClientRect();
      const paths = [];

      function connect(fromRect, toRect, cls, markerId, offsetIndex) {
        const sameRow = Math.abs(fromRect.top - toRect.top) < 16;
        if (sameRow) {
          // Gentle short arc above the chips in the same row
          const x1 = fromRect.left + fromRect.width / 2 - stageRect.left;
          const x2 = toRect.left + toRect.width / 2 - stageRect.left;
          const y = fromRect.top - stageRect.top;
          const lift = 12 + (offsetIndex % 3) * 4;
          const d = 'M ' + x1 + ' ' + y + ' Q ' + ((x1 + x2) / 2) + ' ' + (y - lift) + ' ' + x2 + ' ' + y;
          paths.push('<path class="cs-edge ' + cls + '" d="' + d + '" marker-end="url(#' + markerId + ')" />');
          return;
        }
        const goingDown = fromRect.top < toRect.top;
        const x1 = fromRect.left + fromRect.width / 2 - stageRect.left + ((offsetIndex % 3) - 1) * 5;
        const y1 = (goingDown ? fromRect.bottom : fromRect.top) - stageRect.top;
        const x2 = toRect.left + toRect.width / 2 - stageRect.left;
        const y2 = (goingDown ? toRect.top : toRect.bottom) - stageRect.top;
        const midY = (y1 + y2) / 2;
        const d = 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + midY + ', ' + x2 + ' ' + midY + ', ' + x2 + ' ' + y2;
        paths.push('<path class="cs-edge ' + cls + '" d="' + d + '" marker-end="url(#' + markerId + ')" />');
      }

      // 1. Direct upstream dependencies (blue: selected -> dependency)
      selNode.upstreamPaths.slice(0, 6).forEach((upId, idx) => {
        const upEl = chipEls.get(upId);
        if (!upEl) return;
        connect(selRect, upEl.getBoundingClientRect(), 'cs-edge-up', 'arr-blue', idx);
      });

      // 2. Direct downstream dependents (amber/red: selected -> caller)
      selNode.directDownstreamPaths.slice(0, 6).forEach((downId, idx) => {
        const downEl = chipEls.get(downId);
        if (!downEl) return;
        connect(
          selRect,
          downEl.getBoundingClientRect(),
          isFaultMode ? 'cs-edge-fault' : 'cs-edge-down',
          isFaultMode ? 'arr-red' : 'arr-amber',
          idx
        );
      });

      svgEl.innerHTML = defs + paths.join('');
    }

    function buildExploreDirections(node) {
      const impactCount = node.allDownstreamPaths.length;
      if (impactCount >= 3) {
        return [
          {
            id: 'adj-safe',
            label: '只改内部实现，不影响别的文件',
            strategy: '保持 ' + node.name + ' 原有输入输出不变，避免波及用到它的 ' + impactCount + ' 个文件。',
            surgicalPrompt: '[CodeSight Fix Plan: Safe Internal Edit]\\nModify \`' + node.path + '\` while keeping its exported signature and behavior backward-compatible so none of its ' + impactCount + ' dependent files break.'
          },
          {
            id: 'adj-refactor',
            label: '连同相关 ' + impactCount + ' 个文件一起改',
            strategy: '如果要改数据结构或参数，让 AI 按依赖关系同步改齐全部关联文件。',
            surgicalPrompt: '[CodeSight Fix Plan: Coordinated Update]\\nUpdate \`' + node.path + '\` AND synchronously update all ' + impactCount + ' dependent files (' + node.allDownstreamPaths.slice(0, 5).join(', ') + '). Run typecheck & tests.'
          }
        ];
      }
      return [
        {
          id: 'adj-leaf',
          label: '放心直接改 ' + node.name,
          strategy: impactCount === 0 ? '没有别的文件依赖它，可以直接调整功能或修问题。' : '只关联 ' + impactCount + ' 个文件，改动可控。',
          surgicalPrompt: '[CodeSight Fix Plan: Scoped Edit]\\nUpdate \`' + node.path + '\` cleanly. Keep changes minimal and verify ' + (impactCount > 0 ? node.directDownstreamPaths.join(', ') : 'build & tests') + '.'
        },
        {
          id: 'adj-explain',
          label: '让 AI 结合上下游讲讲这段代码',
          strategy: '只发这个文件与直接关联文件，低 Token 听懂来龙去脉。',
          surgicalPrompt: '[CodeSight Explain]\\nExplain how \`' + node.path + '\` works in plain Chinese, including how it uses (' + (node.upstreamPaths.join(', ') || 'none') + ') and serves (' + (node.directDownstreamPaths.join(', ') || 'top-level entry') + ').'
        }
      ];
    }

    function renderInspector() {
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

      const badgeText = isFaultView
        ? '报错点 · 关联 ' + impactCount + ' 文件'
        : impactCount >= 3
        ? '基础文件 · ' + impactCount + ' 处用到'
        : impactCount > 0
        ? '关联 ' + impactCount + ' 个文件'
        : '独立文件 · 放心改';

      const title = isFaultView ? DATA.activeDiagnosis.headline : node.name;
      const desc = isFaultView
        ? (DATA.activeDiagnosis.subtext || node.summary)
        : (node.roleLabel + '：' + node.summary);
      const dirs = isFaultView ? DATA.activeDiagnosis.directions : buildExploreDirections(node);
      const warns = isFaultView ? (DATA.activeDiagnosis.silentRegressions || []) : [];

      const upStr = node.upstreamPaths.slice(0, 3).map(p => p.split('/').pop()).join('、') || '无';
      const downStr = node.callers.length > 0
        ? node.callers.slice(0, 2).map(c => c.callerFile.split('/').pop() + ':' + c.callerLine).join('、')
        : (node.directDownstreamPaths.slice(0, 3).map(p => p.split('/').pop()).join('、') || '无');
      const indirectExtra = Math.max(0, impactCount - node.directDownstreamPaths.length);

      inspectorEl.innerHTML =
        '<div class="cs-ins-kicker">' +
          '<span>' + (isFaultView ? '报错处理卡' : '文件透视卡') + '</span>' +
          '<span class="cs-pill" style="' + badgeStyle + '">' + escHtml(badgeText) + '</span>' +
        '</div>' +
        '<div>' +
          '<h3 class="cs-ins-title">' + escHtml(title) + '</h3>' +
          '<p class="cs-ins-desc" style="margin-top:5px">' + escHtml(desc) + '</p>' +
        '</div>' +
        '<div class="cs-rel-box">' +
          '<div class="cs-rel-row"><span class="cs-dot" style="background:var(--cs-blue);margin-top:4px"></span><span class="cs-rel-key">用到：</span><span class="cs-rel-val">' + escHtml(upStr) + '</span></div>' +
          '<div class="cs-rel-row"><span class="cs-dot" style="background:var(--cs-amber);margin-top:4px"></span><span class="cs-rel-key">影响：</span><span class="cs-rel-val">' + escHtml(downStr) + (indirectExtra > 0 ? ' 等 ' + impactCount + ' 个' : '') + '</span></div>' +
          '<div class="cs-rel-row"><span class="cs-dot" style="background:var(--cs-green);margin-top:4px"></span><span style="color:var(--cs-green);font-weight:500">其余 ' + safeCount + ' 个文件不受影响</span></div>' +
        '</div>' +
        (warns.length > 0
          ? '<div class="cs-warn-box"><strong>隐蔽隐患：</strong>' + warns.map(w => escHtml(w.title)).join('；') + '</div>'
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
        '<div class="cs-cta-col">' +
          '<button type="button" class="cs-btn" id="cs-copy-btn">' + (isFaultView ? '复制修改指令给 AI' : '复制调整指令给 AI') + '</button>' +
          (DATA.activeDiagnosis && !isFaultView
            ? '<button type="button" class="cs-btn-link" id="cs-back-fault">回到报错文件</button>'
            : '') +
        '</div>';

      const copyBtn = document.getElementById('cs-copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          const checked = inspectorEl.querySelector('input[name="cs_action"]:checked');
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

    function renderAll() {
      renderMapRows();
      renderInspector();
      requestAnimationFrame(drawCleanDirectEdges);
    }

    function selectNode(id) {
      selectedId = id;
      mode = (DATA.activeDiagnosis && id === DATA.activeDiagnosis.targetNodeId) ? 'diagnosis' : 'explore';
      renderAll();
    }

    window.addEventListener('resize', drawCleanDirectEdges);
    renderAll();
  `;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>CodeSight · ${esc(payload.repoName)}</title>
  <style>${COCKPIT_CSS}</style>
</head>
<body>
  <div class="cs-app">
    <header class="cs-header">
      <div class="cs-brand">
        <span class="cs-logo">${LOGO_SVG}</span>
        <div>
          <div class="cs-title">${esc(payload.repoName)} · 活架构地图</div>
          <div class="cs-sub">${isDiag ? '点左侧任意文件，右侧实时显示用途、影响与修改方案' : `共 ${payload.totalFiles} 个文件 · 点左侧任意文件，右侧秒看用途与调整方案`}</div>
        </div>
      </div>
      <div class="cs-legend">
        ${isDiag ? '<span class="cs-legend-item"><span class="cs-dot" style="background:var(--cs-red)"></span>报错点</span>' : ''}
        <span class="cs-legend-item"><span class="cs-dot" style="background:var(--cs-blue)"></span>当前/依赖</span>
        <span class="cs-legend-item"><span class="cs-dot" style="background:var(--cs-amber)"></span>直接影响</span>
        <span class="cs-legend-item"><span class="cs-dot" style="background:var(--cs-muted);opacity:0.35"></span>不受影响</span>
      </div>
    </header>

    <div class="cs-cockpit">
      <div class="cs-map-pane">
        <div class="cs-stage" id="cs-stage">
          <svg class="cs-edges-svg" id="cs-svg"></svg>
          <div class="cs-rows" id="cs-rows"></div>
        </div>
      </div>
      <aside class="cs-inspector" id="cs-inspector"></aside>
    </div>
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

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CodeSight Trace</title><style>${COCKPIT_CSS}</style></head><body><div class="cs-app"><div class="cs-header"><div class="cs-title">函数调用追踪 · ${esc(trace.querySymbol)}</div><div class="cs-sub">${trace.traceMs}ms</div></div>${rows || '<div style="padding:16px;font-size:13px;color:var(--cs-muted)">未找到对应函数或组件。</div>'}</div></body></html>`;
}
