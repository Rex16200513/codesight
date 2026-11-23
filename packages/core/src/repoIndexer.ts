import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseSourceFileAST, type ParsedSymbol } from './astParser.ts';

export type FileLayer =
  | 'entrypoint'
  | 'core-logic'
  | 'ui-component'
  | 'server-api'
  | 'style-asset'
  | 'test'
  | 'config'
  | 'module';

export interface IndexedFileNode {
  /** Posix relative path from repo root, e.g. packages/core/src/schema.ts */
  path: string;
  name: string;
  ext: string;
  hash: string;
  lines: number;
  sizeBytes: number;
  layer: FileLayer;
  /** Short human-readable Chinese role badge, e.g. "核心数据协议" */
  roleLabel: string;
  /** Plain-Chinese 1-sentence explanation of what this file actually does */
  summary: string;
  /** Accurate AST-extracted exported functions, classes, interfaces, types, constants */
  exports: string[];
  /** Function / Class / Interface / Component symbols with line spans & call targets */
  symbols: ParsedSymbol[];
  /** Raw import specifiers found in code */
  rawImports: string[];
  /** Resolved internal repo file paths (normalized posix relative paths) */
  resolvedImports: string[];
  /** External npm/node packages referenced */
  externalDeps: string[];
  /** Key domain terms extracted for fast BM25 & embedding retrieval */
  keywords: string[];
  /** Parser engine used ('typescript-ast' | 'fallback-regex') */
  parserUsed: 'typescript-ast' | 'fallback-regex';
  /** Optional cached dense embedding vector (from local or BYOK embedding provider) */
  embedding?: number[];
  embeddingModel?: string;
}

export interface RepoIndex {
  schemaVersion: '2.0';
  rootDir: string;
  repoName: string;
  updatedAt: string;
  stats: {
    totalFiles: number;
    totalSymbols: number;
    reindexedFiles: number;
    cachedFiles: number;
    scanMs: number;
  };
  files: Record<string, IndexedFileNode>;
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.glassbox',
  '.codesight',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.turbo',
  'coverage',
  '.cache',
  '__pycache__',
  '.venv',
  'venv',
]);

const SUPPORTED_EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.py',
  '.go',
  '.rs',
  '.vue',
  '.svelte',
]);

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/** Collect workspace package name -> source entry path mappings from package.json files */
function discoverWorkspacePackages(rootDir: string): Map<string, string> {
  const pkgMap = new Map<string, string>();
  const walkPkg = (dir: string, depth: number) => {
    if (depth > 3) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        walkPkg(path.join(dir, entry.name), depth + 1);
      } else if (entry.name === 'package.json') {
        try {
          const raw = fs.readFileSync(path.join(dir, entry.name), 'utf8');
          const parsed = JSON.parse(raw) as {
            name?: string;
            exports?: Record<string, unknown>;
          };
          if (!parsed.name) continue;
          const relDir = toPosix(path.relative(rootDir, dir));

          const candidates = [
            path.join(dir, 'src/index.ts'),
            path.join(dir, 'src/index.tsx'),
            path.join(dir, 'src/index.js'),
            path.join(dir, 'index.ts'),
          ];
          for (const c of candidates) {
            if (fs.existsSync(c)) {
              pkgMap.set(parsed.name, toPosix(path.relative(rootDir, c)));
              break;
            }
          }

          if (parsed.exports && typeof parsed.exports === 'object') {
            for (const [subKey, subVal] of Object.entries(parsed.exports)) {
              if (!subKey.startsWith('./')) continue;
              const targetStr =
                typeof subVal === 'string'
                  ? subVal
                  : typeof subVal === 'object' && subVal !== null
                  ? ((subVal as Record<string, unknown>).import as string | undefined) ||
                    ((subVal as Record<string, unknown>).default as string | undefined)
                  : undefined;
              if (targetStr) {
                const resolvedSub = path.resolve(dir, targetStr);
                if (fs.existsSync(resolvedSub)) {
                  const fullSpec = `${parsed.name}/${subKey.slice(2)}`;
                  pkgMap.set(fullSpec, toPosix(path.relative(rootDir, resolvedSub)));
                }
              }
            }
          }

          if (!pkgMap.has(parsed.name) && relDir) {
            pkgMap.set(parsed.name, relDir);
          }
        } catch {
          // ignore invalid package.json
        }
      }
    }
  };
  walkPkg(rootDir, 0);
  return pkgMap;
}

function collectSourceFiles(rootDir: string): string[] {
  const results: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTS.has(ext)) {
          results.push(toPosix(path.relative(rootDir, fullPath)));
        }
      }
    }
  };
  walk(rootDir);
  return results.sort();
}

