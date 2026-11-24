import http from 'node:http';
import { SERVER_INFO, type JsonRpcRequest, type JsonRpcResponse } from './protocol.ts';

export interface McpMessageHandler {
  handleMessage(msg: JsonRpcRequest): Promise<JsonRpcResponse | null>;
}

/** Transport 1: Local Stdio MCP Server (Antigravity, Claude Code, Claude Desktop, Cursor, VS Code, Codex, Orca) */
export function startStdioTransport(handler: McpMessageHandler) {
  process.stdin.setEncoding('utf8');
  let buffer = '';

  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      void (async () => {
        try {
          const msg = JSON.parse(trimmed) as JsonRpcRequest;
          const resp = await handler.handleMessage(msg);
          if (resp) {
            process.stdout.write(JSON.stringify(resp) + '\n');
          }
        } catch {
          process.stdout.write(
            JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: { code: -32700, message: 'Parse error' },
            }) + '\n'
          );
        }
      })();
    }
  });
}

/** Transport 2: Streamable HTTP MCP Server (`/mcp`, compatible with ChatGPT Apps SDK & Antigravity Remote MCP) */
export function startStreamableHttpTransport(handler: McpMessageHandler, port = 4318, host = '127.0.0.1') {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${host}:${port}`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, server: SERVER_INFO, transport: 'streamable-http', endpoint: '/mcp' }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/mcp') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
      const raw = Buffer.concat(chunks).toString('utf8');

      try {
        const parsed = JSON.parse(raw) as JsonRpcRequest | JsonRpcRequest[];
        if (Array.isArray(parsed)) {
          const responses = (
            await Promise.all(parsed.map((item) => handler.handleMessage(item)))
          ).filter(Boolean);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(responses));
          return;
        }
        const resp = await handler.handleMessage(parsed);
        if (!resp) {
          res.writeHead(202);
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(resp));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
        );
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  server.listen(port, host, () => {
    console.error(`[CodeSight MCP Streamable HTTP] Listening on http://${host}:${port}/mcp`);
  });

  return server;
}
