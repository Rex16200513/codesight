import {
  askRepository,
  buildVisualProjectMap,
  generateRepoMap,
  getGlobalConfigPath,
  loadCodeSightConfig,
  maskConfigForDisplay,
  projectProblemOntoRepo,
  resetCodeSightConfig,
  resolveProjectArchitecture,
  safeGitDiff,
  saveCodeSightConfig,
  toActiveLLMConfig,
  traceSymbol,
  type CodeSightConfigPatch,
  type HostArchitectureOverride,
} from '@codesight/core/engine';
import type { JsonRpcResponse, UiResourceEntry } from './protocol.ts';
import {
  renderSettingsCardHtml,
  renderTraceCardHtml,
  renderVisualProjectMapHtml,
} from './uiCards.ts';

async function handleMapTool(
  id: string | number | null,
  repoDir: string,
  args: Record<string, unknown>,
  uiResources: Map<string, UiResourceEntry>
): Promise<JsonRpcResponse> {
  const cfg = loadCodeSightConfig(repoDir);
  const { map, index, graph, callGraph } = await generateRepoMap(repoDir);
  const override = args.architectureOverride as HostArchitectureOverride | undefined;
  const forceRefresh = Boolean(args.forceRefresh);
  const llmConfig = cfg.architectureMode === 'heuristic' ? undefined : toActiveLLMConfig(cfg);
  const blueprint = await resolveProjectArchitecture(index, graph, {
    override,
    llmConfig,
    forceRefresh,
  });
  const visualMap = buildVisualProjectMap(index, graph, callGraph, undefined, blueprint);
  const uri = 'ui://codesight/map/latest';
  const html = renderVisualProjectMapHtml(visualMap, cfg);
  uiResources.set(uri, { title: `CodeSight Map (${map.repoName})`, html });

  const warnNodes = visualMap.nodes.filter((n) => n.healthTips.some((t) => t.level === 'warn'));
  const textSummary = [
    `CodeSight Map · ${map.repoName} [${blueprint.archetypeLabel} · ${blueprint.source}] (${map.totalFiles} files, ${map.totalSymbols} AST symbols, ${map.scanMs}ms)`,
    `Architecture: ${blueprint.projectHeadline}`,
    ...blueprint.zones.map(
      (z) =>
        `- [${z.badge}] ${z.title}: ${z.groups.map((g) => `${g.title}(${g.files.length})`).join(', ')}`
    ),
    'Most-used Foundation Files:',
    ...map.hubs.slice(0, 5).map((h) => `- ${h.path} [used by ${h.downstreamReach} files] — ${h.roleLabel}`),
    ...(warnNodes.length > 0
      ? [
          'Refactor Tips (Oversized / High-Complexity Files):',
          ...warnNodes.slice(0, 4).map((n) => `- ${n.path} (${n.lines} lines): ${n.healthTips[0].en}`),
        ]
      : []),
  ].join('\n');

  return {
    jsonrpc: '2.0',
    id,
    result: {
      content: [
        { type: 'text', text: textSummary },
        { type: 'resource', resource: { uri, mimeType: 'text/html+mcp', text: html } },
      ],
      structuredContent: { map, blueprint, visualMap },
    },
  };
}

async function handleAskTool(
  id: string | number | null,
  repoDir: string,
  args: Record<string, unknown>
): Promise<JsonRpcResponse> {
  const question = String(args.question ?? '').trim();
  const res = await askRepository(repoDir, question);
  const textSummary = [
    `CodeSight Ask · "${res.question}" (${res.retrievalMs}ms | saved ${res.savedPercent}% tokens: ${res.retrievedSliceTokens}/${res.wholeRepoTokens})`,
    ...res.hits.map(
      (h, i) =>
        `${i + 1}. ${h.file.path} (${h.file.roleLabel}, RRF ${h.totalScore}) — ${h.file.summary} [${h.matchReasons.join('; ')}]`
    ),
  ].join('\n');

  return {
    jsonrpc: '2.0',
    id,
    result: {
      content: [{ type: 'text', text: textSummary }],
      structuredContent: res,
    },
  };
}