function resolveImportToRepoFile(
  fromRelPosix: string,
  spec: string,
  allFileSet: Set<string>,
  workspacePkgMap: Map<string, string>
): { internal?: string; external?: string } {
  if (workspacePkgMap.has(spec)) {
    const target = workspacePkgMap.get(spec)!;
    if (allFileSet.has(target)) return { internal: target };
  }

  if (spec.startsWith('.')) {
    const fromDir = path.posix.dirname(fromRelPosix);
    const rawTarget = path.posix.normalize(path.posix.join(fromDir, spec));

    const candidates = [
      rawTarget,
      rawTarget.replace(/\.js$/, '.ts'),
      rawTarget.replace(/\.jsx$/, '.tsx'),
      `${rawTarget}.ts`,
      `${rawTarget}.tsx`,
      `${rawTarget}.js`,
      `${rawTarget}.jsx`,
      `${rawTarget}/index.ts`,
      `${rawTarget}/index.tsx`,
      `${rawTarget}/index.js`,
    ];

    for (const c of candidates) {
      if (allFileSet.has(c)) return { internal: c };
    }
    return {};
  }

  return { external: spec };
}

function inferLayerAndRole(
  relPath: string,
  exports: string[],
  leadingDoc?: string
): { layer: FileLayer; roleLabel: string; summary: string } {
  const lower = relPath.toLowerCase();
  const base = path.posix.basename(relPath);
  const topExports = exports.slice(0, 3).join('、');

  if (/\.(test|spec)\.[tj]sx?$/.test(lower)) {
    return {
      layer: 'test',
      roleLabel: '自动化测试',
      summary: `验证核心逻辑与回归用例的测试文件${topExports ? `（涉及 ${topExports}）` : ''}。`,
    };
  }

  if (lower.endsWith('.css') || lower.endsWith('.scss')) {
    return {
      layer: 'style-asset',
      roleLabel: '视觉样式表',
      summary: `定义界面视觉风格、主题变量（深/浅色）与排版布局样式。`,
    };
  }

  if (base.includes('config') || base === 'vite.config.ts') {
    return {
      layer: 'config',
      roleLabel: '工程构建配置',
      summary: `控制项目构建、开发服务器或工具链运行参数。`,
    };
  }

  if (base === 'main.tsx' || base === 'main.ts' || base === 'cli.ts' || lower.includes('scripts/')) {
    return {
      layer: 'entrypoint',
      roleLabel: '启动入口',
      summary: leadingDoc
        ? `程序启动入口：${leadingDoc.slice(0, 90)}`
        : `应用或命令行工具的启动入口，负责把各模块组装并运行起来。`,
    };
  }

  if (lower.includes('server') || lower.includes('api') || lower.includes('sidecar') || lower.includes('bridge') || lower.includes('mcp')) {
    return {
      layer: 'server-api',
      roleLabel: lower.includes('mcp') ? 'MCP 协议桥接层' : '本地服务网关',
      summary: leadingDoc
        ? `${leadingDoc.slice(0, 96)}`
        : `对外提供接口或外部 MCP 图谱通信桥接${topExports ? `，核心导出：${topExports}` : ''}。`,
    };
  }

  if (lower.endsWith('.tsx') || lower.endsWith('.jsx') || lower.includes('/components/')) {
    const isApp = base === 'App.tsx' || base === 'App.jsx';
    const isHUD = lower.includes('hud');
    return {
      layer: isApp ? 'entrypoint' : 'ui-component',
      roleLabel: isApp ? '前端主容器' : isHUD ? '悬浮交互主视图' : '界面卡片组件',
      summary: isApp
        ? `前端应用的顶层页面容器，负责串联状态、数据流与界面展示。`
        : topExports
        ? `负责渲染 ${topExports} 相关的交互界面与视觉呈现。`
        : `负责前端局部 UI 渲染与用户交互。`,
    };
  }

  if (lower.includes('schema') || lower.includes('types')) {
    return {
      layer: 'core-logic',
      roleLabel: '共享数据契约',
      summary: `全项目共享的数据结构与类型协议${topExports ? `（定义 ${topExports} 等）` : ''}，改这里会影响上下游多个文件。`,
    };
  }

  if (
    lower.includes('analyzer') ||
    lower.includes('engine') ||
    lower.includes('indexer') ||
    lower.includes('graph') ||
    lower.includes('embedding') ||
    lower.includes('parser')
  ) {
    return {
      layer: 'core-logic',
      roleLabel: '核心 GraphRAG 引擎',
      summary: leadingDoc
        ? `${leadingDoc.slice(0, 96)}`
        : `核心 AST 解析、图谱或检索算法模块${topExports ? `，提供 ${topExports}` : ''}。`,
    };
  }

  if (lower.includes('adapter') || lower.includes('llm') || lower.includes('prompt')) {
    return {
      layer: 'core-logic',
      roleLabel: 'AI 协作适配层',
      summary: leadingDoc
        ? `${leadingDoc.slice(0, 96)}`
        : `负责与大模型通信或拼装结构化指令${topExports ? `（${topExports}）` : ''}。`,
    };
  }

  if (base === 'index.ts' || base === 'index.js') {
    return {
      layer: 'core-logic',
      roleLabel: '模块统一出口',
      summary: topExports
        ? `模块对外统一出口并编排主流程（导出 ${topExports}）。`
        : `聚合导出本目录的核心能力，供外部包统一引用。`,
    };
  }

  return {
    layer: 'module',
    roleLabel: '功能模块',
    summary: leadingDoc
      ? leadingDoc.slice(0, 96)
      : topExports
      ? `提供 ${topExports} 等核心实现逻辑。`
      : `实现项目中的业务辅助功能。`,
  };
}

