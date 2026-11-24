import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { LLMConfig } from './schema.ts';

export type CodeSightLanguage = 'zh' | 'en';
export type DashedLineMode = 'always' | 'hover';
export type ArchitectureMode = 'auto' | 'heuristic' | 'llm';

export interface CodeSightConfig {
  schemaVersion: '1.0';
  language: CodeSightLanguage;
  dashedLines: DashedLineMode;
  autoOpenBrowser: boolean;
  silentRegressionGuard: boolean;
  architectureMode: ArchitectureMode;
  llm: {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  hud: {
    alwaysOnTop: boolean;
    opacity: number;
  };
}

export type CodeSightConfigPatch = Partial<Omit<CodeSightConfig, 'llm' | 'hud' | 'schemaVersion'>> & {
  llm?: Partial<CodeSightConfig['llm']>;
  hud?: Partial<CodeSightConfig['hud']>;
};

export const DEFAULT_CODESIGHT_CONFIG: CodeSightConfig = {
  schemaVersion: '1.0',
  language: 'zh',
  dashedLines: 'always',
  autoOpenBrowser: false,
  silentRegressionGuard: true,
  architectureMode: 'auto',
  llm: {
    enabled: false,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
  },
  hud: {
    alwaysOnTop: true,
    opacity: 0.96,
  },
};

export function getGlobalConfigPath(): string {
  const custom = process.env.CODESIGHT_CONFIG_PATH?.trim();
  if (custom) return path.resolve(custom);
  return path.join(os.homedir(), '.codesight', 'config.json');
}

export function getProjectConfigPath(repoDir: string): string {
  return path.join(path.resolve(repoDir), '.codesight', 'config.json');
}

function readJsonSafe(filePath: string): Partial<CodeSightConfig> | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Partial<CodeSightConfig>) : null;
  } catch {
    return null;
  }
}

function mergeConfig(base: CodeSightConfig, patch?: CodeSightConfigPatch | null): CodeSightConfig {
  if (!patch) return { ...base, llm: { ...base.llm }, hud: { ...base.hud } };
  const lang: CodeSightLanguage = patch.language === 'en' || patch.language === 'zh' ? patch.language : base.language;
  const dashed: DashedLineMode =
    patch.dashedLines === 'hover' || patch.dashedLines === 'always' ? patch.dashedLines : base.dashedLines;
  const arch: ArchitectureMode =
    patch.architectureMode === 'auto' ||
    patch.architectureMode === 'heuristic' ||
    patch.architectureMode === 'llm'
      ? patch.architectureMode
      : base.architectureMode;

  const rawOpacity = typeof patch.hud?.opacity === 'number' ? patch.hud.opacity : base.hud.opacity;
  const opacity = Math.max(0.75, Math.min(1, Number.isFinite(rawOpacity) ? rawOpacity : 0.96));

  return {
    schemaVersion: '1.0',
    language: lang,
    dashedLines: dashed,
    autoOpenBrowser:
      typeof patch.autoOpenBrowser === 'boolean' ? patch.autoOpenBrowser : base.autoOpenBrowser,
    silentRegressionGuard:
      typeof patch.silentRegressionGuard === 'boolean'
        ? patch.silentRegressionGuard
        : base.silentRegressionGuard,
    architectureMode: arch,
    llm: {
      enabled: typeof patch.llm?.enabled === 'boolean' ? patch.llm.enabled : base.llm.enabled,
      baseUrl: typeof patch.llm?.baseUrl === 'string' ? patch.llm.baseUrl.trim() : base.llm.baseUrl,
      apiKey: typeof patch.llm?.apiKey === 'string' ? patch.llm.apiKey.trim() : base.llm.apiKey,
      model: typeof patch.llm?.model === 'string' ? patch.llm.model.trim() : base.llm.model,
    },
    hud: {
      alwaysOnTop:
        typeof patch.hud?.alwaysOnTop === 'boolean' ? patch.hud.alwaysOnTop : base.hud.alwaysOnTop,
      opacity,
    },
  };
}

/**
 * Load unified CodeSight settings shared across MCP Agent plugins, CLI, Sidecar, and macOS HUD.
 * Precedence: defaults < global (~/.codesight/config.json) < optional project (.codesight/config.json).
 */
export function loadCodeSightConfig(repoDir?: string): CodeSightConfig {
  const globalPatch = readJsonSafe(getGlobalConfigPath());
  let cfg = mergeConfig(DEFAULT_CODESIGHT_CONFIG, globalPatch);
  if (repoDir) {
    const projectPatch = readJsonSafe(getProjectConfigPath(repoDir));
    if (projectPatch) {
      cfg = mergeConfig(cfg, projectPatch);
    }
  }
  return cfg;
}

/**
 * Save partial settings updates into ~/.codesight/config.json (or project config when scope === 'project').
 */
export function saveCodeSightConfig(
  patch: CodeSightConfigPatch,
  options?: { scope?: 'global' | 'project'; repoDir?: string }
): CodeSightConfig {
  const scope = options?.scope ?? 'global';
  const targetPath =
    scope === 'project' && options?.repoDir
      ? getProjectConfigPath(options.repoDir)
      : getGlobalConfigPath();

  const current = scope === 'project' && options?.repoDir
    ? loadCodeSightConfig(options.repoDir)
    : loadCodeSightConfig();
  const next = mergeConfig(current, patch);

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}

export function resetCodeSightConfig(): CodeSightConfig {
  const targetPath = getGlobalConfigPath();
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(DEFAULT_CODESIGHT_CONFIG, null, 2) + '\n', 'utf8');
  return {
    ...DEFAULT_CODESIGHT_CONFIG,
    llm: { ...DEFAULT_CODESIGHT_CONFIG.llm },
    hud: { ...DEFAULT_CODESIGHT_CONFIG.hud },
  };
}

/** Convert persisted config into LLMConfig only when enabled and configured. */
export function toActiveLLMConfig(cfg: CodeSightConfig): LLMConfig | undefined {
  if (!cfg.llm.enabled) return undefined;
  const apiKey = cfg.llm.apiKey || process.env.CODESIGHT_LLM_API_KEY || process.env.OPENAI_API_KEY || '';
  if (!apiKey && !cfg.llm.baseUrl.includes('127.0.0.1') && !cfg.llm.baseUrl.includes('localhost')) {
    return undefined;
  }
  return {
    enabled: true,
    baseUrl: cfg.llm.baseUrl || 'https://api.openai.com/v1',
    apiKey: apiKey || 'ollama',
    model: cfg.llm.model || 'gpt-4o-mini',
  };
}

/** Safe representation for UI & MCP responses (never exposes raw API keys). */
export function maskConfigForDisplay(cfg: CodeSightConfig): CodeSightConfig & { llmKeyConfigured: boolean } {
  const hasKey = Boolean(cfg.llm.apiKey || process.env.CODESIGHT_LLM_API_KEY || process.env.OPENAI_API_KEY);
  return {
    ...cfg,
    llm: {
      ...cfg.llm,
      apiKey: cfg.llm.apiKey ? '••••••••' : '',
    },
    hud: { ...cfg.hud },
    llmKeyConfigured: hasKey,
  };
}