async function handleTraceTool(
  id: string | number | null,
  repoDir: string,
  args: Record<string, unknown>,
  uiResources: Map<string, UiResourceEntry>
): Promise<JsonRpcResponse> {
  const symbol = String(args.symbol ?? '').trim();
  const trace = await traceSymbol(repoDir, symbol);
  const uri = 'ui://codesight/trace/latest';
  const html = renderTraceCardHtml(trace);
  uiResources.set(uri, { title: `CodeSight Trace (${symbol})`, html });

  const textSummary =
    trace.matches.length === 0
      ? `No AST symbol matching "${symbol}" found in ${trace.repoName}.`
      : trace.matches
          .map(
            (m) =>
              `${m.symbol.name} [${m.symbol.kind}] @ ${m.symbol.file}:${m.symbol.startLine}-${m.symbol.endLine}\n` +
              `  Called by (${m.calledBy.length}): ${m.calledBy.map((e) => `${e.callerName} (${e.callerFile}:${e.callerLine})`).join(', ') || 'none'}\n` +
              `  Calls out (${m.callsOut.length}): ${m.callsOut.map((e) => `${e.calleeName} (${e.calleeFile}:${e.calleeLine})`).join(', ') || 'none'}`
          )
          .join('\n\n');

  return {
    jsonrpc: '2.0',
    id,
    result: {
      content: [
        { type: 'text', text: textSummary },
        { type: 'resource', resource: { uri, mimeType: 'text/html+mcp', text: html } },
      ],
      structuredContent: trace,
    },
  };
}

async function handleDiagnoseTool(
  id: string | number | null,
  repoDir: string,
  args: Record<string, unknown>,
  uiResources: Map<string, UiResourceEntry>
): Promise<JsonRpcResponse> {
  const cfg = loadCodeSightConfig(repoDir);
  const rawError = typeof args.rawError === 'string' ? args.rawError : '';
  const useGit = Boolean(args.useGit);
  const rawDiff = useGit ? safeGitDiff(repoDir).diff : '';
  const llmConfig = toActiveLLMConfig(cfg);
  const { index, graph, callGraph } = await generateRepoMap(repoDir);
  const blueprint = await resolveProjectArchitecture(index, graph, {
    llmConfig: cfg.architectureMode === 'heuristic' ? undefined : llmConfig,
  });
  const report = await projectProblemOntoRepo(repoDir, { rawError, rawDiff }, { llmConfig });
  const visualMap = buildVisualProjectMap(index, graph, callGraph, report, blueprint);

  const uri = 'ui://codesight/diagnose/latest';
  const html = renderVisualProjectMapHtml(visualMap, cfg);
  uiResources.set(uri, { title: `CodeSight Diagnose (${report.repoName})`, html });

  const lines = [
    `CodeSight Diagnose · ${report.repoName} (saved ${report.tokenEconomy.savedPercent}% tokens, ${report.tokenEconomy.retrievalMs}ms)`,
    `Diagnosis: ${report.plainDiagnosis}`,
  ];
  if (report.blastRadius) {
    lines.push(
      `Blast Radius [${report.blastRadius.riskLevel}]: direct=${report.blastRadius.directImpact.length}, indirect=${report.blastRadius.indirectImpact.length}, safeZone=${report.blastRadius.safeZoneCount} files`
    );
  }
  if (report.symbolCallers.length > 0) {
    lines.push(
      `AST Callers: ${report.symbolCallers.slice(0, 5).map((e) => `${e.callerName} (${e.callerFile}:${e.callerLine})`).join(', ')}`
    );
  }
  if (report.silentRegressions.length > 0) {
    lines.push(
      `Silent Regressions (${report.silentRegressions.length}): ` +
        report.silentRegressions.map((r) => `[${r.patternTag}] ${r.file}: ${r.title}`).join(' | ')
    );
  }
  if (report.directions.length > 0) {
    lines.push(
      'Fix Directions (ask the user to choose if high impact):',
      ...report.directions.map((d, i) => `  ${i + 1}. ${d.label} — ${d.strategy}`)
    );
  }

  return {
    jsonrpc: '2.0',
    id,
    result: {
      content: [
        { type: 'text', text: lines.join('\n') },
        { type: 'resource', resource: { uri, mimeType: 'text/html+mcp', text: html } },
      ],
      structuredContent: report,
    },
  };
}

