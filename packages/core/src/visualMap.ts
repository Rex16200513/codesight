import { buildCodeGraph, type CodeDependencyGraph } from './codeGraph.ts';
import type { ProblemProjectionReport } from './comprehensionEngine.ts';
import { buildSymbolCallGraph, type SymbolCallGraph } from './graphProvider.ts';
import type { FileLayer, IndexedFileNode, RepoIndex } from './repoIndexer.ts';

export interface VisualMapNode {
  id: string;
  name: string;
  path: string;
  laneId: string;
  roleLabel: string;
  summary: string;
  inDegree: number;
  outDegree: number;
  downstreamReach: number;
  isHub: boolean;
  exports: string[];
  /** Direct upstream file paths (what this file depends on) */
  upstreamPaths: string[];
  /** Direct downstream file paths (files that directly import this file) */
  directDownstreamPaths: string[];
  /** All transitive downstream file paths (direct + indirect) */
  allDownstreamPaths: string[];
  /** Cross-file function/component callers for human inspection */
  callers: Array<{ symbol: string; callerName: string; callerFile: string; callerLine: number }>;
  /** Status when an error or git diff is projected onto the map */
  status: 'normal' | 'fault' | 'direct-impact' | 'indirect-impact' | 'upstream';
}

export interface VisualMapEdge {
  from: string;
  to: string;
}

export interface VisualMapLane {
  id: string;
  title: string;
  subtitle: string;
  nodeIds: string[];
}

export interface VisualProjectMapPayload {
  repoName: string;
  totalFiles: number;
  shownFiles: number;
  hiddenSupportFiles: number;
  scanMs: number;
  lanes: VisualMapLane[];
  nodes: VisualMapNode[];
  edges: VisualMapEdge[];
  /** Present when an error or diff is actively projected onto the map */
  activeDiagnosis?: {
    targetNodeId?: string;
    targetLine?: number;
    targetSymbol?: string;
    headline: string;
    subtext: string;
    safeZoneCount: number;
    silentRegressions: Array<{ title: string; riskImpact: string }>;
    directions: Array<{
      id: string;
      label: string;
      strategy: string;
      recommended?: boolean;
      surgicalPrompt: string;
    }>;
    retrievalMs: number;
  };
}

interface LaneDef {
  id: string;
  title: string;
  subtitle: string;
  layers: FileLayer[];
}

const LANE_DEFS: LaneDef[] = [
  {
    id: 'ui-entry',
    title: '界面与入口',
    subtitle: '用户交互与启动层',
    layers: ['entrypoint', 'ui-component'],
  },
  {
    id: 'service-plugin',
    title: '服务与插件',
    subtitle: 'MCP / 网关 / 桥接',
    layers: ['server-api'],
  },
  {
    id: 'core-engine',
    title: '核心逻辑',
    subtitle: '分析、图谱与业务处理',
    layers: ['core-logic', 'module'],
  },
];

function collectTransitiveDownstream(
  startPath: string,
  graph: CodeDependencyGraph
): string[] {
  const visited = new Set<string>();
  const queue = [...(graph.nodes[startPath]?.dependedBy ?? [])];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur) || cur === startPath) continue;
    visited.add(cur);
    for (const next of graph.nodes[cur]?.dependedBy ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }
  return Array.from(visited);
}

/**
 * Builds a clean, anti-spiderweb Visual Architecture Map payload from a real repository index & graph.
 * Designed to power:
 * - Interactive MCP App Cards inside Antigravity / ChatGPT / Claude / Orca
 * - Standalone Web / Native Desktop HUD Canvases
 */
