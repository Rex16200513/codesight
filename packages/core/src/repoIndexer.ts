import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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
  /** Exported functions, classes, interfaces, types, constants */
  exports: string[];
  /** Raw import specifiers found in code */
  rawImports: string[];
  /** Resolved internal repo file paths (normalized posix relative paths) */
  resolvedImports: string[];
  /** External npm/node packages referenced */
  externalDeps: string[];
  /** Key domain terms extracted for fast search & embedding */
  keywords: string[];
  /** Optional cached dense embedding vector (from local or BYOK embedding provider) */
  embedding?: number[];
  embeddingModel?: string;
}

export interface RepoIndex {
  schemaVersion: '1.0';
  rootDir: string;
  repoName: string;
  updatedAt: string;
  stats: {
    totalFiles: number;
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
            main?: string;
          };
          if (!parsed.name) continue;
          const relDir = toPosix(path.relative(rootDir, dir));
          // Check common source entry points first
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
          // Also map sub-exports like @glassbox/ui/styles.css
          if (parsed.exports && typeof parsed.exports === 'object') {
            for (const [subKey, subVal] of Object.entries(parsed.exports)) {
              if (subKey.startsWith('./') && typeof subVal === 'string') {
                const resolvedSub = path.resolve(dir, subVal);
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

function extractImports(content: string): string[] {
  const imports = new Set<string>();
  const patterns = [
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (m[1]) imports.add(m[1]);
    }
  }
  return Array.from(imports);
}

function extractExports(content: string): string[] {
  const exports = new Set<string>();
  const patterns = [
    /export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g,
    /export\s+class\s+([A-Za-z0-9_$]+)/g,
    /export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g,
    /export\s+(?:interface|type|enum)\s+([A-Za-z0-9_$]+)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (m[1]) exports.add(m[1]);
    }
  }
  return Array.from(exports).slice(0, 14);
}

function extractLeadingComment(content: string): string | undefined {
  const blockMatch = content.match(/^\s*\/\*\*([\s\S]*?)\*\//);
  if (blockMatch) {
    const cleaned = blockMatch[1]
      .split('\n')
      .map((l) => l.replace(/^\s*\*\s?/, '').trim())
      .filter((l) => l.length > 0 && !l.startsWith('@'));
    if (cleaned.length > 0) return cleaned.slice(0, 2).join(' ');
  }
  return undefined;
}

function resolveImportToRepoFile(
  fromRelPosix: string,
  spec: string,
  allFileSet: Set<string>,
  workspacePkgMap: Map<string, string>
): { internal?: string; external?: string } {
  // 1. Workspace package match (e.g. @glassbox/core)
  if (workspacePkgMap.has(spec)) {
    const target = workspacePkgMap.get(spec)!;
    if (allFileSet.has(target)) return { internal: target };
  }

  // 2. Relative file path resolution
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
  content: string
): { layer: FileLayer; roleLabel: string; summary: string } {
  const lower = relPath.toLowerCase();
  const base = path.posix.basename(relPath);
  const leadingDoc = extractLeadingComment(content);
  const topExports = exports.slice(0, 3).join('、');

  if (/\.(test|spec)\.[tj]sx?$/.test(lower)) {
    return {
      layer: 'test',
      roleLabel: '自动化测试',
      summary: `验证相关核心逻辑的单元测试文件${topExports ? `（涉及 ${topExports}）` : ''}。`,
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
        : `应用或脚本的启动入口，负责把各模块组装并运行起来。`,
    };
  }

  if (lower.includes('server') || lower.includes('api') || lower.includes('sidecar') || lower.includes('bridge')) {
    return {
      layer: 'server-api',
      roleLabel: lower.includes('mcp') ? '协议桥接层' : '本地服务网关',
      summary: leadingDoc
        ? `${leadingDoc.slice(0, 96)}`
        : `对外提供接口/通信桥接${topExports ? `，核心导出：${topExports}` : ''}。`,
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

  if (lower.includes('analyzer') || lower.includes('engine') || lower.includes('indexer') || lower.includes('graph') || lower.includes('embedding')) {
    return {
      layer: 'core-logic',
      roleLabel: '核心分析引擎',
      summary: leadingDoc
        ? `${leadingDoc.slice(0, 96)}`
        : `核心算法与分析处理模块${topExports ? `，提供 ${topExports}` : ''}。`,
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

function extractKeywords(relPath: string, exports: string[], summary: string): string[] {
  const raw = `${relPath} ${exports.join(' ')} ${summary}`;
  const tokens = raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/)
    .filter((t) => t.length >= 2);
  return Array.from(new Set(tokens)).slice(0, 32);
}

/**
 * Incremental 0-Token Repository Indexer:
 * - Scans real source files on disk
 * - Reuses cached entries (and cached embeddings!) when SHA-256 hash matches
 * - Resolves both relative imports and workspace package imports into exact file-to-file edges
 */
export function buildOrUpdateRepoIndex(
  rootDir: string,
  options?: { persistCache?: boolean }
): RepoIndex {
  const startedAt = Date.now();
  const absRoot = path.resolve(rootDir);
  const cachePath = path.join(absRoot, '.glassbox', 'index.json');
  const persistCache = options?.persistCache ?? true;

  let prevFiles: Record<string, IndexedFileNode> = {};
  if (fs.existsSync(cachePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as RepoIndex;
      if (parsed.schemaVersion === '1.0' && parsed.files) {
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

  for (const relPath of allFiles) {
    const fullPath = path.join(absRoot, relPath);
    const content = fs.readFileSync(fullPath, 'utf8');
    const hash = sha256(content);
    const cached = prevFiles[relPath];

    if (cached && cached.hash === hash) {
      // Re-resolve imports only if file list changed, but keep expensive fields & embeddings cached
      nextFiles[relPath] = cached;
      cachedFiles++;
      continue;
    }

    const rawImports = extractImports(content);
    const exports = extractExports(content);
    const resolvedSet = new Set<string>();
    const externalSet = new Set<string>();

    for (const spec of rawImports) {
      const resolved = resolveImportToRepoFile(relPath, spec, allFileSet, workspacePkgMap);
      if (resolved.internal && resolved.internal !== relPath) {
        resolvedSet.add(resolved.internal);
      } else if (resolved.external) {
        externalSet.add(resolved.external);
      }
    }

    const { layer, roleLabel, summary } = inferLayerAndRole(relPath, exports, content);
    const keywords = extractKeywords(relPath, exports, summary);

    nextFiles[relPath] = {
      path: relPath,
      name: path.posix.basename(relPath),
      ext: path.posix.extname(relPath),
      hash,
      lines: content.split('\n').length,
      sizeBytes: Buffer.byteLength(content, 'utf8'),
      layer,
      roleLabel,
      summary,
      exports,
      rawImports,
      resolvedImports: Array.from(resolvedSet).sort(),
      externalDeps: Array.from(externalSet).sort(),
      keywords,
    };
    reindexedFiles++;
  }

  const index: RepoIndex = {
    schemaVersion: '1.0',
    rootDir: absRoot,
    repoName: path.basename(absRoot),
    updatedAt: new Date().toISOString(),
    stats: {
      totalFiles: allFiles.length,
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
      // Read-only directories still work gracefully in memory
    }
  }

  return index;
}
