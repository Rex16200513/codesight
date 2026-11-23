import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { askRepository, generateRepoMap, projectProblemOntoRepo } from './engine.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

test('generateRepoMap builds incremental structured map and identifies real hubs', async () => {
  const first = await generateRepoMap(REPO_ROOT, { persistCache: true });
  assert.ok(first.map.totalFiles >= 12);
  assert.ok(first.map.hubs.some((h) => h.path.endsWith('packages/core/src/schema.ts')));

  // Second run should hit incremental SHA-256 cache for all files!
  const second = await generateRepoMap(REPO_ROOT, { persistCache: true });
  assert.equal(second.map.reindexedFiles, 0);
  assert.equal(second.map.cachedFiles, second.map.totalFiles);
});

test('askRepository retrieves relevant files via bilingual Graph + Embedding search', async () => {
  const res = await askRepository(REPO_ROOT, '修复提示词 prompt 是怎么拼装生成的');
  assert.ok(res.hits.length > 0);
  assert.ok(
    res.hits.some((h) => h.file.path.endsWith('promptBuilder.ts')),
    `Expected promptBuilder.ts in top hits, got: ${res.hits.map((h) => h.file.path).join(', ')}`
  );
  assert.ok(res.savedPercent > 40);
});

test('projectProblemOntoRepo distinguishes High-Hub vs Safe-Leaf blast radius', async () => {
  const hubReport = await projectProblemOntoRepo(REPO_ROOT, {
    rawError: `packages/core/src/schema.ts(104,3): error TS2322: Type 'string' is not assignable to type 'number'.`,
  });
  assert.equal(hubReport.blastRadius?.riskLevel, 'high-hub');
  assert.ok((hubReport.blastRadius?.directImpact.length ?? 0) >= 3);
  assert.ok(hubReport.directions.some((d) => d.id === 'dir-protect-hub'));

  const bridgeReport = await projectProblemOntoRepo(REPO_ROOT, {
    rawError: `apps/hud/src/App.tsx(42,10): TypeError: Cannot read properties of undefined (reading 'bundle')`,
  });
  assert.equal(bridgeReport.blastRadius?.riskLevel, 'medium-bridge');
  assert.equal(bridgeReport.blastRadius?.directImpact[0]?.path, 'apps/hud/src/main.tsx');

  const leafReport = await projectProblemOntoRepo(REPO_ROOT, {
    rawError: `packages/cli/src/cli.ts(52,10): TypeError: Cannot read properties of undefined (reading 'map')`,
  });
  assert.equal(leafReport.blastRadius?.riskLevel, 'low-leaf');
  assert.equal(leafReport.blastRadius?.directImpact.length, 0);
  assert.ok(leafReport.directions.some((d) => d.id === 'dir-safe-leaf-fix'));
});
