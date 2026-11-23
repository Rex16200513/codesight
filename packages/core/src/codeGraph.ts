import type { IndexedFileNode, RepoIndex } from './repoIndexer.ts';

export interface GraphNodeMetrics {
  path: string;
  /** Files this file directly imports */
  dependsOn: string[];
  /** Files that directly import this file */
  dependedBy: string[];
  inDegree: number;
  outDegree: number;
  /** True when >= 3 files directly or indirectly depend on this file */
  isHub: boolean;
  /** True when nothing imports this file (typically app entry, CLI, or leaf page) */
  isEntryOrLeaf: boolean;
  totalDownstreamReach: number;
}

export interface BlastRadiusReport {
  origin: string;
  originNode: IndexedFileNode;
  originMetrics: GraphNodeMetrics;
  /** Direct callers/consumers (1-hop) */
  directImpact: IndexedFileNode[];
  /** Transitive consumers (2+ hops) */
  indirectImpact: IndexedFileNode[];
  /** Upstream files this origin depends on (where bad data/contracts may come from) */
  upstreamDependencies: IndexedFileNode[];
  /** Files in the repo completely untouched by this blast radius */
  safeZoneCount: number;
  safeZoneSample: IndexedFileNode[];
  riskLevel: 'high-hub' | 'medium-bridge' | 'low-leaf';
}

export interface CodeDependencyGraph {
  nodes: Record<string, GraphNodeMetrics>;
  hubs: GraphNodeMetrics[];
  entrypoints: GraphNodeMetrics[];
}

export function buildCodeGraph(index: RepoIndex): CodeDependencyGraph {
  const nodes: Record<string, GraphNodeMetrics> = {};
  const filePaths = Object.keys(index.files);

  for (const fp of filePaths) {
    nodes[fp] = {
      path: fp,
      dependsOn: [...index.files[fp].resolvedImports],
      dependedBy: [],
      inDegree: 0,
      outDegree: index.files[fp].resolvedImports.length,
      isHub: false,
      isEntryOrLeaf: false,
      totalDownstreamReach: 0,
    };
  }

  for (const fp of filePaths) {
    for (const target of index.files[fp].resolvedImports) {
      if (nodes[target]) {
        nodes[target].dependedBy.push(fp);
      }
    }
  }

  // Compute transitive downstream reach for every node
  for (const fp of filePaths) {
    const m = nodes[fp];
    m.dependedBy.sort();
    m.inDegree = m.dependedBy.length;

    const visited = new Set<string>();
    const queue = [...m.dependedBy];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur) || cur === fp) continue;
      visited.add(cur);
      for (const next of nodes[cur]?.dependedBy ?? []) {
        if (!visited.has(next)) queue.push(next);
      }
    }

    m.totalDownstreamReach = visited.size;
    m.isHub = m.inDegree >= 2 || m.totalDownstreamReach >= 3;
    m.isEntryOrLeaf = m.inDegree === 0;
  }

  const allMetrics = Object.values(nodes);
  const hubs = allMetrics
    .filter((n) => n.isHub)
    .sort((a, b) => b.totalDownstreamReach - a.totalDownstreamReach || b.inDegree - a.inDegree);

  const entrypoints = allMetrics
    .filter((n) => n.isEntryOrLeaf && index.files[n.path].layer !== 'test')
    .sort((a, b) => b.outDegree - a.outDegree);

  return { nodes, hubs, entrypoints };
}

/**
 * Computes the exact Blast Radius (1-hop direct, 2+ hop indirect, upstream sources, and safe zone)
 * for any file in the real repository.
 */
export function computeBlastRadius(
  index: RepoIndex,
  graph: CodeDependencyGraph,
  originPath: string
): BlastRadiusReport | null {
  const originNode = index.files[originPath];
  const originMetrics = graph.nodes[originPath];
  if (!originNode || !originMetrics) return null;

  const directSet = new Set(originMetrics.dependedBy);
  const indirectSet = new Set<string>();

  const queue: Array<{ path: string; depth: number }> = originMetrics.dependedBy.map((p) => ({
    path: p,
    depth: 1,
  }));
  const seen = new Set<string>([originPath, ...originMetrics.dependedBy]);

  while (queue.length > 0) {
    const { path: cur, depth } = queue.shift()!;
    if (depth >= 4) continue;
    for (const caller of graph.nodes[cur]?.dependedBy ?? []) {
      if (seen.has(caller)) continue;
      seen.add(caller);
      indirectSet.add(caller);
      queue.push({ path: caller, depth: depth + 1 });
    }
  }

  const upstreamSet = new Set(originMetrics.dependsOn);
  const affectedAll = new Set<string>([originPath, ...directSet, ...indirectSet]);

  const safeFiles = Object.values(index.files).filter(
    (f) => !affectedAll.has(f.path) && f.layer !== 'test'
  );

  const totalImpacted = directSet.size + indirectSet.size;
  const riskLevel: BlastRadiusReport['riskLevel'] =
    totalImpacted >= 3 || originMetrics.inDegree >= 3
      ? 'high-hub'
      : totalImpacted >= 1
      ? 'medium-bridge'
      : 'low-leaf';

  return {
    origin: originPath,
    originNode,
    originMetrics,
    directImpact: Array.from(directSet)
      .map((p) => index.files[p])
      .filter(Boolean),
    indirectImpact: Array.from(indirectSet)
      .map((p) => index.files[p])
      .filter(Boolean),
    upstreamDependencies: Array.from(upstreamSet)
      .map((p) => index.files[p])
      .filter(Boolean),
    safeZoneCount: safeFiles.length,
    safeZoneSample: safeFiles.slice(0, 4),
    riskLevel,
  };
}
