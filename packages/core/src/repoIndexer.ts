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
  'archive',
  'archives',
  'releases',
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

  if (fromRelPosix.endsWith('.py')) {
    const fromDir = path.posix.dirname(fromRelPosix);
    const dotMatch = spec.match(/^(\.+)(.*)$/);
    if (dotMatch) {
      const dots = dotMatch[1].length;
      const rest = dotMatch[2].replace(/\./g, '/');
      let baseDir = fromDir === '.' ? '' : fromDir;
      for (let i = 1; i < dots; i++) {
        baseDir = path.posix.dirname(baseDir);
        if (baseDir === '.') baseDir = '';
      }
      const joined = rest ? path.posix.normalize(path.posix.join(baseDir, rest)) : baseDir;
      const pyCandidates = [`${joined}.py`, `${joined}/__init__.py`];
      for (const c of pyCandidates) {
        if (allFileSet.has(c)) return { internal: c };
      }
      return {};
    }

    // Absolute internal Python module, e.g. `app.services.auth` or `src.models`
    const dottedPath = spec.replace(/\./g, '/');
    const absCandidates = [
      `${dottedPath}.py`,
      `${dottedPath}/__init__.py`,
      `src/${dottedPath}.py`,
      `src/${dottedPath}/__init__.py`,
    ];
    for (const c of absCandidates) {
      if (allFileSet.has(c)) return { internal: c };
    }
    return { external: spec.split('.')[0] };
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
  leadingDoc?: string,
  content?: string
): { layer: FileLayer; roleLabel: string; summary: string } {
  const lower = relPath.toLowerCase();
  const base = path.posix.basename(relPath);
  const topExports = exports.slice(0, 3).join('、');

  if (/\.(test|spec)\.[tj]sx?$/.test(lower) || /(^|\/)(tests?|__tests__)\//.test(lower)) {
    return {
      layer: 'test',
      roleLabel: '测试文件',
      summary: `用来自动检查代码有没有改坏${topExports ? `（测 ${topExports}）` : ''}。`,
    };
  }

  if (lower.endsWith('.css') || lower.endsWith('.scss')) {
    return {
      layer: 'style-asset',
      roleLabel: '界面样式',
      summary: `控制界面的颜色、字体、深浅色主题和排版。`,
    };
  }

  if (base.includes('config') || base === 'vite.config.ts') {
    return {
      layer: 'config',
      roleLabel: '项目配置',
      summary: `控制打包、编译和本地启动参数。`,
    };
  }

  // Browser extension / multi-page entrypoints (before generic index.ts check!)
  if (/(^|\/)pages\/background\/index\.[tj]sx?$/i.test(lower)) {
    return {
      layer: 'server-api',
      roleLabel: '扩展后台脚本',
      summary: `浏览器扩展的后台常驻脚本，负责响应扩展事件与跨页面通信。`,
    };
  }
  if (/(^|\/)pages\/content\/index\.[tj]sx?$/i.test(lower)) {
    return {
      layer: 'entrypoint',
      roleLabel: '页面注入入口',
      summary: `注入到目标网页的主入口，负责初始化所有功能模块与界面组件。`,
    };
  }
  if (/(^|\/)pages\/(options|popup)\/index\.[tj]sx?$/i.test(lower)) {
    const isOpt = lower.includes('/options/');
    return {
      layer: 'entrypoint',
      roleLabel: isOpt ? '设置页入口' : '弹窗页入口',
      summary: isOpt ? `扩展设置页面的启动与交互入口。` : `扩展顶部图标弹窗的界面入口。`,
    };
  }

  if (base === 'main.tsx' || base === 'main.ts' || base === 'cli.ts' || lower.includes('scripts/')) {
    return {
      layer: 'entrypoint',
      roleLabel: '启动入口',
      summary: `程序启动的入口文件，负责把各个模块串起来运行。`,
    };
  }

  if (lower.includes('server') || lower.includes('api') || lower.includes('sidecar') || lower.includes('bridge') || lower.includes('mcp')) {
    return {
      layer: 'server-api',
      roleLabel: lower.includes('mcp') ? '插件通信接口' : '本地后台服务',
      summary: lower.includes('mcp')
        ? `负责和 Antigravity、Cursor、ChatGPT 等 AI 软件对接通信。`
        : `负责在本地接收请求并把分析结果传给界面。`,
    };
  }

  const hasDomUi =
    Boolean(
      content &&
        /(document\.createElement\s*\(|\.innerHTML\s*=|\.attachShadow\s*\(|\.insertAdjacentHTML\s*\(|document\.querySelector(?:All)?\s*\()/.test(
          content
        )
    ) &&
    !/(^|\/)core\/(utils|services|types)\//.test(lower) &&
    !/(indexer|parser|analyzer|graph|embedding)\.[tj]s$/i.test(base);
  const hasUiFileName = /(modal|dialog|drawer|sidebar|board|panel|hud|toolbar|launcher|customizer|highlighter|toolhub|popover|toast)/i.test(base);

  if (lower.endsWith('.tsx') || lower.endsWith('.jsx') || lower.includes('/components/') || hasUiFileName || hasDomUi) {
    const isApp = base === 'App.tsx' || base === 'App.jsx';
    const isModal = /modal|dialog|drawer|sheet/i.test(base);
    const isSidebar = /sidebar|hud|panel|launcher/i.test(base);
    const isBoard = /board|customizer|toolhub|highlighter/i.test(base);
    return {
      layer: isApp ? 'entrypoint' : 'ui-component',
      roleLabel: isApp
        ? '主页面'
        : isModal
        ? '弹窗界面'
        : isSidebar
        ? '侧边栏 / 悬浮界面'
        : isBoard
        ? '交互画板 / 功能面板'
        : '界面组件',
      summary: isApp
        ? `前端的主页面，负责管理状态并把各个界面组件拼在一起。`
        : leadingDoc
        ? leadingDoc.slice(0, 90)
        : topExports
        ? `负责渲染与控制 ${topExports} 对应的界面交互。`
        : `负责展示局部界面内容和点击交互。`,
    };
  }

  if (lower.includes('schema') || lower.includes('types')) {
    return {
      layer: 'core-logic',
      roleLabel: '全项目共用数据格式',
      summary: `定义了整个项目通用的数据字段和类型，很多文件都依赖它，改动前要小心。`,
    };
  }

  if (lower.includes('prompt')) {
    return {
      layer: 'core-logic',
      roleLabel: '修复指令生成',
      summary: `把你的选择整理成清晰、精确的指令，直接发给 AI 去改代码。`,
    };
  }

  if (lower.includes('adapter') || lower.includes('llm')) {
    return {
      layer: 'core-logic',
      roleLabel: '大模型连接器',
      summary: `负责调用你绑定的外部或本地大模型（OpenAI / DeepSeek / Ollama）。`,
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
      roleLabel: '代码分析核心',
      summary: lower.includes('parser')
        ? `解析代码里的函数、导出和调用关系。`
        : lower.includes('graph')
        ? `计算文件之间谁依赖谁，以及改动会影响哪些文件。`
        : lower.includes('embedding')
        ? `把代码转成可搜索的索引，方便用自然语言快速找到文件。`
        : lower.includes('indexer')
        ? `扫描项目目录并缓存每个文件的结构信息。`
        : `负责分析报错信息、检测隐患并给出修改建议。`,
    };
  }

  if (base === 'index.ts' || base === 'index.js') {
    return {
      layer: 'core-logic',
      roleLabel: '目录汇总出口',
      summary: `把当前文件夹里的功能统一汇总对外提供，方便其他模块引用。`,
    };
  }

  return {
    layer: 'module',
    roleLabel: '功能模块',
    summary: topExports
      ? `提供 ${topExports} 等具体功能实现。`
      : `实现项目中的具体业务逻辑。`,
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
      parsedAst.leadingDoc,
      content
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
