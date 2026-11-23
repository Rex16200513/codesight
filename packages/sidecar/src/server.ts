import { execFile } from 'node:child_process';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { promisify } from 'node:util';
import {
  DEMO_SCENARIOS,
  analyzeDiagnostic,
  type AnalyzeInput,
  type DiagnosticBundle,
  type LLMConfig,
} from '@glassbox/core';
import { toMCPAppResource } from './mcpBridge.ts';

const execFileAsync = promisify(execFile);

export interface SidecarOptions {
  port?: number;
  host?: string;
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function startSidecarServer(options: SidecarOptions = {}) {
  const port = options.port ?? Number(process.env.GLASSBOX_PORT || 4317);
  const host = options.host ?? '127.0.0.1';

  const sseClients = new Set<ServerResponse>();
  let latestBundle: DiagnosticBundle = DEMO_SCENARIOS[0].bundle;

  const broadcastBundle = (bundle: DiagnosticBundle) => {
    latestBundle = bundle;
    const frame = `event: diagnostic\ndata: ${JSON.stringify(bundle)}\n\n`;
    for (const client of sseClients) {
      client.write(frame);
    }
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${host}:${port}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      res.end();
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        service: '@glassbox/sidecar',
        schemaVersion: '1.0',
        connectedHudClients: sseClients.size,
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);
      sseClients.add(res);
      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/latest') {
      sendJson(res, 200, latestBundle);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/mcp-preview') {
      sendJson(res, 200, toMCPAppResource(latestBundle));
      return;
    }

    if (req.method === 'POST' && (url.pathname === '/api/analyze' || url.pathname === '/api/ingest')) {
      try {
        const bodyText = await readBody(req);
        const parsed = JSON.parse(bodyText || '{}') as AnalyzeInput & { llmConfig?: LLMConfig };
        const bundle = await analyzeDiagnostic(
          {
            rawError: parsed.rawError,
            rawDiff: parsed.rawDiff,
            sourceAgent: parsed.sourceAgent || 'External CLI / Agent',
          },
          parsed.llmConfig
        );
        broadcastBundle(bundle);
        sendJson(res, 200, bundle);
      } catch (err) {
        sendJson(res, 400, {
          error: err instanceof Error ? err.message : 'Invalid JSON payload',
        });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/scan-git') {
      try {
        const bodyText = await readBody(req);
        const { cwd, sourceAgent, llmConfig } = JSON.parse(bodyText || '{}') as {
          cwd?: string;
          sourceAgent?: string;
          llmConfig?: LLMConfig;
        };
        const targetDir = cwd || process.cwd();
        const { stdout } = await execFileAsync('git', ['diff'], { cwd: targetDir });
        const bundle = await analyzeDiagnostic(
          {
            rawDiff: stdout,
            sourceAgent: sourceAgent || `Git Diff (${targetDir})`,
          },
          llmConfig
        );
        broadcastBundle(bundle);
        sendJson(res, 200, bundle);
      } catch (err) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : 'Failed to inspect git diff',
        });
      }
      return;
    }

    sendJson(res, 404, { error: 'Not Found' });
  });

  server.listen(port, host, () => {
    console.log(`[GlassBox Sidecar] Listening on http://${host}:${port}`);
    console.log(`  - SSE Live Stream : GET  http://${host}:${port}/api/events`);
    console.log(`  - Ingest Any Agent: POST http://${host}:${port}/api/ingest`);
    console.log(`  - MCP App Preview : GET  http://${host}:${port}/api/mcp-preview`);
  });

  return server;
}
