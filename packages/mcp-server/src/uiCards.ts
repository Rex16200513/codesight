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
 * Single Big Architecture Board Card (Vertical Columns: Frontend | Backend | Shared Core)
 * + Interactive Floating Modal Detail Card with Live Mini-Prototype Wireframes!
 *
 * Key UX guarantees:
 * 1. Vertical side-by-side columns fit cleanly inside ONE big card — you ALWAYS see where Frontend / Backend / Core sit.
 * 2. Zero node jumping on click — every file stays rock-steady in its layer.
 * 3. Clicking any file opens a crisp centered Apple Modal overlay with:
 *    - Clear Layer Breadcrumb (e.g. 前端 · 展示与交互层 › 界面组件 › MentalModelCard.tsx)
 *    - Visual Mini-Prototype Wireframe (for Frontend UI/Modal/Card/Page) or Architecture Schematic (for Backend API / Schema / Core Logic)
 *    - Impact summary + clickable related file jumps + 1-click AI Fix/Adjustment Prompt!
 */
const BOARD_CSS = `
  .cs-board {
    --cs-card: var(--card, #ffffff);
    --cs-surface: var(--muted, rgba(120, 118, 114, 0.055));
    --cs-ink: var(--foreground, #1c1917);
    --cs-muted: var(--muted-foreground, #6b6560);
    --cs-border: var(--border, rgba(28, 25, 23, 0.1));
    --cs-border-strong: rgba(28, 25, 23, 0.22);
    --cs-accent: var(--primary, #111827);
    --cs-accent-fg: var(--primary-foreground, #ffffff);
    --cs-blue: #2563eb;
    --cs-blue-soft: rgba(37, 99, 235, 0.09);
    --cs-violet: #7c3aed;
    --cs-violet-soft: rgba(124, 58, 237, 0.09);
    --cs-red: #dc2626;
    --cs-red-soft: rgba(220, 38, 38, 0.11);
    --cs-amber: #d97706;
    --cs-amber-soft: rgba(217, 119, 6, 0.11);
    --cs-green: #059669;
    --cs-green-soft: rgba(5, 150, 105, 0.1);
  }
  @media (prefers-color-scheme: dark) {
    .cs-board {
      --cs-border-strong: rgba(255, 255, 255, 0.22);
      --cs-blue: #60a5fa;
      --cs-blue-soft: rgba(96, 165, 250, 0.15);
      --cs-violet: #a78bfa;
      --cs-violet-soft: rgba(167, 139, 250, 0.15);
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

  /* Single Big Architecture Card */
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
    gap: 12px;
    padding: 13px 18px;
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
    color: var(--cs-ink);
  }
  .cs-sub {
    font-size: 11.5px;
    color: var(--cs-muted);
    margin-top: 1px;
  }
  .cs-top-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .cs-hint-pill {
    font-size: 11.5px;
    color: var(--cs-muted);
    background: var(--cs-surface);
    padding: 4px 10px;
    border-radius: 999px;
  }
  .cs-fault-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 18px;
    background: var(--cs-red-soft);
    border-bottom: 1px solid rgba(220, 38, 38, 0.2);
    font-size: 12.5px;
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

  /* Vertical Multi-Column Architecture Columns Inside ONE Big Card */
  .cs-columns {
    display: grid;
    grid-template-columns: repeat(var(--zone-count, 3), minmax(0, 1fr));
    background: var(--cs-surface);
  }
  @media (max-width: 680px) {
    .cs-columns {
      grid-template-columns: 1fr;
    }
    .cs-col + .cs-col {
      border-left: none !important;
      border-top: 1px dashed var(--cs-border-strong);
    }
  }
  .cs-col {
    padding: 14px 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }
  .cs-col + .cs-col {
    border-left: 1px dashed var(--cs-border-strong);
  }
  .cs-col.kind-frontend {
    background: linear-gradient(180deg, rgba(37, 99, 235, 0.045), transparent 45%);
  }
  .cs-col.kind-backend {
    background: linear-gradient(180deg, rgba(124, 58, 237, 0.045), transparent 45%);
  }
  .cs-col-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--cs-border);
  }
  .cs-col-title {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--cs-ink);
  }
  .cs-col-badge {
    font-family: var(--font-mono, ui-monospace, Menlo, monospace);
    font-size: 10px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--cs-card);
    border: 1px solid var(--cs-border);
    color: var(--cs-muted);
    flex-shrink: 0;
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
    font-size: 11px;
    font-weight: 600;
    color: var(--cs-muted);
    padding: 0 2px;
  }
  .cs-file-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* Rock-Steady File Module Row (Never jumps around!) */
  .cs-mod {
    appearance: none;
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    border-radius: 11px;
    border: 1px solid var(--cs-border);
    background: var(--cs-card);
    color: var(--cs-ink);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    transition: border-color 0.14s ease, transform 0.12s ease, opacity 0.15s ease, box-shadow 0.14s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.025);
  }
  .cs-mod:hover {
    transform: translateY(-1px);
    border-color: var(--cs-blue);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  }
  .cs-mod.is-dim { opacity: 0.36; }
  .cs-mod.is-fault {
    border-color: var(--cs-red);
    background: var(--cs-red-soft);
  }
  .cs-mod.is-up {
    border-color: var(--cs-blue);
    background: var(--cs-blue-soft);
  }
  .cs-mod.is-down {
    border-color: var(--cs-amber);
    background: var(--cs-amber-soft);
  }
  .cs-mod-left {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .cs-mod-name {
    font-family: var(--font-mono, ui-monospace, Menlo, monospace);
    font-size: 11.5px;
    font-weight: 600;
    color: var(--cs-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cs-mod-role {
    font-size: 10.5px;
    color: var(--cs-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cs-mod-tag {
    font-size: 10px;
    font-weight: 600;
    padding: 1.5px 6px;
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
    font-size: 11px;
    padding: 5px 8px;
    border-radius: 9px;
    cursor: pointer;
    text-align: center;
  }
  .cs-more-btn:hover { color: var(--cs-ink); }

  /* Floating Modal Detail Overlay (Centered over the Architecture Board) */
  .cs-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 17, 21, 0.38);
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    z-index: 50;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 14px;
  }
  .cs-modal-backdrop.is-open {
    display: flex;
  }
  .cs-modal {
    width: min(640px, 100%);
    max-height: 92vh;
    overflow-y: auto;
    background: var(--cs-card);
    border: 1px solid var(--cs-border-strong);
    border-radius: 20px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.24);
    display: flex;
    flex-direction: column;
  }
  .cs-modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--cs-border);
  }
  .cs-breadcrumb {
    display: flex;
    align-items: center;
    gap: 6px;
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
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1px solid var(--cs-border);
    background: var(--cs-surface);
    color: var(--cs-muted);
    font-size: 14px;
    cursor: pointer;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .cs-close-btn:hover { color: var(--cs-ink); }

  .cs-modal-body {
    padding: 16px 18px 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  /* Prototype / Schematic Preview Stage inside Modal */
  .cs-proto-grid {
    display: grid;
    grid-template-columns: minmax(200px, 0.95fr) minmax(0, 1.15fr);
    gap: 14px;
    align-items: stretch;
  }
  @media (max-width: 560px) {
    .cs-proto-grid { grid-template-columns: 1fr; }
  }
  .cs-proto-stage {
    border-radius: 14px;
    border: 1px solid var(--cs-border);
    background: var(--cs-surface);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .cs-proto-kicker {
    font-size: 10.5px;
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
    min-height: 122px;
  }
  .cs-info-col {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .cs-modal-title {
    margin: 0;
    font-size: 15.5px;
    font-weight: 650;
    line-height: 1.4;
    color: var(--cs-ink);
  }
  .cs-modal-desc {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.58;
    color: var(--cs-muted);
  }
  .cs-rel-pills {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--cs-surface);
    font-size: 11.5px;
  }
  .cs-rel-line {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .cs-jump-pill {
    appearance: none;
    border: 1px solid var(--cs-border);
    background: var(--cs-card);
    color: var(--cs-ink);
    font-family: var(--font-mono, ui-monospace, Menlo, monospace);
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 7px;
    cursor: pointer;
  }
  .cs-jump-pill:hover {
    border-color: var(--cs-blue);
    color: var(--cs-blue);
  }

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
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid var(--cs-border);
    cursor: pointer;
  }
  .cs-choice:has(input:checked) {
    border-color: var(--cs-blue);
    background: var(--cs-blue-soft);
  }
  .cs-choice input { margin-top: 2px; accent-color: var(--cs-blue); }
  .cs-choice-t { font-size: 12px; font-weight: 600; color: var(--cs-ink); }
  .cs-choice-s { font-size: 11px; color: var(--cs-muted); margin-top: 2px; line-height: 1.4; }
  .cs-btn {
    appearance: none;
    border: none;
    border-radius: 11px;
    padding: 10px 16px;
    width: 100%;
    background: var(--cs-accent);
    color: var(--cs-accent-fg);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .cs-btn:hover { opacity: 0.9; }
`;

