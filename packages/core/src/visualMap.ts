import {
  detectSmartArchitecture,
  type ArchitectureBlueprint,
  type UiPrototypeSpec,
  type ZoneKind,
} from './architecturePlanner.ts';
import { buildCodeGraph, type CodeDependencyGraph } from './codeGraph.ts';
import type { ProblemProjectionReport } from './comprehensionEngine.ts';
import { buildSymbolCallGraph, type SymbolCallGraph } from './graphProvider.ts';
import type { FileLayer, IndexedFileNode, RepoIndex } from './repoIndexer.ts';

export type PrototypeVisualKind =
  | 'ui-hud'
  | 'ui-modal'
  | 'ui-card-flow'
  | 'ui-card-diff'
  | 'ui-card'
  | 'ui-page'
  | 'api-server'
  | 'cli-entry'
  | 'data-schema'
  | 'logic-pipeline';

export interface VisualMapNode {
  id: string;
  name: string;
  path: string;
  laneId: string;
  laneTitle: string;
  zoneId: string;
  zoneTitle: string;
  zoneKind: ZoneKind;
  roleLabel: string;
  summary: string;
  prototypeKind: PrototypeVisualKind;
  /** Optional LLM or Host-Agent curated visual prototype specification */
  prototypeSpec?: UiPrototypeSpec;
  /** Child components or key calls inside this file (for realistic mini-prototype rendering) */
  childComponents: string[];
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
  zones: VisualMapZone[];
  lanes: VisualMapLane[];
  nodes: VisualMapNode[];
  edges: VisualMapEdge[];
  activeDiagnosis?: {
    targetNodeId?: string;
    targetLine?: number;
    targetSymbol?: string;
    headline: string;
    headlineEn: string;
    subtext: string;
    safeZoneCount: number;
    silentRegressions: Array<{ title: string; riskImpact: string }>;
    directions: Array<{
      id: string;
      label: string;
      labelEn: string;
      strategy: string;
      strategyEn: string;
      recommended?: boolean;
      surgicalPrompt: string;
    }>;
    retrievalMs: number;
  };
}

