#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  askRepository,
  generateRepoMap,
  projectProblemOntoRepo,
  safeGitDiff,
  traceSymbol,
  type McpGraphProviderConfig,
} from '@glassbox/core/engine';
import { installCodeSightPlugin, type AgentTarget } from './installer.ts';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const command = args[0] || 'help';
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 1; i < args.length; i++) {
    const cur = args[i];
    if (cur.startsWith('--')) {
      const key = cur.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(cur);
    }
  }
  return { command, flags, positional };
}

function readStdinIfPiped(): string {
  if (process.stdin.isTTY) return '';
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function resolveMcpConfig(flags: Record<string, string | boolean>): McpGraphProviderConfig | undefined {
  const cmd =
    (typeof flags['mcp-cmd'] === 'string' ? flags['mcp-cmd'] : undefined) ||
    process.env.CODESIGHT_MCP_GRAPH_CMD ||
    process.env.GLASSBOX_MCP_GRAPH_CMD;
  if (!cmd) return undefined;
  return { command: cmd };
}

function printHelp() {
  console.log(`
${C.bold}CodeSight GraphRAG Engine CLI${C.reset} ${C.dim}— AST 函数调用图 + BM25/向量 RRF + 可插拔开源 Graph-RAG MCP${C.reset}

用法:
  ${C.cyan}npm run cs -- map [目录]${C.reset}
      10 秒看懂任意陌生仓库：AST 增量索引 + 核心枢纽识别 + 每个文件人话职责

  ${C.cyan}npm run cs -- ask "<自然语言问题>" [目录]${C.reset}
      用 BM25 + 向量 + 依赖图 RRF 混合检索，毫秒级定位相关文件及上下游关系

  ${C.cyan}npm run cs -- trace <函数或组件名> [目录]${C.reset}
      跨文件函数/组件级调用图追踪：定位定义位置、谁调用了它、它调用了谁

  ${C.cyan}npm run cs -- diagnose --error "<报错文本>" [目录]${C.reset}
      把真实报错或 --git diff 投影到依赖图上：人话原因 + 函数调用链 + 爆炸半径 + 给 AI 的修改方向

  ${C.cyan}npm run cs -- install --target <antigravity|claude-code|claude-desktop|cursor|vscode|codex|chatgpt|all>${C.reset}
      一键将 CodeSight MCP App + Skill 插件安装到主流 AI Agent 软件（支持 --global / --dry-run）

可选参数:
  --mcp-cmd "<命令>"  挂载外部开源 Graph-RAG MCP（如 "cgc mcp start" / code-graph-rag / Serena）
  --json              输出标准 JSON（供 macOS 原生 HUD / Codex / Orca / MCP 直接消费）
`);
}

async function runMap(targetDir: string, asJson: boolean, mcpConfig?: McpGraphProviderConfig) {
  const { map } = await generateRepoMap(targetDir, { mcpConfig });
  if (asJson) {
    console.log(JSON.stringify(map, null, 2));
    return;
  }

  console.log(
    `\n${C.bold}[Map] ${map.repoName}${C.reset} ${C.dim}(${map.totalFiles} 文件 / ${map.totalSymbols} AST 符号 | 新解析 ${map.reindexedFiles} / 缓存 ${map.cachedFiles} | ${map.scanMs}ms | ${map.embeddingMode})${C.reset}`
  );
  console.log(`${C.dim}  Provider: ${map.providerName} · 缓存: ${path.join(map.rootDir, '.codesight/index.json')}${C.reset}\n`);

  if (map.hubs.length > 0) {
    console.log(`${C.bold}${C.yellow}核心枢纽文件（改动影响面最大）${C.reset}`);
    for (const h of map.hubs) {
      console.log(
        `  • ${C.bold}${h.path}${C.reset} ${C.yellow}[波及 ${h.downstreamReach} 个文件]${C.reset} ${C.dim}— ${h.roleLabel}${C.reset}`
      );
      console.log(`    ${C.dim}${h.summary}${C.reset}`);
    }
    console.log('');
  }

  for (const sec of map.sections) {
    console.log(`${C.bold}${sec.layerTitle}${C.reset}`);
    for (const f of sec.files) {
      const hubTag = f.isHub ? ` ${C.yellow}(枢纽·波及${f.downstreamReach})${C.reset}` : '';
      const depTag = `${C.gray}[入:${f.inDegree} 出:${f.outDegree} · ${f.symbolCount}符号]${C.reset}`;
      console.log(`  ${C.cyan}${f.path}${C.reset} ${depTag}${hubTag}`);
      console.log(`    ${C.bold}${f.roleLabel}${C.reset}：${f.summary}`);
    }
    console.log('');
  }
}

async function runAsk(question: string, targetDir: string, asJson: boolean, mcpConfig?: McpGraphProviderConfig) {
  const res = await askRepository(targetDir, question, { mcpConfig });
  if (asJson) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  console.log(`\n${C.bold}[Ask] ${C.cyan}${res.question}${C.reset}`);
  console.log(
    `${C.green}耗时 ${res.retrievalMs}ms | 仅需读取 ${res.retrievedSliceTokens.toLocaleString()} / ${res.wholeRepoTokens.toLocaleString()} tok（省 ${res.savedPercent}%）${C.reset}\n`
  );

  res.hits.forEach((hit, idx) => {
    console.log(
      `${C.bold}${idx + 1}. ${hit.file.path}${C.reset} ${C.dim}(${hit.file.roleLabel} · RRF ${hit.totalScore})${C.reset}`
    );
    console.log(`   职责：${hit.file.summary}`);
    console.log(`   依据：${C.dim}${hit.matchReasons.join(' · ')}${C.reset}\n`);
  });
}

async function runTrace(symbolQuery: string, targetDir: string, asJson: boolean, mcpConfig?: McpGraphProviderConfig) {
  const report = await traceSymbol(targetDir, symbolQuery, { mcpConfig });
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n${C.bold}[Trace] ${C.cyan}${report.querySymbol}${C.reset} ${C.dim}(${report.traceMs}ms)${C.reset}\n`);
  for (const m of report.matches) {
    console.log(
      `${C.bold}${m.symbol.name}${C.reset} ${C.dim}[${m.symbol.kind}] · ${m.symbol.file}:${m.symbol.startLine}-${m.symbol.endLine} (${m.fileRole})${C.reset}`
    );
    console.log(
      `   被调用 (${m.calledBy.length})：${
        m.calledBy.map((e) => `${e.callerName} (${e.callerFile}:${e.callerLine})`).join(' · ') || '无'
      }\n`
    );
  }
}

async function runDiagnose(
  targetDir: string,
  options: {
    errorText?: string;
    useGit?: boolean;
    question?: string;
    asJson: boolean;
    mcpConfig?: McpGraphProviderConfig;
  }
) {
  let rawDiff = '';
  if (options.useGit) {
    const res = safeGitDiff(targetDir);
    rawDiff = res.diff;
  }

  const report = await projectProblemOntoRepo(
    targetDir,
    {
      rawError: options.errorText,
      rawDiff,
      question: options.question,
    },
    { mcpConfig: options.mcpConfig }
  );

  if (options.asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n${C.bold}[Diagnose] ${report.repoName}${C.reset} ${C.dim}[${report.providerName}]${C.reset}`);
  console.log(
    `${C.green}耗时 ${report.tokenEconomy.retrievalMs}ms | 全仓 ${report.tokenEconomy.wholeRepoTokens.toLocaleString()} tok → 最小切片 ${report.tokenEconomy.retrievedSliceTokens.toLocaleString()} tok（省 ${report.tokenEconomy.savedPercent}%）${C.reset}\n`
  );
  console.log(`结论：${report.plainDiagnosis}\n`);
}

