import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import {
  DEMO_SCENARIOS,
  analyzeDiagnostic,
  type AnalyzeInput,
  type DiagnosticBundle,
  type LLMConfig,
} from '@codesight/core';
import {
  askRepository,
  buildVisualProjectMap,
  generateRepoMap,
  projectProblemOntoRepo,
  resolveProjectArchitecture,
  safeGitDiff,
  traceSymbol,
} from '@codesight/core/engine';
import { toMCPAppResource } from './mcpBridge.ts';

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
  const port = options.port ?? Number(process.env.CODESIGHT_PORT || process.env.GLASSBOX_PORT || 4317);
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
        service: 'codesight-sidecar',
        schemaVersion: '2.0',
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
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // --- GraphRAG Native HUD Endpoints (Zero TCC prompts, ~5ms warm latency) ---

    if (req.method === 'POST' && url.pathname === '/api/map') {
      try {
        const body = JSON.parse((await readBody(req)) || '{}') as { repoDir?: string };
        const { map } = await generateRepoMap(body.repoDir || process.cwd());
        sendJson(res, 200, map);
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'map failed' });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/visual-map') {
      try {
        const body = JSON.parse((await readBody(req)) || '{}') as {
          repoDir?: string;
          rawError?: string;
          useGit?: boolean;
        };
        const dir = body.repoDir || process.cwd();
        const { index, graph, callGraph } = await generateRepoMap(dir);
        const blueprint = await resolveProjectArchitecture(index, graph);
        let diagReport;
        if (body.rawError || body.useGit) {
          const rawDiff = body.useGit ? safeGitDiff(dir).diff : '';
          diagReport = await projectProblemOntoRepo(dir, { rawError: body.rawError, rawDiff });
        }
        sendJson(res, 200, buildVisualProjectMap(index, graph, callGraph, diagReport, blueprint));
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'visual-map failed' });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/ask') {
      try {
        const body = JSON.parse((await readBody(req)) || '{}') as {
          repoDir?: string;
          question?: string;
          llmConfig?: LLMConfig;
        };
        const result = await askRepository(body.repoDir || process.cwd(), body.question || '', {
          llmConfig: body.llmConfig,
        });
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'ask failed' });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/trace') {
      try {
        const body = JSON.parse((await readBody(req)) || '{}') as {
          repoDir?: string;
          symbol?: string;
        };
        const result = await traceSymbol(body.repoDir || process.cwd(), body.symbol || '');
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'trace failed' });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/diagnose') {
      try {
        const body = JSON.parse((await readBody(req)) || '{}') as {
          repoDir?: string;
          rawError?: string;
          useGit?: boolean;
          llmConfig?: LLMConfig;
        };
        const dir = body.repoDir || process.cwd();
        let rawDiff = '';
        if (body.useGit) {
          const gd = safeGitDiff(dir);
          rawDiff = gd.diff;
        }
        const report = await projectProblemOntoRepo(
          dir,
          { rawError: body.rawError, rawDiff },
          { llmConfig: body.llmConfig }
        );
        sendJson(res, 200, report);
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'diagnose failed' });
      }
      return;
    }

    // --- Legacy / Agent Webhook / MCP Preview Endpoints ---

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
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'Invalid JSON payload' });
      }
      return;
    }

    sendJson(res, 404, { error: 'Not Found' });
  });

  server.listen(port, host, () => {
    console.log(`[CodeSight Sidecar] Listening on http://${host}:${port}`);
    console.log(`  - GraphRAG API: POST /api/map | /api/ask | /api/trace | /api/diagnose`);
    console.log(`  - SSE Stream  : GET  /api/events`);
  });

  return server;
}
