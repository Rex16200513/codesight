import { useState } from 'react';
import type { ActionOption, RippleCardData } from '@glassbox/core';

interface RippleCardProps {
  card: RippleCardData;
  selectedActionId?: string;
  onSelectAction: (cardId: string, action: ActionOption) => void;
  onHighlightFile: (file: string | null) => void;
}

export function RippleCard({
  card,
  selectedActionId,
  onSelectAction,
  onHighlightFile,
}: RippleCardProps) {
  const [showRipples, setShowRipples] = useState(card.ripples.length <= 2);

  return (
    <div className="gb-focus-card">
      <div className="gb-card-head">
        <span className="gb-soft-tag danger">契约冲突</span>
        <button
          type="button"
          className="gb-loc-link"
          onMouseEnter={() => onHighlightFile(card.origin.file)}
          onMouseLeave={() => onHighlightFile(null)}
          onClick={() => onHighlightFile(card.origin.file)}
        >
          {card.origin.file.split('/').pop()}
          {card.origin.line ? `:${card.origin.line}` : ''}
        </button>
      </div>

      <p className="gb-plain-explain">{card.plainSummary}</p>

      <div className="gb-contrast-box">
        <div className="gb-contrast-row">
          <span className="gb-contrast-label">原本要</span>
          <span className="gb-contrast-val is-ok">{card.contractDiff.expected}</span>
        </div>
        <div className="gb-divider" />
        <div className="gb-contrast-row">
          <span className="gb-contrast-label">现在是</span>
          <span className="gb-contrast-val is-bad">{card.contractDiff.actual}</span>
        </div>
      </div>

      {card.ripples.length > 0 && (
        <div className="gb-impact-section">
          <button
            type="button"
            className="gb-disclosure-toggle"
            onClick={() => setShowRipples((v) => !v)}
          >
            <span>
              {showRipples ? '▾' : '▸'} 波及的下游文件（{card.ripples.length} 处）
            </span>
          </button>

          {showRipples && (
            <div className="gb-impact-list">
              {card.ripples.map((node) => (
                <div
                  key={node.id}
                  className="gb-impact-item"
                  onMouseEnter={() => onHighlightFile(node.file)}
                  onMouseLeave={() => onHighlightFile(null)}
                  onClick={() => onHighlightFile(node.file)}
                >
                  <div>
                    <div className="gb-impact-title">
                      {node.file.split('/').pop()}
                      {node.line ? `:${node.line}` : ''} · {node.symbol}
                    </div>
                    <div className="gb-impact-desc">{node.reason}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {card.actions.length > 0 && (
        <div className="gb-choices">
          <span className="gb-mini-label">你想怎么修？</span>
          {card.actions.map((action) => {
            const isSelected = selectedActionId === action.id;
            return (
              <button
                key={action.id}
                type="button"
                className={`gb-choice-btn ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectAction(card.id, action)}
              >
                <span className="gb-choice-radio">
                  {isSelected && <span className="gb-choice-radio-dot" />}
                </span>
                <div>
                  <div className="gb-choice-title">{action.label}</div>
                  <div className="gb-choice-sub">{action.strategy}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
