import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { CodeDependencyGraph } from './codeGraph.ts';
import type { IndexedFileNode, RepoIndex } from './repoIndexer.ts';
import type { LLMConfig } from './schema.ts';

export type ProjectArchetype =
  | 'fullstack'
  | 'frontend'
  | 'backend'
  | 'browser-extension'
  | 'monorepo-platform'
  | 'library';

export type ZoneKind = 'frontend' | 'backend' | 'shared' | 'core';

export type UiPrototypeBlockType =
  | 'header'
  | 'tabs'
  | 'toggle'
  | 'slider'
  | 'chips'
  | 'list'
  | 'search'
  | 'highlight'
  | 'actions';

export interface UiPrototypeBlock {
  type: UiPrototypeBlockType;
  label?: string;
  items?: string[];
  /** For toggle blocks */
  on?: boolean;
  /** For slider blocks (0..100) */
  value?: number;
  /** Optional color dots for folder/highlight/theme pills (e.g. ["#F59E0B","#10B981","#3B82F6"]) */
  colors?: string[];
}

export interface UiPrototypeSpec {
  kind:
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
  visualSummary: string;
  visualSummaryEn?: string;
  /** Structured mini-wireframe controls rendered into an authentic Apple-style component diagram */
  blocks?: UiPrototypeBlock[];
  /** Legacy simple element list fallback */
  elements?: string[];
}

export interface ArchitectureGroup {
  id: string;
  title: string;
  subtitle: string;
  files: string[];
}

export interface ArchitectureZone {
  id: string;
  title: string;
  badge: string;
  kind: ZoneKind;
  groups: ArchitectureGroup[];
}

export interface ArchitectureBlueprint {
  schemaVersion: '1.0';
  structureHash: string;
  archetype: ProjectArchetype;
  archetypeLabel: string;
  projectHeadline: string;
  source: 'llm-cached' | 'host-agent' | 'smart-heuristic';
  modelName?: string;
  zones: ArchitectureZone[];
  /** Optional LLM or Host-Agent curated visual prototype specs keyed by repo file path */
  prototypes?: Record<string, UiPrototypeSpec>;
}

export interface HostArchitectureOverride {
  archetype?: ProjectArchetype;
  archetypeLabel?: string;
  projectHeadline?: string;
  zones: Array<{
    id?: string;
    title: string;
    badge?: string;
    kind: ZoneKind;
    groups: Array<{
      id?: string;
      title: string;
      subtitle?: string;
      files: string[];
    }>;
  }>;
  prototypes?: Record<string, UiPrototypeSpec>;
}

function computeStructureHash(files: IndexedFileNode[]): string {
  const sig = files
    .map((f) => `${f.path}:${f.layer}`)
    .sort()
    .join('\n');
  return crypto.createHash('sha256').update(sig).digest('hex').slice(0, 14);
}

function isFrontendFile(f: IndexedFileNode): boolean {
  const p = f.path.toLowerCase();
  if (f.layer === 'ui-component' || f.ext === '.tsx' || f.ext === '.jsx' || f.ext === '.vue' || f.ext === '.svelte') {
    return true;
  }
  if (f.ext === '.py' && f.externalDeps.some((d) => ['streamlit', 'gradio', 'nicegui', 'dash'].includes(d))) {
    return true;
  }
  return /(^|\/)(frontend|client|web|ui|hud|pages|components|views|hooks|stores?)\//i.test(p);
}

function isBackendFile(f: IndexedFileNode): boolean {
  const p = f.path.toLowerCase();
  if (f.layer === 'server-api') return true;
  if (f.ext === '.py' && f.externalDeps.some((d) => ['fastapi', 'flask', 'django', 'starlette', 'uvicorn', 'aiohttp', 'tornado'].includes(d))) {
    return true;
  }
  return /(^|\/)(backend|server|api|sidecar|mcp-server|routes|routers|controllers|services|middleware|db|prisma|cli)\//i.test(p);
}

