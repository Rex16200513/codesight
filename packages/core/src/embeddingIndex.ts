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
  /** Reciprocal Rank Fusion (RRF) combined score */
  totalScore: number;
  bm25Score: number;
  vectorScore: number;
  graphBoost: number;
  exactBoost: number;
  matchReasons: string[];
}

const VECTOR_DIM = 192;
const RRF_K = 60;

/**
 * Bilingual code-domain concept map so Chinese queries immediately align with English code tokens
 * even in 0-cost offline mode.
 */
const BILINGUAL_CONCEPTS: Array<[RegExp, string[]]> = [
  [/报错|错误|异常|栈|崩溃|error|stack|trace|crash|bug/i, ['error', 'diagnostic', 'analyzer', 'ripple', 'regression', 'stack']],
  [/提示词|指令|prompt|修复|fix/i, ['prompt', 'builder', 'surgical', 'action', 'directive', 'fix']],
  [/模型|大模型|llm|openai|ollama|byok|api/i, ['llm', 'adapter', 'model', 'config', 'provider', 'token']],
  [/悬浮|界面|卡片|ui|hud|弹窗|展示|组件/i, ['hud', 'card', 'ui', 'component', 'ripple', 'mental', 'codesight']],
  [/样式|颜色|主题|暗黑|浅色|css|style/i, ['css', 'style', 'theme', 'light', 'dark', 'codesight']],
  [/服务|接口|网关|监听|推送|server|sidecar|sse|http/i, ['server', 'sidecar', 'http', 'sse', 'ingest', 'bridge']],
  [/协议|结构|类型|契约|schema|type|mcp/i, ['schema', 'mcp', 'bridge', 'bundle', 'type', 'contract']],
  [/图|依赖|索引|检索|向量|调用|ast|graph|embed|index|search|call/i, ['graph', 'index', 'embedding', 'retrieval', 'blast', 'repo', 'ast', 'symbol', 'call']],
  [/测试|单测|test|assert/i, ['test', 'spec', 'assert', 'analyzer']],
  [/鉴权|权限|登录|安全|auth|guard|admin/i, ['auth', 'guard', 'regression', 'security', 'silent']],
];

export function tokenizeForSearch(text: string): string[] {
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
 * 0-Cost Deterministic Local Semantic Embedding (Signed Feature Hashing, 192-d L2 normalized).
 */
export function computeLocalEmbedding(text: string): number[] {
  const vec = new Array<number>(VECTOR_DIM).fill(0);
  const tokens = tokenizeForSearch(text);
  for (const tok of tokens) {
    const h1 = fnv1aHash(tok);
    const h2 = fnv1aHash(`${tok}#2`);
    vec[h1 % VECTOR_DIM] += (h1 & 1) === 0 ? 1 : -1;
    vec[h2 % VECTOR_DIM] += (h2 & 1) === 0 ? 0.5 : -0.5;
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
  const symText = (node.symbols ?? [])
    .slice(0, 12)
    .map((s) => `${s.name} ${s.doc ?? ''}`)
    .join(' ');
  return [node.path, node.roleLabel, node.summary, node.exports.join(' '), symText, node.keywords.join(' ')].join(
    '\n'
  );
}

/**
 * Standard Okapi BM25 lexical scoring over indexed file corpus (k1=1.5, b=0.75).
 */
function computeBM25Scores(nodes: IndexedFileNode[], query: string): Map<string, number> {
  const queryTerms = Array.from(new Set(tokenizeForSearch(query)));
  const scores = new Map<string, number>();
  if (queryTerms.length === 0 || nodes.length === 0) return scores;

  const docTermFreqs = new Map<string, Map<string, number>>();
  const docLengths = new Map<string, number>();
  const docFreq = new Map<string, number>();
  let totalLen = 0;

  for (const node of nodes) {
    const tokens = tokenizeForSearch(buildFileEmbeddingText(node));
    const tf = new Map<string, number>();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) ?? 0) + 1);
    }
    docTermFreqs.set(node.path, tf);
    docLengths.set(node.path, tokens.length);
    totalLen += tokens.length;

    for (const uniqueTerm of tf.keys()) {
      docFreq.set(uniqueTerm, (docFreq.get(uniqueTerm) ?? 0) + 1);
    }
  }

  const N = nodes.length;
  const avgdl = totalLen / N || 1;
  const k1 = 1.5;
  const b = 0.75;

  for (const node of nodes) {
    const tfMap = docTermFreqs.get(node.path)!;
    const dl = docLengths.get(node.path) ?? 1;
    let score = 0;

    for (const term of queryTerms) {
      const tf = tfMap.get(term) ?? 0;
      if (tf === 0) continue;
      const df = docFreq.get(term) ?? 0;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * dl) / avgdl)));
    }
    scores.set(node.path, score);
  }

  return scores;
}

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

  if (!res.ok) throw new Error(`Embedding API failed (${res.status})`);
  const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
  if (!data.data || data.data.length !== texts.length) {
    throw new Error('Unexpected embedding response shape');
  }
  return data.data.map((d) => d.embedding);
}