function inferPrototypeKind(file: IndexedFileNode, zoneKind: ZoneKind): PrototypeVisualKind {
  const lower = `${file.path} ${file.name}`.toLowerCase();

  if (
    zoneKind === 'frontend' ||
    file.layer === 'ui-component' ||
    file.ext === '.tsx' ||
    file.ext === '.jsx' ||
    file.ext === '.vue' ||
    file.ext === '.svelte'
  ) {
    if (/modal|dialog|drawer|popover|sheet|options|settings|studio/.test(lower)) return 'ui-modal';
    if (/hud|panel|overlay|dock|sidebar|launcher|toolhub/.test(lower)) return 'ui-hud';
    if (/mental|flow|map|graph|topo|diagram|timeline|board|customizer/.test(lower)) return 'ui-card-flow';
    if (/ripple|diff|regression|compare|alert|error|highlight/.test(lower)) return 'ui-card-diff';
    if (/card|widget|tile|badge|item|button|form|folder|export|latex/.test(lower)) return 'ui-card';
    return 'ui-page';
  }

  if (/schema|types?|contract|model|dto/.test(lower)) return 'data-schema';
  if (/cli|install|script|bin/.test(lower)) return 'cli-entry';
  if (zoneKind === 'backend' || /server|api|route|bridge|mcp|sidecar|controller|service|lifecycle|storage/.test(lower)) {
    return 'api-server';
  }
  return 'logic-pipeline';
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
 * Builds a Vertical-Column Project Architecture Board payload with real AST-backed prototype metadata.
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

  const fileToPlacement = new Map<
    string,
    { zoneId: string; zoneTitle: string; zoneKind: ZoneKind; laneId: string; laneTitle: string }
  >();
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
          fileToPlacement.set(fp, {
            zoneId: z.id,
            zoneTitle: z.title,
            zoneKind: z.kind,
            laneId: g.id,
            laneTitle: g.title,
          });
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
    const childCompSet = new Set<string>();
    for (const sym of file.symbols ?? []) {
      for (const c of sym.calls) {
        if (/^[A-Z]/.test(c)) childCompSet.add(c);
      }
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
      laneTitle: placement.laneTitle,
      zoneId: placement.zoneId,
      zoneTitle: placement.zoneTitle,
      zoneKind: placement.zoneKind,
      roleLabel: file.roleLabel,
      summary: file.summary,
      prototypeKind: arch.prototypes?.[file.path]?.kind ?? inferPrototypeKind(file, placement.zoneKind),
      prototypeSpec: arch.prototypes?.[file.path],
      childComponents: Array.from(childCompSet).slice(0, 4),
      inDegree: metrics?.inDegree ?? 0,
      outDegree: metrics?.outDegree ?? 0,
      downstreamReach: metrics?.totalDownstreamReach ?? 0,
      isHub: metrics?.isHub ?? false,
      exports: file.exports.slice(0, 6),
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

    const targetName = diagnosis.primaryTarget?.file.name || 'target file';
    const targetLine = diagnosis.primaryTarget?.line;
    const impactCount =
      (diagnosis.blastRadius?.directImpact.length ?? 0) +
      (diagnosis.blastRadius?.indirectImpact.length ?? 0);
    const headlineEn =
      impactCount >= 5
        ? `Error in ${targetName}${targetLine ? `:${targetLine}` : ''} — shared by ${impactCount} files`
        : impactCount > 0
        ? `Error in ${targetName}${targetLine ? `:${targetLine}` : ''} — affects ${impactCount} files`
        : `Error in ${targetName}${targetLine ? `:${targetLine}` : ''} — isolated file`;

    const toDirectionEn = (d: ProblemProjectionReport['directions'][number]): { labelEn: string; strategyEn: string } => {
      switch (d.id) {
        case 'dir-protect-hub':
          return {
            labelEn: `Fix inside ${targetName} only`,
            strategyEn: `Keep exports compatible so none of the ${impactCount} callers break.`,
          };
        case 'dir-cascade-upgrade':
          return {
            labelEn: `Update ${targetName} + ${impactCount} callers`,
            strategyEn: `Propagate signature changes cleanly across all dependent files.`,
          };
        case 'dir-local-bridge-fix':
          return {
            labelEn: `Fix ${targetName} & verify callers`,
            strategyEn: `Resolve the root issue and check direct consumers.`,
          };
        case 'dir-trace-upstream':
          return {
            labelEn: `Fix at upstream source`,
            strategyEn: `Inspect upstream inputs instead of patching downstream.`,
          };
        case 'dir-safe-leaf-fix':
          return {
            labelEn: `Fix ${targetName} directly`,
            strategyEn: `No other files depend on it — safe self-contained edit.`,
          };
        case 'dir-check-upstream-leaf':
          return {
            labelEn: `Sync with upstream types`,
            strategyEn: `Align ${targetName} with the latest exported contracts.`,
          };
        default:
          return {
            labelEn: d.label,
            strategyEn: d.strategy,
          };
      }
    };

    activeDiagnosis = {
      targetNodeId: faultPath,
      targetLine,
      targetSymbol: diagnosis.primaryTarget?.symbol?.name,
      headline,
      headlineEn,
      subtext,
      safeZoneCount: diagnosis.blastRadius?.safeZoneCount ?? 0,
      silentRegressions: diagnosis.silentRegressions.map((r) => ({
        title: r.title,
        riskImpact: r.riskImpact,
      })),
      directions: diagnosis.directions.map((d) => {
        const en = toDirectionEn(d);
        return {
          id: d.id,
          label: d.label,
          labelEn: en.labelEn,
          strategy: d.strategy,
          strategyEn: en.strategyEn,
          recommended: d.recommended,
          surgicalPrompt: d.surgicalPrompt,
        };
      }),
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
