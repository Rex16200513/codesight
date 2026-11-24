import type {
  SymbolTraceReport,
  VisualProjectMapPayload,
} from '@codesight/core/engine';

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * CodeSight v0.8.3 Vertical Architecture Board + Directional Dashed SVG Flow + Clean Modal:
 * 1. Three vertical side-by-side columns (Frontend | Backend | Shared Core) inside ONE big card.
 * 2. Clean directional dashed SVG lines (`stroke-dasharray: 4 3.5` + anchor dots + arrowheads)
 *    connecting ONLY the hovered/focused module's direct 1-hop upstream/downstream relations.
 * 3. Crystal-clear Modal distinguishing Read-Only Info vs Clickable Controls:
 *    - Exploration Mode: NO filler radio choices! Clean 2-button action bar ("让 AI 调整此文件" / "让 AI 讲讲这段代码").
 *    - Error Mode: Radio decision cards ONLY when real architectural choices exist.
 *    - Related file jump pills carry explicit `↗` affordance so interactivity is unmistakable.
 */
const BOARD_CSS = `
  .cs-board,
  .cs-modal-backdrop {
    --cs-card: var(--card, #ffffff);
    --cs-surface: var(--muted, #f4f3ef);
    --cs-ink: var(--foreground, #1c1917);
    --cs-muted: var(--muted-foreground, #6b6560);
    --cs-border: var(--border, rgba(28, 25, 23, 0.12));
    --cs-border-strong: rgba(28, 25, 23, 0.22);
    --cs-accent: var(--primary, #111827);
    --cs-accent-fg: var(--primary-foreground, #ffffff);
    --cs-blue: #2563eb;
    --cs-blue-soft: rgba(37, 99, 235, 0.1);
    --cs-violet: #7c3aed;
    --cs-violet-soft: rgba(124, 58, 237, 0.1);
    --cs-red: #dc2626;
    --cs-red-soft: rgba(220, 38, 38, 0.12);
    --cs-amber: #d97706;
    --cs-amber-soft: rgba(217, 119, 6, 0.12);
    --cs-green: #059669;
    --cs-green-soft: rgba(5, 150, 105, 0.11);
  }
  @media (prefers-color-scheme: dark) {
    .cs-board,
    .cs-modal-backdrop {
      --cs-card: var(--card, #242426);
      --cs-surface: var(--muted, #1c1c1e);
      --cs-border-strong: rgba(255, 255, 255, 0.22);
      --cs-blue: #60a5fa;
      --cs-blue-soft: rgba(96, 165, 250, 0.16);
      --cs-violet: #a78bfa;
      --cs-violet-soft: rgba(167, 139, 250, 0.16);
      --cs-red: #f87171;
      --cs-red-soft: rgba(248, 113, 113, 0.17);
      --cs-amber: #fbbf24;
      --cs-amber-soft: rgba(251, 191, 36, 0.15);
      --cs-green: #34d399;
      --cs-green-soft: rgba(52, 211, 153, 0.15);
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

  .cs-board {
    position: relative;
    max-width: 960px;
    background: var(--cs-card);
    border: 1px solid var(--cs-border);
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 6px 28px rgba(0, 0, 0, 0.05);
  }

  .cs-topbar {
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
    font-size: 13.5px;
    font-weight: 650;
    color: var(--cs-ink);
  }
  .cs-sub {
    font-size: 11px;
    color: var(--cs-muted);
    margin-top: 1px;
  }
  .cs-legend {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 11px;
    color: var(--cs-muted);
  }
  .cs-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .cs-dash-sample {
    width: 14px;
    height: 0;
    border-top: 1.8px dashed currentColor;
    display: inline-block;
  }

  .cs-fault-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 16px;
    background: var(--cs-red-soft);
    border-bottom: 1px solid rgba(220, 38, 38, 0.2);
    font-size: 12px;
    color: var(--cs-ink);
    flex-wrap: wrap;
  }
  .cs-fault-btn {
    appearance: none;
    border: none;
    border-radius: 8px;
    padding: 5px 11px;
    background: var(--cs-red);
    color: #fff;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }

  /* Board Stage + Directional Dashed SVG Overlay */
  .cs-stage {
    position: relative;
    background: var(--cs-surface);
  }
  .cs-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
    z-index: 4;
  }
  .cs-edge-up {
    fill: none;
    stroke: var(--cs-blue);
    stroke-width: 1.6;
    stroke-dasharray: 4 3.5;
    stroke-linecap: round;
    opacity: 0.85;
  }
  .cs-edge-down {
    fill: none;
    stroke: var(--cs-amber);
    stroke-width: 1.65;
    stroke-dasharray: 4 3.5;
    stroke-linecap: round;
    opacity: 0.9;
  }
  .cs-edge-fault {
    fill: none;
    stroke: var(--cs-red);
    stroke-width: 1.75;
    stroke-dasharray: 4 3.5;
    stroke-linecap: round;
    opacity: 0.92;
  }

  /* Three Vertical Side-by-Side Columns Inside ONE Big Card */
  .cs-columns {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: repeat(var(--zone-count, 3), minmax(0, 1fr));
  }
  @media (max-width: 380px) {
    .cs-columns { grid-template-columns: 1fr; }
    .cs-col + .cs-col { border-left: none !important; border-top: 1px dashed var(--cs-border-strong); }
  }
  .cs-col {
    padding: 12px 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 11px;
    min-width: 0;
  }
  .cs-col + .cs-col {
    border-left: 1px dashed var(--cs-border-strong);
  }
  .cs-col.kind-frontend {
    background: linear-gradient(180deg, rgba(37, 99, 235, 0.05), transparent 45%);
  }
  .cs-col.kind-backend {
    background: linear-gradient(180deg, rgba(124, 58, 237, 0.05), transparent 45%);
  }
  .cs-col-head {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--cs-border);
  }
  .cs-col-title {
    font-size: 12px;
    font-weight: 700;
    color: var(--cs-ink);
  }
  .cs-col-badge {
    font-family: var(--font-mono, ui-monospace, Menlo, monospace);
    font-size: 9.5px;
    font-weight: 600;
    padding: 1.5px 7px;
    border-radius: 999px;
    background: var(--cs-card);
    border: 1px solid var(--cs-border);
    color: var(--cs-muted);
  }
  .cs-col.kind-frontend .cs-col-badge {
    color: var(--cs-blue);
    background: var(--cs-blue-soft);
    border-color: transparent;
  }
  .cs-col.kind-backend .cs-col-badge {
    color: var(--cs-violet);
    background: var(--cs-violet-soft);
    border-color: transparent;
  }

  .cs-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .cs-group-title {
    font-size: 10.5px;
    font-weight: 600;
    color: var(--cs-muted);
    padding: 0 2px;
  }
  .cs-file-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .cs-mod {
    appearance: none;
    width: 100%;
    text-align: left;
    padding: 7.5px 9px;
    border-radius: 10px;
    border: 1px solid var(--cs-border);
    background: var(--cs-card);
    color: var(--cs-ink);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    transition: border-color 0.14s ease, transform 0.12s ease, opacity 0.15s ease, box-shadow 0.14s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.025);
  }
  .cs-mod:hover,
  .cs-mod.is-focus {
    border-color: var(--cs-blue);
    box-shadow: 0 3px 10px rgba(37, 99, 235, 0.12);
  }
  .cs-mod.is-dim { opacity: 0.34; }
  .cs-mod.is-fault {
    border-color: var(--cs-red);
    background: var(--cs-red-soft);
    opacity: 1;
  }
  .cs-mod.is-up {
    border-color: var(--cs-blue);
    background: var(--cs-blue-soft);
    opacity: 1;
  }
  .cs-mod.is-down {
    border-color: var(--cs-amber);
    background: var(--cs-amber-soft);
    opacity: 1;
  }
  .cs-mod-left {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1.5px;
  }
  .cs-mod-name {
    font-family: var(--font-mono, ui-monospace, Menlo, monospace);
    font-size: 11px;
    font-weight: 600;
    color: var(--cs-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cs-mod-role {
    font-size: 10px;
    color: var(--cs-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cs-mod-tag {
    font-size: 9.5px;
    font-weight: 600;
    padding: 1.5px 5.5px;
    border-radius: 999px;
    flex-shrink: 0;
  }
  .cs-tag-fault { background: var(--cs-red); color: #fff; }
  .cs-tag-hub { background: var(--cs-amber-soft); color: var(--cs-amber); }
  .cs-tag-ui { background: var(--cs-blue-soft); color: var(--cs-blue); }

  .cs-more-btn {
    appearance: none;
    border: 1px dashed var(--cs-border-strong);
    background: transparent;
    color: var(--cs-muted);
    font-size: 10.5px;
    padding: 4.5px 8px;
    border-radius: 8px;
    cursor: pointer;
    text-align: center;
  }
  .cs-more-btn:hover { color: var(--cs-ink); }

  /* Floating Modal Detail Overlay */
  .cs-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 17, 21, 0.36);
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    z-index: 50;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 12px;
  }
  .cs-modal-backdrop.is-open { display: flex; }

  .cs-modal {
    width: min(600px, 100%);
    max-height: calc(100vh - 20px);
    overflow-y: auto;
    background: var(--cs-card);
    color: var(--cs-ink);
    border: 1px solid var(--cs-border-strong);
    border-radius: 18px;
    box-shadow: 0 22px 58px rgba(0, 0, 0, 0.22);
    display: flex;
    flex-direction: column;
  }
  .cs-modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 11px 16px;
    border-bottom: 1px solid var(--cs-border);
  }
  .cs-breadcrumb {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    color: var(--cs-muted);
    flex-wrap: wrap;
  }
  .cs-breadcrumb strong {
    color: var(--cs-ink);
    font-family: var(--font-mono, ui-monospace, Menlo, monospace);
    font-weight: 600;
  }
  .cs-close-btn {
    appearance: none;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1px solid var(--cs-border);
    background: var(--cs-surface);
    color: var(--cs-muted);
    font-size: 13px;
    cursor: pointer;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .cs-close-btn:hover { color: var(--cs-ink); }

  .cs-modal-body {
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* Read-Only Information Section */
  .cs-info-grid {
    display: grid;
    grid-template-columns: 196px minmax(0, 1fr);
    gap: 14px;
    align-items: stretch;
  }
  @media (max-width: 520px) {
    .cs-info-grid { grid-template-columns: 1fr; }
  }
  .cs-proto-stage {
    border-radius: 12px;
    border: 1px solid var(--cs-border);
    background: var(--cs-surface);
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .cs-proto-kicker {
    font-size: 10px;
    font-weight: 600;
    color: var(--cs-muted);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .cs-wireframe {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 112px;
  }
  .cs-info-col {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .cs-status-pill {
    align-self: flex-start;
    font-size: 11px;
    font-weight: 600;
    padding: 2.5px 9px;
    border-radius: 999px;
  }
  .cs-modal-title {
    margin: 0;
    font-size: 15px;
    font-weight: 650;
    line-height: 1.4;
    color: var(--cs-ink);
  }
  .cs-modal-desc {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--cs-muted);
  }
  .cs-safe-note {
    font-size: 11.5px;
    color: var(--cs-green);
    font-weight: 500;
  }

  /* Clearly Interactive Jump Bar (distinguished from read-only text!) */
  .cs-nav-box {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--cs-surface);
    font-size: 11.5px;
  }
  .cs-nav-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .cs-nav-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--cs-muted);
    min-width: 58px;
  }
  .cs-jump-pill {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid var(--cs-border-strong);
    background: var(--cs-card);
    color: var(--cs-ink);
    font-family: var(--font-mono, ui-monospace, Menlo, monospace);
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 7px;
    cursor: pointer;
    transition: border-color 0.14s ease, color 0.14s ease, background 0.14s ease;
  }
  .cs-jump-pill:hover {
    border-color: var(--cs-blue);
    color: var(--cs-blue);
    background: var(--cs-blue-soft);
  }

  /* Modal Footer: Clean Action Controls */
  .cs-modal-footer {
    border-top: 1px solid var(--cs-border);
    padding: 12px 16px;
    background: var(--cs-surface);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .cs-action-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .cs-btn {
    appearance: none;
    border: none;
    border-radius: 10px;
    padding: 9px 14px;
    background: var(--cs-accent);
    color: var(--cs-accent-fg);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    flex: 1;
    min-width: 150px;
  }
  .cs-btn:hover { opacity: 0.9; }
  .cs-btn-secondary {
    appearance: none;
    border: 1px solid var(--cs-border-strong);
    border-radius: 10px;
    padding: 9px 14px;
    background: var(--cs-card);
    color: var(--cs-ink);
    font-size: 12.5px;
    font-weight: 550;
    cursor: pointer;
  }
  .cs-btn-secondary:hover {
    border-color: var(--cs-blue);
    color: var(--cs-blue);
  }

  /* Decision Radios — ONLY shown when there is a real error/conflict fork! */
  .cs-choices {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  @media (max-width: 520px) {
    .cs-choices { grid-template-columns: 1fr; }
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
  }
  .cs-choice:has(input:checked) {
    border-color: var(--cs-blue);
    background: var(--cs-blue-soft);
  }
  .cs-choice input { margin-top: 2px; accent-color: var(--cs-blue); }
  .cs-choice-t { font-size: 12px; font-weight: 600; color: var(--cs-ink); }
  .cs-choice-s { font-size: 11px; color: var(--cs-muted); margin-top: 2px; line-height: 1.4; }
`;

