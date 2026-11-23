#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  askRepository,
  generateRepoMap,
  projectProblemOntoRepo,
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

function printHelp() {
  console.log(`
${C.bold}GlassBox Engine CLI${C.reset} ${C.dim}— 结构化代码索引 + Graph + Embedding 极速代码透视${C.reset}

用法:
  ${C.cyan}npm run gb -- map [目录]${C.reset}
      10 秒看懂任意陌生仓库：增量扫描 + 依赖图枢纽识别 + 每个文件人话职责

  ${C.cyan}npm run gb -- ask "<自然语言问题>" [目录]${C.reset}
      用 Graph + Embedding 混合检索定位相关文件，并展示上下游影响关系

  ${C.cyan}npm run gb -- diagnose --error "<报错文本>" [目录]${C.reset}
      把真实报错投影到项目地图上：人话原因 + 爆炸半径 + 安全区 + 给 AI 的修改方向
      （也支持 --git 读取真实 git diff，或管道传入 cat err.log | ...）

可选参数:
  --json    输出标准 JSON（供后续桌面原生 HUD / Codex / Orca / MCP 直接消费）
`);
}

async function runMap(targetDir: string, asJson: boolean) {
  const { map } = await generateRepoMap(targetDir);
  if (asJson) {
    console.log(JSON.stringify(map, null, 2));
    return;
  }

  console.log(
    `\n${C.bold}🗺️  项目人话地图 · ${map.repoName}${C.reset} ${C.dim}(${map.totalFiles} 个源文件 | 新解析 ${map.reindexedFiles} / 缓存命中 ${map.cachedFiles} | ${map.scanMs}ms | ${map.embeddingMode})${C.reset}`
  );
  console.log(`${C.dim}   增量缓存已写入 ${path.join(map.rootDir, '.glassbox/index.json')}${C.reset}\n`);

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
      const depTag = `${C.gray}[入:${f.inDegree} 出:${f.outDegree}]${C.reset}`;
      console.log(`  ${C.cyan}${f.path}${C.reset} ${depTag}${hubTag}`);
      console.log(`    ${C.bold}${f.roleLabel}${C.reset}：${f.summary}`);
    }
    console.log('');
  }
}

async function runAsk(question: string, targetDir: string, asJson: boolean) {
  const res = await askRepository(targetDir, question);
  if (asJson) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  console.log(`\n${C.bold}🔎 Graph + Embedding 混合检索：${C.cyan}${res.question}${C.reset}`);
  console.log(
    `${C.green}⚡ 耗时 ${res.retrievalMs}ms | 仅需读取 ${res.retrievedSliceTokens.toLocaleString()} / ${res.wholeRepoTokens.toLocaleString()} tok（省 ${res.savedPercent}%）${C.reset}\n`
  );

  if (res.hits.length === 0) {
    console.log(`${C.yellow}未找到高相关文件，请尝试换个关键词。${C.reset}\n`);
    return;
  }

  res.hits.forEach((hit, idx) => {
    console.log(
      `${C.bold}${idx + 1}. ${hit.file.path}${C.reset} ${C.dim}(${hit.file.roleLabel} · 综合分 ${hit.totalScore})${C.reset}`
    );
    console.log(`   职责：${hit.file.summary}`);
    console.log(`   命中依据：${C.dim}${hit.matchReasons.join(' · ')}${C.reset}`);
    if (hit.file.exports.length > 0) {
      console.log(`   核心导出：${C.gray}${hit.file.exports.slice(0, 6).join(', ')}${C.reset}`);
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

async function runDiagnose(
  targetDir: string,
  options: { errorText?: string; useGit?: boolean; question?: string; asJson: boolean }
) {
  let rawDiff = '';
  if (options.useGit) {
    try {
      rawDiff = execFileSync('git', ['diff'], { cwd: targetDir, encoding: 'utf8' });
    } catch {
      rawDiff = '';
    }
  }

  const report = await projectProblemOntoRepo(targetDir, {
    rawError: options.errorText,
    rawDiff,
    question: options.question,
  });

  if (options.asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n${C.bold}🩺 GlassBox 问题投影报告 · ${report.repoName}${C.reset}`);
  console.log(
    `${C.green}⚡ 检索耗时 ${report.tokenEconomy.retrievalMs}ms | 全仓 ${report.tokenEconomy.wholeRepoTokens.toLocaleString()} tok → 最小上下文切片 ${report.tokenEconomy.retrievedSliceTokens.toLocaleString()} tok（省 ${report.tokenEconomy.savedPercent}%）${C.reset}\n`
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
      `   📍 出事角色：${C.cyan}${br.originNode.path}${C.reset}（${br.originNode.roleLabel}）`
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
    console.log(
      `   ${C.green}🛡️  安全区：其余 ${br.safeZoneCount} 个业务文件完全不受影响（无需去读）${C.reset}\n`
    );
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

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'map') {
    const dir = positional[0] || process.cwd();
    await runMap(dir, asJson);
    return;
  }

  if (command === 'ask') {
    const question = positional[0];
    if (!question) {
      console.error('请提供要检索的问题，例如：npm run gb -- ask "提示词怎么生成的"');
      process.exit(1);
    }
    const dir = positional[1] || process.cwd();
    await runAsk(question, dir, asJson);
    return;
  }

  if (command === 'diagnose') {
    const dir = positional[0] || process.cwd();
    const piped = readStdinIfPiped();
    const errorText =
      (typeof flags.error === 'string' ? flags.error : '') || piped;
    const question = typeof flags.question === 'string' ? flags.question : undefined;
    await runDiagnose(dir, {
      errorText,
      useGit: Boolean(flags.git),
      question,
      asJson,
    });
    return;
  }

  printHelp();
}

main().catch((err) => {
  console.error('[GlassBox CLI Error]', err instanceof Error ? err.message : err);
  process.exit(1);
});
