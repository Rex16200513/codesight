import type {
  AnalyzeInput,
  DiagnosticCard,
  ImpactNode,
  MentalModelCardData,
  RippleCardData,
  SilentRegressionCardData,
  TopologyNode,
} from './schema.ts';

export interface StaticExtractionResult {
  cleanedErrorLines: string[];
  strippedNoiseCount: number;
  parsedLocations: Array<{ file: string; line?: number; column?: number; message?: string }>;
  typeMismatch?: { expected: string; actual: string; symbol?: string };
  diffFiles: Array<{
    file: string;
    addedLines: string[];
    removedLines: string[];
    hunkSnippet: string;
  }>;
  silentRegressions: Array<{
    patternTag: SilentRegressionCardData['patternTag'];
    file: string;
    title: string;
    before: string;
    after: string;
    snippet: string;
    riskImpact: string;
  }>;
  prunedContextForLLM: string;
  rawTokenEstimate: number;
  prunedTokenEstimate: number;
}

/** Rough token estimator (~3.8 chars per token for mixed code/text) */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 3.8));
}

const NOISE_FRAME_PATTERNS = [
  /node_modules\//i,
  /node:internal\//i,
  /webpack-internal:/i,
  /__vite/i,
  /react-dom\.development/i,
  /^\s*at\s+processTicksAndRejections/i,
  /^\s*at\s+Module\._compile/i,
];

/**
 * 0-Token Static Analyzer Layer:
 * 1. Filters noisy framework/runtime frames from stack traces
 * 2. Extracts file:line:col locations & TypeScript/Runtime type mismatches
 * 3. Parses unified Git Diffs to detect Silent Regressions (removed guards, empty catch, @ts-ignore, hardcoded mocks)
 * 4. Produces a minimal pruned context slice so an optional BYOK LLM consumes minimal tokens
 */
