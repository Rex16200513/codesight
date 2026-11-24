import type { ActionOption, DiagnosticBundle } from './schema.ts';

export interface PromptConstraint {
  id: string;
  label: string;
  directive: string;
}

export const DEFAULT_CONSTRAINTS: PromptConstraint[] = [
  {
    id: 'no-type-escape',
    label: '禁止使用 any / @ts-ignore',
    directive: 'Do NOT use `as any`, `@ts-ignore`, or empty `catch {}` blocks.',
  },
  {
    id: 'preserve-guards',
    label: '保留所有权限与空值守卫',
    directive: 'Preserve all existing authentication, authorization, and null-safety guards.',
  },
  {
    id: 'minimal-diff',
    label: '最小改动范围（不重构无关文件）',
    directive: 'Keep the diff strictly minimal; do not refactor unrelated files.',
  },
  {
    id: 'verify-build',
    label: '修复后执行类型检查并报告结果',
    directive: 'Run typecheck/tests after the fix and confirm zero regressions.',
  },
];

/**
 * Compiles user's visual card choices into a razor-sharp, token-efficient Surgical Fix Prompt
 * ready to paste or dispatch to Claude Code, Cursor, Codex, Orca, or any coding agent.
 */
export function buildSurgicalFixPrompt(
  bundle: DiagnosticBundle,
  selectedActions: Record<string, ActionOption>,
  activeConstraintIds: string[]
): string {
  const chosenList = Object.entries(selectedActions);
  const constraints = DEFAULT_CONSTRAINTS.filter((c) => activeConstraintIds.includes(c.id));

  const lines: string[] = [
    `[CodeSight Surgical Fix Request · ${bundle.id}]`,
    `Context: ${bundle.headline}`,
    '',
    '### Decisions Made by Developer:',
  ];

  if (chosenList.length === 0) {
    lines.push('- Inspect the root cause identified above and propose a minimal, safe fix.');
  } else {
    chosenList.forEach(([, action], idx) => {
      lines.push(`${idx + 1}. (${action.label}) ${action.promptDirective}`);
    });
  }

  if (constraints.length > 0) {
    lines.push('', '### Non-Negotiable Guardrails:');
    constraints.forEach((c) => lines.push(`- ${c.directive}`));
  }

  return lines.join('\n');
}
