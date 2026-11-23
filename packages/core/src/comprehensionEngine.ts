import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ParsedSymbol } from './astParser.ts';
import {
  buildCodeGraph,
  computeBlastRadius,
  type BlastRadiusReport,
  type CodeDependencyGraph,
} from './codeGraph.ts';
import {
  ensureEmbeddings,
  hybridRetrieve,
  type EmbeddingProviderConfig,
  type RetrievalHit,
} from './embeddingIndex.ts';
import {
  buildSymbolCallGraph,
  type ExternalGraphHint,
  type GraphProvider,
  type GraphSnapshot,
  type SymbolCallEdge,
  type SymbolCallGraph,
} from './graphProvider.ts';
import { McpEnrichedGraphProvider, type McpGraphProviderConfig } from './mcpGraphProvider.ts';
import {
  buildOrUpdateRepoIndex,
  type FileLayer,
  type IndexedFileNode,
  type RepoIndex,
} from './repoIndexer.ts';
import type { LLMConfig } from './schema.ts';
import { estimateTokens, runStaticAnalysis, type StaticExtractionResult } from './staticAnalyzer.ts';

/**
 * Safe, TCC-friendly `git diff` helper:
 * - Verifies `.git` exists directly inside `rootDir` (never traverses up to ~ or Desktop/Documents)
 * - Disables global/system git config probing (`GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`)
 * - Sets `GIT_CEILING_DIRECTORIES` to parent directory
 */
export function safeGitDiff(rootDir: string): { ok: boolean; diff: string; reason?: string } {
  const absRoot = path.resolve(rootDir);
  if (!fs.existsSync(path.join(absRoot, '.git'))) {
    return {
      ok: false,
      diff: '',
      reason: '当前目录尚未初始化 Git 仓库（未找到 .git）',
    };
  }

  try {
    const diff = execFileSync('git', ['diff', '--no-ext-diff', '--no-color'], {
      cwd: absRoot,
      encoding: 'utf8',
      timeout: 5000,
      env: {
        PATH: process.env.PATH || '/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin',
        HOME: process.env.HOME || '',
        GIT_CEILING_DIRECTORIES: path.dirname(absRoot),
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
      },
    });
    return { ok: true, diff };
  } catch (err) {
    return {
      ok: false,
      diff: '',
      reason: err instanceof Error ? err.message : 'git diff 执行失败',
    };
  }
}

/**
 * Optional BYOK Lightweight LLM Synthesis:
 * Receives ONLY the GraphRAG-pruned minimal code slices (~500-900 tokens)
 * and synthesizes a clear, business-oriented Chinese explanation.
 */
async function synthesizeWithBYOK(
  systemPrompt: string,
  userPrompt: string,
  llmConfig?: LLMConfig
): Promise<{ text: string; promptTokens: number; completionTokens: number } | null> {
  if (!llmConfig?.enabled || !llmConfig.baseUrl || !llmConfig.model) {
    return null;
  }

  const endpoint = `${llmConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (llmConfig.apiKey.trim()) {
    headers['Authorization'] = `Bearer ${llmConfig.apiKey.trim()}`;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: llmConfig.model,
      temperature: 0.2,
      max_tokens: 420,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`LLM HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) return null;

  return {
    text,
    promptTokens: data.usage?.prompt_tokens ?? estimateTokens(userPrompt),
    completionTokens: data.usage?.completion_tokens ?? estimateTokens(text),
  };
}

export class BuiltInAstGraphProvider implements GraphProvider {
  readonly name = 'builtin-ast-graphrag';

  async buildSnapshot(
    rootDir: string,
    options?: { persistCache?: boolean; embeddingConfig?: EmbeddingProviderConfig }
  ): Promise<GraphSnapshot> {
    const index = buildOrUpdateRepoIndex(rootDir, { persistCache: options?.persistCache ?? true });
    const embedMeta = await ensureEmbeddings(index, options?.embeddingConfig);
    const fileGraph = buildCodeGraph(index);
    const callGraph = buildSymbolCallGraph(index);

    if (options?.persistCache ?? true) {
      try {
        const cachePath = path.join(index.rootDir, '.codesight', 'index.json');
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        fs.writeFileSync(cachePath, JSON.stringify(index, null, 2), 'utf8');
      } catch {
        // ignore read-only fs
      }
    }

    return {
      providerName: this.name,
      index,
      fileGraph,
      callGraph,
      embeddingMode: embedMeta.mode,
    };
  }
}