function handleSettingsTool(
  id: string | number | null,
  repoDir: string,
  args: Record<string, unknown>,
  uiResources: Map<string, UiResourceEntry>
): JsonRpcResponse {
  const action = typeof args.action === 'string' ? args.action : 'get';
  let cfg;
  if (action === 'reset') {
    cfg = resetCodeSightConfig();
  } else if (action === 'set') {
    const patch: CodeSightConfigPatch = {};
    if (args.language === 'zh' || args.language === 'en') patch.language = args.language;
    if (args.dashedLines === 'always' || args.dashedLines === 'hover') patch.dashedLines = args.dashedLines;
    if (typeof args.collapsedByDefault === 'boolean') patch.collapsedByDefault = args.collapsedByDefault;
    if (typeof args.autoOpenBrowser === 'boolean') patch.autoOpenBrowser = args.autoOpenBrowser;
    if (typeof args.silentRegressionGuard === 'boolean') {
      patch.silentRegressionGuard = args.silentRegressionGuard;
    }
    if (
      args.architectureMode === 'auto' ||
      args.architectureMode === 'heuristic' ||
      args.architectureMode === 'llm'
    ) {
      patch.architectureMode = args.architectureMode;
    }
    if (args.llm && typeof args.llm === 'object') {
      patch.llm = args.llm as CodeSightConfigPatch['llm'];
    }
    if (args.hud && typeof args.hud === 'object') {
      patch.hud = args.hud as CodeSightConfigPatch['hud'];
    }
    cfg = saveCodeSightConfig(patch);
  } else {
    cfg = loadCodeSightConfig(repoDir);
  }

  const masked = maskConfigForDisplay(cfg);
  const configPath = getGlobalConfigPath();
  const uri = 'ui://codesight/settings/latest';
  const html = renderSettingsCardHtml(cfg, configPath);
  uiResources.set(uri, { title: 'CodeSight Settings', html });

  const textSummary = [
    `CodeSight Settings (${configPath})`,
    `- language: ${masked.language}`,
    `- dashedLines: ${masked.dashedLines}`,
    `- silentRegressionGuard: ${masked.silentRegressionGuard}`,
    `- architectureMode: ${masked.architectureMode}`,
    `- autoOpenBrowser: ${masked.autoOpenBrowser}`,
    `- llm: ${masked.llm.enabled ? `${masked.llm.model} (${masked.llm.baseUrl})` : 'off (0-token local)'}`,
    `- hud: alwaysOnTop=${masked.hud.alwaysOnTop}, opacity=${masked.hud.opacity}`,
  ].join('\n');

  return {
    jsonrpc: '2.0',
    id,
    result: {
      content: [
        { type: 'text', text: textSummary },
        { type: 'resource', resource: { uri, mimeType: 'text/html+mcp', text: html } },
      ],
      structuredContent: { configPath, config: masked },
    },
  };
}

export async function executeCodeSightTool(
  id: string | number | null,
  params: Record<string, unknown>,
  uiResources: Map<string, UiResourceEntry>
): Promise<JsonRpcResponse> {
  const toolName = String(params.name ?? '');
  const args = (params.arguments as Record<string, unknown> | undefined) ?? {};
  const repoDir = typeof args.repoDir === 'string' && args.repoDir.trim() ? args.repoDir : process.cwd();

  switch (toolName) {
    case 'codesight_map':
      return handleMapTool(id, repoDir, args, uiResources);
    case 'codesight_ask':
      return handleAskTool(id, repoDir, args);
    case 'codesight_trace':
      return handleTraceTool(id, repoDir, args, uiResources);
    case 'codesight_diagnose':
      return handleDiagnoseTool(id, repoDir, args, uiResources);
    case 'codesight_settings':
      return handleSettingsTool(id, repoDir, args, uiResources);
    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: `Unknown tool: ${toolName}` },
      };
  }
}