export async function ensureEmbeddings(
  index: RepoIndex,
  config?: EmbeddingProviderConfig
): Promise<{ mode: 'local-bm25+vector-rrf' | 'external-dense+bm25-rrf'; embeddedNow: number }> {
  const nodes = Object.values(index.files);

  if (config?.enabled && config.baseUrl && config.model) {
    const stale = nodes.filter((n) => !n.embedding || n.embeddingModel !== config.model);
    if (stale.length > 0) {
      try {
        const vectors = await fetchExternalEmbeddings(stale.map(buildFileEmbeddingText), config);
        stale.forEach((n, i) => {
          n.embedding = vectors[i];
          n.embeddingModel = config.model;
        });
        return { mode: 'external-dense+bm25-rrf', embeddedNow: stale.length };
      } catch {
        // Fallback cleanly to local vector
      }
    } else {
      return { mode: 'external-dense+bm25-rrf', embeddedNow: 0 };
    }
  }

  let embeddedNow = 0;
  for (const node of nodes) {
    if (!node.embedding || node.embeddingModel !== 'local-192d-v2') {
      node.embedding = computeLocalEmbedding(buildFileEmbeddingText(node));
      node.embeddingModel = 'local-192d-v2';
      embeddedNow++;
    }
  }
  return { mode: 'local-bm25+vector-rrf', embeddedNow };
}