export function createGraphProvider(mcpConfig?: McpGraphProviderConfig): GraphProvider {
  const base = new BuiltInAstGraphProvider();
  if (mcpConfig?.command) {
    return new McpEnrichedGraphProvider(base, mcpConfig);
  }
  return base;
}

export interface RepoMapSection {
  layer: FileLayer;
  layerTitle: string;
  files: Array<{
    path: string;
    name: string;
    roleLabel: string;
    summary: string;
    inDegree: number;
    outDegree: number;
    downstreamReach: number;
    isHub: boolean;
    exports: string[];
    symbolCount: number;
  }>;
}

export interface RepoComprehensionMap {
  repoName: string;
  rootDir: string;
  providerName: string;
  totalFiles: number;
  totalSymbols: number;
  reindexedFiles: number;
  cachedFiles: number;
  scanMs: number;
  embeddingMode: string;
  hubs: Array<{
    path: string;
    roleLabel: string;
    summary: string;
    downstreamReach: number;
  }>;
  sections: RepoMapSection[];
}

export interface SymbolTraceReport {
  repoName: string;
  querySymbol: string;
  matches: Array<{
    symbol: ParsedSymbol;
    fileRole: string;
    calledBy: SymbolCallEdge[];
    callsOut: SymbolCallEdge[];
  }>;
  externalHint?: ExternalGraphHint | null;
  traceMs: number;
}

export interface FixDirection {
  id: string;
  label: string;
  strategy: string;
  affectedFilesCount: number;
  tradeoff: string;
  recommended?: boolean;
  surgicalPrompt: string;
}

export interface ProblemProjectionReport {
  repoName: string;
  rootDir: string;
  providerName: string;
  querySummary: string;
  primaryTarget?: {
    file: IndexedFileNode;
    line?: number;
    symbol?: ParsedSymbol;
    reason: string;
  };
  plainDiagnosis: string;
  aiSummary?: string;
  blastRadius?: BlastRadiusReport;
  symbolCallers: SymbolCallEdge[];
  externalGraphHint?: ExternalGraphHint | null;
  retrievedContext: RetrievalHit[];
  silentRegressions: StaticExtractionResult['silentRegressions'];
  directions: FixDirection[];
  tokenEconomy: {
    wholeRepoTokens: number;
    retrievedSliceTokens: number;
    savedPercent: number;
    retrievalMs: number;
    embeddingMode: string;
    llmUsed?: boolean;
    llmModel?: string;
  };
}

/** Plain, jargon-free Chinese layer titles everyone understands */
const LAYER_TITLES: Record<FileLayer, string> = {
  entrypoint: '程序入口',
  'core-logic': '核心逻辑与数据格式',
  'server-api': '本地服务与插件接口',
  'ui-component': '页面与界面组件',
  'style-asset': '界面样式',
  module: '功能模块',
  test: '测试文件',
  config: '项目配置',
};

const LAYER_ORDER: FileLayer[] = [
  'core-logic',
  'server-api',
  'ui-component',
  'entrypoint',
  'module',
  'style-asset',
  'test',
  'config',
];