function isSharedFoundationFile(f: IndexedFileNode, graph: CodeDependencyGraph): boolean {
  const p = f.path.toLowerCase();
  const m = graph.nodes[f.path];
  if (/(schema|types?|contracts?|models?|constants?)\.(ts|js|py)$/i.test(p)) return true;
  if (/(^|\/)(shared|common|types|core|models|schemas)\//i.test(p) && (m?.totalDownstreamReach ?? 0) >= 3) return true;
  return false;
}

function isBrowserExtensionRepo(index: RepoIndex, allFiles: IndexedFileNode[]): boolean {
  const hasManifest =
    fs.existsSync(path.join(index.rootDir, 'manifest.json')) ||
    fs.existsSync(path.join(index.rootDir, 'chrome/manifest.json')) ||
    fs.existsSync(path.join(index.rootDir, 'edge/manifest.json')) ||
    fs.existsSync(path.join(index.rootDir, 'public/manifest.json'));
  const hasExtPages =
    allFiles.some((f) => /pages\/content\//i.test(f.path)) &&
    allFiles.some((f) => /pages\/(background|options|popup)\//i.test(f.path));
  return hasManifest || hasExtPages;
}

/**
 * 0-Token Adaptive Project Archetype Detector:
 * Automatically recognizes Browser Extensions, Full-Stack (Frontend + Backend separation),
 * Pure Frontend, Pure Backend, or Modular Platform repositories and builds meaningful layered zones.
 */
export function detectSmartArchitecture(
  index: RepoIndex,
  graph: CodeDependencyGraph
): ArchitectureBlueprint {
  const allFiles = Object.values(index.files).filter(
    (f) => f.layer !== 'test' && f.layer !== 'config' && f.layer !== 'style-asset'
  );
  const structureHash = computeStructureHash(allFiles);
  const sortByImpact = (arr: IndexedFileNode[]) =>
    [...arr].sort(
      (a, b) =>
        (graph.nodes[b.path]?.totalDownstreamReach ?? 0) -
          (graph.nodes[a.path]?.totalDownstreamReach ?? 0) ||
        a.path.localeCompare(b.path)
    );

  // Case 0: Browser Extension (Chrome / Edge / Firefox)
  if (isBrowserExtensionRepo(index, allFiles)) {
    const extEntries = sortByImpact(allFiles.filter((f) => /(^|\/)pages\//i.test(f.path)));
    const featureUi = sortByImpact(
      allFiles.filter(
        (f) =>
          !extEntries.includes(f) &&
          (/(^|\/)features\//i.test(f.path) || f.layer === 'ui-component')
      )
    );
    const runtimeServices = sortByImpact(
      allFiles.filter(
        (f) =>
          !extEntries.includes(f) &&
          !featureUi.includes(f) &&
          /(^|\/)services\//i.test(f.path)
      )
    );
    const coreUtilsAndTypes = sortByImpact(
      allFiles.filter(
        (f) => !extEntries.includes(f) && !featureUi.includes(f) && !runtimeServices.includes(f)
      )
    );

    const rawZones: ArchitectureZone[] = [
      {
        id: 'zone-ext-ui',
        title: '界面与功能 · UI & Features',
        badge: 'UI & Features',
        kind: 'frontend',
        groups: [
          ...(extEntries.length > 0
            ? [{ id: 'ext-entry', title: '扩展入口', subtitle: '注入脚本、后台与设置页', files: extEntries.map((f) => f.path) }]
            : []),
          ...(featureUi.length > 0
            ? [{ id: 'ext-features', title: '界面功能模块', subtitle: '弹窗、侧边栏与交互面板', files: featureUi.map((f) => f.path) }]
            : []),
        ],
      },
      {
        id: 'zone-ext-services',
        title: '状态与生命周期 · Services',
        badge: 'Services',
        kind: 'backend',
        groups: [
          ...(runtimeServices.length > 0
            ? [{ id: 'ext-srv', title: '本地服务层', subtitle: '存储、配置与页面生命周期', files: runtimeServices.map((f) => f.path) }]
            : []),
        ],
      },
      {
        id: 'zone-ext-core',
        title: '底层工具与类型 · Core',
        badge: 'Core & Types',
        kind: 'shared',
        groups: [
          ...(coreUtilsAndTypes.length > 0
            ? [{ id: 'ext-core', title: 'DOM 工具与数据定义', subtitle: '全项目共用基础能力', files: coreUtilsAndTypes.map((f) => f.path) }]
            : []),
        ],
      },
    ];
    const zones = rawZones.filter((z) => z.groups.length > 0);

    return {
      schemaVersion: '1.0',
      structureHash,
      archetype: 'browser-extension',
      archetypeLabel: '浏览器扩展架构',
      projectHeadline: `${index.repoName} 是浏览器扩展项目，按扩展入口与界面功能、本地服务、底层工具三层划分`,
      source: 'smart-heuristic',
      zones,
    };
  }

  const frontendFiles: IndexedFileNode[] = [];
  const backendFiles: IndexedFileNode[] = [];
  const coreFiles: IndexedFileNode[] = [];
  const foundationFiles: IndexedFileNode[] = [];

  for (const f of allFiles) {
    if (isFrontendFile(f)) {
      frontendFiles.push(f);
    } else if (isBackendFile(f)) {
      backendFiles.push(f);
    } else if (isSharedFoundationFile(f, graph) && (graph.nodes[f.path]?.outDegree ?? 0) <= 1) {
      foundationFiles.push(f);
    } else {
      coreFiles.push(f);
    }
  }

  const hasFrontend = frontendFiles.length > 0;
  const hasBackend = backendFiles.length > 0;

  // Case 1: Full-Stack / Frontend + Backend Separated Project
  if (hasFrontend && hasBackend) {
    const feEntries = sortByImpact(frontendFiles.filter((f) => f.layer === 'entrypoint' || /app|main|page/i.test(f.name)));
    const feComponents = sortByImpact(frontendFiles.filter((f) => !feEntries.includes(f)));

    const beServices = sortByImpact(backendFiles.filter((f) => f.layer === 'server-api' || /server|api|route|mcp/i.test(f.path)));
    const beCliAndOther = sortByImpact(backendFiles.filter((f) => !beServices.includes(f)));

    const coreSorted = sortByImpact(coreFiles);
    const foundSorted = sortByImpact(foundationFiles);

    const zones: ArchitectureZone[] = [
      {
        id: 'zone-frontend',
        title: '前端 · 展示与交互层',
        badge: 'Frontend',
        kind: 'frontend',
        groups: [
          ...(feEntries.length > 0
            ? [{ id: 'fe-entry', title: '页面与入口', subtitle: '用户打开的界面', files: feEntries.map((f) => f.path) }]
            : []),
          ...(feComponents.length > 0
            ? [{ id: 'fe-ui', title: '界面组件', subtitle: '卡片与交互视图', files: feComponents.map((f) => f.path) }]
            : []),
        ],
      },
      {
        id: 'zone-backend',
        title: '后端 · 服务与入口层',
        badge: 'Backend / Plugin',
        kind: 'backend',
        groups: [
          ...(beServices.length > 0
            ? [{ id: 'be-srv', title: '服务与接口', subtitle: 'HTTP / MCP / 网关', files: beServices.map((f) => f.path) }]
            : []),
          ...(beCliAndOther.length > 0
            ? [{ id: 'be-cli', title: '命令与工具入口', subtitle: 'CLI 与安装脚本', files: beCliAndOther.map((f) => f.path) }]
            : []),
        ],
      },
    ];

    if (coreSorted.length > 0 || foundSorted.length > 0) {
      zones.push({
        id: 'zone-shared',
        title: '共享核心 · 逻辑与数据层',
        badge: 'Core & Shared',
        kind: 'shared',
        groups: [
          ...(coreSorted.length > 0
            ? [{ id: 'core-engine', title: '核心分析与业务', subtitle: '前后端共用的处理核心', files: coreSorted.map((f) => f.path) }]
            : []),
          ...(foundSorted.length > 0
            ? [{ id: 'core-foundation', title: '基础数据定义', subtitle: '全项目共用结构', files: foundSorted.map((f) => f.path) }]
            : []),
        ],
      });
    }

    return {
      schemaVersion: '1.0',
      structureHash,
      archetype: 'fullstack',
      archetypeLabel: '前后端分层架构',
      projectHeadline: `${index.repoName} 包含清晰的前端界面、后端服务与共享核心三层结构`,
      source: 'smart-heuristic',
      zones: zones.filter((z) => z.groups.length > 0),
    };
  }

  // Case 2: Pure Frontend SPA
  if (hasFrontend && !hasBackend) {
    const pages = sortByImpact(frontendFiles.filter((f) => f.layer === 'entrypoint' || /page|app|route/i.test(f.path)));
    const comps = sortByImpact(frontendFiles.filter((f) => !pages.includes(f)));
    const logic = sortByImpact([...coreFiles, ...foundationFiles]);

    return {
      schemaVersion: '1.0',
      structureHash,
      archetype: 'frontend',
      archetypeLabel: '前端应用架构',
      projectHeadline: `${index.repoName} 是一个纯前端项目，按页面、组件与数据逻辑分层`,
      source: 'smart-heuristic',
      zones: [
        {
          id: 'zone-fe',
          title: '前端界面层',
          badge: 'Frontend',
          kind: 'frontend' as ZoneKind,
          groups: [
            ...(pages.length > 0 ? [{ id: 'pages', title: '页面与入口', subtitle: '路由与顶层视图', files: pages.map((f) => f.path) }] : []),
            ...(comps.length > 0 ? [{ id: 'comps', title: '可复用组件', subtitle: '界面模块', files: comps.map((f) => f.path) }] : []),
          ],
        },
        ...(logic.length > 0
          ? [
              {
                id: 'zone-logic',
                title: '状态与数据层',
                badge: 'State & Data',
                kind: 'shared' as ZoneKind,
                groups: [{ id: 'logic', title: '逻辑与数据定义', subtitle: '接口请求、状态与类型', files: logic.map((f) => f.path) }],
              },
            ]
          : []),
      ].filter((z) => z.groups.length > 0),
    };
  }

  // Case 3: Backend Service or Core Library
  const entries = sortByImpact([...backendFiles, ...coreFiles.filter((f) => f.layer === 'entrypoint')]);
  const logic = sortByImpact(coreFiles.filter((f) => !entries.includes(f)));
  const found = sortByImpact(foundationFiles);

  return {
    schemaVersion: '1.0',
    structureHash,
    archetype: hasBackend ? 'backend' : 'library',
    archetypeLabel: hasBackend ? '后端服务架构' : '模块化代码库',
    projectHeadline: `${index.repoName} 按接口入口、核心处理与底层数据分层`,
    source: 'smart-heuristic',
    zones: [
      ...(entries.length > 0
        ? [
            {
              id: 'zone-entry',
              title: '对外接口与入口',
              badge: 'Backend / API',
              kind: 'backend' as ZoneKind,
              groups: [{ id: 'api', title: '入口与服务', subtitle: '请求接入层', files: entries.map((f) => f.path) }],
            },
          ]
        : []),
      {
        id: 'zone-core',
        title: '核心处理与底层数据',
        badge: 'Core',
        kind: 'core' as ZoneKind,
        groups: [
          ...(logic.length > 0 ? [{ id: 'core', title: '核心逻辑', subtitle: '主要业务与算法', files: logic.map((f) => f.path) }] : []),
          ...(found.length > 0 ? [{ id: 'data', title: '基础数据定义', subtitle: '公共类型与模型', files: found.map((f) => f.path) }] : []),
        ],
      },
    ].filter((z) => z.groups.length > 0),
  };
}

/**
 * Validates and normalizes a Host-Agent or LLM-provided architecture blueprint so:
 * - Only real files present in the repo index are kept (zero hallucinations!)
 * - Any unmapped real files are cleanly appended to the fallback zone so nothing is lost.
 */
export function normalizeArchitectureBlueprint(
  override: HostArchitectureOverride,
  index: RepoIndex,
  source: ArchitectureBlueprint['source'],
  modelName?: string
): ArchitectureBlueprint {
  const validFiles = Object.values(index.files).filter(
    (f) => f.layer !== 'test' && f.layer !== 'config' && f.layer !== 'style-asset'
  );
  const validPathSet = new Set(validFiles.map((f) => f.path));
  const used = new Set<string>();

  const resolveFileRef = (raw: string): string | undefined => {
    if (validPathSet.has(raw)) return raw;
    const bySuffix = validFiles.find((f) => f.path.endsWith(`/${raw}`) || f.name === raw);
    return bySuffix?.path;
  };

  const zones: ArchitectureZone[] = [];
  override.zones.forEach((z, zi) => {
    const groups: ArchitectureGroup[] = [];
    z.groups.forEach((g, gi) => {
      const resolved: string[] = [];
      for (const raw of g.files) {
        const hit = resolveFileRef(raw);
        if (hit && !used.has(hit)) {
          used.add(hit);
          resolved.push(hit);
        }
      }
      if (resolved.length > 0) {
        groups.push({
          id: g.id || `z${zi}-g${gi}`,
          title: g.title,
          subtitle: g.subtitle || '',
          files: resolved,
        });
      }
    });
    if (groups.length > 0) {
      zones.push({
        id: z.id || `zone-${zi}`,
        title: z.title,
        badge:
          z.badge ||
          (z.kind === 'frontend' ? 'Frontend' : z.kind === 'backend' ? 'Backend' : 'Shared Core'),
        kind: z.kind,
        groups,
      });
    }
  });

  // Attach any remaining unmapped important files cleanly
  const leftover = validFiles.filter((f) => !used.has(f.path)).map((f) => f.path);
  if (leftover.length > 0 && zones.length > 0) {
    zones[zones.length - 1].groups.push({
      id: 'other-files',
      title: '其他模块',
      subtitle: '辅助实现',
      files: leftover,
    });
  }

  const validBlockTypes = new Set<UiPrototypeBlockType>([
    'header',
    'tabs',
    'toggle',
    'slider',
    'chips',
    'list',
    'search',
    'highlight',
    'actions',
  ]);
  const normalizedPrototypes: Record<string, UiPrototypeSpec> = {};
  if (override.prototypes && typeof override.prototypes === 'object') {
    for (const [rawKey, spec] of Object.entries(override.prototypes)) {
      const hit = resolveFileRef(rawKey);
      if (hit && spec && typeof spec === 'object' && spec.kind && spec.visualSummary) {
        const blocks = Array.isArray(spec.blocks)
          ? spec.blocks
              .filter((b): b is UiPrototypeBlock => Boolean(b && validBlockTypes.has(b.type)))
              .slice(0, 5)
              .map((b) => ({
                type: b.type,
                ...(b.label ? { label: String(b.label).slice(0, 24) } : {}),
                ...(Array.isArray(b.items)
                  ? { items: b.items.map((x) => String(x).slice(0, 14)).slice(0, 4) }
                  : {}),
                ...(typeof b.on === 'boolean' ? { on: b.on } : {}),
                ...(typeof b.value === 'number' ? { value: Math.max(0, Math.min(100, b.value)) } : {}),
                ...(Array.isArray(b.colors)
                  ? { colors: b.colors.filter((c) => /^#[0-9a-fA-F]{3,6}$/.test(c)).slice(0, 6) }
                  : {}),
              }))
          : undefined;

        normalizedPrototypes[hit] = {
          kind: spec.kind,
          visualSummary: String(spec.visualSummary).slice(0, 140),
          visualSummaryEn: spec.visualSummaryEn ? String(spec.visualSummaryEn).slice(0, 140) : undefined,
          ...(blocks && blocks.length > 0 ? { blocks } : {}),
          elements: Array.isArray(spec.elements)
            ? spec.elements.map((e) => String(e).slice(0, 20)).slice(0, 4)
            : undefined,
        };
      }
    }
  }

  return {
    schemaVersion: '1.0',
    structureHash: computeStructureHash(validFiles),
    archetype: override.archetype || 'fullstack',
    archetypeLabel: override.archetypeLabel || 'AI 定制架构视图',
    projectHeadline: override.projectHeadline || `${index.repoName} 智能分层架构图`,
    source,
    modelName,
    zones,
    ...(Object.keys(normalizedPrototypes).length > 0 ? { prototypes: normalizedPrototypes } : {}),
  };
}

function extractCompactUiClues(rootDir: string, relPath: string): string {
  try {
    const raw = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
    // Strip block/line comments so only real UI text & markup strings remain
    const cleaned = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const labels = Array.from(
      new Set(
        (cleaned.match(/['"`]([^'"`\n\r]{2,22})['"`]/g) || [])
          .map((s) => s.slice(1, -1).trim())
          .filter((s) => /[\u4e00-\u9fa5]|^[A-Z][a-z]+(\s[A-Za-z]+){0,2}$/.test(s))
      )
    ).slice(0, 8);
    return labels.length > 0 ? ` uiLabels:[${labels.join(', ')}]` : '';
  } catch {
    return '';
  }
}

function resolveEnvLLMConfig(): LLMConfig | undefined {
  const baseUrl = process.env.CODESIGHT_LLM_BASE_URL || process.env.OPENAI_BASE_URL;
  const apiKey = process.env.CODESIGHT_LLM_API_KEY || process.env.OPENAI_API_KEY || '';
  const model = process.env.CODESIGHT_LLM_MODEL || process.env.OPENAI_MODEL;
  if (!baseUrl || !model) return undefined;
  return { enabled: true, baseUrl, apiKey, model };
}

/**
 * Low-Token Architecture Planner:
 * 1. If Host Agent passes `override`, normalizes & caches it (0 extra API key needed!).
 * 2. Otherwise checks `.codesight/architecture.json` cache (0 tokens on repeat runs!).
 * 3. If a BYOK LLM is configured, sends ONLY a ~350-token compact file list to craft a project-specific
 *    architecture (Frontend vs Backend vs Shared layers) and caches it permanently until structure changes.
 * 4. Always falls back gracefully to the 0-token Smart Multi-Archetype Detector.
 */
export async function resolveProjectArchitecture(
  index: RepoIndex,
  graph: CodeDependencyGraph,
  options?: {
    override?: HostArchitectureOverride;
    llmConfig?: LLMConfig;
    persistCache?: boolean;
    forceRefresh?: boolean;
  }
): Promise<ArchitectureBlueprint> {
  const persistCache = options?.persistCache ?? true;
  const cachePath = path.join(index.rootDir, '.codesight', 'architecture.json');

  const primaryFiles = Object.values(index.files).filter(
    (f) => f.layer !== 'test' && f.layer !== 'config' && f.layer !== 'style-asset'
  );
  const currentHash = computeStructureHash(primaryFiles);

  // 1. Host Agent directly supplied semantic architecture (e.g. Antigravity / Claude / ChatGPT!)
  if (options?.override && options.override.zones.length > 0) {
    const bp = normalizeArchitectureBlueprint(options.override, index, 'host-agent', 'Host Agent');
    if (persistCache) {
      try {
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        fs.writeFileSync(cachePath, JSON.stringify(bp, null, 2), 'utf8');
      } catch {
        // ignore
      }
    }
    return bp;
  }

  // 2. Check cached LLM / Host-Agent architecture blueprint (skip when forceRefresh is requested)
  if (!options?.forceRefresh && fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as ArchitectureBlueprint;
      if (cached.schemaVersion === '1.0' && cached.structureHash === currentHash && cached.zones?.length > 0) {
        return cached;
      }
    } catch {
      // ignore corrupted cache
    }
  }

  // 3. Optional ultra-low-token BYOK LLM architecture classification (~350 tokens once per repo structure!)
  const llm = options?.llmConfig?.enabled ? options.llmConfig : resolveEnvLLMConfig();
  if (llm?.enabled && llm.baseUrl && llm.model) {
    try {
      const compactManifest = primaryFiles
        .slice(0, 45)
        .map((f) => {
          const uiHint =
            f.layer === 'ui-component' || f.layer === 'entrypoint' || /\.(tsx|jsx|vue|svelte)$/.test(f.path)
              ? extractCompactUiClues(index.rootDir, f.path)
              : '';
          return `- ${f.path} [${f.roleLabel}] exports:(${f.exports.slice(0, 3).join(',')})${uiHint}`;
        })
        .join('\n');

      const endpoint = `${llm.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (llm.apiKey.trim()) headers['Authorization'] = `Bearer ${llm.apiKey.trim()}`;

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: llm.model,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You are an expert software architect and UI designer. Given repo files (with extracted UI labels for UI components), classify the project into 2-3 clear zones AND for every UI component generate a concrete `prototypes` entry using typed mini-wireframe blocks so a PM or designer immediately recognizes what that component renders on screen. Supported block types: {"type":"header","label":"..."}, {"type":"tabs","items":["A","B"]}, {"type":"toggle","label":"...","on":true}, {"type":"slider","label":"...","value":65}, {"type":"chips","items":["..."],"colors":["#3B82F6","#10B981"]}, {"type":"list","items":["..."],"colors":["#F59E0B","#EC4899"]}, {"type":"search","label":"..."}, {"type":"highlight","label":"..."}, {"type":"actions","items":["Cancel","Save"]}. Return ONLY JSON: {"archetype":"fullstack|frontend|backend|browser-extension|monorepo-platform|library","archetypeLabel":"...","projectHeadline":"...","zones":[...],"prototypes":{"exact/ui-file.ts":{"kind":"ui-modal|ui-hud|ui-card-flow|ui-card-diff|ui-card|ui-page","visualSummary":"1 concise Chinese sentence","visualSummaryEn":"1 concise English sentence","blocks":[...]}}}',
            },
            {
              role: 'user',
              content: `Repo: ${index.repoName}\nFiles:\n${compactManifest}`,
            },
          ],
        }),
      });

      if (resp.ok) {
        const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const raw = data.choices?.[0]?.message?.content?.trim();
        if (raw) {
          const parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '')) as HostArchitectureOverride;
          if (Array.isArray(parsed.zones) && parsed.zones.length > 0) {
            const bp = normalizeArchitectureBlueprint(parsed, index, 'llm-cached', llm.model);
            if (persistCache) {
              try {
                fs.mkdirSync(path.dirname(cachePath), { recursive: true });
                fs.writeFileSync(cachePath, JSON.stringify(bp, null, 2), 'utf8');
              } catch {
                // ignore
              }
            }
            return bp;
          }
        }
      }
    } catch {
      // Fallback smoothly to 0-token smart heuristic
    }
  }

  // 4. Default 0-Token Smart Multi-Archetype Detector
  return detectSmartArchitecture(index, graph);
}
