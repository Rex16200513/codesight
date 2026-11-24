export const SHEET_CSS = `
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
    width: min(560px, 100%);
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
    grid-template-columns: 214px minmax(0, 1fr);
    gap: 16px;
    align-items: center;
  }
  @media (max-width: 470px) {
    .cs-detail-grid { grid-template-columns: 1fr; }
  }
  .cs-proto-col {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: stretch;
  }
  .cs-proto {
    border: 1px solid var(--cs-hairline);
    border-radius: 12px;
    background: var(--cs-canvas);
    padding: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 136px;
  }
  .cs-proto-refresh {
    appearance: none;
    border: 1px solid var(--cs-hairline);
    background: var(--cs-card);
    color: var(--cs-muted);
    border-radius: 8px;
    padding: 4.5px 9px;
    font-size: 10.5px;
    font-weight: 550;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    cursor: pointer;
    transition: border-color 0.14s ease, color 0.14s ease, background 0.14s ease;
  }
  .cs-proto-refresh:hover {
    border-color: var(--cs-blue);
    color: var(--cs-blue);
    background: var(--cs-blue-soft);
  }
  .cs-proto-refresh:disabled { opacity: 0.6; cursor: wait; }

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

  /* Fallback Selectable Prompt Box */
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
    min-height: 68px;
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
  .cs-choice:has(input:checked) { border-color: var(--cs-ink); }
  .cs-choice input { margin-top: 2px; accent-color: var(--cs-ink); }
  .cs-choice-t { font-size: 12px; font-weight: 600; color: var(--cs-ink); }
  .cs-choice-s { font-size: 11px; color: var(--cs-muted); margin-top: 2px; line-height: 1.35; }

  /* Apple Settings Rows */
  .cs-hint-banner {
    padding: 9px 12px;
    border-radius: 10px;
    background: var(--cs-blue-soft);
    border: 1px solid rgba(0, 113, 227, 0.2);
    color: var(--cs-ink);
    font-size: 11.5px;
    line-height: 1.45;
  }
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
  .cs-set-row + .cs-set-row { border-top: 1px solid var(--cs-hairline); }
  .cs-set-lbl { font-weight: 520; color: var(--cs-ink); }
  .cs-set-sub { font-size: 11px; color: var(--cs-muted); margin-top: 1px; }
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
  .cs-preset-row { display: flex; flex-wrap: wrap; gap: 6px; }
  .cs-preset-chip {
    appearance: none;
    border: 1px solid var(--cs-hairline);
    background: var(--cs-canvas);
    color: var(--cs-muted);
    font-size: 10.5px;
    font-weight: 550;
    padding: 3.5px 9px;
    border-radius: 999px;
    cursor: pointer;
  }
  .cs-preset-chip:hover, .cs-preset-chip.is-on {
    border-color: var(--cs-blue);
    color: var(--cs-blue);
    background: var(--cs-blue-soft);
  }

  /* Native Apple Toggle Switch */
  .cs-switch { position: relative; width: 36px; height: 20px; flex-shrink: 0; }
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
