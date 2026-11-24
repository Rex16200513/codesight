/**
 * Client-side i18n, reliable clipboard helpers, and architecture board rendering.
 */
export const UI_BOARD_CLIENT_JS = `
    const LANE_EN = {
      '页面与入口': 'Pages & Entry',
      '扩展入口': 'Extension Entry',
      '界面组件': 'UI Components',
      '界面功能模块': 'UI & Features',
      '页面与组件': 'Pages & UI',
      '服务与插件': 'Services & MCP',
      '本地服务层': 'Local Services',
      '命令与工具入口': 'CLI & Tools',
      '核心引擎': 'Core Engine',
      '核心逻辑': 'Core Logic',
      '核心分析引擎': 'Analysis Engine',
      '基础数据定义': 'Shared Types',
      '基础与数据定义': 'Shared Types',
      'DOM 工具与数据定义': 'DOM & Types',
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
      '弹窗界面': 'Modal UI',
      '侧边栏 / 悬浮界面': 'Sidebar / Panel',
      '交互画板 / 功能面板': 'Interactive Board',
      '页面注入入口': 'Content Script',
      '扩展后台脚本': 'Background Worker',
      '设置页入口': 'Options Page',
      '弹窗页入口': 'Popup Page',
      '界面卡片': 'UI Card',
      '界面组件': 'UI Component',
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
        warnLegend: '建议拆分',
        none: '无',
        more: (n) => '+ 其余 ' + n + ' 项',
        less: '收起',
        hoverHint: '悬停查看连线，点击查看详情',
        faultBtn: '查看修复',
        faultState: '报错位置',
        filesCount: (n) => n + ' 个文件',
        linesCount: (n) => n + ' 行',
        splitBtn: '拆分建议',
        protoBtn: 'AI 原型',
        protoBtnTitle: '使用 LLM 为所有 UI 组件生成或刷新示意图',
        protoModalRefresh: 'LLM 刷新原型',
        protoRefreshing: '生成中…',
        protoRefreshed: (n) => '已刷新 ' + n + ' 个 UI 原型',
        protoPromptTitle: '使用 AI 生成 / 刷新 UI 原型',
        protoPromptCopied: '已复制给 AI（直接发送即可生成精确原型）',
        protoPromptDesc: '在支持 MCP Apps 双向通信的 AI 客户端中，点「AI 原型」会自动触发宿主 Agent 刷新；当前处于静态只读预览沙箱，将下方指令发给你的 AI 即可生成（无需额外 API Key）：',
        protoHostSent: '已通知 AI 宿主自动刷新',
        apiKeyPh: 'API Key（如 sk-...，Ollama 可留空）',
        apiKeySavedPh: '已保存 API Key（留空保持不变，输入新值覆盖）',
        saveAndGenBtn: '保存并生成 UI 原型',
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
        warnLegend: 'Large',
        none: 'None',
        more: (n) => '+ ' + n + ' more',
        less: 'Less',
        hoverHint: 'Hover for links, click to inspect',
        faultBtn: 'Inspect fix',
        faultState: 'Error origin',
        filesCount: (n) => n + ' files',
        linesCount: (n) => n + 'L',
        splitBtn: 'Split prompt',
        protoBtn: 'AI UI',
        protoBtnTitle: 'Generate or refresh UI component wireframes with LLM',
        protoModalRefresh: 'Refresh UI with LLM',
        protoRefreshing: 'Generating…',
        protoRefreshed: (n) => 'Refreshed ' + n + ' UI wireframes',
        protoPromptTitle: 'Generate / Refresh UI Prototypes with AI',
        protoPromptCopied: 'Prompt copied — send to AI to generate exact UI wireframes',
        protoPromptDesc: 'In MCP Apps-capable AI clients, clicking "AI UI" invokes your host agent directly; in this static preview sandbox, send the prompt below to your AI (no extra API key needed):',
        protoHostSent: 'Dispatched to AI host',
        apiKeyPh: 'API Key (e.g. sk-..., blank for Ollama)',
        apiKeySavedPh: 'API Key saved (leave blank to keep, or enter new key)',
        saveAndGenBtn: 'Save & Generate UI',
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
      if (node.prototypeSpec) {
        if (isEn() && node.prototypeSpec.visualSummaryEn) return node.prototypeSpec.visualSummaryEn;
        if (!isEn() && node.prototypeSpec.visualSummary) return node.prototypeSpec.visualSummary;
      }
      if (!isEn()) return node.summary;
      if (node.summary && !/[\\u4e00-\\u9fa5]/.test(node.summary)) return node.summary;
      const role = nodeRole(node);
      const ex = (node.exports || []).slice(0, 2).join(', ');
      if (node.downstreamReach >= 5) {
        return role + ' shared across ' + node.downstreamReach + ' files' + (ex ? ' (' + ex + ')' : '') + '.';
      }
      if (node.zoneKind === 'frontend') return role + (ex ? ' rendering ' + ex : '') + '.';
      if (node.zoneKind === 'backend') return role + ' handling requests' + (ex ? ' via ' + ex : '') + '.';
      return role + (ex ? ' exporting ' + ex : ' module') + '.';
    }

    function faultHeadline() {
      if (!DATA.activeDiagnosis) return '';
      return isEn() ? (DATA.activeDiagnosis.headlineEn || DATA.activeDiagnosis.headline) : DATA.activeDiagnosis.headline;
    }

    function execCopyFallback(text) {
      try {
        const prevFocus = document.activeElement;
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;pointer-events:none;';
        document.body.appendChild(ta);
        ta.focus({ preventScroll: true });
        ta.select();
        ta.setSelectionRange(0, text.length);
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (prevFocus && typeof prevFocus.focus === 'function') {
          try { prevFocus.focus({ preventScroll: true }); } catch {}
        }
        return Boolean(ok);
      } catch {
        return false;
      }
    }

    async function copyTextReliable(text) {
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
      ta.focus({ preventScroll: true });
      ta.select();
      ta.setSelectionRange(0, text.length);
    }

    function setCollapsed(next) {
      isCollapsed = Boolean(next);
      shellEl.classList.toggle('is-collapsed', isCollapsed);
      if (!isCollapsed) requestAnimationFrame(drawDashedLines);
    }

    function syncChromeText() {
      const t = tr();
      document.querySelectorAll('[data-lang-btn]').forEach(b => {
        b.classList.toggle('is-on', b.dataset.langBtn === CFG.language);
      });
      const refreshBtn = document.getElementById('cs-refresh-proto');
      const refreshLbl = document.getElementById('cs-refresh-lbl');
      const hasUiNodes = DATA.nodes.some(n => isUiProtoKind(n.prototypeKind));
      if (refreshBtn) {
        refreshBtn.style.display = hasUiNodes ? 'inline-flex' : 'none';
        refreshBtn.title = t.protoBtnTitle;
      }
      if (refreshLbl && !isRefreshingProtos) refreshLbl.textContent = t.protoBtn;
      if (legendUpEl) legendUpEl.innerHTML = '<span class="cs-dash"></span>' + t.uses;
      if (legendDownEl) legendDownEl.innerHTML = '<span class="cs-dash"></span>' + t.usedBy;
      if (legendWarnEl) {
        const hasAnyWarn = Boolean(DATA.healthSummary && DATA.healthSummary.warnFilesCount > 0);
        legendWarnEl.style.display = hasAnyWarn ? 'inline-flex' : 'none';
        legendWarnEl.innerHTML = '<span class="cs-dot-warn" style="margin-right:4px"></span>' + t.warnLegend;
      }
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
            const hasWarnTip = Array.isArray(n.healthTips) && n.healthTips.some(tp => tp.level === 'warn');
            let rightEl = '';
            if (isFault) {
              rightEl = '<span class="cs-dot-fault" aria-label="error"></span>';
            } else if (n.downstreamReach >= 5 || hasWarnTip) {
              rightEl = '<span class="cs-row-right">' +
                (hasWarnTip ? '<span class="cs-dot-warn" title="' + escHtml(isEn() ? n.healthTips[0].en : n.healthTips[0].zh) + '"></span>' : '') +
                (n.downstreamReach >= 5 ? '<span class="cs-row-metric">' + n.downstreamReach + '</span>' : '') +
              '</span>';
            }

            return '<button type="button" class="cs-row' + (isFault ? ' is-fault' : '') + '" data-node-id="' + escHtml(n.id) + '" title="' + escHtml(n.path + (n.lines ? ' (' + n.lines + 'L)' : '')) + '">' +
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
        btn.addEventListener('mouseenter', () => { hoveredId = id; updateHover(); });
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
        footHintEl.textContent = focusNode
          ? shortName(focusNode) + ' — ' + nodeRole(focusNode)
          : tr().hoverHint;
      }
      if (!isCollapsed) drawDashedLines();
    }
`;
