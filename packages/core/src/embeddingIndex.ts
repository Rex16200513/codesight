import type { CodeDependencyGraph } from './codeGraph.ts';
import type { IndexedFileNode, RepoIndex } from './repoIndexer.ts';

export interface EmbeddingProviderConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface RetrievalHit {
  file: IndexedFileNode;
  totalScore: number;
  vectorScore: number;
  graphBoost: number;
  exactBoost: number;
  matchReasons: string[];
}

const VECTOR_DIM = 192;

/**
 * Lightweight bilingual code-concept expansion so Chinese natural language queries
 * (e.g. "报错解析在哪", "悬浮窗样式", "提示词怎么拼的") immediately hit English code identifiers
 * even in 0-cost offline local embedding mode!
 */
const BILINGUAL_CONCEPTS: Array<[RegExp, string[]]> = [
  [/报错|错误|异常|栈|崩溃|error|stack|trace|crash|bug/i, ['error', 'diagnostic', 'analyzer', 'ripple', 'regression', 'stack']],
  [/提示词|指令|prompt|修复|fix/i, ['prompt', 'builder', 'surgical', 'action', 'directive', 'fix']],
  [/模型|大模型|llm|openai|ollama|byok|api/i, ['llm', 'adapter', 'model', 'config', 'provider', 'token']],
  [/悬浮|界面|卡片|ui|hud|弹窗|展示|组件/i, ['hud', 'card', 'ui', 'component', 'ripple', 'mental', 'glassbox']],
  [/样式|颜色|主题|暗黑|浅色|css|style/i, ['css', 'style', 'theme', 'light', 'dark', 'glassbox']],
  [/服务|接口|网关|监听|推送|server|sidecar|sse|http/i, ['server', 'sidecar', 'http', 'sse', 'ingest', 'bridge']],
  [/协议|结构|类型|契约|schema|type|mcp/i, ['schema', 'mcp', 'bridge', 'bundle', 'type', 'contract']],
  [/图|依赖|索引|检索|向量|graph|embed|index|search/i, ['graph', 'index', 'embedding', 'retrieval', 'blast', 'repo']],
  [/测试|单测|test|assert/i, ['test', 'spec', 'assert', 'analyzer']],
  [/鉴权|权限|登录|安全|auth|guard|admin/i, ['auth', 'guard', 'regression', 'security', 'silent']],
];

function tokenizeForEmbedding(text: string): string[] {
  const expanded: string[] = [];
  for (const [regex, concepts] of BILINGUAL_CONCEPTS) {
    if (regex.test(text)) {
      expanded.push(...concepts);
    }
  }

  const baseTokens = text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/)
    .filter((t) => t.length >= 2);

  // Add character bigrams for Chinese phrases to improve fuzzy recall
  const cjkBigrams: string[] = [];
  for (const t of baseTokens) {
    if (/^[\u4e00-\u9fa5]+$/.test(t) && t.length >= 2) {
      for (let i = 0; i < t.length - 1; i++) {
        cjkBigrams.push(t.slice(i, i + 2));
      }
    }
  }

  return [...baseTokens, ...cjkBigrams, ...expanded];
}

function fnv1aHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 0-Cost Deterministic Local Semantic Embedding (Signed Random Projection / Feature Hashing).
 * Produces L2-normalized 192-d vectors in < 0.1ms per file, zero network, zero model downloads.
 */