function matchParsedPathToRepoFile(rawFile: string, index: RepoIndex): string | undefined {
  const norm = rawFile.replace(/\\/g, '/').replace(/^\.\//, '');
  if (index.files[norm]) return norm;
  const all = Object.keys(index.files);
  const exactSuffix = all.find((p) => p.endsWith(`/${norm}`) || p === norm);
  if (exactSuffix) return exactSuffix;
  const base = path.posix.basename(norm);
  return all.find((p) => path.posix.basename(p) === base);
}

function findSymbolAtLine(fileNode: IndexedFileNode, line?: number): ParsedSymbol | undefined {
  if (!line || !fileNode.symbols?.length) return undefined;
  return fileNode.symbols.find((s) => line >= s.startLine && line <= s.endLine);
}

function readCodeSlice(rootDir: string, relPath: string, centerLine?: number, radius = 15): string {
  try {
    const content = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
    const lines = content.split('\n');
    if (!centerLine) return lines.slice(0, Math.min(35, lines.length)).join('\n');
    const start = Math.max(0, centerLine - radius - 1);
    const end = Math.min(lines.length, centerLine + radius);
    return lines
      .slice(start, end)
      .map((l, idx) => `${start + idx + 1}: ${l}`)
      .join('\n');
  } catch {
    return '';
  }
}

export async function generateRepoMap(
  rootDir: string,
  options?: {
    persistCache?: boolean;
    embeddingConfig?: EmbeddingProviderConfig;
    provider?: GraphProvider;
    mcpConfig?: McpGraphProviderConfig;
  }
): Promise<{
  map: RepoComprehensionMap;
  index: RepoIndex;
  graph: CodeDependencyGraph;
  callGraph: SymbolCallGraph;
  snapshot: GraphSnapshot;
}> {
  const provider = options?.provider ?? createGraphProvider(options?.mcpConfig);
  const snapshot = await provider.buildSnapshot(rootDir, {
    persistCache: options?.persistCache ?? true,
    embeddingConfig: options?.embeddingConfig,
  });

  const { index, fileGraph: graph, callGraph } = snapshot;

  const byLayer = new Map<FileLayer, RepoMapSection['files']>();
  for (const node of Object.values(index.files)) {
    const m = graph.nodes[node.path];
    const bucket = byLayer.get(node.layer) ?? [];
    bucket.push({
      path: node.path,
      name: node.name,
      roleLabel: node.roleLabel,
      summary: node.summary,
      inDegree: m.inDegree,
      outDegree: m.outDegree,
      downstreamReach: m.totalDownstreamReach,
      isHub: m.isHub,
      exports: node.exports.slice(0, 5),
      symbolCount: node.symbols?.length ?? 0,
    });
    byLayer.set(node.layer, bucket);
  }

  const sections: RepoMapSection[] = [];
  for (const layer of LAYER_ORDER) {
    const files = byLayer.get(layer);
    if (!files || files.length === 0) continue;
    files.sort((a, b) => b.downstreamReach - a.downstreamReach || a.path.localeCompare(b.path));
    sections.push({ layer, layerTitle: LAYER_TITLES[layer], files });
  }

  const hubs = graph.hubs.slice(0, 5).map((h) => ({
    path: h.path,
    roleLabel: index.files[h.path].roleLabel,
    summary: index.files[h.path].summary,
    downstreamReach: h.totalDownstreamReach,
  }));

  return {
    map: {
      repoName: index.repoName,
      rootDir: index.rootDir,
      providerName: snapshot.providerName,
      totalFiles: index.stats.totalFiles,
      totalSymbols: index.stats.totalSymbols,
      reindexedFiles: index.stats.reindexedFiles,
      cachedFiles: index.stats.cachedFiles,
      scanMs: index.stats.scanMs,
      embeddingMode: snapshot.embeddingMode,
      hubs,
      sections,
    },
    index,
    graph,
    callGraph,
    snapshot,
  };
}

export async function traceSymbol(
  rootDir: string,
  symbolQuery: string,
  options?: { provider?: GraphProvider; mcpConfig?: McpGraphProviderConfig }
): Promise<SymbolTraceReport> {
  const startedAt = Date.now();
  const provider = options?.provider ?? createGraphProvider(options?.mcpConfig);
  const { index, callGraph } = await generateRepoMap(rootDir, { provider });

  const q = symbolQuery.toLowerCase();
  const matchedSymbols = Object.values(callGraph.symbolsById)
    .filter((s) => s.name.toLowerCase() === q || s.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const aExact = a.name.toLowerCase() === q ? 1 : 0;
      const bExact = b.name.toLowerCase() === q ? 1 : 0;
      return bExact - aExact || (callGraph.incoming[b.id]?.length ?? 0) - (callGraph.incoming[a.id]?.length ?? 0);
    })
    .slice(0, 5);

  const externalHint = provider.queryExternalContext
    ? await provider.queryExternalContext(rootDir, `Trace callers of ${symbolQuery}`, symbolQuery)
    : null;

  return {
    repoName: index.repoName,
    querySymbol: symbolQuery,
    matches: matchedSymbols.map((sym) => ({
      symbol: sym,
      fileRole: index.files[sym.file]?.roleLabel ?? '模块',
      calledBy: callGraph.incoming[sym.id] ?? [],
      callsOut: callGraph.outgoing[sym.id] ?? [],
    })),
    externalHint,
    traceMs: Math.max(1, Date.now() - startedAt),
  };
}

