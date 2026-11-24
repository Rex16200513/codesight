import { SHEET_CSS } from './uiSheetStyles.ts';

export function esc(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Apple / OpenAI craft stylesheet:
 * - Zero visual noise, hairline borders, crisp typographic hierarchy, pure neutral canvas
 * - Works cleanly inside Orca/Claude/ChatGPT MCP App iframes AND standalone local browser preview
 * - Scopes all custom tokens on `.cs-shell, .cs-backdrop` so host `:root` tokens are never overridden
 */
const BASE_CSS = `
  .cs-shell, .cs-backdrop {
    --cs-bg: #ffffff;
    --cs-canvas: #f5f5f7;
    --cs-card: #ffffff;
    --cs-ink: #1d1d1f;
    --cs-muted: #6e6e73;
    --cs-faint: #98989d;
    --cs-hairline: rgba(0, 0, 0, 0.08);
    --cs-hairline-strong: rgba(0, 0, 0, 0.14);
    --cs-primary: #1d1d1f;
    --cs-primary-fg: #ffffff;
    --cs-blue: #0071e3;
    --cs-blue-soft: rgba(0, 113, 227, 0.08);
    --cs-amber: #c26d0a;
    --cs-amber-soft: rgba(194, 109, 10, 0.09);
    --cs-red: #d92d20;
    --cs-red-soft: rgba(217, 45, 32, 0.09);
    --cs-green: #16803c;
    --cs-green-soft: rgba(22, 128, 60, 0.09);
    --cs-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    --cs-sheet-shadow: 0 24px 60px rgba(0, 0, 0, 0.16), 0 0 0 0.5px rgba(0, 0, 0, 0.08);
  }
  @media (prefers-color-scheme: dark) {
    .cs-shell, .cs-backdrop {
      --cs-bg: #111113;
      --cs-canvas: #161618;
      --cs-card: #1c1c1f;
      --cs-ink: #f5f5f7;
      --cs-muted: #a1a1a6;
      --cs-faint: #6e6e73;
      --cs-hairline: rgba(255, 255, 255, 0.09);
      --cs-hairline-strong: rgba(255, 255, 255, 0.16);
      --cs-primary: #f5f5f7;
      --cs-primary-fg: #111113;
      --cs-blue: #2997ff;
      --cs-blue-soft: rgba(41, 151, 255, 0.14);
      --cs-amber: #f59e0b;
      --cs-amber-soft: rgba(245, 158, 11, 0.14);
      --cs-red: #f87171;
      --cs-red-soft: rgba(248, 113, 113, 0.14);
      --cs-green: #34d399;
      --cs-green-soft: rgba(52, 211, 153, 0.14);
      --cs-shadow: 0 1px 2px rgba(0, 0, 0, 0.24);
      --cs-sheet-shadow: 0 24px 60px rgba(0, 0, 0, 0.55), 0 0 0 0.5px rgba(255, 255, 255, 0.12);
    }
  }

  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: transparent;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "PingFang SC", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    color: var(--cs-ink);
  }

  .cs-shell {
    background: var(--cs-bg);
    border: 1px solid var(--cs-hairline);
    border-radius: 16px;
    overflow: hidden;
    color: var(--cs-ink);
  }

  /* Minimal Apple/OpenAI Header */
  .cs-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--cs-hairline);
    background: var(--cs-bg);
  }
  .cs-shell.is-collapsed .cs-bar { border-bottom: none; }
  .cs-shell.is-collapsed .cs-body-wrap { display: none; }
  .cs-brand {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    cursor: pointer;
    user-select: none;
  }
  .cs-collapsed-pill {
    display: none;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--cs-muted);
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--cs-canvas);
    border: 1px solid var(--cs-hairline);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cs-collapsed-pill.is-fault {
    color: var(--cs-red);
    background: var(--cs-red-soft);
    border-color: transparent;
    font-weight: 550;
  }
  .cs-shell.is-collapsed .cs-collapsed-pill { display: inline-flex; }
  .cs-chev { transition: transform 0.16s ease; }
  .cs-shell.is-collapsed .cs-chev { transform: rotate(-90deg); }
  .cs-mark {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: var(--cs-primary);
    color: var(--cs-primary-fg);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .cs-brand-name { font-size: 13px; font-weight: 600; letter-spacing: -0.015em; color: var(--cs-ink); }
  .cs-brand-repo {
    font-size: 12px;
    color: var(--cs-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cs-bar-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

  .cs-seg {
    display: inline-flex;
    padding: 2px;
    border-radius: 8px;
    background: var(--cs-canvas);
    border: 1px solid var(--cs-hairline);
  }
  .cs-seg button {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--cs-muted);
    font-size: 10.5px;
    font-weight: 550;
    padding: 3px 7px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.14s ease;
  }
  .cs-seg button.is-on {
    background: var(--cs-card);
    color: var(--cs-ink);
    box-shadow: var(--cs-shadow);
  }

  .cs-action-pill {
    appearance: none;
    height: 28px;
    padding: 0 9px;
    border-radius: 8px;
    border: 1px solid var(--cs-hairline);
    background: var(--cs-canvas);
    color: var(--cs-ink);
    font-size: 11px;
    font-weight: 550;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color 0.14s ease, color 0.14s ease, background 0.14s ease;
  }
  .cs-action-pill:hover {
    border-color: var(--cs-blue);
    color: var(--cs-blue);
    background: var(--cs-blue-soft);
  }
  .cs-action-pill:disabled { opacity: 0.6; cursor: wait; }
  .cs-spin { animation: cs-spin 1s linear infinite; }
  @keyframes cs-spin { to { transform: rotate(360deg); } }

  .cs-icon-btn {
    appearance: none;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--cs-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.14s ease, color 0.14s ease, border-color 0.14s ease;
  }
  .cs-icon-btn:hover {
    background: var(--cs-canvas);
    color: var(--cs-ink);
    border-color: var(--cs-hairline);
  }

  /* Compact Fault Strip (only when active error) */
  .cs-fault-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 16px;
    background: var(--cs-red-soft);
    border-bottom: 1px solid var(--cs-hairline);
    font-size: 12px;
  }
  .cs-fault-msg { display: flex; align-items: center; gap: 7px; min-width: 0; color: var(--cs-ink); }
  .cs-fault-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cs-red); flex-shrink: 0; }
  .cs-fault-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
  .cs-fault-act {
    appearance: none;
    border: none;
    border-radius: 999px;
    padding: 4px 11px;
    background: var(--cs-red);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
  }
  .cs-fault-act:hover { opacity: 0.9; }

  /* Vertical Layered Architecture Board */
  .cs-stage { position: relative; background: var(--cs-canvas); }
  .cs-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 3;
    overflow: visible;
  }
  .cs-edge-idle { fill: none; stroke: var(--cs-faint); stroke-width: 1.1; stroke-dasharray: 3.5 3.5; opacity: 0.34; }
  .cs-edge-up { fill: none; stroke: var(--cs-blue); stroke-width: 1.5; stroke-dasharray: 4 3.5; stroke-linecap: round; }
  .cs-edge-down { fill: none; stroke: var(--cs-amber); stroke-width: 1.5; stroke-dasharray: 4 3.5; stroke-linecap: round; }
  .cs-edge-fault { fill: none; stroke: var(--cs-red); stroke-width: 1.75; stroke-dasharray: 4.5 3; stroke-linecap: round; }

  .cs-cols {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: repeat(var(--zone-count, 3), minmax(0, 1fr));
  }
  @media (max-width: 390px) { .cs-cols { grid-template-columns: 1fr; } }
  .cs-col { padding: 14px 12px 16px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .cs-col + .cs-col { border-left: 1px solid var(--cs-hairline); }
  .cs-col-head { display: flex; align-items: baseline; justify-content: space-between; padding: 0 3px; }
  .cs-col-title { font-size: 11.5px; font-weight: 600; letter-spacing: -0.01em; color: var(--cs-ink); }
  .cs-col-count { font-size: 10.5px; color: var(--cs-faint); font-variant-numeric: tabular-nums; }
  .cs-group { display: flex; flex-direction: column; gap: 5px; }
  .cs-group-label { font-size: 10px; font-weight: 550; color: var(--cs-faint); padding: 0 3px; letter-spacing: 0.01em; }
  .cs-list { display: flex; flex-direction: column; gap: 5px; }

  /* Crisp Single-Line Module Row */
  .cs-row {
    appearance: none;
    width: 100%;
    text-align: left;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 7.5px 10px;
    border-radius: 9px;
    border: 1px solid var(--cs-hairline);
    background: var(--cs-card);
    color: var(--cs-ink);
    cursor: pointer;
    user-select: none;
    box-shadow: var(--cs-shadow);
    transition: border-color 0.14s ease, background 0.14s ease, opacity 0.14s ease, transform 0.12s ease;
    min-width: 0;
  }
  .cs-row:hover { border-color: var(--cs-hairline-strong); transform: translateY(-0.5px); }
  .cs-row.is-focus { border-color: var(--cs-blue); background: var(--cs-blue-soft); }
  .cs-row.is-up { border-color: var(--cs-blue); }
  .cs-row.is-down { border-color: var(--cs-amber); }
  .cs-row.is-fault { border-color: var(--cs-red); background: var(--cs-red-soft); }
  .cs-row.is-dim { opacity: 0.34; }

  .cs-row-name {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 11.5px;
    font-weight: 520;
    color: var(--cs-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cs-row-metric { font-size: 10px; font-weight: 550; color: var(--cs-faint); font-variant-numeric: tabular-nums; flex-shrink: 0; }
  .cs-row.is-down .cs-row-metric, .cs-row.is-focus .cs-row-metric { color: var(--cs-amber); }
  .cs-dot-fault { width: 6.5px; height: 6.5px; border-radius: 50%; background: var(--cs-red); flex-shrink: 0; }
  .cs-row-right { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; }
  .cs-dot-warn { width: 5.5px; height: 5.5px; border-radius: 50%; background: var(--cs-amber); flex-shrink: 0; }

  .cs-tip-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 11px;
    border-radius: 10px;
    background: var(--cs-amber-soft);
    border: 1px solid rgba(194, 109, 10, 0.18);
    font-size: 11.5px;
    line-height: 1.4;
    color: var(--cs-ink);
  }
  .cs-tip-strip.is-info { background: var(--cs-canvas); border-color: var(--cs-hairline); color: var(--cs-muted); }
  .cs-tip-btn {
    appearance: none;
    border: 1px solid var(--cs-hairline-strong);
    background: var(--cs-card);
    color: var(--cs-ink);
    border-radius: 7px;
    padding: 4px 9px;
    font-size: 11px;
    font-weight: 550;
    cursor: pointer;
    flex-shrink: 0;
  }
  .cs-tip-btn:hover { border-color: var(--cs-amber); color: var(--cs-amber); }

  .cs-more {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--cs-muted);
    font-size: 10.5px;
    font-weight: 500;
    padding: 4px 4px;
    text-align: left;
    cursor: pointer;
    border-radius: 6px;
  }
  .cs-more:hover { color: var(--cs-ink); }

  /* Subtle Footer Status Line */
  .cs-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 16px;
    border-top: 1px solid var(--cs-hairline);
    background: var(--cs-bg);
    font-size: 11px;
    color: var(--cs-muted);
    min-height: 33px;
  }
  .cs-foot-hint { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cs-foot-legend { display: inline-flex; align-items: center; gap: 10px; flex-shrink: 0; font-size: 10.5px; }
  .cs-dash { display: inline-block; width: 12px; border-top: 1.5px dashed currentColor; vertical-align: middle; margin-right: 4px; }
`;

export const APPLE_CSS = BASE_CSS + SHEET_CSS;

export const LOGO_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9.2 6.8L3.6 12L9.2 17.2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.8 6.8L20.4 12L14.8 17.2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.4" fill="#2997FF" opacity="0.32"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/></svg>`;
export const GEAR_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
export const CHEVRON_SVG = `<svg class="cs-chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>`;
export const SPARKLE_SVG = `<svg width="12.5" height="12.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="M19 3v4M21 5h-4M5 17v4M7 19H3"/></svg>`;