function extractKeywords(relPath: string, exports: string[], symbols: ParsedSymbol[], summary: string): string[] {
  const symNames = symbols.map((s) => `${s.name} ${s.doc ?? ''}`).join(' ');
  const raw = `${relPath} ${exports.join(' ')} ${symNames} ${summary}`;
  const tokens = raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/)
    .filter((t) => t.length >= 2);
  return Array.from(new Set(tokens)).slice(0, 48);
}

/**
 * Incremental v2.0 AST Repository Indexer:
 * - Uses the real TypeScript Compiler AST for TS/JS/TSX/JSX (zero regex false positives!)
 * - Extracts both File-level imports AND Function/Component-level symbols + call targets
 * - Reuses SHA-256 cached entries (and embeddings!) when files have not changed
 */
export function buildOrUpdateRepoIndex(
  rootDir: string,
  options?: { persistCache?: boolean }
): RepoIndex {
  const startedAt = Date.now();
  const absRoot = path.resolve(rootDir);
  const cachePath = path.join(absRoot, '.codesight', 'index.json');
  const legacyCachePath = path.join(absRoot, '.glassbox', 'index.json');
  const persistCache = options?.persistCache ?? true;

  let prevFiles: Record<string, IndexedFileNode> = {};
  const existingCache = fs.existsSync(cachePath)
    ? cachePath
    : fs.existsSync(legacyCachePath)
    ? legacyCachePath
    : null;
  if (existingCache) {
    try {
      const parsed = JSON.parse(fs.readFileSync(existingCache, 'utf8')) as RepoIndex;
      if (parsed.schemaVersion === '2.0' && parsed.files) {
        prevFiles = parsed.files;
      }
    } catch {
      prevFiles = {};
    }
  }

  const allFiles = collectSourceFiles(absRoot);
  const allFileSet = new Set(allFiles);
  const workspacePkgMap = discoverWorkspacePackages(absRoot);

  const nextFiles: Record<string, IndexedFileNode> = {};
  let reindexedFiles = 0;
  let cachedFiles = 0;
  let totalSymbols = 0;

  for (const relPath of allFiles) {
    const fullPath = path.join(absRoot, relPath);
    const content = fs.readFileSync(fullPath, 'utf8');
    const hash = sha256(content);
    const cached = prevFiles[relPath];

    if (cached && cached.hash === hash) {
      nextFiles[relPath] = cached;
      cachedFiles++;
      totalSymbols += cached.symbols?.length ?? 0;
      continue;
    }

    const ext = path.posix.extname(relPath);
    const parsedAst = parseSourceFileAST(relPath, ext, content);

    const resolvedSet = new Set<string>();
    const externalSet = new Set<string>();

    for (const spec of parsedAst.imports) {
      const resolved = resolveImportToRepoFile(relPath, spec, allFileSet, workspacePkgMap);
      if (resolved.internal && resolved.internal !== relPath) {
        resolvedSet.add(resolved.internal);
      } else if (resolved.external) {
        externalSet.add(resolved.external);
      }
    }

    const { layer, roleLabel, summary } = inferLayerAndRole(
      relPath,
      parsedAst.exports,
      parsedAst.leadingDoc
    );
    const keywords = extractKeywords(relPath, parsedAst.exports, parsedAst.symbols, summary);

    nextFiles[relPath] = {
      path: relPath,
      name: path.posix.basename(relPath),
      ext,
      hash,
      lines: content.split('\n').length,
      sizeBytes: Buffer.byteLength(content, 'utf8'),
      layer,
      roleLabel,
      summary,
      exports: parsedAst.exports.slice(0, 20),
      symbols: parsedAst.symbols,
      rawImports: parsedAst.imports,
      resolvedImports: Array.from(resolvedSet).sort(),
      externalDeps: Array.from(externalSet).sort(),
      keywords,
      parserUsed: parsedAst.parserUsed,
    };
    reindexedFiles++;
    totalSymbols += parsedAst.symbols.length;
  }

  const index: RepoIndex = {
    schemaVersion: '2.0',
    rootDir: absRoot,
    repoName: path.basename(absRoot),
    updatedAt: new Date().toISOString(),
    stats: {
      totalFiles: allFiles.length,
      totalSymbols,
      reindexedFiles,
      cachedFiles,
      scanMs: Math.max(1, Date.now() - startedAt),
    },
    files: nextFiles,
  };

  if (persistCache) {
    try {
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify(index, null, 2), 'utf8');
    } catch {
      // ignore read-only fs
    }
  }

  return index;
}
