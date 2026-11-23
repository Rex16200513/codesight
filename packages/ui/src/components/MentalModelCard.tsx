import type { MentalModelCardData } from '@glassbox/core';

interface MentalModelCardProps {
  card: MentalModelCardData;
  onHighlightFile: (file: string | null) => void;
}

export function MentalModelCard({ card, onHighlightFile }: MentalModelCardProps) {
  return (
    <div className="gb-focus-card">
      <div className="gb-card-head">
        <span className="gb-soft-tag calm">上下文地图</span>
        <span className="gb-mini-label">{card.flow.length} 个关键节点</span>
      </div>

      <p className="gb-plain-explain">{card.narrative}</p>

      <div className="gb-flow-list">
        {card.flow.map((node, index) => (
          <div
            key={node.id}
            className={`gb-flow-row status-${node.status}`}
            onMouseEnter={() => onHighlightFile(node.file)}
            onMouseLeave={() => onHighlightFile(null)}
            onClick={() => onHighlightFile(node.file)}
          >
            <span className="gb-flow-step-num">{index + 1}</span>
            <div className="gb-flow-info">
              <div className="gb-flow-file">{node.label}</div>
              <div className="gb-flow-sub">{node.sublabel}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="gb-calm-callout">{card.keyTakeaway}</div>
    </div>
  );
}
