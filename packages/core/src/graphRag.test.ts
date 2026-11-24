import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
  BuiltInAstGraphProvider,
  McpEnrichedGraphProvider,
  buildVisualProjectMap,
  generateRepoMap,
  projectProblemOntoRepo,
  resolveProjectArchitecture,
  traceSymbol,
} from './engine.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

test('TypeScript AST parser eliminates string-literal false exports in scenarios.ts', async () => {
  const { index } = await generateRepoMap(REPO_ROOT, { persistCache: false });
  const scenariosNode = index.files['packages/core/src/scenarios.ts'];
  assert.ok(scenariosNode);
  assert.equal(scenariosNode.parserUsed, 'typescript-ast');
  assert.deepEqual(scenariosNode.exports, ['DEMO_SCENARIOS']);
  assert.ok(!scenariosNode.exports.includes('calculateLoyaltyPoints'));
});

test('AST Call Graph traces cross-file callers of buildSurgicalFixPrompt', async () => {
  const trace = await traceSymbol(REPO_ROOT, 'buildSurgicalFixPrompt');
  assert.ok(trace.matches.length >= 1);
  const match = trace.matches.find((m) => m.symbol.file.endsWith('promptBuilder.ts'));
  assert.ok(match);
  assert.ok(
    match.calledBy.some((e) => e.callerFile.endsWith('CodeSightHUD.tsx')),
    `Expected CodeSightHUD.tsx to call buildSurgicalFixPrompt, got: ${JSON.stringify(match.calledBy)}`
  );
});

test('McpEnrichedGraphProvider connects to an external stdio MCP Graph-RAG server cleanly', async () => {
  // Spawn a minimal in-line Node JSON-RPC 2.0 MCP server simulating CodeGraphContext / code-graph-rag
  const mockMcpScript = `
    process.stdin.setEncoding('utf8');
    let buf = '';
    process.stdin.on('data', (c) => {
      buf += c;
      for (const line of buf.split('\\n')) {
        if (!line.trim()) continue;
        const msg = JSON.parse(line);
        if (msg.method === 'initialize') {
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} } } }) + '\\n');
        } else if (msg.method === 'tools/list') {
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'query_code_graph' }] } }) + '\\n');
        } else if (msg.method === 'tools/call') {
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: 'External Graph-RAG: callers include packages/ui/src/components/CodeSightHUD.tsx' }] } }) + '\\n');
        }
      }
      buf = '';
    });
  `;

  const provider = new McpEnrichedGraphProvider(new BuiltInAstGraphProvider(), {
    command: process.execPath,
    args: ['-e', mockMcpScript],
  });

  const report = await projectProblemOntoRepo(
    REPO_ROOT,
    {
      rawError: `packages/core/src/promptBuilder.ts(55,4): TypeError: Cannot read properties of undefined (reading 'label')`,
    },
    { provider }
  );

  assert.ok(report.externalGraphHint);
  assert.equal(report.externalGraphHint?.toolUsed, 'query_code_graph');
  assert.ok(
    report.externalGraphHint?.relatedFiles.includes('packages/ui/src/components/CodeSightHUD.tsx')
  );
  assert.equal(report.primaryTarget?.symbol?.name, 'buildSurgicalFixPrompt');
});

test('resolveProjectArchitecture detects Frontend/Backend/Shared separation and honors host-agent overrides', async () => {
  const { index, graph, callGraph } = await generateRepoMap(REPO_ROOT, { persistCache: false });
  const autoBp = await resolveProjectArchitecture(index, graph, { persistCache: false });
  assert.equal(autoBp.archetype, 'fullstack');
  assert.ok(autoBp.zones.some((z) => z.kind === 'frontend'));
  assert.ok(autoBp.zones.some((z) => z.kind === 'backend'));
  assert.ok(autoBp.zones.some((z) => z.kind === 'shared'));

  const customBp = await resolveProjectArchitecture(index, graph, {
    persistCache: false,
    override: {
      archetype: 'monorepo-platform',
      archetypeLabel: 'AI 定制前后端分层',
      projectHeadline: '由宿主 Agent 规划的专属项目架构',
      zones: [
        {
          title: '前端与桌面层',
          badge: 'Frontend',
          kind: 'frontend',
          groups: [{ title: '界面视图', files: ['apps/hud/src/App.tsx', 'packages/ui/src/components/CodeSightHUD.tsx'] }],
        },
        {
          title: '后端与 MCP 插件层',
          badge: 'Backend',
          kind: 'backend',
          groups: [{ title: '服务端', files: ['packages/mcp-server/src/server.ts', 'packages/sidecar/src/server.ts'] }],
        },
      ],
    },
  });
  assert.equal(customBp.source, 'host-agent');
  const visual = buildVisualProjectMap(index, graph, callGraph, undefined, customBp);
  assert.equal(visual.zones.length, 2);
  assert.equal(visual.archetypeLabel, 'AI 定制前后端分层');
});
