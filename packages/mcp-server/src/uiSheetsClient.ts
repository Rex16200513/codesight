import { SPARKLE_SVG } from './uiStyles.ts';

/**
 * Client-side sheets (File Detail Modal, 3-tier LLM UI Prototype Refresh flow, Settings Drawer with BYOK API Key)
 * + standard MCP Apps JSON-RPC bridge (`tools/call` & `ui/message`) and DOM event wiring.
 */
export const UI_SHEETS_CLIENT_JS = `
    const SPARKLE_HTML = ${JSON.stringify(SPARKLE_SVG)};
    const SIDECAR_FALLBACK_ORIGIN = 'http://127.0.0.1:4317';
    let mcpRpcSeq = 1;

    function getRepoDirArg() {
      const q = new URLSearchParams(location.search).get('repo');
      return q || DATA.rootDir || undefined;
    }

    function getSidecarEndpoint(path) {
      if (location.protocol === 'http:' || location.protocol === 'https:') return path;
      return SIDECAR_FALLBACK_ORIGIN + path;
    }

    function callMcpAppHost(method, params, timeoutMs) {
      return new Promise((resolve) => {
        if (!window.parent || window.parent === window) { resolve(null); return; }
        const id = 'cs-' + (mcpRpcSeq++);
        let settled = false;
        const done = (val) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          window.removeEventListener('message', onMsg);
          resolve(val);
        };
        const onMsg = (ev) => {
          const d = ev && ev.data;
          if (d && d.jsonrpc === '2.0' && d.id === id) done(d);
        };
        const timer = setTimeout(() => done(null), timeoutMs || 1400);
        window.addEventListener('message', onMsg);
        try {
          window.parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*');
        } catch {
          done(null);
        }
      });
    }

    async function fetchSidecarJson(path, bodyObj, timeoutMs) {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs || 35000) : null;
      try {
        const res = await fetch(getSidecarEndpoint(path), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyObj),
          ...(ctrl ? { signal: ctrl.signal } : {}),
        });
        if (!res.ok) return { _httpError: true, status: res.status };
        return await res.json();
      } catch {
        return null;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    function buildRefreshProtoPrompt(singleNode) {
      const uiFiles = singleNode
        ? [singleNode.path]
        : DATA.nodes.filter(n => isUiProtoKind(n.prototypeKind)).map(n => n.path).slice(0, 14);
      const listStr = uiFiles.join(', ');
      return isEn()
        ? '[CodeSight UI Prototypes] Inspect the UI component(s) (' + listStr + ') in "' + DATA.repoName + '" and call codesight_map with architectureOverride.prototypes using typed wireframe blocks (header, tabs, toggle, slider, chips, list, search, highlight, actions) so each UI component renders an accurate mini-Figma preview.'
        : '[CodeSight UI 原型生成] 请阅读仓库 "' + DATA.repoName + '" 中的 UI 组件代码（' + listStr + '），并调用 codesight_map 传入 architectureOverride.prototypes（使用 header/tabs/toggle/slider/chips/list/search/highlight/actions 控件块），为每个 UI 组件生成精准的原型示意图。';
    }

    function openPromptSheet(title, desc, promptText, copiedOk) {
      settingsOpen = false;
      activeModalId = null;
      const t = tr();
      sheetEl.innerHTML =
        '<div class="cs-sheet-head">' +
          '<div class="cs-crumb"><strong>' + escHtml(title) + '</strong></div>' +
          '<button type="button" class="cs-close" id="cs-close-btn" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="cs-sheet-body">' +
          '<p class="cs-meta-desc">' + escHtml(desc) + '</p>' +
          '<div class="cs-prompt-box is-open" id="cs-prompt-box">' +
            '<div class="cs-prompt-tip" id="cs-prompt-tip">' + escHtml(copiedOk ? t.protoPromptCopied : t.promptHint) + '</div>' +
            '<textarea class="cs-prompt-ta" id="cs-prompt-ta" readonly style="min-height:92px"></textarea>' +
          '</div>' +
        '</div>' +
        '<div class="cs-sheet-foot">' +
          '<div class="cs-actions">' +
            '<button type="button" class="cs-btn-primary" id="cs-copy-proto-prompt">' + escHtml(copiedOk ? t.copied : t.protoBtn) + '</button>' +
            '<button type="button" class="cs-btn-ghost" id="cs-open-set-from-proto">' + escHtml(t.settings) + '</button>' +
          '</div>' +
        '</div>';
      backdropEl.classList.add('is-open');
      const ta = document.getElementById('cs-prompt-ta');
      if (ta) { ta.value = promptText; ta.focus(); ta.select(); ta.setSelectionRange(0, textLen(promptText)); }
      document.getElementById('cs-close-btn')?.addEventListener('click', closeSheet);
      document.getElementById('cs-open-set-from-proto')?.addEventListener('click', () => openSettingsSheet());
      const copyBtn = document.getElementById('cs-copy-proto-prompt');
      copyBtn?.addEventListener('click', async () => {
        const ok = await copyTextReliable(promptText);
        copyBtn.textContent = ok ? t.copied : t.pressCopy;
        if (ta) { ta.focus(); ta.select(); }
      });
    }
    function textLen(s) { return String(s || '').length; }

    async function triggerRefreshUiPrototypes(singleNode, triggerBtn) {
      if (isRefreshingProtos) return;
      isRefreshingProtos = true;
      const t = tr();
      const barBtn = document.getElementById('cs-refresh-proto');
      const barLbl = document.getElementById('cs-refresh-lbl');
      if (barBtn) barBtn.disabled = true;
      if (triggerBtn) triggerBtn.disabled = true;
      if (barLbl) barLbl.textContent = t.protoRefreshing;
      const origBtnHtml = triggerBtn ? triggerBtn.innerHTML : '';
      if (triggerBtn) triggerBtn.textContent = t.protoRefreshing;

      try {
        // Tier 1: Direct call to CodeSight Sidecar (works on http://127.0.0.1:4317 AND cross-origin when host allows localhost)
        const isSameHttp = location.protocol === 'http:' || location.protocol === 'https:';
        const data = await fetchSidecarJson(
          '/api/refresh-prototypes',
          { repoDir: getRepoDirArg() },
          isSameHttp ? 45000 : 2500
        );

        if (data && !data._httpError) {
          if (data.ok && data.visualMap) {
            Object.assign(DATA, data.visualMap);
            nodeMap.clear();
            DATA.nodes.forEach(n => nodeMap.set(n.id, n));
            if (settingsOpen) closeSheet();
            renderBoard();
            if (activeModalId && nodeMap.has(activeModalId)) openFileSheet(activeModalId);
            if (footHintEl) footHintEl.textContent = t.protoRefreshed(data.prototypeCount || 0);
            return;
          }
          if (data.needsLlmConfig) {
            openSettingsSheet(data.error);
            return;
          }
          if (data.error) {
            openSettingsSheet(data.error);
            return;
          }
        }

        // Tier 2: Standard MCP Apps bidirectional JSON-RPC host bridge (Claude / ChatGPT Apps / Antigravity / Cursor)
        const promptText = buildRefreshProtoPrompt(singleNode);
        const uiFiles = singleNode
          ? [singleNode.path]
          : DATA.nodes.filter(n => isUiProtoKind(n.prototypeKind)).map(n => n.path);

        if (CFG.llm && CFG.llm.enabled) {
          const toolReply = await callMcpAppHost(
            'tools/call',
            { name: 'codesight_map', arguments: { repoDir: getRepoDirArg(), forceRefresh: true } },
            2000
          );
          if (toolReply && !toolReply.error) {
            if (footHintEl) footHintEl.textContent = t.protoHostSent;
            return;
          }
        }

        const msgReply = await callMcpAppHost(
          'ui/message',
          { role: 'user', content: [{ type: 'text', text: promptText }] },
          1200
        );
        if (msgReply && !msgReply.error) {
          if (footHintEl) footHintEl.textContent = t.protoHostSent;
          return;
        }

        // Legacy custom event for host wrappers
        window.parent?.postMessage({
          type: 'codesight:refreshPrototypes',
          repoName: DATA.repoName,
          repoDir: getRepoDirArg(),
          uiFiles,
          prompt: promptText,
        }, '*');

        // Tier 3: Offline static sandbox fallback (e.g., Orca network-blocked chat preview / saved HTML)
        const ok = await copyTextReliable(promptText);
        if (singleNode && activeModalId) {
          showPromptBox(promptText, ok);
        } else {
          openPromptSheet(t.protoPromptTitle, t.protoPromptDesc, promptText, ok);
        }
      } finally {
        isRefreshingProtos = false;
        if (barBtn) barBtn.disabled = false;
        if (barLbl) barLbl.textContent = tr().protoBtn;
        if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.innerHTML = origBtnHtml; }
      }
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
      const isUiNode = isUiProtoKind(node.prototypeKind);
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

      const primaryTip = Array.isArray(node.healthTips) && node.healthTips.length > 0 ? node.healthTips[0] : null;
      const tipHtml = primaryTip
        ? '<div class="cs-tip-strip' + (primaryTip.level === 'info' ? ' is-info' : '') + '">' +
            '<span>' + escHtml(isEn() ? primaryTip.en : primaryTip.zh) + '</span>' +
            '<button type="button" class="cs-tip-btn" id="cs-act-split">' + t.splitBtn + '</button>' +
          '</div>'
        : '';

      const protoBlock =
        '<div class="cs-proto-col">' +
          '<div class="cs-proto">' + renderPrototypeSvg(node) + '</div>' +
          (isUiNode
            ? '<button type="button" class="cs-proto-refresh" id="cs-modal-refresh-proto">' + SPARKLE_HTML + '<span>' + escHtml(t.protoModalRefresh) + '</span></button>'
            : '') +
        '</div>';

      const crumbZone = tr().zones[node.zoneKind] || (isEn() ? node.zoneKind : node.zoneTitle);
      sheetEl.innerHTML =
        '<div class="cs-sheet-head">' +
          '<div class="cs-crumb"><span>' + escHtml(crumbZone) + '</span><span>›</span><strong>' + escHtml(shortName(node)) + '</strong></div>' +
          '<button type="button" class="cs-close" id="cs-close-btn" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="cs-sheet-body">' +
          '<div class="cs-detail-grid">' +
            protoBlock +
            '<div class="cs-meta">' +
              '<div class="cs-meta-top">' +
                '<h3 class="cs-meta-title">' + escHtml(shortName(node)) + '</h3>' +
                '<span class="cs-state-dot" style="color:' + stateColor + '">' + escHtml(stateLabel) + '</span>' +
                (node.lines ? '<span style="font-size:11px;color:var(--cs-faint);font-variant-numeric:tabular-nums">' + escHtml(t.linesCount(node.lines)) + '</span>' : '') +
              '</div>' +
              '<p class="cs-meta-desc">' + escHtml(isFault ? (faultHeadline() || nodeSummary(node)) : nodeSummary(node)) + '</p>' +
            '</div>' +
          '</div>' +
          tipHtml +
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
      document.getElementById('cs-modal-refresh-proto')?.addEventListener('click', (e) => {
        triggerRefreshUiPrototypes(node, e.currentTarget);
      });
      sheetEl.querySelectorAll('.cs-chip').forEach(btn => {
        btn.addEventListener('click', () => openFileSheet(btn.dataset.jump));
      });

      const wireCopy = (btn, promptText) => {
        if (!btn) return;
        btn.addEventListener('click', async () => {
          const msgReply = await callMcpAppHost('ui/message', { role: 'user', content: [{ type: 'text', text: promptText }] }, 800);
          if (msgReply && !msgReply.error) {
            btn.textContent = t.protoHostSent;
            setTimeout(() => { btn.textContent = btn.dataset.origLabel || btn.textContent; }, 1600);
            return;
          }
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

      if (primaryTip) wireCopy(document.getElementById('cs-act-split'), primaryTip.refactorPrompt);

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

    const LLM_PRESETS = [
      { name: 'OpenAI', url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
      { name: 'DeepSeek', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
      { name: 'Gemini', url: 'https://openrouter.ai/api/v1', model: 'google/gemini-2.5-flash' },
      { name: 'Ollama', url: 'http://127.0.0.1:11434/v1', model: 'qwen2.5-coder:7b' },
    ];

    function openSettingsSheet(bannerHint) {
      settingsOpen = true;
      activeModalId = null;
      const t = tr();
      const isHttp = location.protocol === 'http:' || location.protocol === 'https:';
      const presetsHtml = LLM_PRESETS.map(p =>
        '<button type="button" class="cs-preset-chip' + (CFG.llm.model === p.model ? ' is-on' : '') + '" data-preset-url="' + escHtml(p.url) + '" data-preset-model="' + escHtml(p.model) + '">' + p.name + '</button>'
      ).join('');

      sheetEl.innerHTML =
        '<div class="cs-sheet-head">' +
          '<div class="cs-crumb"><strong>' + t.settings + '</strong></div>' +
          '<button type="button" class="cs-close" id="cs-close-btn" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="cs-sheet-body">' +
          (bannerHint ? '<div class="cs-hint-banner">' + escHtml(bannerHint) + '</div>' : '') +
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
              '<div class="cs-preset-row">' + presetsHtml + '</div>' +
              '<input class="cs-input" id="cs-set-url" placeholder="https://api.openai.com/v1" value="' + escHtml(CFG.llm.baseUrl || '') + '" />' +
              '<input class="cs-input" id="cs-set-model" placeholder="gpt-4o-mini" value="' + escHtml(CFG.llm.model || '') + '" />' +
              '<input class="cs-input" id="cs-set-key" type="password" autocomplete="off" placeholder="' + escHtml(CFG.llm.hasApiKey ? t.apiKeySavedPh : t.apiKeyPh) + '" value="" />' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="cs-sheet-foot">' +
          '<div class="cs-actions">' +
            '<button type="button" class="cs-btn-primary" id="cs-save-settings">' + t.saveBtn + '</button>' +
            (isHttp ? '<button type="button" class="cs-btn-ghost" id="cs-save-and-gen">' + SPARKLE_HTML + ' ' + t.saveAndGenBtn + '</button>' : '') +
          '</div>' +
          '<div class="cs-prompt-box" id="cs-prompt-box">' +
            '<div class="cs-prompt-tip" id="cs-prompt-tip"></div>' +
            '<textarea class="cs-prompt-ta" id="cs-prompt-ta" readonly></textarea>' +
          '</div>' +
        '</div>';

      backdropEl.classList.add('is-open');
      document.getElementById('cs-close-btn')?.addEventListener('click', closeSheet);

      sheetEl.querySelectorAll('[data-preset-url]').forEach(btn => {
        btn.addEventListener('click', () => {
          const urlEl = document.getElementById('cs-set-url');
          const modEl = document.getElementById('cs-set-model');
          const llmToggle = document.getElementById('cs-set-llm');
          if (urlEl) urlEl.value = btn.dataset.presetUrl || '';
          if (modEl) modEl.value = btn.dataset.presetModel || '';
          if (llmToggle) llmToggle.checked = true;
          sheetEl.querySelectorAll('[data-preset-url]').forEach(b => b.classList.toggle('is-on', b === btn));
        });
      });

      sheetEl.querySelectorAll('[data-set-lang]').forEach(btn => {
        btn.addEventListener('click', () => {
          CFG.language = btn.dataset.setLang;
          renderBoard();
          openSettingsSheet(bannerHint);
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

      const persistSettings = async (forceEnableLlm) => {
        CFG.collapsedByDefault = Boolean(document.getElementById('cs-set-collapse')?.checked);
        CFG.silentRegressionGuard = Boolean(document.getElementById('cs-set-guard')?.checked);
        CFG.llm.enabled = forceEnableLlm ? true : Boolean(document.getElementById('cs-set-llm')?.checked);
        CFG.llm.baseUrl = document.getElementById('cs-set-url')?.value?.trim() || 'https://api.openai.com/v1';
        CFG.llm.model = document.getElementById('cs-set-model')?.value?.trim() || 'gpt-4o-mini';
        const rawKey = document.getElementById('cs-set-key')?.value?.trim() || '';
        if (rawKey) CFG.llm.hasApiKey = true;

        const patch = {
          language: CFG.language,
          dashedLines: CFG.dashedLines,
          collapsedByDefault: CFG.collapsedByDefault,
          silentRegressionGuard: CFG.silentRegressionGuard,
          architectureMode: CFG.architectureMode,
          llm: {
            enabled: CFG.llm.enabled,
            baseUrl: CFG.llm.baseUrl,
            model: CFG.llm.model,
            ...(rawKey ? { apiKey: rawKey } : {}),
          },
        };

        const apiRes = await fetchSidecarJson('/api/settings', patch, 4000);
        if (apiRes && apiRes.ok) return { ok: true, via: 'sidecar', patch };

        const mcpRes = await callMcpAppHost('tools/call', { name: 'codesight_settings', arguments: { action: 'set', ...patch } }, 1200);
        if (mcpRes && !mcpRes.error) return { ok: true, via: 'mcp', patch };

        window.parent?.postMessage({ type: 'codesight:saveSettings', patch }, '*');
        return { ok: false, via: 'fallback', patch };
      };

      const saveBtn = document.getElementById('cs-save-settings');
      saveBtn?.addEventListener('click', async () => {
        const res = await persistSettings(false);
        if (res.ok) {
          saveBtn.textContent = t.saved;
          setTimeout(() => { saveBtn.textContent = t.saveBtn; }, 1400);
        } else {
          const safePatch = { ...res.patch, llm: { enabled: res.patch.llm.enabled, baseUrl: res.patch.llm.baseUrl, model: res.patch.llm.model } };
          const syncCmd = 'Call codesight_settings with action="set" and ' + JSON.stringify(safePatch);
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

      const saveGenBtn = document.getElementById('cs-save-and-gen');
      saveGenBtn?.addEventListener('click', async () => {
        const res = await persistSettings(true);
        if (res.ok) {
          await triggerRefreshUiPrototypes(null, saveGenBtn);
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
    document.getElementById('cs-refresh-proto')?.addEventListener('click', () => triggerRefreshUiPrototypes(null, null));
    document.getElementById('cs-toggle-collapse')?.addEventListener('click', () => setCollapsed(!isCollapsed));
    document.getElementById('cs-brand-toggle')?.addEventListener('click', () => setCollapsed(!isCollapsed));
    document.getElementById('cs-open-settings')?.addEventListener('click', () => openSettingsSheet());
    document.getElementById('cs-open-fault')?.addEventListener('click', () => {
      if (DATA.activeDiagnosis?.targetNodeId) openFileSheet(DATA.activeDiagnosis.targetNodeId);
    });
    backdropEl.addEventListener('click', (e) => { if (e.target === backdropEl) closeSheet(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
    window.addEventListener('resize', () => { if (!isCollapsed) drawDashedLines(); });

    renderBoard();
    setCollapsed(isCollapsed);
`;
