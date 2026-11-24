import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type AgentTarget =
  | 'antigravity'
  | 'claude-code'
  | 'claude-desktop'
  | 'cursor'
  | 'vscode'
  | 'codex'
  | 'chatgpt'
  | 'all';

export interface InstallPlanItem {
  target: Exclude<AgentTarget, 'all'>;
  scope: 'workspace' | 'global' | 'instructions';
  destination: string;
  action: 'write-json' | 'copy-plugin' | 'print-snippet';
  summary: string;
  snippet?: string;
}

function getRepoRootFromCli(): string {
  return path.resolve(import.meta.dirname, '../../..');
}

function getMcpEntryCommand(engineRoot: string): { command: string; args: string[] } {
  const nodeBin = process.execPath;
  const builtJs = path.join(engineRoot, 'packages/mcp-server/dist/index.js');
  if (fs.existsSync(builtJs)) {
    return {
      command: nodeBin,
      args: [builtJs],
    };
  }
  const mcpScript = path.join(engineRoot, 'packages/mcp-server/src/index.ts');
  return {
    command: nodeBin,
    args: ['--experimental-strip-types', mcpScript],
  };
}

function mergeMcpJsonFile(
  filePath: string,
  rootKey: 'mcpServers' | 'servers',
  entry: Record<string, unknown>,
  dryRun: boolean
): void {
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(filePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }
  const mapObj =
    typeof existing[rootKey] === 'object' && existing[rootKey] !== null
      ? { ...(existing[rootKey] as Record<string, unknown>) }
      : {};
  mapObj['codesight'] = entry;
  existing[rootKey] = mapObj;

  if (!dryRun) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
  }
}

function copyDirRecursive(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Universal Plugin & MCP Installer for mainstream AI Agent products:
 * Antigravity, Claude Code, Claude Desktop, Cursor, VS Code, Codex, and ChatGPT Apps.
 */
export function installCodeSightPlugin(options: {
  target: AgentTarget;
  projectDir?: string;
  global?: boolean;
  dryRun?: boolean;
}): InstallPlanItem[] {
  const engineRoot = getRepoRootFromCli();
  const projectDir = path.resolve(options.projectDir || process.cwd());
  const homeDir = os.homedir();
  const isGlobal = Boolean(options.global);
  const dryRun = Boolean(options.dryRun);
  const mcp = getMcpEntryCommand(engineRoot);

  const targets: Array<Exclude<AgentTarget, 'all'>> =
    options.target === 'all'
      ? ['antigravity', 'claude-code', 'claude-desktop', 'cursor', 'vscode', 'codex', 'chatgpt']
      : [options.target];

  const results: InstallPlanItem[] = [];

  for (const t of targets) {
    if (t === 'antigravity') {
      const pluginDest = isGlobal
        ? path.join(homeDir, '.gemini/config/plugins/codesight')
        : path.join(projectDir, '.agents/plugins/codesight');

      if (!dryRun) {
        copyDirRecursive(path.join(engineRoot, 'plugins/codesight'), pluginDest);
        const mcpConfigPath = path.join(pluginDest, 'mcp_config.json');
        fs.writeFileSync(
          mcpConfigPath,
          JSON.stringify(
            {
              mcpServers: {
                codesight: {
                  command: mcp.command,
                  args: mcp.args,
                },
              },
            },
            null,
            2
          ) + '\n',
          'utf8'
        );
      }

      results.push({
        target: 'antigravity',
        scope: isGlobal ? 'global' : 'workspace',
        destination: pluginDest,
        action: 'copy-plugin',
        summary: 'Antigravity 原生插件（含 plugin.json + mcp_config.json + SKILL.md + rules/AGENTS.md）',
      });
    } else if (t === 'claude-code') {
      const dest = isGlobal
        ? path.join(homeDir, '.claude.json')
        : path.join(projectDir, '.mcp.json');
      mergeMcpJsonFile(dest, 'mcpServers', { type: 'stdio', command: mcp.command, args: mcp.args }, dryRun);
      results.push({
        target: 'claude-code',
        scope: isGlobal ? 'global' : 'workspace',
        destination: dest,
        action: 'write-json',
        summary: 'Claude Code MCP 配置（支持 codesight_map / ask / trace / diagnose + 交互卡片）',
      });
    } else if (t === 'claude-desktop') {
      const dest =
        process.platform === 'darwin'
          ? path.join(homeDir, 'Library/Application Support/Claude/claude_desktop_config.json')
          : path.join(homeDir, '.config/Claude/claude_desktop_config.json');
      mergeMcpJsonFile(dest, 'mcpServers', { command: mcp.command, args: mcp.args }, dryRun);
      results.push({
        target: 'claude-desktop',
        scope: 'global',
        destination: dest,
        action: 'write-json',
        summary: 'Claude Desktop MCP Apps 配置（支持在对话流直接内嵌渲染诊断卡片）',
      });
    } else if (t === 'cursor') {
      const dest = isGlobal
        ? path.join(homeDir, '.cursor/mcp.json')
        : path.join(projectDir, '.cursor/mcp.json');
      mergeMcpJsonFile(dest, 'mcpServers', { command: mcp.command, args: mcp.args }, dryRun);
      results.push({
        target: 'cursor',
        scope: isGlobal ? 'global' : 'workspace',
        destination: dest,
        action: 'write-json',
        summary: 'Cursor MCP Server 配置',
      });
    } else if (t === 'vscode') {
      const dest = path.join(projectDir, '.vscode/mcp.json');
      mergeMcpJsonFile(dest, 'servers', { type: 'stdio', command: mcp.command, args: mcp.args }, dryRun);
      results.push({
        target: 'vscode',
        scope: 'workspace',
        destination: dest,
        action: 'write-json',
        summary: 'VS Code / GitHub Copilot MCP 配置',
      });
    } else if (t === 'codex') {
      const tomlPath = path.join(homeDir, '.codex/config.toml');
      const tomlBlock = [
        '',
        '[mcp_servers.codesight]',
        `command = "${mcp.command}"`,
        `args = [${mcp.args.map((a) => `"${a}"`).join(', ')}]`,
        '',
      ].join('\n');

      if (!dryRun && fs.existsSync(path.dirname(tomlPath))) {
        const cur = fs.existsSync(tomlPath) ? fs.readFileSync(tomlPath, 'utf8') : '';
        if (!cur.includes('[mcp_servers.codesight]')) {
          fs.writeFileSync(tomlPath, cur + tomlBlock, 'utf8');
        }
      }

      results.push({
        target: 'codex',
        scope: 'global',
        destination: tomlPath,
        action: 'print-snippet',
        summary: 'OpenAI Codex CLI MCP 配置段（~/.codex/config.toml）',
        snippet: tomlBlock.trim(),
      });
    } else if (t === 'chatgpt') {
      const snippet = [
        '# 1. 启动 CodeSight Streamable HTTP MCP 服务:',
        'npm run mcp:http',
        '# 2. 暴露 HTTPS 端点（例如 cloudflared tunnel --url http://127.0.0.1:4318）',
        '# 3. 在 ChatGPT Apps / Connector 设置中填入: https://<your-domain>/mcp',
      ].join('\n');
      results.push({
        target: 'chatgpt',
        scope: 'instructions',
        destination: 'http://127.0.0.1:4318/mcp',
        action: 'print-snippet',
        summary: 'ChatGPT Apps / Remote MCP Streamable HTTP 接入指引（支持 ui:// 交互卡片）',
        snippet,
      });
    }
  }

  return results;
}