const LOGO_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="3.5" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/></svg>`;

export function renderVisualProjectMapHtml(payload: VisualProjectMapPayload): string {
  const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  const diag = payload.activeDiagnosis;

  const script = `
    const DATA = ${safeJson};
    const nodeMap = new Map(DATA.nodes.map(n => [n.id, n]));
    const stageEl = document.getElementById('cs-stage');
    const svgEl = document.getElementById('cs-svg');
    const colsEl = document.getElementById('cs-columns');
    const backdropEl = document.getElementById('cs-modal-backdrop');
    const modalEl = document.getElementById('cs-modal');

    const MAX_PER_GROUP = 4;
    const expandedGroups = new Set();
    let hoveredId = DATA.activeDiagnosis?.targetNodeId || null;
    let activeModalId = null;

    function escHtml(s) {
      return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function displayFileName(nodeOrPath) {
      const p = typeof nodeOrPath === 'string' ? nodeOrPath : nodeOrPath.path;
      const parts = p.split('/');
      const base = parts[parts.length - 1] || p;
      if (base === 'index.ts' || base === 'index.tsx' || base === 'server.ts' || base === 'main.tsx') {
        const pkgIdx = parts.findIndex(seg => seg === 'packages' || seg === 'apps');
        if (pkgIdx >= 0 && parts[pkgIdx + 1]) return parts[pkgIdx + 1] + '/' + base;
        if (parts.length >= 2) return parts[parts.length - 2] + '/' + base;
      }
      return base;
    }

    function renderPrototypeSvg(node) {
      const k = node.prototypeKind;
      const label = escHtml(displayFileName(node).replace(/\\.(tsx|jsx|ts|js)$/, ''));
      const comps = (node.childComponents && node.childComponents.length > 0 ? node.childComponents : node.exports).slice(0, 2);

      if (k === 'ui-modal') {
        return '<svg viewBox="0 0 200 118" width="100%" style="max-width:190px">' +
          '<rect x="4" y="4" width="192" height="106" rx="10" fill="var(--cs-surface)" stroke="var(--cs-border)"/>' +
          '<rect x="26" y="16" width="148" height="82" rx="9" fill="var(--cs-card)" stroke="var(--cs-blue)" stroke-width="1.3"/>' +
          '<rect x="38" y="27" width="64" height="6" rx="3" fill="var(--cs-ink)" opacity="0.5"/>' +
          '<circle cx="160" cy="30" r="4.5" fill="var(--cs-muted)" opacity="0.25"/>' +
          '<rect x="38" y="43" width="124" height="5.5" rx="2.7" fill="var(--cs-muted)" opacity="0.24"/>' +
          '<rect x="38" y="53" width="96" height="5.5" rx="2.7" fill="var(--cs-muted)" opacity="0.18"/>' +
          '<rect x="38" y="70" width="54" height="16" rx="5" fill="var(--cs-surface)"/>' +
          '<rect x="100" y="70" width="62" height="16" rx="5" fill="var(--cs-blue)" opacity="0.88"/>' +
          '<text x="100" y="114" text-anchor="middle" font-size="8.5" fill="var(--cs-muted)">弹窗原型 · ' + label + '</text>' +
        '</svg>';
      }

      if (k === 'ui-hud') {
        return '<svg viewBox="0 0 200 118" width="100%" style="max-width:190px">' +
          '<rect x="4" y="4" width="192" height="102" rx="10" fill="var(--cs-surface)" stroke="var(--cs-border)"/>' +
          '<rect x="12" y="14" width="76" height="80" rx="7" fill="var(--cs-card)" opacity="0.65"/>' +
          '<rect x="98" y="10" width="90" height="90" rx="11" fill="var(--cs-card)" stroke="var(--cs-blue)" stroke-width="1.3"/>' +
          '<circle cx="110" cy="21" r="3" fill="var(--cs-blue)"/>' +
          '<rect x="118" y="18.5" width="42" height="5" rx="2.5" fill="var(--cs-ink)" opacity="0.5"/>' +
          '<rect x="108" y="31" width="70" height="12" rx="5" fill="var(--cs-blue-soft)"/>' +
          '<rect x="108" y="48" width="70" height="22" rx="5" fill="var(--cs-surface)"/>' +
          '<rect x="108" y="76" width="70" height="15" rx="5" fill="var(--cs-blue)" opacity="0.85"/>' +
          '<text x="100" y="115" text-anchor="middle" font-size="8.5" fill="var(--cs-muted)">悬浮面板原型 · ' + label + '</text>' +
        '</svg>';
      }

      if (k === 'ui-card-flow') {
        return '<svg viewBox="0 0 200 118" width="100%" style="max-width:190px">' +
          '<rect x="8" y="8" width="184" height="94" rx="11" fill="var(--cs-card)" stroke="var(--cs-blue)" stroke-width="1.2"/>' +
          '<rect x="20" y="19" width="48" height="11" rx="5.5" fill="var(--cs-blue-soft)"/>' +
          '<rect x="20" y="40" width="42" height="22" rx="6" fill="var(--cs-surface)" stroke="var(--cs-border)"/>' +
          '<path d="M64 51 H75" stroke="var(--cs-blue)" stroke-width="1.4" stroke-dasharray="2.5 2"/>' +
          '<rect x="77" y="40" width="46" height="22" rx="6" fill="var(--cs-red-soft)" stroke="var(--cs-red)"/>' +
          '<path d="M125 51 H136" stroke="var(--cs-amber)" stroke-width="1.4" stroke-dasharray="2.5 2"/>' +
          '<rect x="138" y="40" width="42" height="22" rx="6" fill="var(--cs-amber-soft)" stroke="var(--cs-amber)"/>' +
          '<rect x="20" y="72" width="160" height="16" rx="5" fill="var(--cs-green-soft)"/>' +
          '<text x="100" y="114" text-anchor="middle" font-size="8.5" fill="var(--cs-muted)">链路卡片原型 · ' + label + '</text>' +
        '</svg>';
      }

      if (k === 'ui-card-diff') {
        return '<svg viewBox="0 0 200 118" width="100%" style="max-width:190px">' +
          '<rect x="8" y="8" width="184" height="94" rx="11" fill="var(--cs-card)" stroke="var(--cs-amber)" stroke-width="1.2"/>' +
          '<rect x="20" y="19" width="54" height="11" rx="5.5" fill="var(--cs-amber-soft)"/>' +
          '<rect x="20" y="38" width="76" height="26" rx="6" fill="var(--cs-green-soft)"/>' +
          '<rect x="104" y="38" width="76" height="26" rx="6" fill="var(--cs-red-soft)"/>' +
          '<text x="58" y="54" text-anchor="middle" font-size="8.5" fill="var(--cs-green)">原本</text>' +
          '<text x="142" y="54" text-anchor="middle" font-size="8.5" fill="var(--cs-red)">现在</text>' +
          '<rect x="20" y="72" width="160" height="17" rx="5" fill="var(--cs-surface)"/>' +
          '<text x="100" y="114" text-anchor="middle" font-size="8.5" fill="var(--cs-muted)">对比卡片原型 · ' + label + '</text>' +
        '</svg>';
      }

      if (k === 'ui-page' || k === 'ui-card') {
        const subText = comps.length > 0 ? comps.join(' · ') : label;
        return '<svg viewBox="0 0 200 118" width="100%" style="max-width:190px">' +
          '<rect x="8" y="8" width="184" height="94" rx="11" fill="var(--cs-card)" stroke="var(--cs-blue)" stroke-width="1.2"/>' +
          '<rect x="8" y="8" width="184" height="18" rx="9" fill="var(--cs-surface)"/>' +
          '<circle cx="20" cy="17" r="2.6" fill="var(--cs-muted)" opacity="0.45"/>' +
          '<circle cx="29" cy="17" r="2.6" fill="var(--cs-muted)" opacity="0.45"/>' +
          '<rect x="18" y="34" width="96" height="56" rx="7" fill="var(--cs-surface)"/>' +
          '<rect x="122" y="34" width="60" height="25" rx="6" fill="var(--cs-blue-soft)"/>' +
          '<rect x="122" y="65" width="60" height="25" rx="6" fill="var(--cs-surface)"/>' +
          '<text x="100" y="114" text-anchor="middle" font-size="8.5" fill="var(--cs-muted)">页面原型 · ' + escHtml(subText) + '</text>' +
        '</svg>';
      }

      if (k === 'api-server') {
        return '<svg viewBox="0 0 200 118" width="100%" style="max-width:190px">' +
          '<rect x="8" y="36" width="44" height="36" rx="8" fill="var(--cs-blue-soft)" stroke="var(--cs-blue)"/>' +
          '<text x="30" y="57" text-anchor="middle" font-size="8.5" fill="var(--cs-blue)">调用端</text>' +
          '<path d="M54 54 H72" stroke="var(--cs-violet)" stroke-width="1.5" stroke-dasharray="3 2.5"/>' +
          '<rect x="74" y="24" width="54" height="60" rx="9" fill="var(--cs-violet-soft)" stroke="var(--cs-violet)" stroke-width="1.3"/>' +
          '<text x="101" y="51" text-anchor="middle" font-size="8.5" font-weight="600" fill="var(--cs-violet)">服务路由</text>' +
          '<text x="101" y="65" text-anchor="middle" font-size="7.5" fill="var(--cs-muted)">HTTP/MCP</text>' +
          '<path d="M130 54 H146" stroke="var(--cs-muted)" stroke-width="1.4" stroke-dasharray="3 2.5"/>' +
          '<rect x="148" y="36" width="44" height="36" rx="8" fill="var(--cs-card)" stroke="var(--cs-border-strong)"/>' +
          '<text x="170" y="57" text-anchor="middle" font-size="8.5" fill="var(--cs-ink)">核心逻辑</text>' +
          '<text x="100" y="112" text-anchor="middle" font-size="8.5" fill="var(--cs-muted)">服务端通信示意</text>' +
        '</svg>';
      }

      if (k === 'data-schema') {
        const fields = (node.exports.length > 0 ? node.exports : ['Schema', 'Model']).slice(0, 3);
        return '<svg viewBox="0 0 200 118" width="100%" style="max-width:190px">' +
          '<rect x="20" y="10" width="160" height="88" rx="10" fill="var(--cs-card)" stroke="var(--cs-amber)" stroke-width="1.2"/>' +
          '<rect x="20" y="10" width="160" height="22" rx="9" fill="var(--cs-amber-soft)"/>' +
          '<text x="100" y="25" text-anchor="middle" font-size="9" font-weight="600" fill="var(--cs-amber)">' + label + '</text>' +
          fields.map((f, i) => '<text x="34" y="' + (48 + i * 16) + '" font-size="8.5" font-family="monospace" fill="var(--cs-ink)">• ' + escHtml(f) + '</text>').join('') +
          '<text x="100" y="112" text-anchor="middle" font-size="8.5" fill="var(--cs-muted)">被 ' + node.downstreamReach + ' 个文件共用</text>' +
        '</svg>';
      }

      const fnName = escHtml((node.exports[0] || label).slice(0, 16));
      return '<svg viewBox="0 0 200 118" width="100%" style="max-width:190px">' +
        '<rect x="6" y="40" width="38" height="30" rx="7" fill="var(--cs-blue-soft)"/>' +
        '<text x="25" y="58" text-anchor="middle" font-size="8" fill="var(--cs-blue)">输入</text>' +
        '<path d="M46 55 H60" stroke="var(--cs-muted)" stroke-width="1.4" stroke-dasharray="3 2"/>' +
        '<rect x="62" y="30" width="76" height="50" rx="10" fill="var(--cs-card)" stroke="var(--cs-blue)" stroke-width="1.2"/>' +
        '<text x="100" y="52" text-anchor="middle" font-size="8.5" font-weight="600" fill="var(--cs-ink)">' + fnName + '</text>' +
        '<text x="100" y="66" text-anchor="middle" font-size="7.5" fill="var(--cs-muted)">' + escHtml(node.roleLabel) + '</text>' +
        '<path d="M140 55 H154" stroke="var(--cs-muted)" stroke-width="1.4" stroke-dasharray="3 2"/>' +
        '<rect x="156" y="40" width="38" height="30" rx="7" fill="var(--cs-green-soft)"/>' +
        '<text x="175" y="58" text-anchor="middle" font-size="8" fill="var(--cs-green)">输出</text>' +
        '<text x="100" y="112" text-anchor="middle" font-size="8.5" fill="var(--cs-muted)">处理流程示意</text>' +
      '</svg>';
    }

    /**
     * Draw crisp directional dashed curves ONLY for the hovered/active node's direct 1-hop connections!
     * Connects cleanly from card side edges across columns (or gentle side arc within the same column).
     */
    function drawDirectionalDashedLines() {
      const focusId = hoveredId || activeModalId;
      const stageRect = stageEl.getBoundingClientRect();
      if (!stageRect.width || !stageRect.height) return;
      svgEl.setAttribute('viewBox', '0 0 ' + stageRect.width + ' ' + stageRect.height);

      const elMap = new Map();
      colsEl.querySelectorAll('.cs-mod').forEach(el => elMap.set(el.dataset.nodeId, el));

      const defs =
        '<defs>' +
          '<marker id="cs-arr-muted" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1.5 L6.5 4 L1 6.5" fill="none" stroke="var(--cs-muted)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/></marker>' +
          '<marker id="cs-arr-blue" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse"><path d="M1 1.5 L6.5 4 L1 6.5" fill="none" stroke="var(--cs-blue)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker>' +
          '<marker id="cs-arr-amber" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse"><path d="M1 1.5 L6.5 4 L1 6.5" fill="none" stroke="var(--cs-amber)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker>' +
          '<marker id="cs-arr-red" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse"><path d="M1 1.5 L6.5 4 L1 6.5" fill="none" stroke="var(--cs-red)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker>' +
        '</defs>';

      const parts = [];

      function addDashedCurve(r1, r2, cls, colorVar, markerId, idx, ambient) {
        const sameCol = Math.abs(r1.left - r2.left) < 24;
        const y1 = r1.top + r1.height / 2 - stageRect.top;
        const y2 = r2.top + r2.height / 2 - stageRect.top;

        let x1, x2, d;
        if (sameCol) {
          const rightEdge = Math.max(r1.right, r2.right) - stageRect.left;
          const goLeft = rightEdge + 18 > stageRect.width;
          x1 = (goLeft ? r1.left : r1.right) - stageRect.left;
          x2 = (goLeft ? r2.left : r2.right) - stageRect.left;
          const offset = 10 + (idx % 3) * 4;
          const bulge = goLeft ? Math.min(x1, x2) - offset : Math.max(x1, x2) + offset;
          d = 'M ' + x1 + ' ' + y1 + ' C ' + bulge + ' ' + y1 + ', ' + bulge + ' ' + y2 + ', ' + x2 + ' ' + y2;
        } else {
          const goingRight = r1.left < r2.left;
          x1 = (goingRight ? r1.right : r1.left) - stageRect.left;
          x2 = (goingRight ? r2.left : r2.right) - stageRect.left;
          const dx = Math.max(22, Math.abs(x2 - x1) * 0.42);
          const c1x = goingRight ? x1 + dx : x1 - dx;
          const c2x = goingRight ? x2 - dx : x2 + dx;
          d = 'M ' + x1 + ' ' + y1 + ' C ' + c1x + ' ' + y1 + ', ' + c2x + ' ' + y2 + ', ' + x2 + ' ' + y2;
        }
        if (ambient) {
          parts.push('<path d="' + d + '" fill="none" stroke="var(--cs-muted)" stroke-width="1.2" stroke-dasharray="4 4" opacity="0.38" marker-end="url(#cs-arr-muted)" />');
        } else {
          parts.push('<circle cx="' + x1 + '" cy="' + y1 + '" r="2.6" fill="' + colorVar + '" />');
          parts.push('<path class="' + cls + '" d="' + d + '" marker-end="url(#' + markerId + ')" />');
        }
      }

      // Idle state: show up to 6 clean cross-column dashed backbone connections so relationships are immediately visible
      if (!focusId) {
        let drawn = 0;
        const usedPairs = new Set();
        for (const [id, srcEl] of elMap.entries()) {
          if (drawn >= 6) break;
          const n = nodeMap.get(id);
          if (!n) continue;
          const r1 = srcEl.getBoundingClientRect();
          for (const upId of n.upstreamPaths) {
            if (drawn >= 6) break;
            const targetEl = elMap.get(upId);
            if (!targetEl) continue;
            const r2 = targetEl.getBoundingClientRect();
            if (Math.abs(r1.left - r2.left) < 24) continue; // cross-column only in idle view
            const key = id + '->' + upId;
            if (usedPairs.has(key)) continue;
            usedPairs.add(key);
            addDashedCurve(r1, r2, '', 'var(--cs-muted)', 'cs-arr-muted', drawn, true);
            drawn++;
            break; // max 1 ambient line per card so it stays uncluttered
          }
        }
        svgEl.innerHTML = defs + parts.join('');
        return;
      }

      const focusNode = nodeMap.get(focusId);
      const srcEl = elMap.get(focusId);
      if (!focusNode || !srcEl) {
        svgEl.innerHTML = '';
        return;
      }

      const srcRect = srcEl.getBoundingClientRect();

      // Direct upstream dependencies (blue dashed: focus -> dependency)
      focusNode.upstreamPaths.slice(0, 5).forEach((upId, idx) => {
        const targetEl = elMap.get(upId);
        if (targetEl) addDashedCurve(srcRect, targetEl.getBoundingClientRect(), 'cs-edge-up', 'var(--cs-blue)', 'cs-arr-blue', idx, false);
      });

      // Direct downstream dependents (amber/red dashed: focus -> impacted consumer)
      const isFault = DATA.activeDiagnosis?.targetNodeId === focusId;
      focusNode.directDownstreamPaths.slice(0, 5).forEach((downId, idx) => {
        const targetEl = elMap.get(downId);
        if (targetEl) {
          addDashedCurve(
            srcRect,
            targetEl.getBoundingClientRect(),
            isFault ? 'cs-edge-fault' : 'cs-edge-down',
            isFault ? 'var(--cs-red)' : 'var(--cs-amber)',
            isFault ? 'cs-arr-red' : 'cs-arr-amber',
            idx,
            false
          );
        }
      });

      svgEl.innerHTML = defs + parts.join('');
    }

    function renderColumns() {
      const zones = DATA.zones && DATA.zones.length > 0
        ? DATA.zones
        : [{ id: 'default', title: '项目模块', badge: 'Modules', kind: 'core', lanes: DATA.lanes }];
      colsEl.style.setProperty('--zone-count', String(zones.length));

      colsEl.innerHTML = zones.map(zone => {
        const groupsHtml = zone.lanes.map(lane => {
          const isExp = expandedGroups.has(lane.id);
          const visibleIds = isExp ? lane.nodeIds : lane.nodeIds.slice(0, MAX_PER_GROUP);
          const hidden = lane.nodeIds.length - visibleIds.length;

          const itemsHtml = visibleIds.map(id => {
            const n = nodeMap.get(id);
            if (!n) return '';
            const isFault = DATA.activeDiagnosis?.targetNodeId === id;
            let tagHtml = '';
            if (isFault) tagHtml = '<span class="cs-mod-tag cs-tag-fault">报错</span>';
            else if (n.downstreamReach >= 5) tagHtml = '<span class="cs-mod-tag cs-tag-hub">' + n.downstreamReach + '处用</span>';
            else if (zone.kind === 'frontend') tagHtml = '<span class="cs-mod-tag cs-tag-ui">原型</span>';

            return '<button type="button" class="cs-mod' + (isFault ? ' is-fault' : '') + '" data-node-id="' + escHtml(n.id) + '" title="' + escHtml(n.path) + '">' +
              '<div class="cs-mod-left">' +
                '<span class="cs-mod-name">' + escHtml(displayFileName(n)) + '</span>' +
                '<span class="cs-mod-role">' + escHtml(n.roleLabel) + '</span>' +
              '</div>' +
              tagHtml +
            '</button>';
          }).join('');

          const moreBtn = hidden > 0
            ? '<button type="button" class="cs-more-btn" data-expand-group="' + escHtml(lane.id) + '">展开其余 ' + hidden + ' 个文件</button>'
            : (isExp && lane.nodeIds.length > MAX_PER_GROUP
                ? '<button type="button" class="cs-more-btn" data-expand-group="' + escHtml(lane.id) + '">收起</button>'
                : '');

          return '<div class="cs-group">' +
            '<div class="cs-group-title">' + escHtml(lane.title) + '</div>' +
            '<div class="cs-file-list">' + itemsHtml + moreBtn + '</div>' +
          '</div>';
        }).join('');

        return '<div class="cs-col kind-' + escHtml(zone.kind) + '">' +
          '<div class="cs-col-head">' +
            '<span class="cs-col-title">' + escHtml(zone.title) + '</span>' +
            '<span class="cs-col-badge">' + escHtml(zone.badge) + '</span>' +
          '</div>' +
          groupsHtml +
        '</div>';
      }).join('');

      colsEl.querySelectorAll('.cs-mod').forEach(btn => {
        const id = btn.dataset.nodeId;
        btn.addEventListener('mouseenter', () => {
          hoveredId = id;
          updateHoverState();
        });
        btn.addEventListener('mouseleave', () => {
          hoveredId = activeModalId || DATA.activeDiagnosis?.targetNodeId || null;
          updateHoverState();
        });
        btn.addEventListener('click', () => openModal(id));
      });

      colsEl.querySelectorAll('.cs-more-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const gid = btn.dataset.expandGroup;
          if (expandedGroups.has(gid)) expandedGroups.delete(gid);
          else expandedGroups.add(gid);
          renderColumns();
          requestAnimationFrame(updateHoverState);
        });
      });

      requestAnimationFrame(updateHoverState);
    }

    function updateHoverState() {
      const focusId = hoveredId || activeModalId;
      const focusNode = focusId ? nodeMap.get(focusId) : null;
      const upSet = new Set(focusNode ? focusNode.upstreamPaths : []);
      const downSet = new Set(focusNode ? focusNode.directDownstreamPaths : []);

      colsEl.querySelectorAll('.cs-mod').forEach(btn => {
        const id = btn.dataset.nodeId;
        const isFault = DATA.activeDiagnosis?.targetNodeId === id;
        btn.classList.remove('is-focus', 'is-dim', 'is-up', 'is-down');
        if (!focusId) return;
        if (id === focusId) {
          if (!isFault) btn.classList.add('is-focus');
        } else if (upSet.has(id)) {
          btn.classList.add('is-up');
        } else if (downSet.has(id)) {
          btn.classList.add('is-down');
        } else if (!isFault) {
          btn.classList.add('is-dim');
        }
      });
      drawDirectionalDashedLines();
    }

    function openModal(id) {
      const node = nodeMap.get(id);
      if (!node) return;
      activeModalId = id;
      hoveredId = id;
      updateHoverState();

      const isFault = Boolean(DATA.activeDiagnosis && DATA.activeDiagnosis.targetNodeId === id);
      const impactCount = node.allDownstreamPaths.length;
      const safeCount = Math.max(0, DATA.totalFiles - 1 - impactCount);
      const title = isFault ? DATA.activeDiagnosis.headline : displayFileName(node) + ' · ' + node.roleLabel;
      const desc = isFault ? (DATA.activeDiagnosis.subtext || node.summary) : node.summary;

      const statusStyle = isFault
        ? 'color:var(--cs-red);background:var(--cs-red-soft)'
        : impactCount >= 5
        ? 'color:var(--cs-amber);background:var(--cs-amber-soft)'
        : 'color:var(--cs-green);background:var(--cs-green-soft)';

      const statusText = isFault
        ? '当前报错位置 · 关联 ' + impactCount + ' 个文件'
        : impactCount >= 5
        ? '基础共享文件 · 被 ' + impactCount + ' 处用到（改动需谨慎）'
        : impactCount > 0
        ? '改动安全可控 · 直接关联 ' + node.directDownstreamPaths.length + ' 个文件'
        : '独立文件 · 放心调整';

      const protoTag = node.zoneKind === 'frontend' ? '界面原型示意' : node.zoneKind === 'backend' ? '服务流转示意' : '结构示意';

      const upPills = node.upstreamPaths.slice(0, 4).map(p => {
        const target = nodeMap.get(p);
        return '<button type="button" class="cs-jump-pill" data-jump="' + escHtml(p) + '">' + escHtml(displayFileName(target || p)) + ' ↗</button>';
      }).join('') || '<span style="color:var(--cs-muted)">无（最底层文件）</span>';

      const downPills = node.directDownstreamPaths.slice(0, 4).map(p => {
        const target = nodeMap.get(p);
        return '<button type="button" class="cs-jump-pill" data-jump="' + escHtml(p) + '">' + escHtml(displayFileName(target || p)) + ' ↗</button>';
      }).join('') || '<span style="color:var(--cs-muted)">无（顶层入口）</span>';

      // Build clean footer: Decision Radios ONLY for actual errors/conflicts; Direct Action Buttons for normal browsing!
      let footerHtml = '';
      if (isFault && DATA.activeDiagnosis.directions.length > 0) {
        const dirs = DATA.activeDiagnosis.directions;
        footerHtml =
          '<div style="font-size:11.5px;font-weight:600;color:var(--cs-muted)">选择修复方向</div>' +
          '<div class="cs-choices">' +
            dirs.map((d, i) =>
              '<label class="cs-choice">' +
                '<input type="radio" name="cs_modal_dir" value="' + escHtml(d.id) + '" ' + (i === 0 ? 'checked' : '') + ' />' +
                '<div><div class="cs-choice-t">' + escHtml(d.label) + '</div><div class="cs-choice-s">' + escHtml(d.strategy) + '</div></div>' +
              '</label>'
            ).join('') +
          '</div>' +
          '<button type="button" class="cs-btn" id="cs-copy-fix">复制选中修复指令给 AI</button>';
      } else {
        footerHtml =
          '<div class="cs-action-bar">' +
            '<button type="button" class="cs-btn" id="cs-btn-edit">' + (impactCount >= 5 ? '安全调整此文件（不破坏调用方）' : '让 AI 调整此文件') + '</button>' +
            '<button type="button" class="cs-btn-secondary" id="cs-btn-explain">让 AI 讲讲这段代码</button>' +
          '</div>';
      }

      modalEl.innerHTML =
        '<div class="cs-modal-head">' +
          '<div class="cs-breadcrumb">' +
            '<span>' + escHtml(node.zoneTitle) + '</span><span>›</span>' +
            '<span>' + escHtml(node.laneTitle) + '</span><span>›</span>' +
            '<strong>' + escHtml(displayFileName(node)) + '</strong>' +
          '</div>' +
          '<button type="button" class="cs-close-btn" id="cs-modal-close" aria-label="关闭">✕</button>' +
        '</div>' +
        '<div class="cs-modal-body">' +
          '<div class="cs-info-grid">' +
            '<div class="cs-proto-stage">' +
              '<div class="cs-proto-kicker"><span>' + protoTag + '</span><span>只读预览</span></div>' +
              '<div class="cs-wireframe">' + renderPrototypeSvg(node) + '</div>' +
            '</div>' +
            '<div class="cs-info-col">' +
              '<span class="cs-status-pill" style="' + statusStyle + '">' + escHtml(statusText) + '</span>' +
              '<h3 class="cs-modal-title">' + escHtml(title) + '</h3>' +
              '<p class="cs-modal-desc">' + escHtml(desc) + '</p>' +
              '<div class="cs-safe-note">其余 ' + safeCount + ' 个文件完全不受影响</div>' +
            '</div>' +
          '</div>' +
          '<div class="cs-nav-box">' +
            '<div class="cs-nav-row"><span class="cs-nav-label">依赖谁 ↗</span>' + upPills + '</div>' +
            '<div class="cs-nav-row"><span class="cs-nav-label">影响谁 ↗</span>' + downPills + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="cs-modal-footer">' + footerHtml + '</div>';

      backdropEl.classList.add('is-open');

      document.getElementById('cs-modal-close')?.addEventListener('click', closeModal);
      modalEl.querySelectorAll('.cs-jump-pill').forEach(btn => {
        btn.addEventListener('click', () => openModal(btn.dataset.jump));
      });

      const wireCopy = (el, promptText, doneLabel) => {
        if (!el) return;
        el.addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(promptText); } catch {}
          window.parent?.postMessage({ type: 'codesight:actionPrompt', nodeId: node.id, prompt: promptText }, '*');
          const old = el.textContent;
          el.textContent = doneLabel;
          setTimeout(() => { el.textContent = old; }, 1600);
        });
      };

      if (isFault && DATA.activeDiagnosis.directions.length > 0) {
        const fixBtn = document.getElementById('cs-copy-fix');
        fixBtn?.addEventListener('click', async () => {
          const checked = modalEl.querySelector('input[name="cs_modal_dir"]:checked');
          const chosen = DATA.activeDiagnosis.directions.find(d => d.id === checked?.value) || DATA.activeDiagnosis.directions[0];
          try { await navigator.clipboard.writeText(chosen.surgicalPrompt); } catch {}
          const old = fixBtn.textContent;
          fixBtn.textContent = '已复制，直接发给 AI 即可';
          setTimeout(() => { fixBtn.textContent = old; }, 1600);
        });
      } else {
        const editPrompt = impactCount >= 5
          ? '[CodeSight Safe Edit]\\nModify \`' + node.path + '\` while keeping its exported interface backward-compatible so none of its ' + impactCount + ' dependent files break.'
          : '[CodeSight Scoped Edit]\\nUpdate \`' + node.path + '\` cleanly. Keep changes minimal and verify ' + (node.directDownstreamPaths.join(', ') || 'build & tests') + '.';
        const explainPrompt = '[CodeSight Explain]\\nExplain how \`' + node.path + '\` works in plain Chinese, including how it uses (' + (node.upstreamPaths.join(', ') || 'none') + ') and serves (' + (node.directDownstreamPaths.join(', ') || 'top-level entry') + ').';

        wireCopy(document.getElementById('cs-btn-edit'), editPrompt, '已复制调整指令给 AI');
        wireCopy(document.getElementById('cs-btn-explain'), explainPrompt, '已复制讲解指令给 AI');
      }
    }

    function closeModal() {
      activeModalId = null;
      hoveredId = DATA.activeDiagnosis?.targetNodeId || null;
      backdropEl.classList.remove('is-open');
      updateHoverState();
    }

    backdropEl.addEventListener('click', (e) => {
      if (e.target === backdropEl) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
    window.addEventListener('resize', drawDirectionalDashedLines);

    const faultBannerBtn = document.getElementById('cs-open-fault');
    if (faultBannerBtn && DATA.activeDiagnosis?.targetNodeId) {
      faultBannerBtn.addEventListener('click', () => openModal(DATA.activeDiagnosis.targetNodeId));
    }

    renderColumns();
  `;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>CodeSight · ${esc(payload.repoName)}</title>
  <style>${BOARD_CSS}</style>
</head>
<body>
  <div class="cs-board">
    <header class="cs-topbar">
      <div class="cs-brand">
        <span class="cs-logo">${LOGO_SVG}</span>
        <div>
          <div class="cs-title">${esc(payload.repoName)} · ${esc(payload.archetypeLabel || '竖排架构总览')}</div>
          <div class="cs-sub">${esc(payload.projectHeadline)} · 共 ${payload.totalFiles} 个文件</div>
        </div>
      </div>
      <div class="cs-legend">
        <span class="cs-legend-item" style="color:var(--cs-blue)"><span class="cs-dash-sample"></span>依赖谁</span>
        <span class="cs-legend-item" style="color:var(--cs-amber)"><span class="cs-dash-sample"></span>影响谁</span>
      </div>
    </header>

    ${
      diag
        ? `<div class="cs-fault-banner">
            <span><strong>当前报错：</strong>${esc(diag.headline)}</span>
            <button type="button" class="cs-fault-btn" id="cs-open-fault">查看报错与修复方案</button>
          </div>`
        : ''
    }

    <div class="cs-stage" id="cs-stage">
      <svg class="cs-svg" id="cs-svg"></svg>
      <div class="cs-columns" id="cs-columns"></div>
    </div>
  </div>

  <div class="cs-modal-backdrop" id="cs-modal-backdrop">
    <div class="cs-modal" id="cs-modal" role="dialog" aria-modal="true"></div>
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

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CodeSight Trace</title><style>${BOARD_CSS}</style></head><body><div class="cs-board"><div class="cs-topbar"><div class="cs-title">函数调用追踪 · ${esc(trace.querySymbol)}</div><div class="cs-sub">${trace.traceMs}ms</div></div>${rows || '<div style="padding:16px;font-size:13px;color:var(--cs-muted)">未找到对应函数或组件。</div>'}</div></body></html>`;
}
