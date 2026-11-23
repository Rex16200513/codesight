#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  askRepository,
  generateRepoMap,
  projectProblemOntoRepo,
  traceSymbol,
  type McpGraphProviderConfig,
} from '@glassbox/core/engine';

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
    process.env.GLASSBOX_MCP_GRAPH_CMD;
  if (!cmd) return undefined;
  return { command: cmd };
}

function printHelp() {
  console.log(`
${C.bold}GlassBox GraphRAG Engine CLI v0.2${C.reset} ${C.dim}— AST 函数调用图 + BM25/向量 RRF + 可插拔开源 Graph-RAG MCP${C.reset}

用法:
  ${C.cyan}npm run gb -- map [目录]${C.reset}
      10 秒看懂任意陌生仓库：AST 增量索引 + 核心枢纽识别 + 每个文件人话职责

  ${C.cyan}npm run gb -- ask "<自然语言问题>" [目录]${C.reset}
      用 BM25 + 向量 + 依赖图 RRF 混合检索，毫秒级定位相关文件及上下游关系

  ${C.cyan}npm run gb -- trace <函数或组件名> [目录]${C.reset}
      跨文件函数/组件级调用图追踪：定位定义位置、谁调用了它、它调用了谁

  ${C.cyan}npm run gb -- diagnose --error "<报错文本>" [目录]${C.reset}
      把真实报错或 --git diff 投影到依赖图上：人话原因 + 函数调用链 + 爆炸半径 + 给 AI 的修改方向

可选参数:
  --mcp-cmd "<命令>"  挂载外部开源 Graph-RAG MCP（如 "cgc mcp start" / code-graph-rag / Serena）
  --json              输出标准 JSON（供桌面原生 HUD / Codex / Orca / MCP 直接消费）
`);
}