export async function askRepository(
  rootDir: string,
  question: string,
  options?: {
    topK?: number;
    embeddingConfig?: EmbeddingProviderConfig;
    llmConfig?: LLMConfig;
    provider?: GraphProvider;
    mcpConfig?: McpGraphProviderConfig;
  }
): Promise<{
  repoName: string;
  question: string;
  aiAnswer?: string;
  llmUsed: boolean;
  llmModel?: string;
  hits: RetrievalHit[];
  primaryBlastRadius?: BlastRadiusReport;
  retrievalMs: number;
  wholeRepoTokens: number;
  retrievedSliceTokens: number;
  savedPercent: number;
  embeddingMode: string;
}> {
  const startedAt = Date.now();
  const { map, index, graph } = await generateRepoMap(rootDir, {
    embeddingConfig: options?.embeddingConfig,
    provider: options?.provider,
    mcpConfig: options?.mcpConfig,
  });

  const hits = await hybridRetrieve(index, graph, question, {
    topK: options?.topK ?? 5,
    embeddingConfig: options?.embeddingConfig,
  });

  const primaryBlastRadius = hits[0]
    ? computeBlastRadius(index, graph, hits[0].file.path) ?? undefined
    : undefined;

  const wholeRepoTokens = Object.values(index.files).reduce(
    (sum, f) => sum + Math.ceil(f.sizeBytes / 3.8),
    0
  );

  const topSlices = hits.slice(0, 3).map((h) => ({
    path: h.file.path,
    role: h.file.roleLabel,
    slice: readCodeSlice(index.rootDir, h.file.path),
  }));

  const retrievedSliceTokens = topSlices.reduce((sum, s) => sum + estimateTokens(s.slice), 0);
  const savedPercent =
    wholeRepoTokens > 0
      ? Math.max(0, Number((((wholeRepoTokens - retrievedSliceTokens) / wholeRepoTokens) * 100).toFixed(1)))
      : 0;

  let aiAnswer: string | undefined;
  let llmUsed = false;
  if (options?.llmConfig?.enabled && topSlices.length > 0) {
    try {
      const prompt = [
        `用户问题：${question}`,
        `已通过本地 GraphRAG 精准剪枝出最相关的 ${topSlices.length} 个代码切片：`,
        ...topSlices.map((s) => `### ${s.path} (${s.role})\n${s.slice}`),
      ].join('\n\n');

      const synth = await synthesizeWithBYOK(
        '你是 CodeSight 代码理解助手。请用极简、清晰、像资深同事面授一样的中文（不超过 160 字），直接回答用户的问题：逻辑在哪个文件、怎么流转、修改时需要注意什么。不要输出 Markdown 标题，不要使用 Emoji。',
        prompt,
        options.llmConfig
      );
      if (synth) {
        aiAnswer = synth.text;
        llmUsed = true;
      }
    } catch {
      // Graceful fallback to local-only retrieval
    }
  }

  return {
    repoName: index.repoName,
    question,
    aiAnswer,
    llmUsed,
    llmModel: llmUsed ? options?.llmConfig?.model : undefined,
    hits,
    primaryBlastRadius,
    retrievalMs: Math.max(1, Date.now() - startedAt),
    wholeRepoTokens,
    retrievedSliceTokens,
    savedPercent,
    embeddingMode: map.embeddingMode,
  };
}