export function runStaticAnalysis(input: AnalyzeInput): StaticExtractionResult {
  const rawError = (input.rawError ?? '').trim();
  const rawDiff = (input.rawDiff ?? '').trim();

  // 1. Strip noise from raw error trace
  const errorLines = rawError ? rawError.split('\n') : [];
  const cleanedErrorLines: string[] = [];
  let strippedNoiseCount = 0;

  for (const line of errorLines) {
    if (NOISE_FRAME_PATTERNS.some((re) => re.test(line))) {
      strippedNoiseCount++;
      continue;
    }
    if (line.trim().length > 0) {
      cleanedErrorLines.push(line);
    }
  }

  // 2. Extract file:line:col locations
  const parsedLocations: StaticExtractionResult['parsedLocations'] = [];
  const seenLoc = new Set<string>();
  const locRegex = /([a-zA-Z0-9_./-]+\.(?:tsx?|jsx?|py|go|rs|vue|svelte))(?::(\d+)(?::(\d+))?|\((\d+),(\d+)\))?/g;

  for (const line of cleanedErrorLines) {
    let match: RegExpExecArray | null;
    while ((match = locRegex.exec(line)) !== null) {
      const file = match[1];
      const lineNum = match[2] ? Number(match[2]) : match[4] ? Number(match[4]) : undefined;
      const colNum = match[3] ? Number(match[3]) : match[5] ? Number(match[5]) : undefined;
      const key = `${file}:${lineNum ?? ''}`;
      if (!seenLoc.has(key)) {
        seenLoc.add(key);
        parsedLocations.push({ file, line: lineNum, column: colNum, message: line.trim() });
      }
    }
  }

  // 3. Detect Type / Contract mismatch patterns (TS2322, TS2345, TypeError, etc.)
  let typeMismatch: StaticExtractionResult['typeMismatch'];
  const tsAssignMatch = rawError.match(/Type '([^']+)' is not assignable to type '([^']+)'/i);
  const tsArgMatch = rawError.match(/Argument of type '([^']+)' is not assignable to parameter of type '([^']+)'/i);
  const propMissingMatch = rawError.match(/Property '([^']+)' does not exist on type '([^']+)'/i);
  const cannotReadMatch = rawError.match(/Cannot read propert(?:y|ies) (?:of (undefined|null) \(reading '([^']+)'\)|'([^']+)' of (undefined|null))/i);

  if (tsAssignMatch) {
    typeMismatch = { actual: tsAssignMatch[1], expected: tsAssignMatch[2] };
  } else if (tsArgMatch) {
    typeMismatch = { actual: tsArgMatch[1], expected: tsArgMatch[2] };
  } else if (propMissingMatch) {
    typeMismatch = {
      expected: `object with .${propMissingMatch[1]}`,
      actual: propMissingMatch[2],
      symbol: propMissingMatch[1],
    };
  } else if (cannotReadMatch) {
    const nullish = cannotReadMatch[1] || cannotReadMatch[4] || 'undefined';
    const prop = cannotReadMatch[2] || cannotReadMatch[3] || 'property';
    typeMismatch = {
      expected: `defined object containing .${prop}`,
      actual: nullish,
      symbol: prop,
    };
  }

  // 4. Parse unified Git Diff per file
  const diffFiles: StaticExtractionResult['diffFiles'] = [];
  if (rawDiff) {
    const fileSections = rawDiff.split(/^diff --git /m).filter((s) => s.trim().length > 0);
    for (const section of fileSections) {
      const headerMatch = section.match(/b\/([^\s\n]+)/) || section.match(/^\+\+\+\s+b\/([^\s\n]+)/m);
      const file = headerMatch ? headerMatch[1] : 'modified-file.ts';
      const lines = section.split('\n');
      const addedLines: string[] = [];
      const removedLines: string[] = [];
      const snippetLines: string[] = [];

      for (const l of lines) {
        if (l.startsWith('+++') || l.startsWith('---') || l.startsWith('index ')) continue;
        if (l.startsWith('+')) {
          addedLines.push(l.slice(1));
          snippetLines.push(l);
        } else if (l.startsWith('-')) {
          removedLines.push(l.slice(1));
          snippetLines.push(l);
        } else if (l.startsWith('@@') || snippetLines.length > 0) {
          snippetLines.push(l);
        }
      }

      diffFiles.push({
        file,
        addedLines,
        removedLines,
        hunkSnippet: snippetLines.slice(0, 14).join('\n'),
      });
    }
  }

  // 5. Silent Regression Heuristic Scanner (0-Token!)
  const silentRegressions: StaticExtractionResult['silentRegressions'] = [];
  for (const df of diffFiles) {
    const removedJoined = df.removedLines.join('\n');
    const addedJoined = df.addedLines.join('\n');

    // Heuristic A: Removed auth / permission / null guard
    if (
      /if\s*\([^)]*(?:auth|token|role|permission|session|user|admin|valid|!)/i.test(removedJoined) &&
      !/if\s*\([^)]*(?:auth|token|role|permission|session|user|admin|valid|!)/i.test(addedJoined)
    ) {
      silentRegressions.push({
        patternTag: 'REMOVED_GUARD',
        file: df.file,
        title: `AI 移除了 ${df.file.split('/').pop()} 中的边界/权限守卫`,
        before: '执行前校验权限或空值条件，非法状态会及时拦截',
        after: '守卫条件被删去，请求直接穿透到核心逻辑',
        snippet: df.hunkSnippet,
        riskImpact: '编译和运行不会报错，但会导致越权访问或脏数据静默写入。',
      });
    }

    // Heuristic B: Empty catch / swallowed error
    if (/catch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\/[^\n]*)?\s*(?:return\s+(?:\[\]|\{\}|null|undefined|true);?)?\s*\}/m.test(addedJoined)) {
      silentRegressions.push({
        patternTag: 'SWALLOWED_ERROR',
        file: df.file,
        title: `检测到静默吞掉异常（Empty / Fallback Catch）`,
        before: '异常向上抛出，由全局错误边界或调用方感知并处理',
        after: '异常在 catch 中被静默吞掉并返回空默认值',
        snippet: df.hunkSnippet,
        riskImpact: '表面上“不报错了”，但真实业务失败被掩盖，极难排查。',
      });
    }

    // Heuristic C: Type escape hatches (@ts-ignore, @ts-expect-error, as any)
    if (/@ts-ignore|@ts-expect-error|\bas\s+any\b|eslint-disable/i.test(addedJoined)) {
      silentRegressions.push({
        patternTag: 'TYPE_ESCAPE_HATCH',
        file: df.file,
        title: `AI 使用类型逃生舱绕过了编译器检查`,
        before: '受 TypeScript 静态类型契约保护',
        after: '引入了 as any / @ts-ignore 强行压制报错',
        snippet: df.hunkSnippet,
        riskImpact: '把编译期能拦截的错误推迟到了用户运行时崩溃。',
      });
    }

    // Heuristic D: Hardcoded mock / placeholder return
    if (/return\s+(?:\[\s*\]|['"]mock|true\s*;?\s*\/\/\s*temp|TODO)/i.test(addedJoined)) {
      silentRegressions.push({
        patternTag: 'HARDCODED_FALLBACK',
        file: df.file,
        title: `检测到疑似硬编码兜底值或临时 Mock`,
        before: '依赖真实计算或远端接口返回结果',
        after: '新增了固定返回值 / 临时占位逻辑',
        snippet: df.hunkSnippet,
        riskImpact: '测试看似通过，但生产环境将持续返回假数据。',
      });
    }
  }

  // 6. Build minimal pruned context slice for optional BYOK LLM
  const prunedParts: string[] = [];
  if (cleanedErrorLines.length > 0) {
    prunedParts.push('## Cleaned Error (noise stripped)\n' + cleanedErrorLines.slice(0, 12).join('\n'));
  }
  if (typeMismatch) {
    prunedParts.push(
      `## Static Type/Contract Mismatch\nExpected: ${typeMismatch.expected}\nActual: ${typeMismatch.actual}`
    );
  }
  if (diffFiles.length > 0) {
    const compactDiff = diffFiles
      .slice(0, 4)
      .map((d) => `File: ${d.file}\n${d.hunkSnippet}`)
      .join('\n---\n');
    prunedParts.push('## Minimal Diff Slices\n' + compactDiff);
  }
  if (silentRegressions.length > 0) {
    prunedParts.push(
      '## Static Regression Flags\n' +
        silentRegressions.map((r) => `- [${r.patternTag}] ${r.file}: ${r.title}`).join('\n')
    );
  }

  const prunedContextForLLM = prunedParts.join('\n\n');
  const rawCombined = `${rawError}\n${rawDiff}`;
  // Simulate typical full-file context if pasted directly into an agent vs our pruned slice
  const rawTokenEstimate = Math.max(
    estimateTokens(rawCombined),
    estimateTokens(rawCombined) + diffFiles.length * 420 + parsedLocations.length * 280
  );
  const prunedTokenEstimate = estimateTokens(prunedContextForLLM);

  return {
    cleanedErrorLines,
    strippedNoiseCount,
    parsedLocations,
    typeMismatch,
    diffFiles,
    silentRegressions,
    prunedContextForLLM,
    rawTokenEstimate,
    prunedTokenEstimate,
  };
}

/**
 * Deterministic 0-Token Card Synthesizer:
 * Turns static extraction into immediately usable visual cards without requiring an API key.
 */
export function buildStaticCards(extracted: StaticExtractionResult): DiagnosticCard[] {
  const cards: DiagnosticCard[] = [];

  // 1. Build Ripple / Error Card if there's an error or type mismatch
  if (extracted.cleanedErrorLines.length > 0 || extracted.typeMismatch) {
    const rootLoc = extracted.parsedLocations[0] ?? {
      file: extracted.diffFiles[0]?.file ?? 'unknown-file.ts',
      line: 1,
    };

    const downstreamNodes: ImpactNode[] = extracted.parsedLocations.slice(1, 5).map((loc, idx) => ({
      id: `impact-${idx}`,
      file: loc.file,
      symbol: loc.file.split('/').pop() ?? loc.file,
      line: loc.line,
      role: 'downstream',
      reason: '调用链经过此文件，受上游契约破坏影响',
      severity: idx === 0 ? 'critical' : 'warning',
    }));

    if (downstreamNodes.length === 0 && extracted.diffFiles.length > 1) {
      extracted.diffFiles.slice(1, 4).forEach((df, idx) => {
        downstreamNodes.push({
          id: `diff-impact-${idx}`,
          file: df.file,
          symbol: df.file.split('/').pop() ?? df.file,
          role: 'downstream',
          reason: '同批次变更文件，存在连带影响风险',
          severity: 'warning',
        });
      });
    }

    const firstHeadline = extracted.cleanedErrorLines[0] ?? '检测到代码契约或运行时错误';
    const rippleCard: RippleCardData = {
      id: 'card-ripple-static',
      kind: 'ripple',
      severity: 'critical',
      badge: extracted.typeMismatch ? 'TYPE / CONTRACT RIPPLE' : 'RUNTIME ERROR',
      title: extracted.typeMismatch
        ? `契约冲突：期望 ${extracted.typeMismatch.expected}，实际传入 ${extracted.typeMismatch.actual}`
        : firstHeadline.slice(0, 88),
      plainSummary: extracted.typeMismatch
        ? `静态解析已过滤 ${extracted.strippedNoiseCount} 行框架噪音帧。根因位于 ${rootLoc.file}${rootLoc.line ? `:${rootLoc.line}` : ''}，上下游数据结构不再一致，导致调用链中断。`
        : `静态解析剥离了 ${extracted.strippedNoiseCount} 行无关栈帧，定位到业务代码报错源头 ${rootLoc.file}${rootLoc.line ? `:${rootLoc.line}` : ''}。建议先确认源头变更意图，再决定修复方向。`,
      origin: {
        file: rootLoc.file,
        line: rootLoc.line,
        column: rootLoc.column,
        symbol: extracted.typeMismatch?.symbol,
      },
      contractDiff: extracted.typeMismatch
        ? {
            label: '契约形状对比 (Expected vs Actual)',
            expected: extracted.typeMismatch.expected,
            actual: extracted.typeMismatch.actual,
          }
        : {
            label: '核心报错摘要',
            expected: '正常执行并返回预期结果',
            actual: firstHeadline.slice(0, 110),
          },
      ripples: downstreamNodes,
      actions: [
        {
          id: 'fix-adapt-downstream',
          label: '方案 A：在报错处做类型/空值兼容适配',
          strategy: '保持上游最新输出不变，仅在消费端补齐防御性转换与类型声明',
          tradeoff: '改动面最小，但需确认上游改动是否符合长期接口设计',
          recommended: true,
          promptDirective: `Keep the upstream signature unchanged. Fix the mismatch in ${rootLoc.file}${rootLoc.line ? ` around line ${rootLoc.line}` : ''} by safely adapting to the actual shape (${extracted.typeMismatch?.actual ?? 'observed runtime value'}) without using \`any\` or suppressing errors.`,
        },
        {
          id: 'fix-revert-origin',
          label: '方案 B：回退源头契约变更，保持原有接口稳定',
          strategy: '恢复被 AI 改动的上游返回结构，消除所有下游连锁报错',
          tradeoff: '无需逐个修改调用方，最适合 AI 擅自修改共享模型字段的场景',
          promptDirective: `Restore the original expected contract (${extracted.typeMismatch?.expected ?? 'previous interface'}) at the root source instead of patching downstream call sites. Verify all affected files compile cleanly.`,
        },
      ],
    };
    cards.push(rippleCard);
  }

  // 2. Build Silent Regression Cards from static heuristics
  extracted.silentRegressions.forEach((reg, index) => {
    const regCard: SilentRegressionCardData = {
      id: `card-regression-${index}`,
      kind: 'silent_regression',
      severity: 'warning',
      badge: `SILENT REGRESSION · ${reg.patternTag}`,
      title: reg.title,
      plainSummary: `该改动未触发编译报错，但静态规则检测到高风险行为漂移（${reg.patternTag}）。AI 经常为了“让报错消失”而采取这类危险捷径。`,
      location: { file: reg.file },
      patternTag: reg.patternTag,
      behaviorShift: {
        before: reg.before,
        after: reg.after,
      },
      evidenceSnippet: reg.snippet,
      riskImpact: reg.riskImpact,
      actions: [
        {
          id: `restore-guard-${index}`,
          label: '恢复原有安全守卫，并用正确方式修根因',
          strategy: '撤回 AI 的绕过逻辑，保留安全/类型边界并修复底层真正问题',
          tradeoff: '可能重新暴露真实错误，但确保代码库不留隐蔽漏洞',
          recommended: true,
          promptDirective: `In ${reg.file}, undo the ${reg.patternTag} shortcut. Restore the original safety/type invariant and fix the underlying root cause properly with explicit error handling.`,
        },
        {
          id: `explicit-accept-${index}`,
          label: '确认为有意简化，补充显式注释与单测',
          strategy: '保留当前行为变更，但要求 Agent 补充边界单测以防回归',
          tradeoff: '仅在你明确允许放宽该边界条件时选择',
          promptDirective: `The behavior shift in ${reg.file} (${reg.patternTag}) is intentional. Add an explicit explanatory comment and unit test covering the edge case.`,
        },
      ],
    };
    cards.push(regCard);
  });

  // 3. Build Mental Model Anchor Card
  const flowNodes: TopologyNode[] = [];
  const allFiles = Array.from(
    new Set([
      ...extracted.diffFiles.map((d) => d.file),
      ...extracted.parsedLocations.map((l) => l.file),
    ])
  ).slice(0, 4);

  allFiles.forEach((file, idx) => {
    const hasReg = extracted.silentRegressions.some((r) => r.file === file);
    const isRoot = extracted.parsedLocations[0]?.file === file;
    flowNodes.push({
      id: `node-${idx}`,
      label: file.split('/').pop() ?? file,
      sublabel: isRoot ? '报错源头' : hasReg ? '行为漂移' : idx === 0 ? '变更入口' : '关联节点',
      file,
      line: extracted.parsedLocations.find((l) => l.file === file)?.line,
      status: isRoot ? 'fault' : hasReg ? 'guard_removed' : 'affected',
    });
  });

  if (flowNodes.length > 0) {
    const mentalCard: MentalModelCardData = {
      id: 'card-mental-model-static',
      kind: 'mental_model',
      badge: 'MENTAL MODEL ANCHOR',
      title: '3 秒重建上下文：当前报错在项目中的链路位置',
      narrative: `本次涉及 ${allFiles.length} 个核心文件节点。你可以无需通读全部代码，只需顺着下方红色/琥珀色节点即可理解本次 Vibe Coding 改动的完整因果面。`,
      flow: flowNodes,
      keyTakeaway:
        extracted.silentRegressions.length > 0
          ? '注意：除了表面报错外，AI 在本次修改中引入了静默风险，建议优先处理琥珀色卡片。'
          : '先定夺“改上游契约”还是“改下游适配”，再把下方生成的精确指令回传给主 Agent，可避免来回拉扯。',
    };
    cards.push(mentalCard);
  }

  return cards;
}