async function runMap(targetDir: string, asJson: boolean, mcpConfig?: McpGraphProviderConfig) {
  const { map } = await generateRepoMap(targetDir, { mcpConfig });
  if (asJson) {
    console.log(JSON.stringify(map, null, 2));
    return;
  }

  console.log(
    `\n${C.bold}🗺️  项目人话地图 · ${map.repoName}${C.reset} ${C.dim}(${map.totalFiles} 文件 / ${map.totalSymbols} AST 符号 | 新解析 ${map.reindexedFiles} / 缓存 ${map.cachedFiles} | ${map.scanMs}ms | ${map.embeddingMode})${C.reset}`
  );
  console.log(`${C.dim}   GraphProvider: ${map.providerName} · 增量缓存: ${path.join(map.rootDir, '.glassbox/index.json')}${C.reset}\n`);

  if (map.hubs.length > 0) {
    console.log(`${C.bold}${C.yellow}⭐ 核心枢纽文件（改这些文件要小心，影响面最大）${C.reset}`);
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

  console.log(`\n${C.bold}🔎 GraphRAG (BM25 + 向量 + 依赖图 RRF) 检索：${C.cyan}${res.question}${C.reset}`);
  console.log(
    `${C.green}⚡ 耗时 ${res.retrievalMs}ms | 仅需读取 ${res.retrievedSliceTokens.toLocaleString()} / ${res.wholeRepoTokens.toLocaleString()} tok（省 ${res.savedPercent}%）${C.reset}\n`
  );

  if (res.hits.length === 0) {
    console.log(`${C.yellow}未找到高相关文件，请尝试换个关键词。${C.reset}\n`);
    return;
  }

  res.hits.forEach((hit, idx) => {
    console.log(
      `${C.bold}${idx + 1}. ${hit.file.path}${C.reset} ${C.dim}(${hit.file.roleLabel} · RRF ${hit.totalScore})${C.reset}`
    );
    console.log(`   职责：${hit.file.summary}`);
    console.log(`   命中依据：${C.dim}${hit.matchReasons.join(' · ')}${C.reset}`);
    if (hit.file.exports.length > 0) {
      console.log(`   真实 AST 导出：${C.gray}${hit.file.exports.slice(0, 6).join(', ')}${C.reset}`);
    }
    console.log('');
  });

  if (res.primaryBlastRadius) {
    const br = res.primaryBlastRadius;
    console.log(`${C.bold}🔗 关联拓扑（围绕最相关文件 ${br.originNode.name}）${C.reset}`);
    console.log(
      `   上游依赖 (${br.upstreamDependencies.length})：${
        br.upstreamDependencies.map((u) => u.name).join(', ') || '无'
      }`
    );
    console.log(
      `   下游被谁用 (${br.directImpact.length} 直接 / ${br.indirectImpact.length} 间接)：${
        [...br.directImpact, ...br.indirectImpact].map((d) => d.name).join(', ') || '无（末梢安全节点）'
      }`
    );
    console.log('');
  }
}

async function runTrace(symbolQuery: string, targetDir: string, asJson: boolean, mcpConfig?: McpGraphProviderConfig) {
  const report = await traceSymbol(targetDir, symbolQuery, { mcpConfig });
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n${C.bold}🧬 AST 函数/组件调用图追踪：${C.cyan}${report.querySymbol}${C.reset} ${C.dim}(${report.traceMs}ms)${C.reset}\n`);
  if (report.matches.length === 0) {
    console.log(`${C.yellow}未在 AST 符号表中找到 "${symbolQuery}"。${C.reset}\n`);
    return;
  }

  for (const m of report.matches) {
    console.log(
      `${C.bold}${m.symbol.name}${C.reset} ${C.dim}[${m.symbol.kind}] · ${m.symbol.file}:${m.symbol.startLine}-${m.symbol.endLine} (${m.fileRole})${C.reset}`
    );
    console.log(`   签名：${C.gray}${m.symbol.signature}${C.reset}`);
    console.log(
      `   📥 被谁调用 (${m.calledBy.length})：${
        m.calledBy.length > 0
          ? m.calledBy.map((e) => `${e.callerName} (${e.callerFile}:${e.callerLine})`).join(' · ')
          : '无跨文件调用方'
      }`
    );
    console.log(
      `   📤 内部调用 (${m.callsOut.length})：${
        m.callsOut.length > 0
          ? m.callsOut.map((e) => `${e.calleeName} (${e.calleeFile.split('/').pop()}:${e.calleeLine})`).join(' · ')
          : '无内部调用'
      }`
    );
    console.log('');
  }

  if (report.externalHint) {
    console.log(`${C.bold}🔌 外部 Graph-RAG MCP 补充 (${report.externalHint.providerName} · ${report.externalHint.toolUsed})${C.reset}`);
    console.log(`   ${C.dim}${report.externalHint.rawSummary}${C.reset}\n`);
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
    try {
      rawDiff = execFileSync('git', ['diff'], { cwd: targetDir, encoding: 'utf8' });
    } catch {
      rawDiff = '';
    }
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

  console.log(`\n${C.bold}🩺 GlassBox GraphRAG 问题投影报告 · ${report.repoName}${C.reset} ${C.dim}[${report.providerName}]${C.reset}`);
  console.log(
    `${C.green}⚡ 检索耗时 ${report.tokenEconomy.retrievalMs}ms | 全仓 ${report.tokenEconomy.wholeRepoTokens.toLocaleString()} tok → 最小切片 ${report.tokenEconomy.retrievedSliceTokens.toLocaleString()} tok（省 ${report.tokenEconomy.savedPercent}%）${C.reset}\n`
  );

  console.log(`${C.bold}1. 一句话看懂出了什么事${C.reset}`);
  console.log(`   ${report.plainDiagnosis}\n`);

  if (report.blastRadius) {
    const br = report.blastRadius;
    const riskBadge =
      br.riskLevel === 'high-hub'
        ? `${C.red}[高风险核心枢纽]${C.reset}`
        : br.riskLevel === 'medium-bridge'
        ? `${C.yellow}[中游桥接节点]${C.reset}`
        : `${C.green}[低风险末梢节点]${C.reset}`;

    console.log(`${C.bold}2. 真实依赖图爆炸半径 (Blast Radius) ${riskBadge}${C.reset}`);
    console.log(
      `   📍 出事角色：${C.cyan}${br.originNode.path}${report.primaryTarget?.symbol ? ` :: ${report.primaryTarget.symbol.name}()` : ''}${C.reset}（${br.originNode.roleLabel}）`
    );
    console.log(
      `   ⬆️  上游来源 (${br.upstreamDependencies.length})：${
        br.upstreamDependencies.map((u) => `${u.name}(${u.roleLabel})`).join('、') || '无内部上游'
      }`
    );
    console.log(
      `   💥 直接波及 (${br.directImpact.length})：${
        br.directImpact.map((d) => `${d.name}(${d.roleLabel})`).join('、') || '无'
      }`
    );
    if (br.indirectImpact.length > 0) {
      console.log(
        `   🌊 间接连锁 (${br.indirectImpact.length})：${br.indirectImpact
          .map((d) => d.name)
          .join('、')}`
      );
    }
    if (report.symbolCallers.length > 0) {
      console.log(
        `   🧬 函数级调用方：${report.symbolCallers
          .slice(0, 5)
          .map((e) => `${e.callerName} (${e.callerFile.split('/').pop()}:${e.callerLine})`)
          .join(' · ')}`
      );
    }
    console.log(
      `   ${C.green}🛡️  安全区：其余 ${br.safeZoneCount} 个业务文件完全不受影响（无需去读）${C.reset}\n`
    );
  }

  if (report.externalGraphHint) {
    console.log(`${C.bold}🔌 外部 Graph-RAG MCP 关联情报 (${report.externalGraphHint.toolUsed})${C.reset}`);
    console.log(`   ${C.dim}${report.externalGraphHint.rawSummary}${C.reset}\n`);
  }

  if (report.silentRegressions.length > 0) {
    console.log(`${C.bold}${C.yellow}⚠️  检测到静默退化风险 (${report.silentRegressions.length})${C.reset}`);
    for (const r of report.silentRegressions) {
      console.log(`   • [${r.patternTag}] ${r.file} — ${r.title}`);
      console.log(`     风险：${C.dim}${r.riskImpact}${C.reset}`);
    }
    console.log('');
  }

  if (report.directions.length > 0) {
    console.log(`${C.bold}3. 让 AI 修改的可选方向（按真实依赖图推演）${C.reset}`);
    for (const dir of report.directions) {
      const rec = dir.recommended ? ` ${C.green}[推荐]${C.reset}` : '';
      console.log(`\n   ${C.bold}${dir.label}${C.reset}${rec}`);
      console.log(`   思路：${dir.strategy}`);
      console.log(`   权衡：${C.dim}${dir.tradeoff}（预计涉及 ${dir.affectedFilesCount} 个文件）${C.reset}`);
      console.log(`   ${C.gray}给 AI 的精确指令: ${dir.surgicalPrompt.replace(/\n/g, ' ')}${C.reset}`);
    }
    console.log('');
  }
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
    const dir = positional[0] || process.cwd();
    await runMap(dir, asJson, mcpConfig);
    return;
  }

  if (command === 'ask') {
    const question = positional[0];
    if (!question) {
      console.error('请提供要检索的问题，例如：npm run gb -- ask "提示词怎么生成的"');
      process.exit(1);
    }
    const dir = positional[1] || process.cwd();
    await runAsk(question, dir, asJson, mcpConfig);
    return;
  }

  if (command === 'trace') {
    const symbolName = positional[0];
    if (!symbolName) {
      console.error('请提供要追踪的函数/组件名，例如：npm run gb -- trace buildSurgicalFixPrompt');
      process.exit(1);
    }
    const dir = positional[1] || process.cwd();
    await runTrace(symbolName, dir, asJson, mcpConfig);
    return;
  }

  if (command === 'diagnose') {
    const dir = positional[0] || process.cwd();
    const piped = readStdinIfPiped();
    const errorText = (typeof flags.error === 'string' ? flags.error : '') || piped;
    const question = typeof flags.question === 'string' ? flags.question : undefined;
    await runDiagnose(dir, {
      errorText,
      useGit: Boolean(flags.git),
      question,
      asJson,
      mcpConfig,
    });
    return;
  }

  printHelp();
}

main().catch((err) => {
  console.error('[GlassBox CLI Error]', err instanceof Error ? err.message : err);
  process.exit(1);
});
