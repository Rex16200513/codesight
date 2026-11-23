import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeDiagnostic, buildSurgicalFixPrompt, runStaticAnalysis } from './index.ts';

test('staticAnalyzer strips node_modules noise and extracts type mismatch', () => {
  const result = runStaticAnalysis({
    rawError: `src/app.ts(12,4): error TS2322: Type 'string' is not assignable to type 'number'.
  at node_modules/react-dom/cjs/react-dom.development.js:123:4
  at renderApp (src/app.ts:12:4)`,
  });

  assert.equal(result.strippedNoiseCount, 1);
  assert.equal(result.typeMismatch?.actual, 'string');
  assert.equal(result.typeMismatch?.expected, 'number');
  assert.equal(result.parsedLocations[0]?.file, 'src/app.ts');
  assert.equal(result.parsedLocations[0]?.line, 12);
});

test('staticAnalyzer catches silent regressions with 0 tokens', () => {
  const result = runStaticAnalysis({
    rawDiff: `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -4,6 +4,4 @@
- if (!user.isAdmin) throw new Error('forbidden');
+ // bypassed
+ try { run(); } catch { return []; }`,
  });

  const tags = result.silentRegressions.map((r) => r.patternTag);
  assert.ok(tags.includes('REMOVED_GUARD'));
  assert.ok(tags.includes('SWALLOWED_ERROR'));
});

test('analyzeDiagnostic synthesizes cards and surgical fix prompt without API key', async () => {
  const bundle = await analyzeDiagnostic({
    sourceAgent: 'Test Agent',
    rawError: `src/cart.ts:22:5 TypeError: Cannot read properties of undefined (reading 'price')`,
  });

  assert.equal(bundle.schemaVersion, '1.0');
  assert.ok(bundle.cards.length >= 1);
  assert.equal(bundle.telemetry.engineMode, 'static-only');

  const firstRipple = bundle.cards.find((c) => c.kind === 'ripple');
  assert.ok(firstRipple && firstRipple.kind === 'ripple');
  const prompt = buildSurgicalFixPrompt(
    bundle,
    { [firstRipple.id]: firstRipple.actions[0] },
    ['no-type-escape']
  );
  assert.match(prompt, /GlassBox Surgical Fix Request/);
  assert.match(prompt, /Do NOT use `as any`/);
});
