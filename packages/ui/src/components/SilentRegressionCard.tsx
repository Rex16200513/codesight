import { useState } from 'react';
import type { ActionOption, SilentRegressionCardData } from '@glassbox/core';

interface SilentRegressionCardProps {
  card: SilentRegressionCardData;
  selectedActionId?: string;
  onSelectAction: (cardId: string, action: ActionOption) => void;
  onHighlightFile: (file: string | null) => void;
}

const PATTERN_LABELS: Record<SilentRegressionCardData['patternTag'], string> = {
  REMOVED_GUARD: '权限/守卫被删',
  SWALLOWED_ERROR: '异常被静默吞掉',
  HARDCODED_FALLBACK: '硬编码假数据',
  TYPE_ESCAPE_HATCH: '用 as any 强行过检',
  ASYNC_RACE: '并发竞态隐患',
};

export function SilentRegressionCard({
  card,
  selectedActionId,
  onSelectAction,
  onHighlightFile,
}: SilentRegressionCardProps) {
  const [showDiff, setShowDiff] = useState(false);

  return (
    <div className="gb-focus-card">
      <div className="gb-card-head">
        <span className="gb-soft-tag warn">
          隐蔽风险 · {PATTERN_LABELS[card.patternTag]}
        </span>
        <button
          type="button"
          className="gb-loc-link"
          onMouseEnter={() => onHighlightFile(card.location.file)}
          onMouseLeave={() => onHighlightFile(null)}
          onClick={() => onHighlightFile(card.location.file)}
        >
          {card.location.file.split('/').pop()}
          {card.location.line ? `:${card.location.line}` : ''}
        </button>
      </div>

      <p className="gb-plain-explain">{card.plainSummary}</p>

      <div className="gb-contrast-box">
        <div className="gb-contrast-row">
          <span className="gb-contrast-label">以前</span>
          <span className="gb-contrast-val is-ok">{card.behaviorShift.before}</span>
        </div>
        <div className="gb-divider" />
        <div className="gb-contrast-row">
          <span className="gb-contrast-label">改动后</span>
          <span className="gb-contrast-val is-warn">{card.behaviorShift.after}</span>
        </div>
      </div>

      {card.evidenceSnippet && (
        <>
          <button
            type="button"
            className="gb-disclosure-toggle"
            onClick={() => setShowDiff((v) => !v)}
          >
            <span>{showDiff ? '▾ 隐藏关键代码对比' : '▸ 查看这几行改动'}</span>
          </button>
          {showDiff && <pre className="gb-code-drawer">{card.evidenceSnippet}</pre>}
        </>
      )}

      {card.actions.length > 0 && (
        <div className="gb-choices">
          <span className="gb-mini-label">处理建议</span>
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
