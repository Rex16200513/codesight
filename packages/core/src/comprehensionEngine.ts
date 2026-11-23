import fs from 'node:fs';
import path from 'node:path';
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
  buildOrUpdateRepoIndex,
  type FileLayer,
  type IndexedFileNode,
  type RepoIndex,
} from './repoIndexer.ts';
import { estimateTokens, runStaticAnalysis, type StaticExtractionResult } from './staticAnalyzer.ts';

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
  }>;
}

export interface RepoComprehensionMap {
  repoName: string;
  rootDir: string;
  totalFiles: number;
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
  querySummary: string;
  /** Primary file where the issue originates or manifests */
  primaryTarget?: {
    file: IndexedFileNode;
    line?: number;
    reason: string;
  };
  /** Plain-Chinese 1-paragraph explanation anchored to real file roles */
  plainDiagnosis: string;
  /** Graph-computed exact Blast Radius */
  blastRadius?: BlastRadiusReport;
  /** Hybrid Graph + Embedding top relevant files */
  retrievedContext: RetrievalHit[];
  /** Static silent regression flags found in Git diff (if provided) */
  silentRegressions: StaticExtractionResult['silentRegressions'];
  /** Graph-informed architectural fix directions */
  directions: FixDirection[];
  /** Real token compression proof: whole repo vs retrieved minimal slice */
  tokenEconomy: {
    wholeRepoTokens: number;
    retrievedSliceTokens: number;
    savedPercent: number;
    retrievalMs: number;
    embeddingMode: string;
  };
}

const LAYER_TITLES: Record<FileLayer, string> = {
  entrypoint: '🚪 入口层（程序怎么启动的）',
  'core-logic': '🧠 核心引擎与共享契约（最关键的大脑）',
  'server-api': '🔌 服务与协议桥接（怎么对外通信）',
  'ui-component': '🎨 界面与交互组件（用户看到的画面）',
  'style-asset': '✨ 样式与视觉定义',
  module: '📦 业务辅助模块',
  test: '🧪 自动化测试',
  config: '⚙️ 构建与工程配置',
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
  // Suffix match (e.g. "src/schema.ts" -> "packages/core/src/schema.ts")
  const all = Object.keys(index.files);
  const exactSuffix = all.find((p) => p.endsWith(`/${norm}`) || p === norm);
  if (exactSuffix) return exactSuffix;
  const base = path.posix.basename(norm);
  return all.find((p) => path.posix.basename(p) === base);
}

function readCodeSlice(rootDir: string, relPath: string, centerLine?: number, radius = 15): string {
  try {
    const content = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
    const lines = content.split('\n');
    if (!centerLine) {
      return lines.slice(0, Math.min(35, lines.length)).join('\n');
    }
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

/**
 * 1. Build a 10-second Human Comprehension Map of ANY local repository
 *    using incremental structured scanning + Graph centrality + Embedding indexing.
 */
export async function generateRepoMap(
  rootDir: string,
  options?: { persistCache?: boolean; embeddingConfig?: EmbeddingProviderConfig }
): Promise<{
  map: RepoComprehensionMap;
  index: RepoIndex;
  graph: CodeDependencyGraph;
}> {
  const index = buildOrUpdateRepoIndex(rootDir, { persistCache: options?.persistCache ?? true });
  const embedMeta = await ensureEmbeddings(index, options?.embeddingConfig);
  const graph = buildCodeGraph(index);

  // Persist updated embeddings into .glassbox/index.json
  if (options?.persistCache ?? true) {
    try {
      const cachePath = path.join(index.rootDir, '.glassbox', 'index.json');
      fs.writeFileSync(cachePath, JSON.stringify(index, null, 2), 'utf8');
    } catch {
      // ignore read-only fs
    }
  }

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
    });
    byLayer.set(node.layer, bucket);
  }

  const sections: RepoMapSection[] = [];
  for (const layer of LAYER_ORDER) {
    const files = byLayer.get(layer);
    if (!files || files.length === 0) continue;
    files.sort((a, b) => b.downstreamReach - a.downstreamReach || a.path.localeCompare(b.path));
    sections.push({
      layer,
      layerTitle: LAYER_TITLES[layer],
      files,
    });
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
      totalFiles: index.stats.totalFiles,
      reindexedFiles: index.stats.reindexedFiles,
      cachedFiles: index.stats.cachedFiles,
      scanMs: index.stats.scanMs,
      embeddingMode: embedMeta.mode,
      hubs,
      sections,
    },
    index,
    graph,
  };
}