/**
 * Industry-Standard Hybrid GraphRAG Retrieval via Reciprocal Rank Fusion (RRF):
 * Fuses 4 independent rankings:
 * 1. Exact Seed / Symbol / Filename matches
 * 2. Okapi BM25 lexical ranking
 * 3. Cosine Semantic Vector ranking (local or external dense embeddings)
 * 4. Graph 1-hop neighborhood propagation (with barrel damping)
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
  const nodes = Object.values(index.files);
  const embedMeta = await ensureEmbeddings(index, options?.embeddingConfig);

  let queryVec: number[];
  if (embedMeta.mode === 'external-dense+bm25-rrf' && options?.embeddingConfig) {
    try {
      const [v] = await fetchExternalEmbeddings([query], options.embeddingConfig);
      queryVec = v;
    } catch {
      queryVec = computeLocalEmbedding(query);
    }
  } else {
    queryVec = computeLocalEmbedding(query);
  }

  const bm25Scores = computeBM25Scores(nodes, query);
  const vectorScores = new Map<string, number>();
  const exactScores = new Map<string, number>();
  const reasonsMap = new Map<string, string[]>();
  const queryLower = query.toLowerCase();

  for (const node of nodes) {
    const reasons: string[] = [];
    const vecSim = node.embedding ? Math.max(0, cosineSimilarity(queryVec, node.embedding)) : 0;
    vectorScores.set(node.path, vecSim);

    let exact = 0;
    if (seedFiles.has(node.path)) {
      exact += 2.0;
      reasons.push('报错/变更直接命中该文件');
    } else if (
      queryLower.includes(node.name.toLowerCase()) ||
      queryLower.includes(node.path.toLowerCase())
    ) {
      exact += 1.4;
      reasons.push('文件名精确命中');
    }

    const matchedSymbols = (node.symbols ?? [])
      .map((s) => s.name)
      .filter((name) => name.length >= 3 && queryLower.includes(name.toLowerCase()));
    if (matchedSymbols.length > 0) {
      exact += 1.2;
      reasons.push(`精确命中 AST 符号 ${Array.from(new Set(matchedSymbols)).slice(0, 2).join(', ')}`);
    }

    if ((bm25Scores.get(node.path) ?? 0) > 1.2) {
      reasons.push(`BM25 词法高相关 (${(bm25Scores.get(node.path) ?? 0).toFixed(1)})`);
    }
    if (vecSim >= 0.2) {
      reasons.push(`向量语义相似度 ${(vecSim * 100).toFixed(0)}%`);
    }

    exactScores.set(node.path, exact);
    reasonsMap.set(node.path, reasons);
  }

  // Build individual ranked lists for RRF
  const bm25Rank = new Map<string, number>();
  Array.from(bm25Scores.entries())
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .forEach(([fp], idx) => bm25Rank.set(fp, idx + 1));

  const vectorRank = new Map<string, number>();
  Array.from(vectorScores.entries())
    .filter(([, s]) => s > 0.08)
    .sort((a, b) => b[1] - a[1])
    .forEach(([fp], idx) => vectorRank.set(fp, idx + 1));

  // Graph 1-hop propagation from top 3 combined lexical/exact/vector anchors
  const preAnchors = nodes
    .map((n) => ({
      path: n.path,
      score:
        (exactScores.get(n.path) ?? 0) * 3 +
        (bm25Rank.has(n.path) ? 1 / (RRF_K + bm25Rank.get(n.path)!) : 0) * 40 +
        (vectorRank.has(n.path) ? 1 / (RRF_K + vectorRank.get(n.path)!) : 0) * 40,
    }))
    .filter((a) => a.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const graphScores = new Map<string, number>();
  for (const anchor of preAnchors) {
    const metrics = graph.nodes[anchor.path];
    if (!metrics) continue;
    for (const caller of metrics.dependedBy) {
      graphScores.set(caller, Math.min(0.45, (graphScores.get(caller) ?? 0) + 0.25));
      reasonsMap.get(caller)?.push(`调用关联文件 ${index.files[anchor.path]?.name}`);
    }
    for (const dep of metrics.dependsOn) {
      graphScores.set(dep, Math.min(0.45, (graphScores.get(dep) ?? 0) + 0.22));
      reasonsMap.get(dep)?.push(`被命中文件 ${index.files[anchor.path]?.name} 直接依赖`);
    }
  }

  const graphRank = new Map<string, number>();
  Array.from(graphScores.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([fp], idx) => graphRank.set(fp, idx + 1));

  // Fuse all 4 signals via weighted RRF
  const hits: RetrievalHit[] = [];
  for (const node of nodes) {
    const isBarrel = node.name === 'index.ts' || node.name === 'index.js';
    const exact = exactScores.get(node.path) ?? 0;
    const bm25 = bm25Scores.get(node.path) ?? 0;
    const vec = vectorScores.get(node.path) ?? 0;
    const gScore = graphScores.get(node.path) ?? 0;

    let rrf = 0;
    if (exact > 0) rrf += exact * 0.04;
    if (bm25Rank.has(node.path)) rrf += 1.25 / (RRF_K + bm25Rank.get(node.path)!);
    if (vectorRank.has(node.path)) rrf += 1.15 / (RRF_K + vectorRank.get(node.path)!);
    if (graphRank.has(node.path)) {
      const gWeight = isBarrel ? 0.22 : 0.55;
      rrf += gWeight / (RRF_K + graphRank.get(node.path)!);
    }

    if (rrf <= 0.005) continue;

    const metrics = graph.nodes[node.path];
    const reasons = reasonsMap.get(node.path) ?? [];
    if (metrics?.isHub && reasons.length > 0) {
      reasons.push(`核心枢纽（波及 ${metrics.totalDownstreamReach} 个文件）`);
    }

    hits.push({
      file: node,
      totalScore: Number((rrf * 100).toFixed(2)),
      bm25Score: Number(bm25.toFixed(2)),
      vectorScore: Number(vec.toFixed(3)),
      graphBoost: Number(gScore.toFixed(3)),
      exactBoost: Number(exact.toFixed(2)),
      matchReasons: Array.from(new Set(reasons)),
    });
  }

  return hits.sort((a, b) => b.totalScore - a.totalScore).slice(0, topK);
}
