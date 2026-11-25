import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { apply as applyClient, extractCodeSightCardMeta, VISUAL_TOOL_KEYS } from './client.ts';
import { apply as applyHost, name as pluginName } from './index.ts';
import type { DshSlotRegistration, DshToolDefinition } from './types.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

test('DeepSeek Harness Cordis host plugin registers all 5 CodeSight tools and executes in-process', async () => {
  const registered = new Map<string, DshToolDefinition>();
  const dispose = applyHost({
    tools: {
      register(tool) {
        registered.set(tool.name, tool);
        return () => registered.delete(tool.name);
      },
    },
  });

  assert.equal(pluginName, 'codesight');
  assert.deepEqual(Array.from(registered.keys()), [
    'codesight_map',
    'codesight_ask',
    'codesight_trace',
    'codesight_diagnose',
    'codesight_settings',
  ]);

  const mapTool = registered.get('codesight_map')!;
  const mapVal = await mapTool.execute({ repoDir: REPO_ROOT });
  const rendered = mapTool.output.render({ repoDir: REPO_ROOT }, mapVal);
  const meta = mapTool.output.presentationMeta?.({ repoDir: REPO_ROOT }, mapVal);

  assert.match(rendered[0].text, /CodeSight Map/);
  assert.equal(meta?.kind, 'codesight-card');
  assert.match(meta?.html ?? '', /cs-refresh-proto/);
  assert.match(meta?.html ?? '', /renderPrototypeSvg/);

  const traceTool = registered.get('codesight_trace')!;
  const traceVal = await traceTool.execute({ repoDir: REPO_ROOT, symbol: 'buildSurgicalFixPrompt' });
  const traceRendered = traceTool.output.render({}, traceVal);
  assert.match(traceRendered[0].text, /CodeSightHUD/);

  dispose();
  assert.equal(registered.size, 0);
});

test('DeepSeek Harness Cordis client plugin registers keyed tool.call.toolview slots for visual tools', () => {
  const slots: DshSlotRegistration[] = [];
  const dispose = applyClient({
    slots: {
      register(entry) {
        slots.push(entry);
        return () => {
          const idx = slots.indexOf(entry);
          if (idx >= 0) slots.splice(idx, 1);
        };
      },
    },
  });

  assert.equal(slots.length, VISUAL_TOOL_KEYS.length);
  assert.deepEqual(
    slots.map((s) => s.key),
    Array.from(VISUAL_TOOL_KEYS)
  );

  const sampleMeta = extractCodeSightCardMeta({
    name: 'codesight_map',
    meta: { kind: 'codesight-card', toolName: 'codesight_map', title: 'Map', html: '<html>ok</html>' },
  });
  assert.equal(sampleMeta?.title, 'Map');

  dispose();
  assert.equal(slots.length, 0);
});
