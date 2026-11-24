export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface UiResourceEntry {
  title: string;
  html: string;
}

export const SERVER_INFO = {
  name: 'codesight',
  version: '1.0.3',
};

export const TOOL_DEFINITIONS = [
  {
    name: 'codesight_map',
    description:
      'Build an incremental AST + Dependency Graph comprehension map of a local repository. Reveals high-impact core hub files and plain-language roles per layer at near-zero token cost.',
    inputSchema: {
      type: 'object',
      properties: {
        repoDir: {
          type: 'string',
          description: 'Absolute path to the repository root (defaults to current working directory).',
        },
        architectureOverride: {
          type: 'object',
          description:
            'Optional semantic architecture blueprint provided by the host AI agent (e.g., custom Frontend / Backend / Shared zones and per-UI-component wireframe prototypes). Cached locally once provided.',
        },
        forceRefresh: {
          type: 'boolean',
          description:
            'When true, bypasses the cached .codesight/architecture.json and regenerates zones + UI wireframe prototypes using the configured BYOK LLM.',
        },
      },
    },
    _meta: {
      ui: { resourceUri: 'ui://codesight/map/latest' },
    },
  },
  {
    name: 'codesight_ask',
    description:
      'Locate relevant code files using hybrid GraphRAG (BM25 + Bilingual Vector + 1-hop Dependency Graph RRF). Compresses whole-repo context by ~97% and returns exact symbol/dependency context.',
    inputSchema: {
      type: 'object',
      required: ['question'],
      properties: {
        question: {
          type: 'string',
          description: 'Natural language question (Chinese or English) or symbol/concept to locate.',
        },
        repoDir: {
          type: 'string',
          description: 'Absolute path to the repository root (defaults to current working directory).',
        },
      },
    },
  },
  {
    name: 'codesight_trace',
    description:
      'Trace cross-file AST callers and callees of any function, React component, class, or type before editing it.',
    inputSchema: {
      type: 'object',
      required: ['symbol'],
      properties: {
        symbol: {
          type: 'string',
          description: 'Exact or partial function/component/type name to trace.',
        },
        repoDir: {
          type: 'string',
          description: 'Absolute path to the repository root (defaults to current working directory).',
        },
      },
    },
    _meta: {
      ui: { resourceUri: 'ui://codesight/trace/latest' },
    },
  },
  {
    name: 'codesight_diagnose',
    description:
      'Project a terminal error stack trace and/or current git diff onto the repository dependency & AST call graph. Computes Blast Radius, Safe Zones, Silent Regression traps (removed guards / empty catch / as any), and concrete Fix Directions.',
    inputSchema: {
      type: 'object',
      properties: {
        rawError: {
          type: 'string',
          description: 'Raw compiler or runtime error / stack trace.',
        },
        useGit: {
          type: 'boolean',
          description: 'If true, safely inspects uncommitted git diff inside repoDir for blast radius and silent regressions.',
        },
        repoDir: {
          type: 'string',
          description: 'Absolute path to the repository root (defaults to current working directory).',
        },
      },
    },
    _meta: {
      ui: { resourceUri: 'ui://codesight/diagnose/latest' },
    },
  },
  {
    name: 'codesight_settings',
    description:
      'View, update, or reset unified CodeSight settings (~/.codesight/config.json) shared across AI Agent plugins, CLI, and macOS HUD (language, dashed flow lines, silent regression guard, architecture mode, optional BYOK LLM).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'set', 'reset'],
          description: 'Action to perform (defaults to "get").',
        },
        language: { type: 'string', enum: ['zh', 'en'] },
        dashedLines: { type: 'string', enum: ['always', 'hover'] },
        collapsedByDefault: { type: 'boolean' },
        autoOpenBrowser: { type: 'boolean' },
        silentRegressionGuard: { type: 'boolean' },
        architectureMode: { type: 'string', enum: ['auto', 'heuristic', 'llm'] },
        llm: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            baseUrl: { type: 'string' },
            apiKey: { type: 'string' },
            model: { type: 'string' },
          },
        },
        hud: {
          type: 'object',
          properties: {
            alwaysOnTop: { type: 'boolean' },
            opacity: { type: 'number' },
          },
        },
        repoDir: {
          type: 'string',
          description: 'Optional repo root if reading/writing project-scoped config.',
        },
      },
    },
    _meta: {
      ui: { resourceUri: 'ui://codesight/settings/latest' },
    },
  },
];
