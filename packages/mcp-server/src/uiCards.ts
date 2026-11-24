import type {
  CodeSightConfig,
  SymbolTraceReport,
  VisualProjectMapPayload,
} from '@codesight/core/engine';
import { DEFAULT_CODESIGHT_CONFIG } from '@codesight/core/engine';

function esc(str: string): string {
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
const APPLE_CSS = `
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
  .cs-shell.is-collapsed .cs-bar {
    border-bottom: none;
  }
  .cs-shell.is-collapsed .cs-body-wrap {
    display: none;
  }
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
  .cs-shell.is-collapsed .cs-collapsed-pill {
    display: inline-flex;
  }
  .cs-chev {
    transition: transform 0.16s ease;
  }
  .cs-shell.is-collapsed .cs-chev {
    transform: rotate(-90deg);
  }
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
  .cs-brand-name {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.015em;
    color: var(--cs-ink);
  }
  .cs-brand-repo {
    font-size: 12px;
    color: var(--cs-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cs-bar-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

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
  .cs-fault-msg {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    color: var(--cs-ink);
  }
  .cs-fault-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--cs-red);
    flex-shrink: 0;
  }
  .cs-fault-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
  }
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
  .cs-stage {
    position: relative;
    background: var(--cs-canvas);
  }
  .cs-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 3;
    overflow: visible;
  }
  .cs-edge-idle {
    fill: none;
    stroke: var(--cs-faint);
    stroke-width: 1.1;
    stroke-dasharray: 3.5 3.5;
    opacity: 0.34;
  }
  .cs-edge-up {
    fill: none;
    stroke: var(--cs-blue);
    stroke-width: 1.5;
    stroke-dasharray: 4 3.5;
    stroke-linecap: round;
  }
  .cs-edge-down {
    fill: none;
    stroke: var(--cs-amber);
    stroke-width: 1.5;
    stroke-dasharray: 4 3.5;
    stroke-linecap: round;
  }
  .cs-edge-fault {
    fill: none;
    stroke: var(--cs-red);
    stroke-width: 1.75;
    stroke-dasharray: 4.5 3;
    stroke-linecap: round;
  }

  .cs-cols {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: repeat(var(--zone-count, 3), minmax(0, 1fr));
  }
  @media (max-width: 390px) {
    .cs-cols { grid-template-columns: 1fr; }
  }
  .cs-col {
    padding: 14px 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  .cs-col + .cs-col {
    border-left: 1px solid var(--cs-hairline);
  }

  .cs-col-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 0 3px;
  }
  .cs-col-title {
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--cs-ink);
  }
  .cs-col-count {
    font-size: 10.5px;
    color: var(--cs-faint);
    font-variant-numeric: tabular-nums;
  }

  .cs-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .cs-group-label {
    font-size: 10px;
    font-weight: 550;
    color: var(--cs-faint);
    padding: 0 3px;
    letter-spacing: 0.01em;
  }
  .cs-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  /* Crisp Single-Line Module Row (Minimal Text!) */
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
    box-shadow: var(--cs-shadow);
    transition: border-color 0.14s ease, background 0.14s ease, opacity 0.14s ease, transform 0.12s ease;
    min-width: 0;
  }
  .cs-row:hover {
    border-color: var(--cs-hairline-strong);
    transform: translateY(-0.5px);
  }
  .cs-row.is-focus {
    border-color: var(--cs-blue);
    background: var(--cs-blue-soft);
  }
  .cs-row.is-up {
    border-color: var(--cs-blue);
  }
  .cs-row.is-down {
    border-color: var(--cs-amber);
  }
  .cs-row.is-fault {
    border-color: var(--cs-red);
    background: var(--cs-red-soft);
  }
  .cs-row.is-dim {
    opacity: 0.34;
  }

  .cs-row-name {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 11.5px;
    font-weight: 520;
    color: var(--cs-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cs-row-metric {
    font-size: 10px;
    font-weight: 550;
    color: var(--cs-faint);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
  .cs-row.is-down .cs-row-metric,
  .cs-row.is-focus .cs-row-metric {
    color: var(--cs-amber);
  }
  .cs-dot-fault {
    width: 6.5px;
    height: 6.5px;
    border-radius: 50%;
    background: var(--cs-red);
    flex-shrink: 0;
  }

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

  /* Subtle Footer Status Line (Hover Preview, 1 Line) */
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
  .cs-foot-hint {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cs-foot-legend {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
    font-size: 10.5px;
  }
  .cs-dash {
    display: inline-block;
    width: 12px;
    border-top: 1.5px dashed currentColor;
    vertical-align: middle;
    margin-right: 4px;
  }

  /* Apple Frosted Sheet Backdrop */
  .cs-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: none;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .cs-backdrop.is-open { display: flex; }

  .cs-sheet {
    width: min(500px, 100%);
    max-height: calc(100vh - 32px);
    overflow-y: auto;
    background: var(--cs-bg);
    color: var(--cs-ink);
    border: 1px solid var(--cs-hairline);
    border-radius: 18px;
    box-shadow: var(--cs-sheet-shadow);
    animation: cs-sheet-in 0.16s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes cs-sheet-in {
    from { opacity: 0; transform: translateY(6px) scale(0.985); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .cs-sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 13px 16px;
    border-bottom: 1px solid var(--cs-hairline);
  }
  .cs-crumb {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    color: var(--cs-muted);
    min-width: 0;
    overflow: hidden;
  }
  .cs-crumb strong {
    color: var(--cs-ink);
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cs-close {
    appearance: none;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: none;
    background: var(--cs-canvas);
    color: var(--cs-muted);
    font-size: 12px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .cs-close:hover { color: var(--cs-ink); }

  /* Modal Body: Clean Info vs Clickable Navigation */
  .cs-sheet-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .cs-detail-grid {
    display: grid;
    grid-template-columns: 164px minmax(0, 1fr);
    gap: 16px;
    align-items: center;
  }
  @media (max-width: 440px) {
    .cs-detail-grid { grid-template-columns: 1fr; }
  }
  .cs-proto {
    border: 1px solid var(--cs-hairline);
    border-radius: 12px;
    background: var(--cs-canvas);
    padding: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 112px;
  }
  .cs-meta {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
  }
  .cs-meta-top {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .cs-meta-title {
    margin: 0;
    font-size: 15px;
    font-weight: 620;
    letter-spacing: -0.02em;
    color: var(--cs-ink);
  }
  .cs-state-dot {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 550;
    color: var(--cs-muted);
  }
  .cs-state-dot::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
  .cs-meta-desc {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--cs-muted);
  }

  /* Clickable Jump Chips */
  .cs-links {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding-top: 10px;
    border-top: 1px solid var(--cs-hairline);
  }
  .cs-link-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    font-size: 11px;
  }
  .cs-link-lbl {
    color: var(--cs-faint);
    min-width: 52px;
    font-weight: 550;
  }
  .cs-chip {
    appearance: none;
    border: 1px solid var(--cs-hairline);
    background: var(--cs-canvas);
    color: var(--cs-ink);
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 7px;
    cursor: pointer;
    transition: border-color 0.14s ease, color 0.14s ease;
  }
  .cs-chip:hover {
    border-color: var(--cs-blue);
    color: var(--cs-blue);
  }

  /* Modal Footer: Clean Actions */
  .cs-sheet-foot {
    padding: 12px 16px;
    border-top: 1px solid var(--cs-hairline);
    background: var(--cs-canvas);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .cs-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .cs-btn-primary {
    appearance: none;
    flex: 1;
    border: none;
    border-radius: 10px;
    padding: 9px 14px;
    background: var(--cs-primary);
    color: var(--cs-primary-fg);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .cs-btn-primary:hover { opacity: 0.88; }
  .cs-btn-ghost {
    appearance: none;
    border: 1px solid var(--cs-hairline-strong);
    border-radius: 10px;
    padding: 9px 14px;
    background: var(--cs-card);
    color: var(--cs-ink);
    font-size: 12.5px;
    font-weight: 550;
    cursor: pointer;
  }
  .cs-btn-ghost:hover { border-color: var(--cs-ink); }

  /* Fallback Selectable Prompt Box (auto-shown if host iframe blocks programmatic clipboard) */
  .cs-prompt-box {
    display: none;
    flex-direction: column;
    gap: 5px;
    padding-top: 4px;
  }
  .cs-prompt-box.is-open { display: flex; }
  .cs-prompt-tip {
    font-size: 11px;
    color: var(--cs-muted);
    display: flex;
    justify-content: space-between;
  }
  .cs-prompt-ta {
    width: 100%;
    min-height: 62px;
    resize: vertical;
    border: 1px solid var(--cs-blue);
    border-radius: 9px;
    background: var(--cs-card);
    color: var(--cs-ink);
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 11px;
    line-height: 1.45;
    padding: 8px 10px;
    outline: none;
  }

  /* Error-only Fix Choices */
  .cs-choices {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  @media (max-width: 440px) {
    .cs-choices { grid-template-columns: 1fr; }
  }
  .cs-choice {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 9px 10px;
    border-radius: 10px;
    border: 1px solid var(--cs-hairline);
    background: var(--cs-card);
    cursor: pointer;
  }
  .cs-choice:has(input:checked) {
    border-color: var(--cs-ink);
  }
  .cs-choice input { margin-top: 2px; accent-color: var(--cs-ink); }
  .cs-choice-t { font-size: 12px; font-weight: 600; color: var(--cs-ink); }
  .cs-choice-s { font-size: 11px; color: var(--cs-muted); margin-top: 2px; line-height: 1.35; }

  /* Apple Settings Rows */
  .cs-set-group {
    border: 1px solid var(--cs-hairline);
    border-radius: 12px;
    background: var(--cs-card);
    overflow: hidden;
  }
  .cs-set-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 13px;
    font-size: 12.5px;
  }
  .cs-set-row + .cs-set-row {
    border-top: 1px solid var(--cs-hairline);
  }
  .cs-set-lbl {
    font-weight: 520;
    color: var(--cs-ink);
  }
  .cs-set-sub {
    font-size: 11px;
    color: var(--cs-muted);
    margin-top: 1px;
  }
  .cs-input {
    width: 100%;
    border: 1px solid var(--cs-hairline-strong);
    background: var(--cs-canvas);
    color: var(--cs-ink);
    border-radius: 8px;
    padding: 7px 10px;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 11.5px;
    outline: none;
  }
  .cs-input:focus { border-color: var(--cs-blue); }

  /* Native Apple Toggle Switch */
  .cs-switch {
    position: relative;
    width: 36px;
    height: 20px;
    flex-shrink: 0;
  }
  .cs-switch input { opacity: 0; width: 0; height: 0; }
  .cs-slider {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    background: var(--cs-hairline-strong);
    cursor: pointer;
    transition: background 0.16s ease;
  }
  .cs-slider::before {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    left: 2px;
    top: 2px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    transition: transform 0.16s ease;
  }
  .cs-switch input:checked + .cs-slider { background: var(--cs-blue); }
  .cs-switch input:checked + .cs-slider::before { transform: translateX(16px); }
`;

const LOGO_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9.2 6.8L3.6 12L9.2 17.2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.8 6.8L20.4 12L14.8 17.2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.4" fill="#2997FF" opacity="0.32"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/></svg>`;
const GEAR_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
const CHEVRON_SVG = `<svg class="cs-chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>`;

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
    },
  }).replace(/</g, '\\u003c');

  const diag = payload.activeDiagnosis;

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

    const LANE_EN = {
      '页面与入口': 'Pages & Entry',
      '界面组件': 'UI Components',
      '页面与组件': 'Pages & UI',
      '服务与插件': 'Services & MCP',
      '命令与工具入口': 'CLI & Tools',
      '核心引擎': 'Core Engine',
      '核心逻辑': 'Core Logic',
      '核心分析引擎': 'Analysis Engine',
      '基础数据定义': 'Shared Types',
      '基础与数据定义': 'Shared Types',
      '数据与协议': 'Schemas',
      '功能模块': 'Modules',
      '业务模块': 'Modules',
      '界面视图': 'UI Views',
      '服务端': 'Server',
      '后端接口': 'API & Routes',
      '程序入口': 'Entrypoints',
      '工具模块': 'Utilities',
    };

    const ROLE_EN = {
      '主页面': 'App Entry',
      '悬浮窗主界面': 'Floating HUD',
      '界面卡片': 'UI Card',
      '插件通信接口': 'MCP Interface',
      '本地后台服务': 'Local Service',
      '代码分析核心': 'Analysis Core',
      '全项目共用数据格式': 'Shared Schema',
      '修复指令生成': 'Prompt Builder',
      '大模型连接器': 'LLM Adapter',
      '目录汇总出口': 'Barrel Export',
      '启动入口': 'Entrypoint',
      '功能模块': 'Module',
      '测试文件': 'Test',
      '界面样式': 'Styles',
      '项目配置': 'Config',
    };

    const T = {
      zh: {
        zones: { frontend: '前端', backend: '服务', core: '核心', shared: '基础' },
        uses: '依赖',
        usedBy: '影响',
        none: '无',
        more: (n) => '+ 其余 ' + n + ' 项',
        less: '收起',
        hoverHint: '悬停查看连线，点击查看详情',
        faultBtn: '查看修复',
        faultState: '报错位置',
        filesCount: (n) => n + ' 个文件',
        callers: (n) => n === 0 ? '独立文件' : n + ' 处调用',
        editBtn: (hub) => hub ? '安全调整' : '调整此文件',
        explainBtn: '讲解代码',
        copyFix: '复制修复指令',
        copied: '已复制给 AI',
        pressCopy: '已选中，按 ⌘C / Ctrl+C 复制',
        promptHint: '环境限制自动剪贴板，已为你全选下方指令：',
        settings: '设置',
        langLbl: '语言',
        linesLbl: '关联虚线',
        linesAlways: '常显',
        linesHover: '仅悬停',
        collapseDefLbl: '默认折叠卡片',
        collapseDefSub: '长对话连续排错时保持精简',
        guardLbl: '静默回归拦截',
        guardSub: '拦截空 catch、as any 与删校验',
        archLbl: '架构分层',
        archAuto: '自动',
        archLocal: '本地',
        archLlm: '模型',
        llmLbl: '小模型增强（BYOK）',
        saveBtn: '保存设置',
        saved: '已保存',
        savedCopy: '已复制同步指令',
      },
      en: {
        zones: { frontend: 'Frontend', backend: 'Backend', core: 'Core', shared: 'Shared' },
        uses: 'Uses',
        usedBy: 'Used by',
        none: 'None',
        more: (n) => '+ ' + n + ' more',
        less: 'Less',
        hoverHint: 'Hover for links, click to inspect',
        faultBtn: 'Inspect fix',
        faultState: 'Error origin',
        filesCount: (n) => n + ' files',
        callers: (n) => n === 0 ? 'Standalone' : n + ' callers',
        editBtn: (hub) => hub ? 'Safe edit' : 'Edit file',
        explainBtn: 'Explain',
        copyFix: 'Copy fix prompt',
        copied: 'Copied for AI',
        pressCopy: 'Selected — press ⌘C / Ctrl+C',
        promptHint: 'Clipboard restricted by host — prompt selected below:',
        settings: 'Settings',
        langLbl: 'Language',
        linesLbl: 'Flow lines',
        linesAlways: 'Always',
        linesHover: 'Hover',
        collapseDefLbl: 'Collapsed by default',
        collapseDefSub: 'Keep long debug threads compact',
        guardLbl: 'Regression guard',
        guardSub: 'Catch empty catch, as any, removed guards',
        archLbl: 'Architecture',
        archAuto: 'Auto',
        archLocal: 'Local',
        archLlm: 'LLM',
        llmLbl: 'BYOK model',
        saveBtn: 'Save',
        saved: 'Saved',
        savedCopy: 'Sync command copied',
      }
    };
    const tr = () => T[CFG.language === 'en' ? 'en' : 'zh'];
    const isEn = () => CFG.language === 'en';

    function escHtml(s) {
      return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function shortName(nodeOrPath) {
      const p = typeof nodeOrPath === 'string' ? nodeOrPath : nodeOrPath.path;
      const parts = p.split('/');
      const base = parts[parts.length - 1] || p;
      if (base === 'index.ts' || base === 'index.tsx' || base === 'server.ts' || base === 'main.tsx' || base === '__init__.py') {
        const pkgIdx = parts.findIndex(seg => seg === 'packages' || seg === 'apps');
        if (pkgIdx >= 0 && parts[pkgIdx + 1]) return parts[pkgIdx + 1] + '/' + base;
        if (parts.length >= 2) return parts[parts.length - 2] + '/' + base;
      }
      return base;
    }

    function zoneHeading(zone) {
      return tr().zones[zone.kind] || (isEn() ? (zone.badge || zone.title) : zone.title);
    }

    function laneHeading(title) {
      if (!isEn()) return title;
      if (LANE_EN[title]) return LANE_EN[title];
      if (!/[\\u4e00-\\u9fa5]/.test(title)) return title;
      if (title.includes('前端') || title.includes('界面') || title.includes('组件')) return 'UI Components';
      if (title.includes('服务') || title.includes('接口') || title.includes('插件')) return 'Services & API';
      if (title.includes('命令') || title.includes('入口')) return 'Entrypoints';
      if (title.includes('数据') || title.includes('基础') || title.includes('定义')) return 'Shared Types';
      if (title.includes('核心') || title.includes('引擎') || title.includes('分析')) return 'Core Engine';
      return 'Modules';
    }

    function nodeRole(node) {
      if (!isEn()) return node.roleLabel;
      if (ROLE_EN[node.roleLabel]) return ROLE_EN[node.roleLabel];
      if (!/[\\u4e00-\\u9fa5]/.test(node.roleLabel || '')) return node.roleLabel || 'Module';
      return tr().zones[node.zoneKind] || 'Module';
    }

    function nodeSummary(node) {
      if (!isEn()) return node.summary;
      if (node.summary && !/[\\u4e00-\\u9fa5]/.test(node.summary)) return node.summary;
      const role = nodeRole(node);
      const ex = (node.exports || []).slice(0, 2).join(', ');
      if (node.downstreamReach >= 5) {
        return role + ' shared across ' + node.downstreamReach + ' files' + (ex ? ' (' + ex + ')' : '') + '.';
      }
      if (node.zoneKind === 'frontend') {
        return role + (ex ? ' rendering ' + ex : '') + '.';
      }
      if (node.zoneKind === 'backend') {
        return role + ' handling requests' + (ex ? ' via ' + ex : '') + '.';
      }
      return role + (ex ? ' exporting ' + ex : ' module') + '.';
    }

    function faultHeadline() {
      if (!DATA.activeDiagnosis) return '';
      if (isEn()) return DATA.activeDiagnosis.headlineEn || DATA.activeDiagnosis.headline;
      return DATA.activeDiagnosis.headline;
    }

    function execCopyFallback(text) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        ta.style.left = '-9999px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, text.length);
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return Boolean(ok);
      } catch {
        return false;
      }
    }

    async function copyTextReliable(text) {
      // Inside sandboxed iframes or file://, synchronous execCommand preserves user activation reliably
      const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
      if (inIframe || !window.isSecureContext) {
        if (execCopyFallback(text)) return true;
      }
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch {}
      }
      return execCopyFallback(text);
    }

    function showPromptBox(text, copiedOk) {
      const box = document.getElementById('cs-prompt-box');
      const ta = document.getElementById('cs-prompt-ta');
      const tip = document.getElementById('cs-prompt-tip');
      if (!box || !ta) return;
      ta.value = text;
      box.classList.add('is-open');
      if (tip) tip.textContent = copiedOk ? tr().copied : tr().promptHint;
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
    }

    function setCollapsed(next) {
      isCollapsed = Boolean(next);
      shellEl.classList.toggle('is-collapsed', isCollapsed);
      if (!isCollapsed) {
        requestAnimationFrame(drawDashedLines);
      }
    }

    function renderPrototypeSvg(node) {
      const k = node.prototypeKind;
      if (k === 'ui-modal') {
        return '<svg viewBox="0 0 160 96" width="144">' +
          '<rect x="4" y="4" width="152" height="88" rx="8" fill="var(--cs-bg)" stroke="var(--cs-hairline-strong)"/>' +
          '<rect x="26" y="16" width="108" height="64" rx="8" fill="var(--cs-card)" stroke="var(--cs-blue)" stroke-width="1.2"/>' +
          '<rect x="36" y="26" width="46" height="5" rx="2.5" fill="var(--cs-ink)" opacity="0.55"/>' +
          '<rect x="36" y="38" width="88" height="4" rx="2" fill="var(--cs-muted)" opacity="0.3"/>' +
          '<rect x="36" y="46" width="66" height="4" rx="2" fill="var(--cs-muted)" opacity="0.22"/>' +
          '<rect x="82" y="59" width="42" height="12" rx="4" fill="var(--cs-ink)" opacity="0.85"/>' +
        '</svg>';
      }
      if (k === 'ui-hud') {
        return '<svg viewBox="0 0 160 96" width="144">' +
          '<rect x="4" y="4" width="152" height="88" rx="8" fill="var(--cs-bg)" stroke="var(--cs-hairline)"/>' +
          '<rect x="12" y="14" width="58" height="68" rx="6" fill="var(--cs-canvas)"/>' +
          '<rect x="78" y="10" width="70" height="76" rx="9" fill="var(--cs-card)" stroke="var(--cs-blue)" stroke-width="1.2"/>' +
          '<rect x="87" y="20" width="34" height="4.5" rx="2.2" fill="var(--cs-ink)" opacity="0.55"/>' +
          '<rect x="87" y="31" width="52" height="12" rx="4" fill="var(--cs-blue-soft)"/>' +
          '<rect x="87" y="48" width="52" height="14" rx="4" fill="var(--cs-canvas)"/>' +
          '<rect x="87" y="67" width="52" height="11" rx="4" fill="var(--cs-ink)" opacity="0.82"/>' +
        '</svg>';
      }
      if (k === 'ui-card-flow' || k === 'ui-card-diff' || k === 'ui-page' || k === 'ui-card') {
        return '<svg viewBox="0 0 160 96" width="144">' +
          '<rect x="8" y="8" width="144" height="80" rx="9" fill="var(--cs-card)" stroke="var(--cs-hairline-strong)"/>' +
          '<circle cx="19" cy="18" r="2.2" fill="var(--cs-faint)"/>' +
          '<circle cx="27" cy="18" r="2.2" fill="var(--cs-faint)"/>' +
          '<line x1="8" y1="27" x2="152" y2="27" stroke="var(--cs-hairline)"/>' +
          '<rect x="18" y="35" width="70" height="44" rx="5" fill="var(--cs-canvas)"/>' +
          '<rect x="95" y="35" width="47" height="19" rx="5" fill="var(--cs-blue-soft)" stroke="var(--cs-blue)" stroke-width="0.9"/>' +
          '<rect x="95" y="60" width="47" height="19" rx="5" fill="var(--cs-canvas)"/>' +
        '</svg>';
      }
      if (k === 'api-server') {
        return '<svg viewBox="0 0 160 96" width="144">' +
          '<rect x="8" y="32" width="34" height="32" rx="7" fill="var(--cs-card)" stroke="var(--cs-hairline-strong)"/>' +
          '<path d="M44 48 H60" stroke="var(--cs-blue)" stroke-width="1.3" stroke-dasharray="3 2.5"/>' +
          '<rect x="62" y="22" width="38" height="52" rx="8" fill="var(--cs-card)" stroke="var(--cs-blue)" stroke-width="1.2"/>' +
          '<line x1="70" y1="38" x2="92" y2="38" stroke="var(--cs-ink)" stroke-width="1.5" opacity="0.5"/>' +
          '<line x1="70" y1="48" x2="88" y2="48" stroke="var(--cs-muted)" stroke-width="1.3" opacity="0.45"/>' +
          '<line x1="70" y1="58" x2="92" y2="58" stroke="var(--cs-muted)" stroke-width="1.3" opacity="0.35"/>' +
          '<path d="M102 48 H118" stroke="var(--cs-muted)" stroke-width="1.3" stroke-dasharray="3 2.5"/>' +
          '<rect x="120" y="32" width="32" height="32" rx="7" fill="var(--cs-card)" stroke="var(--cs-hairline-strong)"/>' +
        '</svg>';
      }
      return '<svg viewBox="0 0 160 96" width="144">' +
        '<rect x="18" y="16" width="124" height="64" rx="9" fill="var(--cs-card)" stroke="var(--cs-hairline-strong)"/>' +
        '<rect x="30" y="29" width="52" height="5" rx="2.5" fill="var(--cs-ink)" opacity="0.55"/>' +
        '<rect x="30" y="42" width="100" height="4" rx="2" fill="var(--cs-muted)" opacity="0.28"/>' +
        '<rect x="30" y="52" width="84" height="4" rx="2" fill="var(--cs-muted)" opacity="0.22"/>' +
        '<rect x="30" y="62" width="64" height="4" rx="2" fill="var(--cs-blue)" opacity="0.55"/>' +
      '</svg>';
    }

    function drawDashedLines() {
      const focusId = hoveredId || activeModalId;
      const stageRect = stageEl.getBoundingClientRect();
      if (!stageRect.width || !stageRect.height) return;
      svgEl.setAttribute('viewBox', '0 0 ' + stageRect.width + ' ' + stageRect.height);

      const elMap = new Map();
      colsEl.querySelectorAll('.cs-row').forEach(el => elMap.set(el.dataset.nodeId, el));

      const defs =
        '<defs>' +
          '<marker id="cs-m-idle" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse"><path d="M1.2 1.8 L6.2 4 L1.2 6.2" fill="none" stroke="var(--cs-faint)" stroke-width="1.3" stroke-linecap="round"/></marker>' +
          '<marker id="cs-m-blue" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1.2 1.6 L6.4 4 L1.2 6.4" fill="none" stroke="var(--cs-blue)" stroke-width="1.5" stroke-linecap="round"/></marker>' +
          '<marker id="cs-m-amber" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1.2 1.6 L6.4 4 L1.2 6.4" fill="none" stroke="var(--cs-amber)" stroke-width="1.5" stroke-linecap="round"/></marker>' +
          '<marker id="cs-m-red" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1.2 1.6 L6.4 4 L1.2 6.4" fill="none" stroke="var(--cs-red)" stroke-width="1.5" stroke-linecap="round"/></marker>' +
        '</defs>';

      const parts = [];

      function pushCurve(r1, r2, cls, colorVar, markerId, idx, idle) {
        const sameCol = Math.abs(r1.left - r2.left) < 24;
        const y1 = r1.top + r1.height / 2 - stageRect.top;
        const y2 = r2.top + r2.height / 2 - stageRect.top;
        let x1, x2, d;
        if (sameCol) {
          const rightEdge = Math.max(r1.right, r2.right) - stageRect.left;
          const goLeft = rightEdge + 16 > stageRect.width;
          x1 = (goLeft ? r1.left : r1.right) - stageRect.left;
          x2 = (goLeft ? r2.left : r2.right) - stageRect.left;
          const off = 9 + (idx % 3) * 4;
          const bulge = goLeft ? Math.min(x1, x2) - off : Math.max(x1, x2) + off;
          d = 'M ' + x1 + ' ' + y1 + ' C ' + bulge + ' ' + y1 + ', ' + bulge + ' ' + y2 + ', ' + x2 + ' ' + y2;
        } else {
          const right = r1.left < r2.left;
          x1 = (right ? r1.right : r1.left) - stageRect.left;
          x2 = (right ? r2.left : r2.right) - stageRect.left;
          const dx = Math.max(20, Math.abs(x2 - x1) * 0.42);
          const c1x = right ? x1 + dx : x1 - dx;
          const c2x = right ? x2 - dx : x2 + dx;
          d = 'M ' + x1 + ' ' + y1 + ' C ' + c1x + ' ' + y1 + ', ' + c2x + ' ' + y2 + ', ' + x2 + ' ' + y2;
        }
        if (idle) {
          parts.push('<path class="cs-edge-idle" d="' + d + '" marker-end="url(#cs-m-idle)" />');
        } else {
          parts.push('<circle cx="' + x1 + '" cy="' + y1 + '" r="2.2" fill="' + colorVar + '" />');
          parts.push('<path class="' + cls + '" d="' + d + '" marker-end="url(#' + markerId + ')" />');
        }
      }

      if (!focusId) {
        if (CFG.dashedLines === 'hover') {
          svgEl.innerHTML = '';
          return;
        }
        let count = 0;
        const seen = new Set();
        for (const [id, srcEl] of elMap.entries()) {
          if (count >= 5) break;
          const n = nodeMap.get(id);
          if (!n) continue;
          const r1 = srcEl.getBoundingClientRect();
          for (const upId of n.upstreamPaths) {
            if (count >= 5) break;
            const tEl = elMap.get(upId);
            if (!tEl) continue;
            const r2 = tEl.getBoundingClientRect();
            if (Math.abs(r1.left - r2.left) < 24) continue;
            const k = id + '>' + upId;
            if (seen.has(k)) continue;
            seen.add(k);
            pushCurve(r1, r2, 'cs-edge-idle', 'var(--cs-faint)', 'cs-m-idle', count, true);
            count++;
            break;
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

      focusNode.upstreamPaths.slice(0, 5).forEach((upId, i) => {
        const el = elMap.get(upId);
        if (el) pushCurve(srcRect, el.getBoundingClientRect(), 'cs-edge-up', 'var(--cs-blue)', 'cs-m-blue', i, false);
      });

      const isFault = DATA.activeDiagnosis?.targetNodeId === focusId;
      focusNode.directDownstreamPaths.slice(0, 5).forEach((downId, i) => {
        const el = elMap.get(downId);
        if (el) {
          pushCurve(
            srcRect,
            el.getBoundingClientRect(),
            isFault ? 'cs-edge-fault' : 'cs-edge-down',
            isFault ? 'var(--cs-red)' : 'var(--cs-amber)',
            isFault ? 'cs-m-red' : 'cs-m-amber',
            i,
            false
          );
        }
      });

      svgEl.innerHTML = defs + parts.join('');
    }

    function syncChromeText() {
      const t = tr();
      document.querySelectorAll('[data-lang-btn]').forEach(b => {
        b.classList.toggle('is-on', b.dataset.langBtn === CFG.language);
      });
      if (legendUpEl) legendUpEl.innerHTML = '<span class="cs-dash"></span>' + t.uses;
      if (legendDownEl) legendDownEl.innerHTML = '<span class="cs-dash"></span>' + t.usedBy;
      const fb = document.getElementById('cs-open-fault');
      if (fb) fb.textContent = t.faultBtn;
      if (faultTextEl) faultTextEl.textContent = faultHeadline();
      if (collapsedPillEl) {
        if (DATA.activeDiagnosis && DATA.activeDiagnosis.targetNodeId) {
          const fn = shortName(DATA.activeDiagnosis.targetNodeId);
          collapsedPillEl.classList.add('is-fault');
          collapsedPillEl.innerHTML = '<span class="cs-dot-fault"></span>' + escHtml(fn);
        } else {
          collapsedPillEl.classList.remove('is-fault');
          collapsedPillEl.textContent = t.filesCount(DATA.totalFiles);
        }
      }
    }

    function renderBoard() {
      syncChromeText();
      const t = tr();
      const zones = DATA.zones && DATA.zones.length > 0
        ? DATA.zones
        : [{ id: 'core', title: 'Core', badge: 'Core', kind: 'core', lanes: DATA.lanes }];
      colsEl.style.setProperty('--zone-count', String(zones.length));

      colsEl.innerHTML = zones.map(zone => {
        const totalInZone = zone.lanes.reduce((sum, l) => sum + l.nodeIds.length, 0);
        const groupsHtml = zone.lanes.map(lane => {
          const isExp = expandedGroups.has(lane.id);
          const visible = isExp ? lane.nodeIds : lane.nodeIds.slice(0, MAX_PER_GROUP);
          const hidden = lane.nodeIds.length - visible.length;

          const rows = visible.map(id => {
            const n = nodeMap.get(id);
            if (!n) return '';
            const isFault = DATA.activeDiagnosis?.targetNodeId === id;
            const rightEl = isFault
              ? '<span class="cs-dot-fault" aria-label="error"></span>'
              : n.downstreamReach >= 5
              ? '<span class="cs-row-metric">' + n.downstreamReach + '</span>'
              : '';

            return '<button type="button" class="cs-row' + (isFault ? ' is-fault' : '') + '" data-node-id="' + escHtml(n.id) + '" title="' + escHtml(n.path) + '">' +
              '<span class="cs-row-name">' + escHtml(shortName(n)) + '</span>' +
              rightEl +
            '</button>';
          }).join('');

          const more = hidden > 0
            ? '<button type="button" class="cs-more" data-expand="' + escHtml(lane.id) + '">' + t.more(hidden) + '</button>'
            : (isExp && lane.nodeIds.length > MAX_PER_GROUP
                ? '<button type="button" class="cs-more" data-expand="' + escHtml(lane.id) + '">' + t.less + '</button>'
                : '');

          return '<div class="cs-group">' +
            '<div class="cs-group-label">' + escHtml(laneHeading(lane.title)) + '</div>' +
            '<div class="cs-list">' + rows + more + '</div>' +
          '</div>';
        }).join('');

        return '<div class="cs-col">' +
          '<div class="cs-col-head">' +
            '<span class="cs-col-title">' + escHtml(zoneHeading(zone)) + '</span>' +
            '<span class="cs-col-count">' + totalInZone + '</span>' +
          '</div>' +
          groupsHtml +
        '</div>';
      }).join('');

      colsEl.querySelectorAll('.cs-row').forEach(btn => {
        const id = btn.dataset.nodeId;
        btn.addEventListener('mouseenter', () => {
          hoveredId = id;
          updateHover();
        });
        btn.addEventListener('mouseleave', () => {
          hoveredId = activeModalId || DATA.activeDiagnosis?.targetNodeId || null;
          updateHover();
        });
        btn.addEventListener('click', () => openFileSheet(id));
      });

      colsEl.querySelectorAll('.cs-more').forEach(btn => {
        btn.addEventListener('click', () => {
          const gid = btn.dataset.expand;
          if (expandedGroups.has(gid)) expandedGroups.delete(gid);
          else expandedGroups.add(gid);
          renderBoard();
        });
      });

      requestAnimationFrame(updateHover);
    }

    function updateHover() {
      const focusId = hoveredId || activeModalId;
      const focusNode = focusId ? nodeMap.get(focusId) : null;
      const upSet = new Set(focusNode ? focusNode.upstreamPaths : []);
      const downSet = new Set(focusNode ? focusNode.directDownstreamPaths : []);

      colsEl.querySelectorAll('.cs-row').forEach(btn => {
        const id = btn.dataset.nodeId;
        const isFault = DATA.activeDiagnosis?.targetNodeId === id;
        btn.classList.remove('is-focus', 'is-up', 'is-down', 'is-dim');
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

      if (footHintEl) {
        if (focusNode) {
          footHintEl.textContent = shortName(focusNode) + ' — ' + nodeRole(focusNode);
        } else {
          footHintEl.textContent = tr().hoverHint;
        }
      }
      if (!isCollapsed) drawDashedLines();
    }

    function openFileSheet(id) {
      const node = nodeMap.get(id);
      if (!node) return;
      settingsOpen = false;
      activeModalId = id;
      hoveredId = id;
      updateHover();

      const t = tr();
      const isFault = Boolean(DATA.activeDiagnosis && DATA.activeDiagnosis.targetNodeId === id);
      const callers = node.allDownstreamPaths.length;
      const stateColor = isFault ? 'var(--cs-red)' : callers >= 5 ? 'var(--cs-amber)' : 'var(--cs-green)';
      const stateLabel = isFault ? t.faultState : t.callers(callers);

      const upChips = node.upstreamPaths.slice(0, 4).map(p => {
        const target = nodeMap.get(p);
        return '<button type="button" class="cs-chip" data-jump="' + escHtml(p) + '">' + escHtml(shortName(target || p)) + ' ↗</button>';
      }).join('') || '<span style="color:var(--cs-faint)">' + t.none + '</span>';

      const downChips = node.directDownstreamPaths.slice(0, 4).map(p => {
        const target = nodeMap.get(p);
        return '<button type="button" class="cs-chip" data-jump="' + escHtml(p) + '">' + escHtml(shortName(target || p)) + ' ↗</button>';
      }).join('') || '<span style="color:var(--cs-faint)">' + t.none + '</span>';

      let footHtml = '';
      if (isFault && DATA.activeDiagnosis.directions.length > 0) {
        const dirs = DATA.activeDiagnosis.directions;
        footHtml =
          '<div class="cs-choices">' +
            dirs.map((d, i) => {
              const dLabel = isEn() ? (d.labelEn || d.label) : d.label;
              const dStrat = isEn() ? (d.strategyEn || d.strategy) : d.strategy;
              return '<label class="cs-choice">' +
                '<input type="radio" name="cs_dir" value="' + escHtml(d.id) + '" ' + (i === 0 ? 'checked' : '') + ' />' +
                '<div><div class="cs-choice-t">' + escHtml(dLabel) + '</div><div class="cs-choice-s">' + escHtml(dStrat) + '</div></div>' +
              '</label>';
            }).join('') +
          '</div>' +
          '<button type="button" class="cs-btn-primary" id="cs-act-fix">' + t.copyFix + '</button>';
      } else {
        footHtml =
          '<div class="cs-actions">' +
            '<button type="button" class="cs-btn-primary" id="cs-act-edit">' + t.editBtn(callers >= 5) + '</button>' +
            '<button type="button" class="cs-btn-ghost" id="cs-act-explain">' + t.explainBtn + '</button>' +
          '</div>';
      }

      const crumbZone = tr().zones[node.zoneKind] || (isEn() ? node.zoneKind : node.zoneTitle);
      sheetEl.innerHTML =
        '<div class="cs-sheet-head">' +
          '<div class="cs-crumb">' +
            '<span>' + escHtml(crumbZone) + '</span><span>›</span>' +
            '<strong>' + escHtml(shortName(node)) + '</strong>' +
          '</div>' +
          '<button type="button" class="cs-close" id="cs-close-btn" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="cs-sheet-body">' +
          '<div class="cs-detail-grid">' +
            '<div class="cs-proto">' + renderPrototypeSvg(node) + '</div>' +
            '<div class="cs-meta">' +
              '<div class="cs-meta-top">' +
                '<h3 class="cs-meta-title">' + escHtml(shortName(node)) + '</h3>' +
                '<span class="cs-state-dot" style="color:' + stateColor + '">' + escHtml(stateLabel) + '</span>' +
              '</div>' +
              '<p class="cs-meta-desc">' + escHtml(isFault ? (faultHeadline() || nodeSummary(node)) : nodeSummary(node)) + '</p>' +
            '</div>' +
          '</div>' +
          '<div class="cs-links">' +
            '<div class="cs-link-row"><span class="cs-link-lbl">' + t.uses + '</span>' + upChips + '</div>' +
            '<div class="cs-link-row"><span class="cs-link-lbl">' + t.usedBy + '</span>' + downChips + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="cs-sheet-foot">' +
          footHtml +
          '<div class="cs-prompt-box" id="cs-prompt-box">' +
            '<div class="cs-prompt-tip" id="cs-prompt-tip"></div>' +
            '<textarea class="cs-prompt-ta" id="cs-prompt-ta" readonly></textarea>' +
          '</div>' +
        '</div>';

      backdropEl.classList.add('is-open');

      document.getElementById('cs-close-btn')?.addEventListener('click', closeSheet);
      sheetEl.querySelectorAll('.cs-chip').forEach(btn => {
        btn.addEventListener('click', () => openFileSheet(btn.dataset.jump));
      });

      const wireCopy = (btn, promptText) => {
        if (!btn) return;
        btn.addEventListener('click', async () => {
          const ok = await copyTextReliable(promptText);
          window.parent?.postMessage({ type: 'codesight:actionPrompt', nodeId: node.id, prompt: promptText }, '*');
          const old = btn.dataset.origLabel || btn.textContent;
          btn.dataset.origLabel = old;
          if (ok) {
            btn.textContent = t.copied;
            setTimeout(() => { btn.textContent = old; }, 1600);
          } else {
            btn.textContent = t.pressCopy;
            showPromptBox(promptText, false);
          }
        });
      };

      if (isFault && DATA.activeDiagnosis.directions.length > 0) {
        const fixBtn = document.getElementById('cs-act-fix');
        fixBtn?.addEventListener('click', async () => {
          const checked = sheetEl.querySelector('input[name="cs_dir"]:checked');
          const chosen = DATA.activeDiagnosis.directions.find(d => d.id === checked?.value) || DATA.activeDiagnosis.directions[0];
          const ok = await copyTextReliable(chosen.surgicalPrompt);
          window.parent?.postMessage({ type: 'codesight:actionPrompt', nodeId: node.id, prompt: chosen.surgicalPrompt }, '*');
          const old = fixBtn.dataset.origLabel || fixBtn.textContent;
          fixBtn.dataset.origLabel = old;
          if (ok) {
            fixBtn.textContent = t.copied;
            setTimeout(() => { fixBtn.textContent = old; }, 1600);
          } else {
            fixBtn.textContent = t.pressCopy;
            showPromptBox(chosen.surgicalPrompt, false);
          }
        });
      } else {
        const editPrompt = callers >= 5
          ? '[CodeSight Safe Edit] Modify \`' + node.path + '\` while keeping exported signatures backward-compatible (' + callers + ' callers).'
          : '[CodeSight Edit] Update \`' + node.path + '\` cleanly. Verify ' + (node.directDownstreamPaths.join(', ') || 'build & tests') + '.';
        const explainPrompt = '[CodeSight Explain] Concisely explain \`' + node.path + '\` with its direct dependencies (' + (node.upstreamPaths.join(', ') || 'none') + ').';
        wireCopy(document.getElementById('cs-act-edit'), editPrompt);
        wireCopy(document.getElementById('cs-act-explain'), explainPrompt);
      }
    }

    function openSettingsSheet() {
      settingsOpen = true;
      activeModalId = null;
      const t = tr();

      sheetEl.innerHTML =
        '<div class="cs-sheet-head">' +
          '<div class="cs-crumb"><strong>' + t.settings + '</strong></div>' +
          '<button type="button" class="cs-close" id="cs-close-btn" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="cs-sheet-body">' +
          '<div class="cs-set-group">' +
            '<div class="cs-set-row">' +
              '<span class="cs-set-lbl">' + t.langLbl + '</span>' +
              '<div class="cs-seg">' +
                '<button type="button" class="' + (CFG.language === 'zh' ? 'is-on' : '') + '" data-set-lang="zh">中文</button>' +
                '<button type="button" class="' + (CFG.language === 'en' ? 'is-on' : '') + '" data-set-lang="en">EN</button>' +
              '</div>' +
            '</div>' +
            '<div class="cs-set-row">' +
              '<span class="cs-set-lbl">' + t.linesLbl + '</span>' +
              '<div class="cs-seg">' +
                '<button type="button" class="' + (CFG.dashedLines === 'always' ? 'is-on' : '') + '" data-set-lines="always">' + t.linesAlways + '</button>' +
                '<button type="button" class="' + (CFG.dashedLines === 'hover' ? 'is-on' : '') + '" data-set-lines="hover">' + t.linesHover + '</button>' +
              '</div>' +
            '</div>' +
            '<div class="cs-set-row">' +
              '<div><div class="cs-set-lbl">' + t.collapseDefLbl + '</div><div class="cs-set-sub">' + t.collapseDefSub + '</div></div>' +
              '<label class="cs-switch"><input type="checkbox" id="cs-set-collapse" ' + (CFG.collapsedByDefault ? 'checked' : '') + ' /><span class="cs-slider"></span></label>' +
            '</div>' +
            '<div class="cs-set-row">' +
              '<div><div class="cs-set-lbl">' + t.guardLbl + '</div><div class="cs-set-sub">' + t.guardSub + '</div></div>' +
              '<label class="cs-switch"><input type="checkbox" id="cs-set-guard" ' + (CFG.silentRegressionGuard ? 'checked' : '') + ' /><span class="cs-slider"></span></label>' +
            '</div>' +
            '<div class="cs-set-row">' +
              '<span class="cs-set-lbl">' + t.archLbl + '</span>' +
              '<div class="cs-seg">' +
                '<button type="button" class="' + (CFG.architectureMode === 'auto' ? 'is-on' : '') + '" data-set-arch="auto">' + t.archAuto + '</button>' +
                '<button type="button" class="' + (CFG.architectureMode === 'heuristic' ? 'is-on' : '') + '" data-set-arch="heuristic">' + t.archLocal + '</button>' +
                '<button type="button" class="' + (CFG.architectureMode === 'llm' ? 'is-on' : '') + '" data-set-arch="llm">' + t.archLlm + '</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="cs-set-group">' +
            '<div class="cs-set-row">' +
              '<span class="cs-set-lbl">' + t.llmLbl + '</span>' +
              '<label class="cs-switch"><input type="checkbox" id="cs-set-llm" ' + (CFG.llm.enabled ? 'checked' : '') + ' /><span class="cs-slider"></span></label>' +
            '</div>' +
            '<div class="cs-set-row" style="flex-direction:column;align-items:stretch;gap:7px">' +
              '<input class="cs-input" id="cs-set-url" placeholder="https://api.openai.com/v1" value="' + escHtml(CFG.llm.baseUrl || '') + '" />' +
              '<input class="cs-input" id="cs-set-model" placeholder="gpt-4o-mini" value="' + escHtml(CFG.llm.model || '') + '" />' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="cs-sheet-foot">' +
          '<button type="button" class="cs-btn-primary" id="cs-save-settings">' + t.saveBtn + '</button>' +
          '<div class="cs-prompt-box" id="cs-prompt-box">' +
            '<div class="cs-prompt-tip" id="cs-prompt-tip"></div>' +
            '<textarea class="cs-prompt-ta" id="cs-prompt-ta" readonly></textarea>' +
          '</div>' +
        '</div>';

      backdropEl.classList.add('is-open');
      document.getElementById('cs-close-btn')?.addEventListener('click', closeSheet);

      sheetEl.querySelectorAll('[data-set-lang]').forEach(btn => {
        btn.addEventListener('click', () => {
          CFG.language = btn.dataset.setLang;
          renderBoard();
          openSettingsSheet();
        });
      });
      sheetEl.querySelectorAll('[data-set-lines]').forEach(btn => {
        btn.addEventListener('click', () => {
          CFG.dashedLines = btn.dataset.setLines;
          sheetEl.querySelectorAll('[data-set-lines]').forEach(b => b.classList.toggle('is-on', b.dataset.setLines === CFG.dashedLines));
          drawDashedLines();
        });
      });
      sheetEl.querySelectorAll('[data-set-arch]').forEach(btn => {
        btn.addEventListener('click', () => {
          CFG.architectureMode = btn.dataset.setArch;
          sheetEl.querySelectorAll('[data-set-arch]').forEach(b => b.classList.toggle('is-on', b.dataset.setArch === CFG.architectureMode));
        });
      });

      const saveBtn = document.getElementById('cs-save-settings');
      saveBtn?.addEventListener('click', async () => {
        CFG.collapsedByDefault = Boolean(document.getElementById('cs-set-collapse')?.checked);
        CFG.silentRegressionGuard = Boolean(document.getElementById('cs-set-guard')?.checked);
        CFG.llm.enabled = Boolean(document.getElementById('cs-set-llm')?.checked);
        CFG.llm.baseUrl = document.getElementById('cs-set-url')?.value?.trim() || 'https://api.openai.com/v1';
        CFG.llm.model = document.getElementById('cs-set-model')?.value?.trim() || 'gpt-4o-mini';

        const patch = {
          language: CFG.language,
          dashedLines: CFG.dashedLines,
          collapsedByDefault: CFG.collapsedByDefault,
          silentRegressionGuard: CFG.silentRegressionGuard,
          architectureMode: CFG.architectureMode,
          llm: { enabled: CFG.llm.enabled, baseUrl: CFG.llm.baseUrl, model: CFG.llm.model },
        };

        let persistedViaApi = false;
        if (location.protocol === 'http:' || location.protocol === 'https:') {
          try {
            const res = await fetch('/api/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(patch),
            });
            persistedViaApi = res.ok;
          } catch {}
        }

        window.parent?.postMessage({ type: 'codesight:saveSettings', patch }, '*');
        if (persistedViaApi) {
          saveBtn.textContent = t.saved;
          setTimeout(() => { saveBtn.textContent = t.saveBtn; }, 1400);
        } else {
          const syncCmd = 'Call codesight_settings with action="set" and ' + JSON.stringify(patch);
          const ok = await copyTextReliable(syncCmd);
          if (ok) {
            saveBtn.textContent = t.savedCopy;
            setTimeout(() => { saveBtn.textContent = t.saveBtn; }, 1600);
          } else {
            saveBtn.textContent = t.pressCopy;
            showPromptBox(syncCmd, false);
          }
        }
      });
    }

    function closeSheet() {
      activeModalId = null;
      settingsOpen = false;
      hoveredId = DATA.activeDiagnosis?.targetNodeId || null;
      backdropEl.classList.remove('is-open');
      updateHover();
    }

    document.querySelectorAll('[data-lang-btn]').forEach(btn => {
      btn.addEventListener('click', () => {
        CFG.language = btn.dataset.langBtn;
        renderBoard();
        if (activeModalId) openFileSheet(activeModalId);
      });
    });
    document.getElementById('cs-toggle-collapse')?.addEventListener('click', () => setCollapsed(!isCollapsed));
    document.getElementById('cs-brand-toggle')?.addEventListener('click', () => setCollapsed(!isCollapsed));
    document.getElementById('cs-open-settings')?.addEventListener('click', openSettingsSheet);
    document.getElementById('cs-open-fault')?.addEventListener('click', () => {
      if (DATA.activeDiagnosis?.targetNodeId) openFileSheet(DATA.activeDiagnosis.targetNodeId);
    });
    backdropEl.addEventListener('click', (e) => {
      if (e.target === backdropEl) closeSheet();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSheet();
    });
    window.addEventListener('resize', () => { if (!isCollapsed) drawDashedLines(); });

    renderBoard();
    setCollapsed(isCollapsed);
  `;

  return `<!doctype html>
<html lang="${config.language === 'en' ? 'en' : 'zh-CN'}">
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
        <div class="cs-seg" role="group" aria-label="Language">
          <button type="button" data-lang-btn="zh" class="${config.language !== 'en' ? 'is-on' : ''}">中文</button>
          <button type="button" data-lang-btn="en" class="${config.language === 'en' ? 'is-on' : ''}">EN</button>
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
                <span class="cs-fault-text" id="cs-fault-text">${esc(config.language === 'en' ? diag.headlineEn : diag.headline)}</span>
              </div>
              <button type="button" class="cs-fault-act" id="cs-open-fault">${config.language === 'en' ? 'Inspect fix' : '查看修复'}</button>
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
