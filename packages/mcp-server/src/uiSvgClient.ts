/**
 * Client-side SVG renderers injected into CodeSight interactive cards:
 * - renderRelationGraphSvg: AST dependency mini-graph for Backend / Core / Schema modules
 * - renderWireframeBlocksSvg: typed mini-Figma wireframe blocks for UI modules
 * - renderPrototypeSvg: dispatches UI wireframes vs non-UI relation graphs
 * - drawDashedLines: live curved dependency arrows across the board columns
 */
export const UI_SVG_CLIENT_JS = `
    function isUiProtoKind(k) {
      return k === 'ui-modal' || k === 'ui-hud' || k === 'ui-card-flow' || k === 'ui-card-diff' || k === 'ui-card' || k === 'ui-page';
    }

    function renderRelationGraphSvg(node) {
      const isFault = Boolean(DATA.activeDiagnosis && DATA.activeDiagnosis.targetNodeId === node.id);
      const focusStroke = isFault ? 'var(--cs-red)' : 'var(--cs-blue)';
      const focusFill = isFault ? 'var(--cs-red-soft)' : 'var(--cs-blue-soft)';
      const downColor = isFault ? 'var(--cs-red)' : 'var(--cs-amber)';

      const trimLbl = (p, maxLen) => {
        const base = shortName(p).replace(/\\.(tsx|jsx|ts|js|py|go|rs)$/, '');
        return base.length > maxLen ? base.slice(0, maxLen - 1) + '…' : base;
      };

      const packSide = (arr, maxLen) => {
        if (arr.length <= 3) return arr.map(p => trimLbl(p, maxLen));
        return [trimLbl(arr[0], maxLen), trimLbl(arr[1], maxLen), '+' + (arr.length - 2)];
      };

      const hasUp = node.upstreamPaths.length > 0;
      const hasDown = node.directDownstreamPaths.length > 0;
      const selfLbl = trimLbl(node, hasUp && hasDown ? 8 : 10);

      const ySlots = (n) => {
        if (n === 1) return [50];
        if (n === 2) return [31, 69];
        return [20, 50, 80];
      };

      const parts = [
        '<defs>' +
          '<marker id="cs-mg-b" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4.2" markerHeight="4.2" orient="auto"><path d="M1 1L5 3L1 5" fill="none" stroke="var(--cs-blue)" stroke-width="1.3" stroke-linecap="round"/></marker>' +
          '<marker id="cs-mg-d" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4.2" markerHeight="4.2" orient="auto"><path d="M1 1L5 3L1 5" fill="none" stroke="' + downColor + '" stroke-width="1.3" stroke-linecap="round"/></marker>' +
        '</defs>'
      ];

      const drawNode = (x, yCenter, w, h, lbl, fill, stroke, textFill, bold) => {
        const y = yCenter - h / 2;
        parts.push(
          '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="5.5" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (bold ? '1.25' : '0.9') + '"/>' +
          '<text x="' + (x + w / 2) + '" y="' + (yCenter + 2.6) + '" text-anchor="middle" font-size="' + (bold ? '7.2' : '6.5') + '" font-weight="' + (bold ? '600' : '500') + '" font-family="ui-monospace,SF Mono,Menlo,monospace" fill="' + textFill + '">' + escHtml(lbl) + '</text>'
        );
      };

      if (hasUp && hasDown) {
        const ups = packSide(node.upstreamPaths, 7);
        const downs = packSide(node.directDownstreamPaths, 7);
        const upYs = ySlots(ups.length);
        const downYs = ySlots(downs.length);

        ups.forEach((lbl, i) => {
          const y = upYs[i];
          parts.push('<path d="M 46 ' + y + ' C 52 ' + y + ', 52 50, 57 50" fill="none" stroke="var(--cs-blue)" stroke-width="1.15" stroke-dasharray="2.6 2.2" marker-end="url(#cs-mg-b)"/>');
          drawNode(3, y, 43, 18, lbl, 'var(--cs-card)', 'var(--cs-hairline-strong)', 'var(--cs-muted)', false);
        });
        downs.forEach((lbl, i) => {
          const y = downYs[i];
          parts.push('<path d="M 106 50 C 111 50, 111 ' + y + ', 116 ' + y + '" fill="none" stroke="' + downColor + '" stroke-width="1.15" stroke-dasharray="2.6 2.2" marker-end="url(#cs-mg-d)"/>');
          drawNode(118, y, 43, 18, lbl, 'var(--cs-card)', 'var(--cs-hairline-strong)', 'var(--cs-ink)', false);
        });
        drawNode(58, 50, 48, 24, selfLbl, focusFill, focusStroke, focusStroke, true);
      } else if (hasDown) {
        const downs = packSide(node.directDownstreamPaths, 10);
        const downYs = ySlots(downs.length);
        downs.forEach((lbl, i) => {
          const y = downYs[i];
          parts.push('<path d="M 66 50 C 78 50, 78 ' + y + ', 89 ' + y + '" fill="none" stroke="' + downColor + '" stroke-width="1.2" stroke-dasharray="2.8 2.2" marker-end="url(#cs-mg-d)"/>');
          drawNode(91, y, 66, 19, lbl, 'var(--cs-card)', 'var(--cs-hairline-strong)', 'var(--cs-ink)', false);
        });
        drawNode(7, 50, 59, 26, selfLbl, focusFill, focusStroke, focusStroke, true);
      } else if (hasUp) {
        const ups = packSide(node.upstreamPaths, 10);
        const upYs = ySlots(ups.length);
        ups.forEach((lbl, i) => {
          const y = upYs[i];
          parts.push('<path d="M 73 ' + y + ' C 84 ' + y + ', 84 50, 95 50" fill="none" stroke="var(--cs-blue)" stroke-width="1.2" stroke-dasharray="2.8 2.2" marker-end="url(#cs-mg-b)"/>');
          drawNode(7, y, 66, 19, lbl, 'var(--cs-card)', 'var(--cs-hairline-strong)', 'var(--cs-muted)', false);
        });
        drawNode(97, 50, 60, 26, selfLbl, focusFill, focusStroke, focusStroke, true);
      } else {
        parts.push('<rect x="34" y="28" width="96" height="44" rx="10" fill="none" stroke="var(--cs-hairline-strong)" stroke-dasharray="3 3"/>');
        drawNode(44, 50, 76, 26, selfLbl, focusFill, focusStroke, focusStroke, true);
      }

      return '<svg viewBox="0 0 164 100" width="150">' + parts.join('') + '</svg>';
    }

    function renderWireframeBlocksSvg(k, blocks) {
      const isModal = k === 'ui-modal';
      const isHud = k === 'ui-hud';
      const W = 200;
      const H = 132;
      const fx = isModal ? 14 : isHud ? 58 : 8;
      const fy = isModal ? 10 : 6;
      const fw = isModal ? 172 : isHud ? 134 : 184;
      const fh = isModal ? 112 : 120;
      const ix = fx + 8;
      const iw = fw - 16;

      const out = [];
      if (isModal) {
        out.push('<rect x="3" y="3" width="194" height="126" rx="9" fill="var(--cs-bg)" stroke="var(--cs-hairline)"/>');
        out.push('<rect x="10" y="14" width="38" height="104" rx="4" fill="var(--cs-canvas)" opacity="0.7"/>');
        out.push('<rect x="' + fx + '" y="' + fy + '" width="' + fw + '" height="' + fh + '" rx="9" fill="var(--cs-card)" stroke="var(--cs-blue)" stroke-width="1.2"/>');
      } else if (isHud) {
        out.push('<rect x="3" y="3" width="194" height="126" rx="9" fill="var(--cs-bg)" stroke="var(--cs-hairline)"/>');
        out.push('<rect x="10" y="12" width="42" height="108" rx="5" fill="var(--cs-canvas)"/>');
        out.push('<rect x="' + fx + '" y="' + fy + '" width="' + fw + '" height="' + fh + '" rx="9" fill="var(--cs-card)" stroke="var(--cs-blue)" stroke-width="1.2"/>');
      } else {
        out.push('<rect x="' + fx + '" y="' + fy + '" width="' + fw + '" height="' + fh + '" rx="9" fill="var(--cs-card)" stroke="var(--cs-hairline-strong)"/>');
      }

      const list = blocks.slice(0, 5);
      let y = fy + 9;
      const maxY = fy + fh - 6;

      for (const b of list) {
        if (y + 14 > maxY) break;
        if (b.type === 'header') {
          out.push('<text x="' + ix + '" y="' + (y + 8) + '" font-size="7.8" font-weight="600" fill="var(--cs-ink)">' + escHtml((b.label || '').slice(0, 18)) + '</text>');
          out.push('<circle cx="' + (ix + iw - 4) + '" cy="' + (y + 5.5) + '" r="3.4" fill="var(--cs-canvas)"/>');
          out.push('<line x1="' + fx + '" y1="' + (y + 13) + '" x2="' + (fx + fw) + '" y2="' + (y + 13) + '" stroke="var(--cs-hairline)"/>');
          y += 18;
        } else if (b.type === 'tabs') {
          const items = (b.items || ['Tab 1', 'Tab 2']).slice(0, 3);
          out.push('<rect x="' + ix + '" y="' + y + '" width="' + iw + '" height="16" rx="5" fill="var(--cs-canvas)"/>');
          const tw = (iw - 4) / items.length;
          items.forEach((it, i) => {
            const tx = ix + 2 + i * tw;
            if (i === 0) out.push('<rect x="' + tx + '" y="' + (y + 2) + '" width="' + (tw - 1) + '" height="12" rx="3.5" fill="var(--cs-card)" stroke="var(--cs-hairline)"/>');
            out.push('<text x="' + (tx + tw / 2) + '" y="' + (y + 10.5) + '" text-anchor="middle" font-size="6.6" font-weight="' + (i === 0 ? '600' : '500') + '" fill="' + (i === 0 ? 'var(--cs-ink)' : 'var(--cs-muted)') + '">' + escHtml(it.slice(0, 7)) + '</text>');
          });
          y += 20;
        } else if (b.type === 'search') {
          out.push('<rect x="' + ix + '" y="' + y + '" width="' + iw + '" height="15" rx="5" fill="var(--cs-canvas)" stroke="var(--cs-hairline)"/>');
          out.push('<circle cx="' + (ix + 7) + '" cy="' + (y + 7.2) + '" r="2.5" fill="none" stroke="var(--cs-faint)" stroke-width="1"/>');
          out.push('<text x="' + (ix + 13) + '" y="' + (y + 10) + '" font-size="6.6" fill="var(--cs-faint)">' + escHtml((b.label || 'Search').slice(0, 18)) + '</text>');
          y += 19;
        } else if (b.type === 'toggle') {
          const isOn = b.on !== false;
          out.push('<rect x="' + ix + '" y="' + y + '" width="' + iw + '" height="16" rx="4.5" fill="var(--cs-canvas)"/>');
          out.push('<text x="' + (ix + 6) + '" y="' + (y + 10.5) + '" font-size="6.8" fill="var(--cs-ink)">' + escHtml((b.label || '').slice(0, 16)) + '</text>');
          const swX = ix + iw - 20;
          out.push('<rect x="' + swX + '" y="' + (y + 3.5) + '" width="15" height="9" rx="4.5" fill="' + (isOn ? 'var(--cs-blue)' : 'var(--cs-hairline-strong)') + '"/>');
          out.push('<circle cx="' + (isOn ? swX + 10.5 : swX + 4.5) + '" cy="' + (y + 8) + '" r="3.2" fill="#fff"/>');
          y += 19.5;
        } else if (b.type === 'slider') {
          const pct = Math.max(10, Math.min(92, typeof b.value === 'number' ? b.value : 65)) / 100;
          out.push('<text x="' + ix + '" y="' + (y + 7) + '" font-size="6.6" fill="var(--cs-muted)">' + escHtml((b.label || '').slice(0, 18)) + '</text>');
          const ty = y + 12;
          out.push('<rect x="' + ix + '" y="' + ty + '" width="' + iw + '" height="3.2" rx="1.6" fill="var(--cs-hairline-strong)"/>');
          out.push('<rect x="' + ix + '" y="' + ty + '" width="' + Math.round(iw * pct) + '" height="3.2" rx="1.6" fill="var(--cs-blue)"/>');
          out.push('<circle cx="' + (ix + Math.round(iw * pct)) + '" cy="' + (ty + 1.6) + '" r="3.6" fill="var(--cs-card)" stroke="var(--cs-blue)" stroke-width="1.2"/>');
          y += 20;
        } else if (b.type === 'chips') {
          const items = (b.items || []).slice(0, 4);
          const cols = b.colors || [];
          const cw = Math.floor((iw - (items.length - 1) * 4) / Math.max(1, items.length));
          items.forEach((it, i) => {
            const cx = ix + i * (cw + 4);
            const dot = cols[i];
            out.push('<rect x="' + cx + '" y="' + y + '" width="' + cw + '" height="15" rx="7.5" fill="' + (i === 0 ? 'var(--cs-blue-soft)' : 'var(--cs-canvas)') + '" stroke="' + (i === 0 ? 'var(--cs-blue)' : 'var(--cs-hairline)') + '" stroke-width="0.8"/>');
            if (dot) {
              out.push('<circle cx="' + (cx + 7) + '" cy="' + (y + 7.5) + '" r="2.6" fill="' + dot + '"/>');
              out.push('<text x="' + (cx + 12) + '" y="' + (y + 10) + '" font-size="6.3" fill="var(--cs-ink)">' + escHtml(it.slice(0, 5)) + '</text>');
            } else {
              out.push('<text x="' + (cx + cw / 2) + '" y="' + (y + 10) + '" text-anchor="middle" font-size="6.4" fill="' + (i === 0 ? 'var(--cs-blue)' : 'var(--cs-ink)') + '">' + escHtml(it.slice(0, 6)) + '</text>');
            }
          });
          y += 19;
        } else if (b.type === 'list') {
          const items = (b.items || []).slice(0, 3);
          const cols = b.colors || ['#3B82F6', '#F59E0B', '#10B981'];
          items.forEach((it, i) => {
            if (y + 14 > maxY) return;
            out.push('<rect x="' + ix + '" y="' + y + '" width="' + iw + '" height="13.5" rx="3.5" fill="var(--cs-canvas)"/>');
            out.push('<circle cx="' + (ix + 7) + '" cy="' + (y + 6.8) + '" r="2.4" fill="' + (cols[i % cols.length] || 'var(--cs-blue)') + '"/>');
            out.push('<text x="' + (ix + 13) + '" y="' + (y + 9.2) + '" font-size="6.6" fill="var(--cs-ink)">' + escHtml(it.slice(0, 18)) + '</text>');
            y += 16;
          });
          y += 2;
        } else if (b.type === 'highlight') {
          out.push('<rect x="' + ix + '" y="' + y + '" width="' + Math.round(iw * 0.85) + '" height="4" rx="2" fill="var(--cs-hairline-strong)"/>');
          out.push('<rect x="' + ix + '" y="' + (y + 7) + '" width="' + Math.round(iw * 0.72) + '" height="10" rx="2.5" fill="rgba(250,204,21,0.34)"/>');
          out.push('<text x="' + (ix + 4) + '" y="' + (y + 14.3) + '" font-size="6.5" fill="var(--cs-ink)">' + escHtml((b.label || '').slice(0, 16)) + '</text>');
          out.push('<rect x="' + (ix + iw - 42) + '" y="' + (y + 19) + '" width="42" height="11" rx="5.5" fill="var(--cs-ink)"/>');
          out.push('<circle cx="' + (ix + iw - 33) + '" cy="' + (y + 24.5) + '" r="2.2" fill="#FACC15"/>');
          out.push('<circle cx="' + (ix + iw - 24) + '" cy="' + (y + 24.5) + '" r="2.2" fill="#34D399"/>');
          out.push('<circle cx="' + (ix + iw - 15) + '" cy="' + (y + 24.5) + '" r="2.2" fill="#38BDF8"/>');
          y += 33;
        } else if (b.type === 'actions') {
          const items = (b.items || ['Cancel', 'Save']).slice(0, 2);
          const ay = Math.min(maxY - 15, y + 2);
          if (items.length === 1) {
            out.push('<rect x="' + ix + '" y="' + ay + '" width="' + iw + '" height="15" rx="4.5" fill="var(--cs-primary)"/>');
            out.push('<text x="' + (ix + iw / 2) + '" y="' + (ay + 10) + '" text-anchor="middle" font-size="6.8" font-weight="600" fill="var(--cs-primary-fg)">' + escHtml(items[0].slice(0, 12)) + '</text>');
          } else {
            const bw = Math.floor((iw - 5) / 2);
            out.push('<rect x="' + ix + '" y="' + ay + '" width="' + bw + '" height="15" rx="4.5" fill="var(--cs-canvas)" stroke="var(--cs-hairline)"/>');
            out.push('<text x="' + (ix + bw / 2) + '" y="' + (ay + 10) + '" text-anchor="middle" font-size="6.6" fill="var(--cs-ink)">' + escHtml(items[0].slice(0, 8)) + '</text>');
            out.push('<rect x="' + (ix + bw + 5) + '" y="' + ay + '" width="' + bw + '" height="15" rx="4.5" fill="var(--cs-primary)"/>');
            out.push('<text x="' + (ix + bw + 5 + bw / 2) + '" y="' + (ay + 10) + '" text-anchor="middle" font-size="6.6" font-weight="600" fill="var(--cs-primary-fg)">' + escHtml(items[1].slice(0, 8)) + '</text>');
          }
          y = ay + 18;
        }
      }

      return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="194">' + out.join('') + '</svg>';
    }

    function renderPrototypeSvg(node) {
      const k = node.prototypeKind;
      if (!isUiProtoKind(k)) return renderRelationGraphSvg(node);

      const spec = node.prototypeSpec;
      if (spec && Array.isArray(spec.blocks) && spec.blocks.length > 0) {
        return renderWireframeBlocksSvg(k, spec.blocks);
      }
      if (spec && Array.isArray(spec.elements) && spec.elements.length > 0) {
        const els = spec.elements.slice(0, 4);
        const isModal = k === 'ui-modal';
        const frame = isModal
          ? '<rect x="4" y="4" width="152" height="88" rx="8" fill="var(--cs-bg)" stroke="var(--cs-hairline)"/>' +
            '<rect x="18" y="12" width="124" height="72" rx="8" fill="var(--cs-card)" stroke="var(--cs-blue)" stroke-width="1.2"/>'
          : '<rect x="6" y="6" width="148" height="84" rx="9" fill="var(--cs-card)" stroke="var(--cs-blue)" stroke-width="1.15"/>';
        const xBase = isModal ? 26 : 16;
        const wBase = isModal ? 108 : 128;
        const rows = els.map((lbl, idx) => {
          const y = (isModal ? 20 : 16) + idx * 15;
          const isLast = idx === els.length - 1;
          return '<rect x="' + xBase + '" y="' + y + '" width="' + wBase + '" height="12" rx="3.5" fill="' + (isLast ? 'var(--cs-blue-soft)' : 'var(--cs-canvas)') + '"/>' +
            '<text x="' + (xBase + 6) + '" y="' + (y + 8.8) + '" font-size="7.2" fill="' + (isLast ? 'var(--cs-blue)' : 'var(--cs-ink)') + '">' + escHtml(String(lbl).slice(0, 14)) + '</text>';
        }).join('');
        return '<svg viewBox="0 0 160 96" width="144">' + frame + rows + '</svg>';
      }
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
      return '<svg viewBox="0 0 160 96" width="144">' +
        '<rect x="8" y="8" width="144" height="80" rx="9" fill="var(--cs-card)" stroke="var(--cs-hairline-strong)"/>' +
        '<circle cx="19" cy="18" r="2.2" fill="var(--cs-faint)"/><circle cx="27" cy="18" r="2.2" fill="var(--cs-faint)"/>' +
        '<line x1="8" y1="27" x2="152" y2="27" stroke="var(--cs-hairline)"/>' +
        '<rect x="18" y="35" width="70" height="44" rx="5" fill="var(--cs-canvas)"/>' +
        '<rect x="95" y="35" width="47" height="19" rx="5" fill="var(--cs-blue-soft)" stroke="var(--cs-blue)" stroke-width="0.9"/>' +
        '<rect x="95" y="60" width="47" height="19" rx="5" fill="var(--cs-canvas)"/>' +
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
          d = 'M ' + x1 + ' ' + y1 + ' C ' + (right ? x1 + dx : x1 - dx) + ' ' + y1 + ', ' + (right ? x2 - dx : x2 + dx) + ' ' + y2 + ', ' + x2 + ' ' + y2;
        }
        if (idle) {
          parts.push('<path class="cs-edge-idle" d="' + d + '" marker-end="url(#cs-m-idle)" />');
        } else {
          parts.push('<circle cx="' + x1 + '" cy="' + y1 + '" r="2.2" fill="' + colorVar + '" />');
          parts.push('<path class="' + cls + '" d="' + d + '" marker-end="url(#' + markerId + ')" />');
        }
      }

      if (!focusId) {
        if (CFG.dashedLines === 'hover') { svgEl.innerHTML = ''; return; }
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
      if (!focusNode || !srcEl) { svgEl.innerHTML = ''; return; }
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
`;
