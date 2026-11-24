import {
  detectSmartArchitecture,
  type ArchitectureBlueprint,
  type ZoneKind,
} from './architecturePlanner.ts';
import { buildCodeGraph, type CodeDependencyGraph } from './codeGraph.ts';
import type { ProblemProjectionReport } from './comprehensionEngine.ts';
import { buildSymbolCallGraph, type SymbolCallGraph } from './graphProvider.ts';
import type { FileLayer, IndexedFileNode, RepoIndex } from './repoIndexer.ts';

export interface VisualMapNode {
  id: string;
  name: string;
  path: string;
  laneId: string;
  zoneId: string;
  roleLabel: string;
  summary: string;
  inDegree: number;
  outDegree: number;
  downstreamReach: number;
  isHub: boolean;
  exports: string[];
  upstreamPaths: string[];
  directDownstreamPaths: string[];
  allDownstreamPaths: string[];
  callers: Array<{ symbol: string; callerName: string; callerFile: string; callerLine: number }>;
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

export interface VisualMapZone {
  id: string;
  title: string;
  badge: string;
  kind: ZoneKind;
  lanes: VisualMapLane[];
}

export interface VisualProjectMapPayload {
  repoName: string;
  archetype: ArchitectureBlueprint['archetype'];
  archetypeLabel: string;
  projectHeadline: string;
  architectureSource: ArchitectureBlueprint['source'];
  totalFiles: number;
  shownFiles: number;
  hiddenSupportFiles: number;
  scanMs: number;
  /** Semantic Architecture Zones (e.g. Frontend Zone vs Backend Zone vs Shared Core Zone) */
  zones: VisualMapZone[];
  /** Flattened lanes for backwards compatibility */
  lanes: VisualMapLane[];
  nodes: VisualMapNode[];
  edges: VisualMapEdge[];
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
 * Builds a Project-Adaptive Visual Architecture Map (Frontend / Backend / Shared Core Zones)
 * driven by either an LLM/Host-Agent ArchitectureBlueprint or the 0-Token Smart Archetype Detector.
 */
export function buildVisualProjectMap(
  index: RepoIndex,
  fileGraph?: CodeDependencyGraph,
  callGraph?: SymbolCallGraph,
  diagnosis?: ProblemProjectionReport,
  blueprint?: ArchitectureBlueprint
): VisualProjectMapPayload {
  const graph = fileGraph ?? buildCodeGraph(index);
  const calls = callGraph ?? buildSymbolCallGraph(index);
  const arch = blueprint ?? detectSmartArchitecture(index, graph);

  const allNodes = Object.values(index.files);
  const supportLayers = new Set<FileLayer>(['test', 'config', 'style-asset']);
  const primaryFiles = allNodes.filter((f) => !supportLayers.has(f.layer));
  const hiddenSupportFiles = allNodes.length - primaryFiles.length;

  const faultPath = diagnosis?.primaryTarget?.file.path;
  const directSet = new Set((diagnosis?.blastRadius?.directImpact ?? []).map((f) => f.path));
  const indirectSet = new Set((diagnosis?.blastRadius?.indirectImpact ?? []).map((f) => f.path));
  const upstreamSet = new Set((diagnosis?.blastRadius?.upstreamDependencies ?? []).map((f) => f.path));

  // Collect all files referenced in the architecture blueprint
  const fileToPlacement = new Map<string, { zoneId: string; laneId: string }>();
  const selectedIds: string[] = [];
  const zones: VisualMapZone[] = [];

  for (const z of arch.zones) {
    const lanes: VisualMapLane[] = [];
    for (const g of z.groups) {
      const nodeIds = g.files.filter((fp) => Boolean(index.files[fp]));
      if (nodeIds.length === 0) continue;
      lanes.push({
        id: g.id,
        title: g.title,
        subtitle: g.subtitle,
        nodeIds,
      });
      for (const fp of nodeIds) {
        if (!fileToPlacement.has(fp)) {
          fileToPlacement.set(fp, { zoneId: z.id, laneId: g.id });
          selectedIds.push(fp);
        }
      }
    }
    if (lanes.length > 0) {
      zones.push({
        id: z.id,
        title: z.title,
        badge: z.badge,
        kind: z.kind,
        lanes,
      });
    }
  }

  const selectedSet = new Set(selectedIds);

  const visualNodes: VisualMapNode[] = selectedIds.map((fp) => {
    const file: IndexedFileNode = index.files[fp];
    const metrics = graph.nodes[fp];
    const placement = fileToPlacement.get(fp)!;

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
      laneId: placement.laneId,
      zoneId: placement.zoneId,
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
    archetype: arch.archetype,
    archetypeLabel: arch.archetypeLabel,
    projectHeadline: arch.projectHeadline,
    architectureSource: arch.source,
    totalFiles: index.stats.totalFiles,
    shownFiles: visualNodes.length,
    hiddenSupportFiles,
    scanMs: index.stats.scanMs,
    zones,
    lanes: zones.flatMap((z) => z.lanes),
    nodes: visualNodes,
    edges,
    activeDiagnosis,
  };
}
