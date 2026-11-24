import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { startStreamableHttpMcpServer } from './server.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const SERVER_ENTRY = path.resolve(import.meta.dirname, './index.ts');

test('Stdio MCP Server handles initialize, tools/list, tools/call (trace & diagnose), and ui:// resource read', async () => {
  const child = spawn(process.execPath, ['--experimental-strip-types', SERVER_ENTRY], {
    cwd: REPO_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const pending = new Map<number, (msg: Record<string, unknown>) => void>();
  let buf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const id = parsed.id as number;
      if (pending.has(id)) {
        pending.get(id)!(parsed);
        pending.delete(id);
      }
    }
  });

  let nextId = 1;
  const rpc = (method: string, params: Record<string, unknown>) =>
    new Promise<Record<string, unknown>>((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });

  try {
    const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {} });
    assert.equal((init.result as { serverInfo: { name: string } }).serverInfo.name, 'codesight');

    const listed = await rpc('tools/list', {});
    const toolNames = ((listed.result as { tools: Array<{ name: string }> }).tools).map((t) => t.name);
    assert.deepEqual(toolNames, ['codesight_map', 'codesight_ask', 'codesight_trace', 'codesight_diagnose']);

    const traceRes = await rpc('tools/call', {
      name: 'codesight_trace',
      arguments: { symbol: 'buildSurgicalFixPrompt', repoDir: REPO_ROOT },
    });
    const traceContent = (traceRes.result as { content: Array<{ type: string; text?: string }> }).content;
    assert.match(traceContent[0].text ?? '', /CodeSightHUD/);

    const diagRes = await rpc('tools/call', {
      name: 'codesight_diagnose',
      arguments: {
        repoDir: REPO_ROOT,
        rawError: `packages/core/src/schema.ts(104,3): error TS2322: Type 'string' is not assignable to type 'number'.`,
      },
    });
    const diagContent = (diagRes.result as { content: Array<{ type: string; text?: string }> }).content;
    assert.match(diagContent[0].text ?? '', /high-hub/);

    const uiRead = await rpc('resources/read', { uri: 'ui://codesight/diagnose/latest' });
    const html = ((uiRead.result as { contents: Array<{ text: string }> }).contents)[0].text;
    assert.match(html, /cs-columns/);
    assert.match(html, /cs-modal-backdrop/);
    assert.match(html, /renderPrototypeSvg/);
  } finally {
    child.kill('SIGTERM');
  }
});

test('Streamable HTTP MCP Server (/mcp) serves ChatGPT & Antigravity remote requests cleanly', async () => {
  const server = startStreamableHttpMcpServer(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 4318;

  try {
    const resp = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'codesight_map', arguments: { repoDir: REPO_ROOT } },
      }),
    });
    assert.equal(resp.status, 200);
    const json = (await resp.json()) as { result: { content: Array<{ text?: string }> } };
    assert.match(json.result.content[0].text ?? '', /CodeSight Map/);
  } finally {
    server.close();
  }
});