const LOGO_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="3.5" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/></svg>`;

export function renderVisualProjectMapHtml(payload: VisualProjectMapPayload): string {
  const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  const diag = payload.activeDiagnosis;

  const script = `
    const DATA = ${safeJson};
    const nodeMap = new Map(DATA.nodes.map(n => [n.id, n]));
    const colsEl = document.getElementById('cs-columns');
    const backdropEl = document.getElementById('cs-modal-backdrop');
    const modalEl = document.getElementById('cs-modal');

    const MAX_PER_GROUP = 5;
    const expandedGroups = new Set();
    let hoveredId = null;
    let activeModalId = null;

    function escHtml(s) {
      return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    /**
     * Generates a crisp, Apple-style mini wireframe prototype SVG tailored to the real component/file type!
     */
    function renderPrototypeSvg(node) {
      const k = node.prototypeKind;
      const label = escHtml(node.name.replace(/\\.(tsx|jsx|ts|js)$/, ''));
      const comps = (node.childComponents && node.childComponents.length > 0 ? node.childComponents : node.exports).slice(0, 3);

      // 1. Modal / Dialog / Settings Overlay Prototype
      if (k === 'ui-modal') {
        return '<svg viewBox="0 0 210 124" width="100%" style="max-width:220px">' +
          '<rect x="4" y="4" width="202" height="116" rx="12" fill="currentColor" opacity="0.06" stroke="currentColor" stroke-opacity="0.14"/>' +
          '<rect x="28" y="18" width="154" height="88" rx="10" fill="var(--cs-card)" stroke="var(--cs-blue)" stroke-width="1.4"/>' +
          '<rect x="40" y="29" width="68" height="7" rx="3.5" fill="currentColor" opacity="0.55"/>' +
          '<circle cx="168" cy="32" r="5" fill="currentColor" opacity="0.18"/>' +
          '<rect x="40" y="46" width="130" height="6" rx="3" fill="currentColor" opacity="0.16"/>' +
          '<rect x="40" y="57" width="104" height="6" rx="3" fill="currentColor" opacity="0.12"/>' +
          '<rect x="40" y="76" width="58" height="18" rx="6" fill="currentColor" opacity="0.09"/>' +
          '<rect x="106" y="76" width="64" height="18" rx="6" fill="var(--cs-blue)" opacity="0.88"/>' +
          '<text x="105" y="114" text-anchor="middle" font-size="8.5" fill="var(--cs-muted)">弹窗组件原型 · ' + label + '</text>' +
        '</svg>';
      }

      // 2. Floating HUD / Panel Prototype
      if (k === 'ui-hud') {
        return '<svg viewBox="0 0 210 124" width="100%" style="max-width:220px">' +
          '<rect x="4" y="4" width="202" height="116" rx="12" fill="currentColor" opacity="0.04" stroke="currentColor" stroke-opacity="0.12"/>' +
          '<rect x="14" y="16" width="76" height="86" rx="7" fill="currentColor" opacity="0.06"/>' +
          '<rect x="102" y="12" width="94" height="98" rx="12" fill="var(--cs-card)" stroke="var(--cs-blue)" stroke-width="1.4"/>' +
          '<circle cx="114" cy="24" r="3.5" fill="var(--cs-blue)"/>' +
          '<rect x="122" y="21" width="44" height="6" rx="3" fill="currentColor" opacity="0.55"/>' +
          '<rect x="112" y="34" width="74" height="13" rx="5" fill="var(--cs-blue-soft)"/>' +
          '<rect x="112" y="53" width="74" height="24" rx="6" fill="currentColor" opacity="0.08"/>' +
          '<rect x="112" y="84" width="74" height="16" rx="6" fill="var(--cs-blue)" opacity="0.86"/>' +
          '<text x="105" y="117" text-anchor="middle" font-size="8.5" fill="var(--cs-muted)">悬浮面板原型 · ' + label + '</text>' +
        '</svg>';
      }

      // 3. Flow / Mental Model Card Prototype
      if (k === 'ui-card-flow') {
        return '<svg viewBox="0 0 210 124" width="100%" style="max-width:220px">' +
          '<rect x="10" y="10" width="190" height="96" rx="12" fill="var(--cs-card)" stroke="var(--cs-blue)" stroke-width="1.3"/>' +
          '<rect x="22" y="22" width="52" height="12" rx="6" fill="var(--cs-blue-soft)"/>' +
          '<rect x="22" y="44" width="44" height="24" rx="7" fill="currentColor" opacity="0.08" stroke="currentColor" stroke-opacity="0.18"/>' +
          '<path d="M68 56 H80" stroke="var(--cs-blue)" stroke-width="1.5"/>' +
          '<rect x="82" y="44" width="46" height="24" rx="7" fill="var(--cs-red-soft)" stroke="var(--cs-red)"/>' +
          '<path d="M130 56 H142" stroke="var(--cs-amber)" stroke-width="1.5"/>' +
          '<rect x="144" y="44" width="44" height="24" rx="7" fill="var(--cs-amber-soft)" stroke="var(--cs-amber)"/>' +
          '<rect x="22" y="78" width="166" height="16" rx="6" fill="var(--cs-green-soft)"/>' +
          '<text x="105" y="118" text-anchor="middle" font-size="8.5" fill="var(--cs-muted)">流程卡片原型 · ' + label + '</text>' +
        '</svg>';
      }

      // 4. Diff / Alert / Regression Card Prototype
      if (k === 'ui-card-diff') {
        return '<svg viewBox="0 0 210 124" width="100%" style="max-width:220px">' +
          '<rect x="10" y="10" width="190" height="96" rx="12" fill="var(--cs-card)" stroke="var(--cs-amber)" stroke-width="1.3"/>' +
          '<rect x="22" y="21" width="60" height="12" rx="6" fill="var(--cs-amber-soft)"/>' +
          '<rect x="22" y="40" width="79" height="28" rx="7" fill="var(--cs-green-soft)"/>' +
          '<rect x="109" y="40" width="79" height="28" rx="7" fill="var(--cs-red-soft)"/>' +
          '<rect x="22" y="76" width="166" height="18" rx="6" fill="currentColor" opacity="0.08"/>' +
          '<text x="61" y="57" text-anchor="middle" font-size="8" fill="var(--cs-green)">原本</text>' +
          '<text x="148" y="57" text-anchor="middle" font-size="8" fill="var(--cs-red)">现在</text>' +
          '<text x="105" y="118" text-anchor="middle" font-size="8.5" fill="var(--cs-muted)">对比诊断卡原型 · ' + label + '</text>' +
        '</svg>';
      }

      // 5. Frontend Page / Generic UI Card Prototype
      if (k === 'ui-page' || k === 'ui-card') {
        const subText = comps.length > 0 ? comps.slice(0, 2).join(' · ') : label;
        return '<svg viewBox="0 0 210 124" width="100%" style="max-width:220px">' +
          '<rect x="8" y="8" width="194" height="98" rx="12" fill="var(--cs-card)" stroke="var(--cs-blue)" stroke-width="1.3"/>' +
          '<rect x="8" y="8" width="194" height="20" rx="10" fill="currentColor" opacity="0.06"/>' +
          '<circle cx="22" cy="18" r="3" fill="currentColor" opacity="0.3"/>' +
          '<circle cx="32" cy="18" r="3" fill="currentColor" opacity="0.3"/>' +
          '<rect x="20" y="38" width="100" height="56" rx="8" fill="currentColor" opacity="0.06"/>' +
          '<rect x="128" y="38" width="62" height="25" rx="7" fill="var(--cs-blue-soft)"/>' +
          '<rect x="128" y="69" width="62" height="25" rx="7" fill="currentColor" opacity="0.08"/>' +
          '<text x="105" y="118" text-anchor="middle" font-size="8.5" fill="var(--cs-muted)">界面原型 · ' + escHtml(subText) + '</text>' +
        '</svg>';
      }

      // 6. Backend API / MCP Server Schematic
      if (k === 'api-server') {
        return '<svg viewBox="0 0 210 124" width="100%" style="max-width:220px">' +
          '<rect x="10" y="38" width="46" height="40" rx="9" fill="var(--cs-blue-soft)" stroke="var(--cs-blue)"/>' +
          '<text x="33" y="61" text-anchor="middle" font-size="8.5" fill="var(--cs-blue)">请求端</text>' +
          '<path d="M58 58 H78" stroke="var(--cs-violet)" stroke-width="1.6"/>' +
          '<rect x="80" y="26" width="54" height="64" rx="10" fill="var(--cs-violet-soft)" stroke="var(--cs-violet)" stroke-width="1.4"/>' +
          '<text x="107" y="55" text-anchor="middle" font-size="8.5" font-weight="600" fill="var(--cs-violet)">服务路由</text>' +
          '<text x="107" y="69" text-anchor="middle" font-size="7.5" fill="var(--cs-muted)">HTTP/MCP</text>' +
          '<path d="M136 58 H154" stroke="var(--cs-muted)" stroke-width="1.5"/>' +
          '<rect x="156" y="38" width="44" height="40" rx="9" fill="currentColor" opacity="0.07" stroke="currentColor" stroke-opacity="0.2"/>' +
          '<text x="178" y="61" text-anchor="middle" font-size="8.5" fill="var(--cs-ink)">核心逻辑</text>' +
          '<text x="105" y="114" text-anchor="middle" font-size="8.5" fill="var(--cs-muted)">服务通信示意 · ' + label + '</text>' +
        '</svg>';
      }

      // 7. Data Schema Blueprint
      if (k === 'data-schema') {
        const fields = (node.exports.length > 0 ? node.exports : ['Schema', 'Model']).slice(0, 3);
        return '<svg viewBox="0 0 210 124" width="100%" style="max-width:220px">' +
          '<rect x="26" y="12" width="158" height="90" rx="11" fill="var(--cs-card)" stroke="var(--cs-amber)" stroke-width="1.3"/>' +
          '<rect x="26" y="12" width="158" height="24" rx="10" fill="var(--cs-amber-soft)"/>' +
          '<text x="105" y="28" text-anchor="middle" font-size="9.5" font-weight="600" fill="var(--cs-amber)">' + label + '</text>' +
          fields.map((f, i) => '<text x="40" y="' + (52 + i * 16) + '" font-size="8.5" font-family="monospace" fill="var(--cs-ink)">• ' + escHtml(f) + '</text>').join('') +
          '<text x="105" y="116" text-anchor="middle" font-size="8.5" fill="var(--cs-muted)">公共数据结构（被 ' + node.downstreamReach + ' 处共用）</text>' +
        '</svg>';
      }

      // 8. Core Logic / CLI Pipeline Schematic
      const fnName = escHtml((node.exports[0] || label).slice(0, 18));
      return '<svg viewBox="0 0 210 124" width="100%" style="max-width:220px">' +
        '<rect x="8" y="42" width="42" height="32" rx="8" fill="var(--cs-blue-soft)"/>' +
        '<text x="29" y="61" text-anchor="middle" font-size="8" fill="var(--cs-blue)">输入</text>' +
        '<path d="M52 58 H66" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.4"/>' +
        '<rect x="68" y="32" width="76" height="52" rx="11" fill="var(--cs-card)" stroke="var(--cs-blue)" stroke-width="1.3"/>' +
        '<text x="106" y="55" text-anchor="middle" font-size="8.5" font-weight="600" fill="var(--cs-ink)">' + fnName + '</text>' +
        '<text x="106" y="69" text-anchor="middle" font-size="7.5" fill="var(--cs-muted)">' + escHtml(node.roleLabel) + '</text>' +
        '<path d="M146 58 H160" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.4"/>' +
        '<rect x="162" y="42" width="40" height="32" rx="8" fill="var(--cs-green-soft)"/>' +
        '<text x="182" y="61" text-anchor="middle" font-size="8" fill="var(--cs-green)">输出</text>' +
        '<text x="105" y="114" text-anchor="middle" font-size="8.5" fill="var(--cs-muted)">模块处理流程示意</text>' +
      '</svg>';
    }

    function renderColumns() {
      const zones = DATA.zones && DATA.zones.length > 0
        ? DATA.zones
        : [{ id: 'default', title: '项目模块', badge: 'Modules', kind: 'core', lanes: DATA.lanes }];
      colsEl.style.setProperty('--zone-count', String(zones.length));

      const focusId = hoveredId || activeModalId;
      const focusNode = focusId ? nodeMap.get(focusId) : null;
      const upSet = new Set(focusNode ? focusNode.upstreamPaths : []);
      const downSet = new Set(focusNode ? focusNode.directDownstreamPaths : []);

      colsEl.innerHTML = zones.map(zone => {
        const groupsHtml = zone.lanes.map(lane => {
          const isExp = expandedGroups.has(lane.id);
          // Rock-steady order: NEVER re-sort on click/hover so user always knows where everything lives!
          const visibleIds = isExp ? lane.nodeIds : lane.nodeIds.slice(0, MAX_PER_GROUP);
          const hidden = lane.nodeIds.length - visibleIds.length;

          const itemsHtml = visibleIds.map(id => {
            const n = nodeMap.get(id);
            if (!n) return '';
            const cls = ['cs-mod'];
            const isFault = DATA.activeDiagnosis?.targetNodeId === id;
            if (isFault) cls.push('is-fault');
            else if (focusId && id !== focusId) {
              if (upSet.has(id)) cls.push('is-up');
              else if (downSet.has(id)) cls.push('is-down');
              else cls.push('is-dim');
            }

            let tagHtml = '';
            if (isFault) tagHtml = '<span class="cs-mod-tag cs-tag-fault">报错</span>';
            else if (n.downstreamReach >= 5) tagHtml = '<span class="cs-mod-tag cs-tag-hub">' + n.downstreamReach + '处用</span>';
            else if (zone.kind === 'frontend') tagHtml = '<span class="cs-mod-tag cs-tag-ui">原型</span>';

            return '<button type="button" class="' + cls.join(' ') + '" data-node-id="' + escHtml(n.id) + '">' +
              '<div class="cs-mod-left">' +
                '<span class="cs-mod-name">' + escHtml(n.name) + '</span>' +
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
          updateHoverClasses();
        });
        btn.addEventListener('mouseleave', () => {
          hoveredId = null;
          updateHoverClasses();
        });
        btn.addEventListener('click', () => openModal(id));
      });

      colsEl.querySelectorAll('.cs-more-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const gid = btn.dataset.expandGroup;
          if (expandedGroups.has(gid)) expandedGroups.delete(gid);
          else expandedGroups.add(gid);
          renderColumns();
        });
      });
    }

    function updateHoverClasses() {
      const focusId = hoveredId || activeModalId;
      const focusNode = focusId ? nodeMap.get(focusId) : null;
      const upSet = new Set(focusNode ? focusNode.upstreamPaths : []);
      const downSet = new Set(focusNode ? focusNode.directDownstreamPaths : []);
      colsEl.querySelectorAll('.cs-mod').forEach(btn => {
        const id = btn.dataset.nodeId;
        const isFault = DATA.activeDiagnosis?.targetNodeId === id;
        btn.classList.remove('is-dim', 'is-up', 'is-down');
        if (isFault || !focusId || id === focusId) return;
        if (upSet.has(id)) btn.classList.add('is-up');
        else if (downSet.has(id)) btn.classList.add('is-down');
        else btn.classList.add('is-dim');
      });
    }

    function buildExploreDirections(node) {
      const impactCount = node.allDownstreamPaths.length;
      if (impactCount >= 3) {
        return [
          {
            id: 'adj-safe',
            label: '只改内部实现，不影响别的文件',
            strategy: '保持 ' + node.name + ' 原有输入输出不变，避免影响用到它的 ' + impactCount + ' 个文件。',
            surgicalPrompt: '[CodeSight Fix Plan: Safe Internal Edit]\\nModify \`' + node.path + '\` while keeping its exported signature backward-compatible so none of its ' + impactCount + ' dependent files break.'
          },
          {
            id: 'adj-all',
            label: '连同相关 ' + impactCount + ' 个文件一起改',
            strategy: '如果需要改接口或数据结构，让 AI 按依赖关系把关联文件一次改齐。',
            surgicalPrompt: '[CodeSight Fix Plan: Coordinated Update]\\nUpdate \`' + node.path + '\` AND synchronously update all ' + impactCount + ' dependent files (' + node.allDownstreamPaths.slice(0, 5).join(', ') + '). Run typecheck & tests.'
          }
        ];
      }
      return [
        {
          id: 'adj-direct',
          label: '放心直接调整 ' + node.name,
          strategy: impactCount === 0 ? '没有其他文件依赖它，改样式、加功能或修问题都很安全。' : '只直接关联 ' + impactCount + ' 个文件，改动可控。',
          surgicalPrompt: '[CodeSight Fix Plan: Scoped Edit]\\nUpdate \`' + node.path + '\` cleanly. Keep changes minimal and verify ' + (impactCount > 0 ? node.directDownstreamPaths.join(', ') : 'build & tests') + '.'
        },
        {
          id: 'adj-explain',
          label: '让 AI 结合上下游讲讲这段代码',
          strategy: '只把这 1 个文件和直接关联发给 AI，用最少 Token 听懂来龙去脉。',
          surgicalPrompt: '[CodeSight Explain]\\nExplain how \`' + node.path + '\` works in plain Chinese, including how it uses (' + (node.upstreamPaths.join(', ') || 'none') + ') and serves (' + (node.directDownstreamPaths.join(', ') || 'top-level entry') + ').'
        }
      ];
    }

    function openModal(id) {
      const node = nodeMap.get(id);
      if (!node) return;
      activeModalId = id;
      updateHoverClasses();

      const isFault = Boolean(DATA.activeDiagnosis && DATA.activeDiagnosis.targetNodeId === id);
      const impactCount = node.allDownstreamPaths.length;
      const safeCount = Math.max(0, DATA.totalFiles - 1 - impactCount);
      const dirs = isFault ? DATA.activeDiagnosis.directions : buildExploreDirections(node);
      const title = isFault ? DATA.activeDiagnosis.headline : node.name + ' · ' + node.roleLabel;
      const desc = isFault ? (DATA.activeDiagnosis.subtext || node.summary) : node.summary;

      const protoTag = node.zoneKind === 'frontend' ? '界面原型示意' : node.zoneKind === 'backend' ? '服务流转示意' : '结构示意';

      const upPills = node.upstreamPaths.slice(0, 4).map(p => {
        const target = nodeMap.get(p);
        return '<button type="button" class="cs-jump-pill" data-jump="' + escHtml(p) + '">' + escHtml(target ? target.name : p) + '</button>';
      }).join('') || '<span style="color:var(--cs-muted)">无</span>';

      const downPills = node.directDownstreamPaths.slice(0, 4).map(p => {
        const target = nodeMap.get(p);
        return '<button type="button" class="cs-jump-pill" data-jump="' + escHtml(p) + '">' + escHtml(target ? target.name : p) + '</button>';
      }).join('') || '<span style="color:var(--cs-muted)">无（独立文件）</span>';

      modalEl.innerHTML =
        '<div class="cs-modal-head">' +
          '<div class="cs-breadcrumb">' +
            '<span>' + escHtml(node.zoneTitle) + '</span>' +
            '<span>›</span>' +
            '<span>' + escHtml(node.laneTitle) + '</span>' +
            '<span>›</span>' +
            '<strong>' + escHtml(node.name) + '</strong>' +
          '</div>' +
          '<button type="button" class="cs-close-btn" id="cs-modal-close" aria-label="关闭">✕</button>' +
        '</div>' +
        '<div class="cs-modal-body">' +
          '<div class="cs-proto-grid">' +
            '<div class="cs-proto-stage">' +
              '<div class="cs-proto-kicker"><span>' + protoTag + '</span><span>' + escHtml(node.zoneKind.toUpperCase()) + '</span></div>' +
              '<div class="cs-wireframe">' + renderPrototypeSvg(node) + '</div>' +
            '</div>' +
            '<div class="cs-info-col">' +
              '<h3 class="cs-modal-title">' + escHtml(title) + '</h3>' +
              '<p class="cs-modal-desc">' + escHtml(desc) + '</p>' +
              '<div class="cs-rel-pills">' +
                '<div class="cs-rel-line"><span style="color:var(--cs-blue);font-weight:600">用到：</span>' + upPills + '</div>' +
                '<div class="cs-rel-line"><span style="color:var(--cs-amber);font-weight:600">影响：</span>' + downPills + '</div>' +
                '<div class="cs-rel-line" style="color:var(--cs-green);font-weight:500">其余 ' + safeCount + ' 个文件完全不受影响</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="cs-choices">' +
            dirs.map((d, i) =>
              '<label class="cs-choice">' +
                '<input type="radio" name="cs_modal_dir" value="' + escHtml(d.id) + '" ' + (i === 0 ? 'checked' : '') + ' />' +
                '<div>' +
                  '<div class="cs-choice-t">' + escHtml(d.label) + '</div>' +
                  '<div class="cs-choice-s">' + escHtml(d.strategy) + '</div>' +
                '</div>' +
              '</label>'
            ).join('') +
          '</div>' +
          '<button type="button" class="cs-btn" id="cs-modal-copy">' + (isFault ? '复制修改指令给 AI' : '复制调整指令给 AI') + '</button>' +
        '</div>';

      backdropEl.classList.add('is-open');

      document.getElementById('cs-modal-close')?.addEventListener('click', closeModal);
      modalEl.querySelectorAll('.cs-jump-pill').forEach(btn => {
        btn.addEventListener('click', () => openModal(btn.dataset.jump));
      });
      const copyBtn = document.getElementById('cs-modal-copy');
      copyBtn?.addEventListener('click', async () => {
        const checked = modalEl.querySelector('input[name="cs_modal_dir"]:checked');
        const chosen = dirs.find(d => d.id === checked?.value) || dirs[0];
        try { await navigator.clipboard.writeText(chosen.surgicalPrompt); } catch {}
        window.parent?.postMessage({ type: 'codesight:actionPrompt', nodeId: node.id, prompt: chosen.surgicalPrompt }, '*');
        const old = copyBtn.textContent;
        copyBtn.textContent = '已复制，直接发给 AI 即可';
        setTimeout(() => { copyBtn.textContent = old; }, 1600);
      });
    }

    function closeModal() {
      activeModalId = null;
      backdropEl.classList.remove('is-open');
      updateHoverClasses();
    }

    backdropEl.addEventListener('click', (e) => {
      if (e.target === backdropEl) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

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
      <div class="cs-top-actions">
        <span class="cs-hint-pill">悬停高亮关联 · 点击弹出详情与原型图</span>
      </div>
    </header>

    ${
      diag
        ? `<div class="cs-fault-banner">
            <span><strong>当前报错：</strong>${esc(diag.headline)}</span>
            <button type="button" class="cs-fault-btn" id="cs-open-fault">弹窗查看报错与修复方案</button>
          </div>`
        : ''
    }

    <div class="cs-columns" id="cs-columns"></div>
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