export function buildVisualProjectMap(
  index: RepoIndex,
  fileGraph?: CodeDependencyGraph,
  callGraph?: SymbolCallGraph,
  diagnosis?: ProblemProjectionReport
): VisualProjectMapPayload {
  const graph = fileGraph ?? buildCodeGraph(index);
  const calls = callGraph ?? buildSymbolCallGraph(index);

  const allNodes = Object.values(index.files);
  const supportLayers = new Set<FileLayer>(['test', 'config', 'style-asset']);
  const primaryFiles = allNodes.filter((f) => !supportLayers.has(f.layer));
  const hiddenSupportFiles = allNodes.length - primaryFiles.length;

  // Pick up to 20 most structurally meaningful files (always include diagnosis target + direct impact!)
  const pinnedPaths = new Set<string>();
  if (diagnosis?.primaryTarget?.file.path) pinnedPaths.add(diagnosis.primaryTarget.file.path);
  for (const d of diagnosis?.blastRadius?.directImpact ?? []) pinnedPaths.add(d.path);
  for (const u of diagnosis?.blastRadius?.upstreamDependencies ?? []) pinnedPaths.add(u.path);

  const rankedFiles = [...primaryFiles].sort((a, b) => {
    const aPin = pinnedPaths.has(a.path) ? 1 : 0;
    const bPin = pinnedPaths.has(b.path) ? 1 : 0;
    if (aPin !== bPin) return bPin - aPin;
    const aReach = graph.nodes[a.path]?.totalDownstreamReach ?? 0;
    const bReach = graph.nodes[b.path]?.totalDownstreamReach ?? 0;
    if (aReach !== bReach) return bReach - aReach;
    const aDeg = (graph.nodes[a.path]?.inDegree ?? 0) + (graph.nodes[a.path]?.outDegree ?? 0);
    const bDeg = (graph.nodes[b.path]?.inDegree ?? 0) + (graph.nodes[b.path]?.outDegree ?? 0);
    return bDeg - aDeg || a.path.localeCompare(b.path);
  });

  const selectedFiles = rankedFiles.slice(0, 20);
  const selectedSet = new Set(selectedFiles.map((f) => f.path));

  // Diagnosis highlight sets
  const faultPath = diagnosis?.primaryTarget?.file.path;
  const directSet = new Set((diagnosis?.blastRadius?.directImpact ?? []).map((f) => f.path));
  const indirectSet = new Set((diagnosis?.blastRadius?.indirectImpact ?? []).map((f) => f.path));
  const upstreamSet = new Set((diagnosis?.blastRadius?.upstreamDependencies ?? []).map((f) => f.path));

  const laneBuckets = new Map<string, string[]>();
  for (const l of LANE_DEFS) laneBuckets.set(l.id, []);

  // Also separate "基础共享文件" (core-logic files with outDegree === 0 and high inDegree, e.g. schema.ts) into a clean 4th foundation lane if present
  const foundationIds: string[] = [];

  const visualNodes: VisualMapNode[] = selectedFiles.map((file: IndexedFileNode) => {
    const metrics = graph.nodes[file.path];
    const isFoundation =
      file.layer === 'core-logic' &&
      (metrics?.outDegree ?? 0) === 0 &&
      (metrics?.totalDownstreamReach ?? 0) >= 3;

    let laneId = 'core-engine';
    if (isFoundation) {
      laneId = 'foundation';
      foundationIds.push(file.path);
    } else {
      const matchedLane = LANE_DEFS.find((l) => l.layers.includes(file.layer)) ?? LANE_DEFS[2];
      laneId = matchedLane.id;
      laneBuckets.get(laneId)!.push(file.path);
    }

    // Collect cross-file function callers for this file
    const fileCallers: VisualMapNode['callers'] = [];
    for (const sym of file.symbols ?? []) {
      for (const edge of calls.incoming[sym.id] ?? []) {
        if (edge.callerFile !== file.path) {
          fileCallers.push({
            symbol: sym.name,
            callerName: edge.callerName,
            callerFile: edge.callerFile,
            callerLine: edge.callerLine,
          });
        }
      }
    }

    let status: VisualMapNode['status'] = 'normal';
    if (faultPath === file.path) status = 'fault';
    else if (directSet.has(file.path)) status = 'direct-impact';
    else if (indirectSet.has(file.path)) status = 'indirect-impact';
    else if (upstreamSet.has(file.path)) status = 'upstream';

    return {
      id: file.path,
      name: file.name,
      path: file.path,
      laneId,
      roleLabel: file.roleLabel,
      summary: file.summary,
      inDegree: metrics?.inDegree ?? 0,
      outDegree: metrics?.outDegree ?? 0,
      downstreamReach: metrics?.totalDownstreamReach ?? 0,
      isHub: metrics?.isHub ?? false,
      exports: file.exports.slice(0, 5),
      upstreamPaths: (metrics?.dependsOn ?? []).filter((p) => selectedSet.has(p)),
      directDownstreamPaths: (metrics?.dependedBy ?? []).filter((p) => selectedSet.has(p)),
      allDownstreamPaths: collectTransitiveDownstream(file.path, graph).filter((p) =>
        selectedSet.has(p)
      ),
      callers: fileCallers.slice(0, 5),
      status,
    };
  });

  const lanes: VisualMapLane[] = LANE_DEFS.map((l) => ({
    id: l.id,
    title: l.title,
    subtitle: l.subtitle,
    nodeIds: laneBuckets.get(l.id) ?? [],
  })).filter((l) => l.nodeIds.length > 0);

  if (foundationIds.length > 0) {
    lanes.push({
      id: 'foundation',
      title: '基础与数据定义',
      subtitle: '多处共用的底层契约',
      nodeIds: foundationIds,
    });
  }

  // Build clean directed edges (from consumer -> dependency) within selected nodes
  const edges: VisualMapEdge[] = [];
  for (const node of visualNodes) {
    for (const dep of node.upstreamPaths) {
      if (selectedSet.has(dep) && dep !== node.id) {
        edges.push({ from: node.id, to: dep });
      }
    }
  }

  let activeDiagnosis: VisualProjectMapPayload['activeDiagnosis'];
  if (diagnosis) {
    const rawDiag = diagnosis.aiSummary || diagnosis.plainDiagnosis;
    const sentences = rawDiag.split('。').filter((s) => s.trim().length > 0);
    const headline = (sentences[0] || rawDiag).trim();
    const subtext = sentences.slice(1).join('。') + (sentences.length > 1 ? '。' : '');

    activeDiagnosis = {
      targetNodeId: faultPath,
      targetLine: diagnosis.primaryTarget?.line,
      targetSymbol: diagnosis.primaryTarget?.symbol?.name,
      headline,
      subtext,
      safeZoneCount: diagnosis.blastRadius?.safeZoneCount ?? 0,
      silentRegressions: diagnosis.silentRegressions.map((r) => ({
        title: r.title,
        riskImpact: r.riskImpact,
      })),
      directions: diagnosis.directions.map((d) => ({
        id: d.id,
        label: d.label,
        strategy: d.strategy,
        recommended: d.recommended,
        surgicalPrompt: d.surgicalPrompt,
      })),
      retrievalMs: diagnosis.tokenEconomy.retrievalMs,
    };
  }

  return {
    repoName: index.repoName,
    totalFiles: index.stats.totalFiles,
    shownFiles: visualNodes.length,
    hiddenSupportFiles,
    scanMs: index.stats.scanMs,
    lanes,
    nodes: visualNodes,
    edges,
    activeDiagnosis,
  };
}