/**
 * 2. Natural-language or Symbol Codebase Q&A powered by Hybrid Graph + Embedding Retrieval
 */
export async function askRepository(
  rootDir: string,
  question: string,
  options?: { topK?: number; embeddingConfig?: EmbeddingProviderConfig }
): Promise<{
  repoName: string;
  question: string;
  hits: RetrievalHit[];
  primaryBlastRadius?: BlastRadiusReport;
  retrievalMs: number;
  wholeRepoTokens: number;
  retrievedSliceTokens: number;
  savedPercent: number;
}> {
  const startedAt = Date.now();
  const { index, graph } = await generateRepoMap(rootDir, {
    embeddingConfig: options?.embeddingConfig,
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
  const retrievedSliceTokens = hits.reduce(
    (sum, h) => sum + estimateTokens(readCodeSlice(index.rootDir, h.file.path)),
    0
  );
  const savedPercent =
    wholeRepoTokens > 0
      ? Math.max(0, Number((((wholeRepoTokens - retrievedSliceTokens) / wholeRepoTokens) * 100).toFixed(1)))
      : 0;

  return {
    repoName: index.repoName,
    question,
    hits,
    primaryBlastRadius,
    retrievalMs: Math.max(1, Date.now() - startedAt),
    wholeRepoTokens,
    retrievedSliceTokens,
    savedPercent,
  };
}

/**
 * 3. Problem Projection Engine:
 *    Projects a real error, stack trace, git diff, or problem description onto the real Repo Graph,
 *    revealing: what file role broke, exact blast radius, unaffected safe zones, and concrete AI fix directions.
 */
export async function projectProblemOntoRepo(
  rootDir: string,
  input: { rawError?: string; rawDiff?: string; question?: string },
  options?: { embeddingConfig?: EmbeddingProviderConfig }
): Promise<ProblemProjectionReport> {
  const startedAt = Date.now();
  const { map, index, graph } = await generateRepoMap(rootDir, {
    embeddingConfig: options?.embeddingConfig,
  });

  const staticRes = runStaticAnalysis({
    rawError: input.rawError,
    rawDiff: input.rawDiff,
  });

  // Resolve exact seed files mentioned in error or diff
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
  const blastRadius = primaryPath ? computeBlastRadius(index, graph, primaryPath) ?? undefined : undefined;

  // Build plain-Chinese diagnosis anchored to real file roles & blast radius
  let plainDiagnosis = '';
  if (primaryNode && blastRadius) {
    const impactCount = blastRadius.directImpact.length + blastRadius.indirectImpact.length;
    const roleDesc = `「${primaryNode.roleLabel}」(${primaryNode.path})`;
    if (staticRes.typeMismatch) {
      plainDiagnosis = `问题出在 ${roleDesc}：它期望的数据形状是 \`${staticRes.typeMismatch.expected}\`，但实际收到了 \`${staticRes.typeMismatch.actual}\`。${
        impactCount > 0
          ? `因为它是被 ${impactCount} 个上游/下游文件依赖的节点，修改它前需要先确认波及面。`
          : `好消息是它处于调用链末端（0 个其他文件依赖它），可以放心局部修复。`
      }`;
    } else if (staticRes.silentRegressions.length > 0) {
      plainDiagnosis = `在 ${roleDesc} 的代码变更中，静态规则拦截到 ${staticRes.silentRegressions.length} 处静默风险（如删守卫、空 catch 或类型绕过）。表面上可能不报错，但已经改变了原有安全/业务行为。`;
    } else if (staticRes.cleanedErrorLines.length > 0) {
      plainDiagnosis = `报错锚定在 ${roleDesc}${primaryLine ? ` 第 ${primaryLine} 行` : ''}（职责：${primaryNode.summary}）。它依赖 ${blastRadius.upstreamDependencies.length} 个内部文件，且影响下游 ${impactCount} 个文件；其余 ${blastRadius.safeZoneCount} 个文件完全不受波及。`;
    } else {
      plainDiagnosis = `通过 Graph + Embedding 混合检索，最相关的核心位置是 ${roleDesc}（职责：${primaryNode.summary}）。`;
    }
  } else {
    plainDiagnosis = '暂未在当前仓库内匹配到具体源文件，建议提供包含文件名、符号名或具体报错信息的片段。';
  }

  // Generate Graph-informed AI Fix Directions (truly tailored to Hub vs Bridge vs Leaf!)
  const directions: FixDirection[] = [];
  if (primaryNode && blastRadius) {
    const impactCount = blastRadius.directImpact.length + blastRadius.indirectImpact.length;
    const impactListStr = [...blastRadius.directImpact, ...blastRadius.indirectImpact]
      .slice(0, 4)
      .map((f) => f.path)
      .join(', ');

    if (blastRadius.riskLevel === 'high-hub') {
      directions.push({
        id: 'dir-protect-hub',
        label: `方向 A：守住核心枢纽 ${primaryNode.name} 的既有接口，隔离新改动`,
        strategy: `${primaryNode.name} 是高扇入枢纽（波及 ${impactCount} 个文件），保持它原有对外契约不变，把新需求做成可选字段或独立适配函数。`,
        affectedFilesCount: 1,
        tradeoff: '风险最低、10 秒止血，不会引发连锁报错',
        recommended: true,
        surgicalPrompt: `[GlassBox Direction: Protect Hub]\nKeep the existing exported contract of \`${primaryNode.path}\` intact (it has ${impactCount} downstream dependents: ${impactListStr}). Isolate the new requirement via an additive/optional field or adapter instead of breaking existing callers. Do NOT use \`as any\` or empty \`catch\`.`,
      });
      directions.push({
        id: 'dir-cascade-upgrade',
        label: `方向 B：确认要改核心协议，让 AI 一次性同步升级全部 ${impactCount + 1} 个文件`,
        strategy: `修改 ${primaryNode.path} 的同时，明确要求 AI 按依赖图逐一更新：${impactListStr || '全部下游调用方'}。`,
        affectedFilesCount: impactCount + 1,
        tradeoff: '改动面较大，但架构长期最干净；必须跑全量 typecheck 验证',
        surgicalPrompt: `[GlassBox Direction: Coordinated Hub Migration]\nUpdate \`${primaryNode.path}\`${primaryLine ? ` (line ${primaryLine})` : ''} AND synchronously update all ${impactCount} impacted downstream files (${impactListStr}). Run typecheck and tests to verify zero broken call sites.`,
      });
    } else if (blastRadius.riskLevel === 'medium-bridge') {
      directions.push({
        id: 'dir-local-bridge-fix',
        label: `方向 A：在 ${primaryNode.name} 内部修复并校验直接调用方（共 ${blastRadius.directImpact.length + 1} 个文件）`,
        strategy: `修正当前模块的逻辑/契约冲突，并顺手核对直接调用它的 ${blastRadius.directImpact.map((f) => f.name).join('、')}。`,
        affectedFilesCount: blastRadius.directImpact.length + 1,
        tradeoff: '改动可控，直接解决根因',
        recommended: true,
        surgicalPrompt: `[GlassBox Direction: Scoped Bridge Fix]\nFix the issue in \`${primaryNode.path}\`${primaryLine ? ` around line ${primaryLine}` : ''}. Verify compatibility with its direct dependents (${blastRadius.directImpact.map((f) => f.path).join(', ')}). Keep changes minimal and avoid type escape hatches.`,
      });
      if (blastRadius.upstreamDependencies.length > 0) {
        directions.push({
          id: 'dir-trace-upstream',
          label: `方向 B：向上游源头排查（检查 ${blastRadius.upstreamDependencies[0].name} 的输出）`,
          strategy: `不要在 ${primaryNode.name} 打补丁，让 AI 先检查上游依赖 ${blastRadius.upstreamDependencies.map((f) => f.name).join('、')} 是否输出了不符合预期的数据。`,
          affectedFilesCount: 2,
          tradeoff: '更治本，适合“上游刚被 AI 改过导致这里接不住”的情况',
          surgicalPrompt: `[GlassBox Direction: Upstream Root-Cause Fix]\nInspect upstream dependencies of \`${primaryNode.path}\` (${blastRadius.upstreamDependencies.map((f) => f.path).join(', ')}) to fix the contract mismatch at its source rather than adding a fragile workaround downstream.`,
        });
      }
    } else {
      directions.push({
        id: 'dir-safe-leaf-fix',
        label: `方向 A：安心局部修复 ${primaryNode.name}（零连锁风险）`,
        strategy: `该文件是末梢节点（0 个其他文件依赖它），让 AI 直接在当前文件内修复即可，不会弄坏其他模块。`,
        affectedFilesCount: 1,
        tradeoff: '爆炸半径为 0，可以放心快速修改',
        recommended: true,
        surgicalPrompt: `[GlassBox Direction: Safe Leaf Fix]\nFix the error inside leaf file \`${primaryNode.path}\`${primaryLine ? ` near line ${primaryLine}` : ''}. No other files depend on it, so keep the fix self-contained without touching shared core modules or suppressing errors.`,
      });
      if (blastRadius.upstreamDependencies.length > 0) {
        directions.push({
          id: 'dir-check-upstream-leaf',
          label: `方向 B：确认上游依赖契约（${blastRadius.upstreamDependencies.slice(0, 2).map((u) => u.name).join(' / ')}）`,
          strategy: `如果这里报错是因为上游数据格式变了，让 AI 按上游最新契约同步适配本文件。`,
          affectedFilesCount: 1,
          tradeoff: '保持本文件与核心模块同步',
          surgicalPrompt: `[GlassBox Direction: Align With Upstream]\nAlign \`${primaryNode.path}\` with the latest exported types/behavior from ${blastRadius.upstreamDependencies.slice(0, 3).map((u) => `\`${u.path}\``).join(', ')}.`,
        });
      }
    }
  }

  // Real Token Economy: compare sending the whole repo vs only our Graph+Embedding minimal slice
  const wholeRepoTokens = Object.values(index.files).reduce(
    (sum, f) => sum + Math.ceil(f.sizeBytes / 3.8),
    0
  );
  const retrievedSliceTokens =
    retrievedContext.slice(0, 3).reduce(
      (sum, h, i) => sum + estimateTokens(readCodeSlice(index.rootDir, h.file.path, i === 0 ? primaryLine : undefined)),
      0
    ) + estimateTokens(staticRes.cleanedErrorLines.slice(0, 8).join('\n'));

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

  return {
    repoName: index.repoName,
    rootDir: index.rootDir,
    querySummary: combinedQuery.slice(0, 140) || '(Git Diff / Project Scan)',
    primaryTarget: primaryNode
      ? {
          file: primaryNode,
          line: primaryLine,
          reason:
            retrievedContext.find((h) => h.file.path === primaryNode.path)?.matchReasons.join('；') ||
            '直接命中报错源头',
        }
      : undefined,
    plainDiagnosis,
    blastRadius,
    retrievedContext,
    silentRegressions: staticRes.silentRegressions,
    directions,
    tokenEconomy: {
      wholeRepoTokens,
      retrievedSliceTokens,
      savedPercent,
      retrievalMs: Math.max(1, Date.now() - startedAt),
      embeddingMode: map.embeddingMode,
    },
  };
}