export async function projectProblemOntoRepo(
  rootDir: string,
  input: { rawError?: string; rawDiff?: string; question?: string },
  options?: {
    embeddingConfig?: EmbeddingProviderConfig;
    llmConfig?: LLMConfig;
    provider?: GraphProvider;
    mcpConfig?: McpGraphProviderConfig;
  }
): Promise<ProblemProjectionReport> {
  const startedAt = Date.now();
  const provider = options?.provider ?? createGraphProvider(options?.mcpConfig);
  const { map, index, graph, callGraph } = await generateRepoMap(rootDir, {
    embeddingConfig: options?.embeddingConfig,
    provider,
  });

  const staticRes = runStaticAnalysis({
    rawError: input.rawError,
    rawDiff: input.rawDiff,
  });

  const seedFiles: string[] = [];
  let primaryLine: number | undefined;

  for (const loc of staticRes.parsedLocations) {
    const matched = matchParsedPathToRepoFile(loc.file, index);
    if (matched) {
      if (!seedFiles.includes(matched)) seedFiles.push(matched);
      if (primaryLine === undefined && loc.line) primaryLine = loc.line;
    }
  }
  for (const df of staticRes.diffFiles) {
    const matched = matchParsedPathToRepoFile(df.file, index);
    if (matched && !seedFiles.includes(matched)) seedFiles.push(matched);
  }

  const combinedQuery = [
    input.question ?? '',
    staticRes.cleanedErrorLines.slice(0, 6).join(' '),
    staticRes.typeMismatch
      ? `${staticRes.typeMismatch.expected} ${staticRes.typeMismatch.actual} ${staticRes.typeMismatch.symbol ?? ''}`
      : '',
  ]
    .join(' ')
    .trim();

  const retrievedContext = await hybridRetrieve(index, graph, combinedQuery || 'core error', {
    topK: 5,
    seedFiles,
    embeddingConfig: options?.embeddingConfig,
  });

  const primaryPath = seedFiles[0] ?? retrievedContext[0]?.file.path;
  const primaryNode = primaryPath ? index.files[primaryPath] : undefined;
  const primarySymbol = primaryNode ? findSymbolAtLine(primaryNode, primaryLine) : undefined;
  const blastRadius = primaryPath ? computeBlastRadius(index, graph, primaryPath) ?? undefined : undefined;

  let symbolCallers: SymbolCallEdge[] = [];
  if (primarySymbol) {
    symbolCallers = callGraph.incoming[primarySymbol.id] ?? [];
  } else if (primaryNode) {
    const allIncoming: SymbolCallEdge[] = [];
    for (const sym of primaryNode.symbols ?? []) {
      for (const edge of callGraph.incoming[sym.id] ?? []) {
        if (edge.callerFile !== primaryNode.path) allIncoming.push(edge);
      }
    }
    symbolCallers = allIncoming.slice(0, 6);
  }

  const externalGraphHint = provider.queryExternalContext
    ? await provider.queryExternalContext(
        rootDir,
        combinedQuery || primaryPath || '',
        primarySymbol?.name ?? staticRes.typeMismatch?.symbol
      )
    : null;

  let plainDiagnosis = '';
  if (primaryNode && blastRadius) {
    const impactCount = blastRadius.directImpact.length + blastRadius.indirectImpact.length;
    const fnPart = primarySymbol ? ` 的 ${primarySymbol.name} 函数` : '';
    const whereDesc = `${primaryNode.name}${fnPart}（负责：${primaryNode.roleLabel}）`;

    if (staticRes.typeMismatch) {
      const isNullish = staticRes.typeMismatch.actual === 'undefined' || staticRes.typeMismatch.actual === 'null';
      const problemPhrase = isNullish && staticRes.typeMismatch.symbol
        ? `代码想读取 .${staticRes.typeMismatch.symbol}，但拿到的对象是空的（${staticRes.typeMismatch.actual}）`
        : `数据类型对不上：这里需要 ${staticRes.typeMismatch.expected}，但实际传进来的是 ${staticRes.typeMismatch.actual}`;
      plainDiagnosis = `${problemPhrase}。出错位置在 ${whereDesc}。${
        impactCount > 0
          ? `注意：还有 ${impactCount} 个文件直接或间接依赖它，改之前先选好方案。`
          : `好消息：没有其他文件依赖它，直接在这里修很安全。`
      }`;
    } else if (staticRes.silentRegressions.length > 0) {
      plainDiagnosis = `在 ${whereDesc} 的改动中，发现 ${staticRes.silentRegressions.length} 处隐蔽问题（比如删掉了安全检查、吞掉报错或用 any 跳过检查）。虽然程序没报错，但原本的保护逻辑被悄悄改掉了。`;
    } else if (staticRes.cleanedErrorLines.length > 0) {
      plainDiagnosis = `报错出在 ${whereDesc}${primaryLine ? ` 第 ${primaryLine} 行` : ''}。改动它可能影响到 ${impactCount} 个文件，另外 ${blastRadius.safeZoneCount} 个文件完全不受影响。`;
    } else if (!input.rawError && !input.rawDiff) {
      plainDiagnosis = `目前没有发现未提交的代码改动。你可以复制一段终端报错，或者改完代码后再来检查。`;
    } else {
      plainDiagnosis = `最相关的文件是 ${whereDesc}（${primaryNode.summary}）。`;
    }
  } else {
    plainDiagnosis = '目前没有检测到明显的报错或代码改动；你可以粘贴一段报错试试。';
  }

  const directions: FixDirection[] = [];
  if (primaryNode && blastRadius && (input.rawError || input.rawDiff)) {
    const impactCount = blastRadius.directImpact.length + blastRadius.indirectImpact.length;
    const impactListStr = [...blastRadius.directImpact, ...blastRadius.indirectImpact]
      .slice(0, 4)
      .map((f) => f.path)
      .join(', ');

    if (blastRadius.riskLevel === 'high-hub') {
      directions.push({
        id: 'dir-protect-hub',
        label: `只修 ${primaryNode.name} 内部，不动其他文件`,
        strategy: `保持它原有的输入输出不变，避免影响依赖它的 ${impactCount} 个文件，用补空值检查或新增可选字段的方式安全修复。`,
        affectedFilesCount: 1,
        tradeoff: '只改 1 个文件，最稳妥，不会引发连锁报错',
        recommended: true,
        surgicalPrompt: `[CodeSight Fix Plan: Minimal Safe Fix]\nKeep the existing exported signature/contract of \`${primaryNode.path}\`${primarySymbol ? ` (${primarySymbol.name})` : ''} unchanged so none of its ${impactCount} dependent files (${impactListStr}) break. Fix the error safely inside this file without using \`as any\` or empty \`catch\`.`,
      });
      directions.push({
        id: 'dir-cascade-upgrade',
        label: `连同依赖它的 ${impactCount} 个文件一起同步修改`,
        strategy: `如果你确实要改 ${primaryNode.name} 的数据结构或参数，让 AI 按依赖关系把相关的 ${impactCount + 1} 个文件一次改齐。`,
        affectedFilesCount: impactCount + 1,
        tradeoff: '改动文件较多，改完后需要跑一遍检查确认没漏改',
        surgicalPrompt: `[CodeSight Fix Plan: Update File + All Dependents]\nUpdate \`${primaryNode.path}\`${primaryLine ? ` (line ${primaryLine})` : ''} AND synchronously update all ${impactCount} dependent files (${impactListStr}). Run typecheck and tests afterward to make sure nothing breaks.`,
      });
    } else if (blastRadius.riskLevel === 'medium-bridge') {
      directions.push({
        id: 'dir-local-bridge-fix',
        label: `修复 ${primaryNode.name} 并顺手检查调用它的文件`,
        strategy: `修好当前文件的问题，并确认直接用到它的 ${blastRadius.directImpact.map((f) => f.name).join('、')} 仍然正常。`,
        affectedFilesCount: blastRadius.directImpact.length + 1,
        tradeoff: '改动范围小，直接修根因',
        recommended: true,
        surgicalPrompt: `[CodeSight Fix Plan: Fix + Check Callers]\nFix the issue in \`${primaryNode.path}\`${primaryLine ? ` around line ${primaryLine}` : ''}. Verify its direct callers (${blastRadius.directImpact.map((f) => f.path).join(', ')}) continue to work properly. Keep changes minimal.`,
      });
      if (blastRadius.upstreamDependencies.length > 0) {
        directions.push({
          id: 'dir-trace-upstream',
          label: `顺着源头查：看看 ${blastRadius.upstreamDependencies[0].name} 传的数据对不对`,
          strategy: `不要在这里硬补丁，让 AI 先检查上游文件 ${blastRadius.upstreamDependencies.map((f) => f.name).join('、')} 是不是传错了数据。`,
          affectedFilesCount: 2,
          tradeoff: '从源头解决，避免以后再踩坑',
          surgicalPrompt: `[CodeSight Fix Plan: Fix At Data Source]\nInspect upstream files of \`${primaryNode.path}\` (${blastRadius.upstreamDependencies.map((f) => f.path).join(', ')}) and fix the data mismatch at its source instead of patching downstream.`,
        });
      }
    } else {
      directions.push({
        id: 'dir-safe-leaf-fix',
        label: `放心直接修 ${primaryNode.name}（不会影响其他文件）`,
        strategy: `没有其他文件依赖它，让 AI 直接在这里把问题修好即可。`,
        affectedFilesCount: 1,
        tradeoff: '只改这 1 个文件，零连锁风险',
        recommended: true,
        surgicalPrompt: `[CodeSight Fix Plan: Safe Local Fix]\nFix the error inside \`${primaryNode.path}\`${primaryLine ? ` near line ${primaryLine}` : ''}. No other files depend on it, so keep the fix self-contained and clean without suppressing errors.`,
      });
      if (blastRadius.upstreamDependencies.length > 0) {
        directions.push({
          id: 'dir-check-upstream-leaf',
          label: `按 ${blastRadius.upstreamDependencies[0].name} 的最新写法同步改这里`,
          strategy: `如果是上游文件最近改过格式导致这里不匹配，让 AI 对照 ${blastRadius.upstreamDependencies.slice(0, 2).map((u) => u.name).join(' / ')} 更新本文件。`,
          affectedFilesCount: 1,
          tradeoff: '和项目里的公共定义保持一致',
          surgicalPrompt: `[CodeSight Fix Plan: Sync With Upstream]\nUpdate \`${primaryNode.path}\` to match the latest exported types/behavior from ${blastRadius.upstreamDependencies.slice(0, 3).map((u) => `\`${u.path}\``).join(', ')}.`,
        });
      }
    }
  }

  const wholeRepoTokens = Object.values(index.files).reduce(
    (sum, f) => sum + Math.ceil(f.sizeBytes / 3.8),
    0
  );
  const sliceTexts = retrievedContext
    .slice(0, 3)
    .map((h, i) => `### ${h.file.path}\n${readCodeSlice(index.rootDir, h.file.path, i === 0 ? primaryLine : undefined)}`);
  const retrievedSliceTokens =
    sliceTexts.reduce((sum, s) => sum + estimateTokens(s), 0) +
    estimateTokens(staticRes.cleanedErrorLines.slice(0, 8).join('\n'));

  const savedPercent =
    wholeRepoTokens > 0
      ? Math.max(
          0,
          Math.min(
            99.5,
            Number((((wholeRepoTokens - retrievedSliceTokens) / wholeRepoTokens) * 100).toFixed(1))
          )
        )
      : 0;

  let aiSummary: string | undefined;
  let llmUsed = false;
  if (options?.llmConfig?.enabled && (input.rawError || input.rawDiff)) {
    try {
      const synth = await synthesizeWithBYOK(
        '你是 CodeSight 代码排错专家。用 2~3 句克制、准确的中文讲清楚：为什么会出这个错、影响是什么、最推荐怎么修。不要用 Emoji 或 Markdown 标题。',
        `原始报错/变更摘要：\n${staticRes.prunedContextForLLM}\n\nGraphRAG 精准代码切片：\n${sliceTexts.join('\n\n')}`,
        options.llmConfig
      );
      if (synth) {
        aiSummary = synth.text;
        llmUsed = true;
      }
    } catch {
      // fallback smoothly
    }
  }

  return {
    repoName: index.repoName,
    rootDir: index.rootDir,
    providerName: map.providerName,
    querySummary: combinedQuery.slice(0, 140) || '(Git Diff / Project Scan)',
    primaryTarget: primaryNode
      ? {
          file: primaryNode,
          line: primaryLine,
          symbol: primarySymbol,
          reason:
            retrievedContext.find((h) => h.file.path === primaryNode.path)?.matchReasons.join('；') ||
            '直接命中报错源头',
        }
      : undefined,
    plainDiagnosis,
    aiSummary,
    blastRadius,
    symbolCallers,
    externalGraphHint,
    retrievedContext,
    silentRegressions: staticRes.silentRegressions,
    directions,
    tokenEconomy: {
      wholeRepoTokens,
      retrievedSliceTokens,
      savedPercent,
      retrievalMs: Math.max(1, Date.now() - startedAt),
      embeddingMode: map.embeddingMode,
      llmUsed,
      llmModel: llmUsed ? options?.llmConfig?.model : undefined,
    },
  };
}
