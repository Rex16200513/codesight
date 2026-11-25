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
import {
  renderSettingsCardHtml,
  renderTraceCardHtml,
  renderVisualProjectMapHtml,
} from '@codesight/mcp-server';
import type {
  CordisHostContext,
  Disposer,
  DshToolDefinition,
  DshToolPresentationMeta,
} from './types.ts';

export * from './types.ts';

export const name = 'codesight';
export const inject = ['tools'] as const;

interface CodeSightToolValue {
  text: string;
  title: string;
  repoName?: string;
  html?: string;
  warnFilesCount?: number;
  structured: unknown;
}

function resolveDir(args: Record<string, unknown>, exec?: { cwd?: string }): string {
  if (typeof args.repoDir === 'string' && args.repoDir.trim()) return args.repoDir.trim();
  if (exec?.cwd && exec.cwd.trim()) return exec.cwd.trim();
  return process.cwd();
}

function toMeta(toolName: string, value: CodeSightToolValue): DshToolPresentationMeta | undefined {
  if (!value.html) return undefined;
  return {
    kind: 'codesight-card',
    toolName,
    title: value.title,
    repoName: value.repoName,
    html: value.html,
    warnFilesCount: value.warnFilesCount,
  };
}

export function createCodeSightDshTools(): DshToolDefinition<CodeSightToolValue>[] {
  return [
    {
      name: 'codesight_map',
      description:
        'Build an incremental AST + Dependency Graph comprehension map of a repository. Reveals core hubs, UI wireframe prototypes, non-UI relation graphs, and 0-token split tips.',
      parameters: {
        repoDir: { type: 'string', description: 'Absolute path to repository root (defaults to workspace cwd).' },
        architectureOverride: {
          type: 'object',
          description: 'Optional semantic zones + UI wireframe prototypes (`blocks`) cached to .codesight/architecture.json.',
        },
        forceRefresh: {
          type: 'boolean',
          description: 'When true, bypasses cached architecture and regenerates zones/prototypes with BYOK LLM.',
        },
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [{ type: 'text', text: value.text }],
        presentationMeta: (_args, value) => toMeta('codesight_map', value),
      },
      async execute(args, exec) {
        const repoDir = resolveDir(args, exec);
        const cfg = loadCodeSightConfig(repoDir);
        const { map, index, graph, callGraph } = await generateRepoMap(repoDir);
        const override = args.architectureOverride as HostArchitectureOverride | undefined;
        const forceRefresh = Boolean(args.forceRefresh);
        const llmConfig = cfg.architectureMode === 'heuristic' ? undefined : toActiveLLMConfig(cfg);
        const blueprint = await resolveProjectArchitecture(index, graph, { override, llmConfig, forceRefresh });
        const visualMap = buildVisualProjectMap(index, graph, callGraph, undefined, blueprint);
        const html = renderVisualProjectMapHtml(visualMap, cfg);
        const warnNodes = visualMap.nodes.filter((n) => n.healthTips.some((t) => t.level === 'warn'));
        const text = [
          `CodeSight Map · ${map.repoName} [${blueprint.archetypeLabel} · ${blueprint.source}] (${map.totalFiles} files, ${map.totalSymbols} AST symbols, ${map.scanMs}ms)`,
          `Architecture: ${blueprint.projectHeadline}`,
          ...blueprint.zones.map(
            (z) => `- [${z.badge}] ${z.title}: ${z.groups.map((g) => `${g.title}(${g.files.length})`).join(', ')}`
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
          text,
          title: `CodeSight Map (${map.repoName})`,
          repoName: map.repoName,
          html,
          warnFilesCount: warnNodes.length,
          structured: { map, blueprint, visualMap },
        };
      },
    },
    {
      name: 'codesight_ask',
      description:
        'Locate relevant code files using hybrid GraphRAG (BM25 + Bilingual Vector + 1-hop Dependency Graph RRF) with ~97% token compression.',
      parameters: {
        question: { type: 'string', required: true, description: 'Natural language question (Chinese or English) or concept.' },
        repoDir: { type: 'string', description: 'Repository root path (defaults to cwd).' },
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [{ type: 'text', text: value.text }],
      },
      async execute(args, exec) {
        const repoDir = resolveDir(args, exec);
        const question = String(args.question ?? '').trim();
        const res = await askRepository(repoDir, question);
        const text = [
          `CodeSight Ask · "${res.question}" (${res.retrievalMs}ms | saved ${res.savedPercent}% tokens: ${res.retrievedSliceTokens}/${res.wholeRepoTokens})`,
          ...res.hits.map(
            (h, i) =>
              `${i + 1}. ${h.file.path} (${h.file.roleLabel}, RRF ${h.totalScore}) — ${h.file.summary} [${h.matchReasons.join('; ')}]`
          ),
        ].join('\n');
        return { text, title: `CodeSight Ask`, repoName: res.repoName, structured: res };
      },
    },
    {
      name: 'codesight_trace',
      description: 'Trace cross-file AST callers and callees of any function, React component, class, or type before editing.',
      parameters: {
        symbol: { type: 'string', required: true, description: 'Exact or partial symbol name to trace.' },
        repoDir: { type: 'string', description: 'Repository root path (defaults to cwd).' },
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [{ type: 'text', text: value.text }],
        presentationMeta: (_args, value) => toMeta('codesight_trace', value),
      },
      async execute(args, exec) {
        const repoDir = resolveDir(args, exec);
        const symbol = String(args.symbol ?? '').trim();
        const trace = await traceSymbol(repoDir, symbol);
        const html = renderTraceCardHtml(trace);
        const text =
          trace.matches.length === 0
            ? `No AST symbol matching "${symbol}" found in ${trace.repoName}.`
            : trace.matches
                .map(
                  (m) =>
                    `${m.symbol.name} [${m.symbol.kind}] @ ${m.symbol.file}:${m.symbol.startLine}-${m.symbol.endLine}\n` +
                    `  Called by (${m.calledBy.length}): ${m.calledBy.map((e) => `${e.callerName} (${e.callerFile}:${e.callerLine})`).join(', ') || 'none'}`
                )
                .join('\n\n');
        return { text, title: `CodeSight Trace (${symbol})`, repoName: trace.repoName, html, structured: trace };
      },
    },
    {
      name: 'codesight_diagnose',
      description:
        'Project a terminal error stack trace and/or uncommitted git diff onto the AST dependency graph. Computes Blast Radius, Safe Zones, 0-token Silent Regressions, and Fix Directions.',
      parameters: {
        rawError: { type: 'string', description: 'Raw compiler or runtime error stack trace.' },
        useGit: { type: 'boolean', description: 'Inspect uncommitted git diff inside repoDir.' },
        repoDir: { type: 'string', description: 'Repository root path (defaults to cwd).' },
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [{ type: 'text', text: value.text }],
        presentationMeta: (_args, value) => toMeta('codesight_diagnose', value),
      },
      async execute(args, exec) {
        const repoDir = resolveDir(args, exec);
        const cfg = loadCodeSightConfig(repoDir);
        const rawError = typeof args.rawError === 'string' ? args.rawError : '';
        const rawDiff = Boolean(args.useGit) ? safeGitDiff(repoDir).diff : '';
        const llmConfig = toActiveLLMConfig(cfg);
        const { index, graph, callGraph } = await generateRepoMap(repoDir);
        const blueprint = await resolveProjectArchitecture(index, graph, {
          llmConfig: cfg.architectureMode === 'heuristic' ? undefined : llmConfig,
        });
        const report = await projectProblemOntoRepo(repoDir, { rawError, rawDiff }, { llmConfig });
        const visualMap = buildVisualProjectMap(index, graph, callGraph, report, blueprint);
        const html = renderVisualProjectMapHtml(visualMap, cfg);
        const lines = [
          `CodeSight Diagnose · ${report.repoName} (saved ${report.tokenEconomy.savedPercent}% tokens, ${report.tokenEconomy.retrievalMs}ms)`,
          `Diagnosis: ${report.plainDiagnosis}`,
          ...(report.blastRadius
            ? [
                `Blast Radius [${report.blastRadius.riskLevel}]: direct=${report.blastRadius.directImpact.length}, indirect=${report.blastRadius.indirectImpact.length}, safeZone=${report.blastRadius.safeZoneCount} files`,
              ]
            : []),
          ...(report.silentRegressions.length > 0
            ? [
                `Silent Regressions (${report.silentRegressions.length}): ` +
                  report.silentRegressions.map((r) => `[${r.patternTag}] ${r.file}: ${r.title}`).join(' | '),
              ]
            : []),
        ];
        return {
          text: lines.join('\n'),
          title: `CodeSight Diagnose (${report.repoName})`,
          repoName: report.repoName,
          html,
          structured: report,
        };
      },
    },
    {
      name: 'codesight_settings',
      description: 'View, update, or reset unified CodeSight settings (~/.codesight/config.json).',
      parameters: {
        action: { type: 'string', description: 'get | set | reset (default: get)' },
        language: { type: 'string', description: 'zh | en' },
        dashedLines: { type: 'string', description: 'always | hover' },
        collapsedByDefault: { type: 'boolean' },
        silentRegressionGuard: { type: 'boolean' },
        architectureMode: { type: 'string', description: 'auto | heuristic | llm' },
        llm: { type: 'object' },
        repoDir: { type: 'string' },
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [{ type: 'text', text: value.text }],
        presentationMeta: (_args, value) => toMeta('codesight_settings', value),
      },
      async execute(args, exec) {
        const repoDir = resolveDir(args, exec);
        const action = typeof args.action === 'string' ? args.action : 'get';
        let cfg;
        if (action === 'reset') {
          cfg = resetCodeSightConfig();
        } else if (action === 'set') {
          const patch: CodeSightConfigPatch = {};
          if (args.language === 'zh' || args.language === 'en') patch.language = args.language;
          if (args.dashedLines === 'always' || args.dashedLines === 'hover') patch.dashedLines = args.dashedLines;
          if (typeof args.collapsedByDefault === 'boolean') patch.collapsedByDefault = args.collapsedByDefault;
          if (typeof args.silentRegressionGuard === 'boolean') patch.silentRegressionGuard = args.silentRegressionGuard;
          if (args.architectureMode === 'auto' || args.architectureMode === 'heuristic' || args.architectureMode === 'llm') {
            patch.architectureMode = args.architectureMode;
          }
          if (args.llm && typeof args.llm === 'object') patch.llm = args.llm as CodeSightConfigPatch['llm'];
          cfg = saveCodeSightConfig(patch);
        } else {
          cfg = loadCodeSightConfig(repoDir);
        }
        const masked = maskConfigForDisplay(cfg);
        const configPath = getGlobalConfigPath();
        const html = renderSettingsCardHtml(cfg, configPath);
        const text = `CodeSight Settings (${configPath}): language=${masked.language}, dashedLines=${masked.dashedLines}, guard=${masked.silentRegressionGuard}, arch=${masked.architectureMode}`;
        return { text, title: 'CodeSight Settings', html, structured: { configPath, config: masked } };
      },
    },
  ];
}

/**
 * Cordis plugin entry point loaded automatically by DeepSeek Harness (`dsh`).
 * Registers all 5 CodeSight tools directly in-process and cleans up cleanly on unload/HMR.
 */
export function apply(ctx: CordisHostContext): Disposer {
  const disposers: Disposer[] = [];
  for (const tool of createCodeSightDshTools()) {
    const dispose = ctx.tools.register(tool);
    if (typeof dispose === 'function') disposers.push(dispose);
  }
  const cleanup: Disposer = () => {
    for (const fn of disposers) fn();
    disposers.length = 0;
  };
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => cleanup, 'codesight: tools');
  }
  return cleanup;
}