async function main() {
  const { command, flags, positional } = parseArgs(process.argv);
  const asJson = Boolean(flags.json);
  const mcpConfig = resolveMcpConfig(flags);

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }
  if (command === 'map') {
    await runMap(positional[0] || process.cwd(), asJson, mcpConfig);
    return;
  }
  if (command === 'ask') {
    const question = positional[0];
    if (!question) process.exit(1);
    await runAsk(question, positional[1] || process.cwd(), asJson, mcpConfig);
    return;
  }
  if (command === 'trace') {
    const sym = positional[0];
    if (!sym) process.exit(1);
    await runTrace(sym, positional[1] || process.cwd(), asJson, mcpConfig);
    return;
  }
  if (command === 'diagnose') {
    const dir = positional[0] || process.cwd();
    const piped = readStdinIfPiped();
    const errorText = (typeof flags.error === 'string' ? flags.error : '') || piped;
    await runDiagnose(dir, {
      errorText,
      useGit: Boolean(flags.git),
      question: typeof flags.question === 'string' ? flags.question : undefined,
      asJson,
      mcpConfig,
    });
    return;
  }
  if (command === 'install') {
    const rawTarget = (typeof flags.target === 'string' ? flags.target : positional[0]) || 'all';
    const validTargets: AgentTarget[] = [
      'antigravity',
      'claude-code',
      'claude-desktop',
      'cursor',
      'vscode',
      'codex',
      'chatgpt',
      'all',
    ];
    const target = (validTargets.includes(rawTarget as AgentTarget) ? rawTarget : 'all') as AgentTarget;
    const projectDir = typeof flags.dir === 'string' ? flags.dir : process.cwd();
    const dryRun = Boolean(flags['dry-run']);
    const global = Boolean(flags.global);

    const items = installCodeSightPlugin({ target, projectDir, global, dryRun });
    if (asJson) {
      console.log(JSON.stringify({ dryRun, global, items }, null, 2));
      return;
    }

    console.log(
      `\n${C.bold}[CodeSight Installer]${C.reset} ${dryRun ? `${C.yellow}(Dry-Run 预览模式，未写入文件)${C.reset}` : `${C.green}已完成插件配置${C.reset}`}\n`
    );
    for (const item of items) {
      console.log(`  • ${C.cyan}${item.target}${C.reset} (${item.scope}) → ${C.bold}${item.destination}${C.reset}`);
      console.log(`    ${C.dim}${item.summary}${C.reset}`);
      if (item.snippet) {
        console.log(`${C.gray}${item.snippet.split('\n').map((l) => `      ${l}`).join('\n')}${C.reset}`);
      }
    }
    console.log('');
    return;
  }

  printHelp();
}

main().catch((err) => {
  console.error('[CodeSight CLI Error]', err instanceof Error ? err.message : err);
  process.exit(1);
});
