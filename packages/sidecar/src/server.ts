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
  getGlobalConfigPath,
  loadCodeSightConfig,
  maskConfigForDisplay,
  projectProblemOntoRepo,
  resetCodeSightConfig,
  resolveProjectArchitecture,
  safeGitDiff,
  saveCodeSightConfig,
  toActiveLLMConfig,
  traceSymbol,
  type CodeSightConfigPatch,
} from '@codesight/core/engine';
import { renderVisualProjectMapHtml } from '@codesight/mcp-server';
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

    // --- Live Browser Preview (Apple-crafted Visual Map + In-Card Settings) ---
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/map')) {
      try {
        const dir = url.searchParams.get('repo') || process.cwd();
        const cfg = loadCodeSightConfig(dir);
        const { index, graph, callGraph } = await generateRepoMap(dir);
        const llmConfig = cfg.architectureMode === 'heuristic' ? undefined : toActiveLLMConfig(cfg);
        const blueprint = await resolveProjectArchitecture(index, graph, { llmConfig });
        const visual = buildVisualProjectMap(index, graph, callGraph, undefined, blueprint);
        const rawHtml = renderVisualProjectMapHtml(visual, cfg);
        const pageHtml = rawHtml.replace(
          '<body>',
          '<body style="background:var(--cs-canvas,#f5f5f7);min-height:100vh;padding:24px;display:flex;justify-content:center;align-items:flex-start"><div style="width:min(960px,100%)">'
        ).replace('</body>', '</div></body>');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pageHtml);
      } catch (err) {
        sendJson(res, 500, { error: err instanceof Error ? err.message : 'Failed to render map' });
      }
      return;
    }

    // --- Unified Persistent Settings API (Shared by Agent Plugins, Browser Map & macOS HUD) ---
    if (req.method === 'GET' && url.pathname === '/api/settings') {
      const repoDir = url.searchParams.get('repo') || undefined;
      const cfg = loadCodeSightConfig(repoDir);
      sendJson(res, 200, {
        configPath: getGlobalConfigPath(),
        config: maskConfigForDisplay(cfg),
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/settings') {
      try {
        const body = JSON.parse((await readBody(req)) || '{}') as CodeSightConfigPatch & { reset?: boolean };
        const next = body.reset ? resetCodeSightConfig() : saveCodeSightConfig(body);
        sendJson(res, 200, {
          ok: true,
          configPath: getGlobalConfigPath(),
          config: maskConfigForDisplay(next),
        });
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'Invalid settings payload' });
      }
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
          forceRefresh?: boolean;
        };
        const dir = body.repoDir || process.cwd();
        const cfg = loadCodeSightConfig(dir);
        const { index, graph, callGraph } = await generateRepoMap(dir);
        const llmConfig = cfg.architectureMode === 'heuristic' ? undefined : toActiveLLMConfig(cfg);
        const blueprint = await resolveProjectArchitecture(index, graph, {
          llmConfig,
          forceRefresh: Boolean(body.forceRefresh),
        });
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

    if (req.method === 'POST' && url.pathname === '/api/refresh-prototypes') {
      try {
        const body = JSON.parse((await readBody(req)) || '{}') as { repoDir?: string };
        const dir = body.repoDir || process.cwd();
        const cfg = loadCodeSightConfig(dir);
        const llmConfig = toActiveLLMConfig(cfg);
        if (!llmConfig) {
          sendJson(res, 200, {
            ok: false,
            needsLlmConfig: true,
            error:
              cfg.language === 'en'
                ? 'Enable a BYOK model in Settings first to generate or refresh UI prototypes.'
                : '请先在设置中启用小模型（BYOK），即可一键生成或刷新所有 UI 原型示意图。',
          });
          return;
        }
        const { index, graph, callGraph } = await generateRepoMap(dir);
        const blueprint = await resolveProjectArchitecture(index, graph, {
          llmConfig,
          forceRefresh: true,
        });
        const visualMap = buildVisualProjectMap(index, graph, callGraph, undefined, blueprint);
        const prototypeCount = Object.keys(blueprint.prototypes ?? {}).length;
        sendJson(res, 200, {
          ok: blueprint.source === 'llm-cached',
          source: blueprint.source,
          modelName: blueprint.modelName ?? llmConfig.model,
          prototypeCount,
          visualMap,
          ...(blueprint.source !== 'llm-cached'
            ? {
                error:
                  cfg.language === 'en'
                    ? 'Model did not return a valid prototype spec. Check Base URL, model name, and API key.'
                    : '模型未返回有效的 UI 原型结构，请检查 Base URL、模型名与 API Key 是否正常。',
              }
            : {}),
        });
      } catch (err) {
        sendJson(res, 400, {
          ok: false,
          error: err instanceof Error ? err.message : 'refresh-prototypes failed',
        });
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