export function computeLocalEmbedding(text: string): number[] {
  const vec = new Array<number>(VECTOR_DIM).fill(0);
  const tokens = tokenizeForEmbedding(text);
  for (const tok of tokens) {
    const h1 = fnv1aHash(tok);
    const h2 = fnv1aHash(`${tok}#2`);
    const idx1 = h1 % VECTOR_DIM;
    const sign1 = (h1 & 1) === 0 ? 1 : -1;
    const idx2 = h2 % VECTOR_DIM;
    const sign2 = (h2 & 1) === 0 ? 0.5 : -0.5;
    vec[idx1] += sign1;
    vec[idx2] += sign2;
  }

  let normSq = 0;
  for (let i = 0; i < VECTOR_DIM; i++) normSq += vec[i] * vec[i];
  const norm = Math.sqrt(normSq) || 1;
  for (let i = 0; i < VECTOR_DIM; i++) vec[i] = Number((vec[i] / norm).toFixed(5));
  return vec;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export function buildFileEmbeddingText(node: IndexedFileNode): string {
  return [
    node.path,
    node.roleLabel,
    node.summary,
    node.exports.join(' '),
    node.keywords.join(' '),
  ].join('\n');
}

/**
 * Optional external OpenAI-compatible dense embedding call (e.g. text-embedding-3-small / Ollama nomic-embed-text).
 */
async function fetchExternalEmbeddings(
  texts: string[],
  config: EmbeddingProviderConfig
): Promise<number[][]> {
  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/embeddings`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey.trim()) headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: config.model, input: texts }),
  });

  if (!res.ok) {
    throw new Error(`Embedding API failed (${res.status})`);
  }

  const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
  if (!data.data || data.data.length !== texts.length) {
    throw new Error('Unexpected embedding response shape');
  }
  return data.data.map((d) => d.embedding);
}

/**
 * Ensures every file node in RepoIndex has an up-to-date embedding vector.
 * Uses incremental caching: unchanged files keep their cached vectors!
 */
export async function ensureEmbeddings(
  index: RepoIndex,
  config?: EmbeddingProviderConfig
): Promise<{ mode: 'local-hash-vector' | 'external-dense-vector'; embeddedNow: number }> {
  const nodes = Object.values(index.files);

  if (config?.enabled && config.baseUrl && config.model) {
    const stale = nodes.filter(
      (n) => !n.embedding || n.embeddingModel !== config.model
    );
    if (stale.length > 0) {
      try {
        const vectors = await fetchExternalEmbeddings(
          stale.map(buildFileEmbeddingText),
          config
        );
        stale.forEach((n, i) => {
          n.embedding = vectors[i];
          n.embeddingModel = config.model;
        });
        return { mode: 'external-dense-vector', embeddedNow: stale.length };
      } catch {
        // Fallback smoothly to local 0-cost embedding
      }
    } else {
      return { mode: 'external-dense-vector', embeddedNow: 0 };
    }
  }

  let embeddedNow = 0;
  for (const node of nodes) {
    if (!node.embedding || node.embeddingModel !== 'local-192d') {
      node.embedding = computeLocalEmbedding(buildFileEmbeddingText(node));
      node.embeddingModel = 'local-192d';
      embeddedNow++;
    }
  }
  return { mode: 'local-hash-vector', embeddedNow };
}

/**
 * Hybrid Graph + Embedding Retrieval:
 * 1. Exact filename / exported symbol hits (highest precision)
 * 2. Embedding cosine similarity (semantic recall across CN/EN descriptions & identifiers)
 * 3. Graph 1-hop neighborhood propagation + hub centrality boost (captures causal callers & shared contracts!)
 */
export async function hybridRetrieve(
  index: RepoIndex,
  graph: CodeDependencyGraph,
  query: string,
  options?: {
    topK?: number;
    seedFiles?: string[];
    embeddingConfig?: EmbeddingProviderConfig;
  }
): Promise<RetrievalHit[]> {
  const topK = options?.topK ?? 5;
  const seedFiles = new Set(options?.seedFiles ?? []);
  const embedMeta = await ensureEmbeddings(index, options?.embeddingConfig);

  let queryVec: number[];
  if (embedMeta.mode === 'external-dense-vector' && options?.embeddingConfig) {
    try {
      const [v] = await fetchExternalEmbeddings([query], options.embeddingConfig);
      queryVec = v;
    } catch {
      queryVec = computeLocalEmbedding(query);
    }
  } else {
    queryVec = computeLocalEmbedding(query);
  }

  const queryLower = query.toLowerCase();
  const baseScores = new Map<
    string,
    { vectorScore: number; exactBoost: number; reasons: string[] }
  >();

  for (const node of Object.values(index.files)) {
    const vecSim = node.embedding ? Math.max(0, cosineSimilarity(queryVec, node.embedding)) : 0;
    let exactBoost = 0;
    const reasons: string[] = [];

    if (seedFiles.has(node.path)) {
      exactBoost += 1.0;
      reasons.push('报错/变更直接命中该文件');
    } else if (queryLower.includes(node.name.toLowerCase()) || queryLower.includes(node.path.toLowerCase())) {
      exactBoost += 0.75;
      reasons.push('文件名精确命中');
    }

    const matchedExports = node.exports.filter(
      (exp) => exp.length >= 3 && queryLower.includes(exp.toLowerCase())
    );
    if (matchedExports.length > 0) {
      exactBoost += 0.55;
      reasons.push(`命中导出符号 ${matchedExports.slice(0, 2).join(', ')}`);
    }

    if (vecSim >= 0.18) {
      reasons.push(`向量语义相似度 ${(vecSim * 100).toFixed(0)}%`);
    }

    baseScores.set(node.path, { vectorScore: vecSim, exactBoost, reasons });
  }

  // Pick top seed anchors for Graph 1-hop propagation
  const topAnchors = Array.from(baseScores.entries())
    .sort((a, b) => b[1].exactBoost + b[1].vectorScore - (a[1].exactBoost + a[1].vectorScore))
    .slice(0, 3)
    .filter(([, s]) => s.exactBoost + s.vectorScore > 0.2);

  const graphBoostMap = new Map<string, { boost: number; reasons: string[] }>();
  for (const [anchorPath] of topAnchors) {
    const metrics = graph.nodes[anchorPath];
    if (!metrics) continue;

    for (const caller of metrics.dependedBy) {
      const prev = graphBoostMap.get(caller) ?? { boost: 0, reasons: [] };
      prev.boost += 0.24;
      prev.reasons.push(`依赖核心命中文件 ${index.files[anchorPath]?.name}`);
      graphBoostMap.set(caller, prev);
    }

    for (const dep of metrics.dependsOn) {
      const prev = graphBoostMap.get(dep) ?? { boost: 0, reasons: [] };
      prev.boost += 0.2;
      prev.reasons.push(`被命中文件 ${index.files[anchorPath]?.name} 直接调用`);
      graphBoostMap.set(dep, prev);
    }
  }

  const hits: RetrievalHit[] = [];
  for (const node of Object.values(index.files)) {
    const base = baseScores.get(node.path)!;
    const gBoost = graphBoostMap.get(node.path);
    const metrics = graph.nodes[node.path];
    const isBarrel = node.name === 'index.ts' || node.name === 'index.js';
    const rawGraphBoost = Math.min(0.22, gBoost?.boost ?? 0) + (metrics?.isHub ? 0.04 : 0);
    const graphBoost = isBarrel ? rawGraphBoost * 0.35 : rawGraphBoost;
    const totalScore = base.exactBoost + base.vectorScore * 0.85 + graphBoost;

    if (totalScore <= 0.08) continue;

    const matchReasons = [...base.reasons, ...(gBoost?.reasons ?? [])];
    if (metrics?.isHub && matchReasons.length > 0) {
      matchReasons.push(`核心枢纽（被 ${metrics.totalDownstreamReach} 个文件依赖）`);
    }

    hits.push({
      file: node,
      totalScore: Number(totalScore.toFixed(4)),
      vectorScore: Number(base.vectorScore.toFixed(4)),
      graphBoost: Number(graphBoost.toFixed(4)),
      exactBoost: Number(base.exactBoost.toFixed(4)),
      matchReasons: Array.from(new Set(matchReasons)),
    });
  }

  return hits.sort((a, b) => b.totalScore - a.totalScore).slice(0, topK);
}
