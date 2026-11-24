import http from 'node:http';
import {
  askRepository,
  buildVisualProjectMap,
  generateRepoMap,
  projectProblemOntoRepo,
  resolveProjectArchitecture,
  safeGitDiff,
  traceSymbol,
  type HostArchitectureOverride,
} from '@codesight/core/engine';
import { renderTraceCardHtml, renderVisualProjectMapHtml } from './uiCards.ts';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

const SERVER_INFO = {
  name: 'codesight',
  version: '0.5.0',
};

const TOOL_DEFINITIONS = [
  {
    name: 'codesight_map',
    description:
      'Build an incremental AST + Dependency Graph comprehension map of a local repository. Reveals high-impact core hub files and plain-language roles per layer at near-zero token cost.',
    inputSchema: {
      type: 'object',
      properties: {
        repoDir: {
          type: 'string',
          description: 'Absolute path to the repository root (defaults to current working directory).',
        },
        architectureOverride: {
          type: 'object',
          description:
            'Optional semantic architecture blueprint provided by the host AI agent (e.g., custom Frontend / Backend / Shared zones tailored to this specific project). Cached locally once provided.',
        },
      },
    },
    _meta: {
      ui: { resourceUri: 'ui://codesight/map/latest' },
    },
  },
  {
    name: 'codesight_ask',
    description:
      'Locate relevant code files using hybrid GraphRAG (BM25 + Bilingual Vector + 1-hop Dependency Graph RRF). Compresses whole-repo context by ~97% and returns exact symbol/dependency context.',
    inputSchema: {
      type: 'object',
      required: ['question'],
      properties: {
        question: {
          type: 'string',
          description: 'Natural language question (Chinese or English) or symbol/concept to locate.',
        },
        repoDir: {
          type: 'string',
          description: 'Absolute path to the repository root (defaults to current working directory).',
        },
      },
    },
  },
  {
    name: 'codesight_trace',
    description:
      'Trace cross-file AST callers and callees of any function, React component, class, or type before editing it.',
    inputSchema: {
      type: 'object',
      required: ['symbol'],
      properties: {
        symbol: {
          type: 'string',
          description: 'Exact or partial function/component/type name to trace.',
        },
        repoDir: {
          type: 'string',
          description: 'Absolute path to the repository root (defaults to current working directory).',
        },
      },
    },
    _meta: {
      ui: { resourceUri: 'ui://codesight/trace/latest' },
    },
  },
  {
    name: 'codesight_diagnose',
    description:
      'Project a terminal error stack trace and/or current git diff onto the repository dependency & AST call graph. Computes Blast Radius, Safe Zones, Silent Regression traps (removed guards / empty catch / as any), and concrete Fix Directions.',
    inputSchema: {
      type: 'object',
      properties: {
        rawError: {
          type: 'string',
          description: 'Raw compiler or runtime error / stack trace.',
        },
        useGit: {
          type: 'boolean',
          description: 'If true, safely inspects uncommitted git diff inside repoDir for blast radius and silent regressions.',
        },
        repoDir: {
          type: 'string',
          description: 'Absolute path to the repository root (defaults to current working directory).',
        },
      },
    },
    _meta: {
      ui: { resourceUri: 'ui://codesight/diagnose/latest' },
    },
  },
];

/**
 * Core protocol handler shared identically between Stdio (local agents) and Streamable HTTP (ChatGPT / Remote MCP).
 */
export class CodeSightMcpHandler {
  private readonly uiResources = new Map<string, { title: string; html: string }>();

  async handleMessage(msg: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    // Notifications have no id and expect no response
    if (msg.id === undefined) {
      return null;
    }

    try {
      switch (msg.method) {
        case 'initialize': {
          const clientProto =
            typeof msg.params?.protocolVersion === 'string'
              ? msg.params.protocolVersion
              : '2025-03-26';
          return {
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              protocolVersion: clientProto,
              serverInfo: SERVER_INFO,
              capabilities: {
                tools: { listChanged: false },
                resources: { subscribe: false, listChanged: false },
                experimental: {
                  'io.modelcontextprotocol/ui': { supported: true },
                },
              },
            },
          };
        }

        case 'ping':
          return { jsonrpc: '2.0', id: msg.id, result: {} };

        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id: msg.id,
            result: { tools: TOOL_DEFINITIONS },
          };

        case 'resources/list': {
          const resources = Array.from(this.uiResources.entries()).map(([uri, entry]) => ({
            uri,
            name: entry.title,
            mimeType: 'text/html+mcp',
          }));
          return {
            jsonrpc: '2.0',
            id: msg.id,
            result: { resources },
          };
        }

        case 'resources/read': {
          const uri = String(msg.params?.uri ?? '');
          const found = this.uiResources.get(uri);
          if (!found) {
            return {
              jsonrpc: '2.0',
              id: msg.id,
              error: { code: -32002, message: `UI resource not found: ${uri}` },
            };
          }
          return {
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: 'text/html+mcp',
                  text: found.html,
                },
              ],
            },
          };
        }

        case 'tools/call':
          return await this.handleToolCall(msg.id, msg.params ?? {});

        default:
          return {
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32601, message: `Method not found: ${msg.method}` },
          };
      }
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id: msg.id,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : 'Internal MCP error',
        },
      };
    }
  }

  private async handleToolCall(
    id: string | number | null,
    params: Record<string, unknown>
  ): Promise<JsonRpcResponse> {
    const toolName = String(params.name ?? '');
    const args = (params.arguments as Record<string, unknown> | undefined) ?? {};
    const repoDir = typeof args.repoDir === 'string' && args.repoDir.trim() ? args.repoDir : process.cwd();

    if (toolName === 'codesight_map') {
      const { map, index, graph, callGraph } = await generateRepoMap(repoDir);
      const override = args.architectureOverride as HostArchitectureOverride | undefined;
      const blueprint = await resolveProjectArchitecture(index, graph, { override });
      const visualMap = buildVisualProjectMap(index, graph, callGraph, undefined, blueprint);
      const uri = 'ui://codesight/map/latest';
      const html = renderVisualProjectMapHtml(visualMap);
      this.uiResources.set(uri, { title: `CodeSight Map (${map.repoName})`, html });

      const textSummary = [
        `CodeSight Map · ${map.repoName} [${blueprint.archetypeLabel} · ${blueprint.source}] (${map.totalFiles} files, ${map.totalSymbols} AST symbols, ${map.scanMs}ms)`,
        `Architecture: ${blueprint.projectHeadline}`,
        ...blueprint.zones.map(
          (z) =>
            `- [${z.badge}] ${z.title}: ${z.groups.map((g) => `${g.title}(${g.files.length})`).join(', ')}`
        ),
        'Most-used Foundation Files:',
        ...map.hubs.slice(0, 5).map((h) => `- ${h.path} [used by ${h.downstreamReach} files] — ${h.roleLabel}`),
      ].join('\n');

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            { type: 'text', text: textSummary },
            { type: 'resource', resource: { uri, mimeType: 'text/html+mcp', text: html } },
          ],
          structuredContent: { map, blueprint, visualMap },
        },
      };
    }

    if (toolName === 'codesight_ask') {
      const question = String(args.question ?? '').trim();
      const res = await askRepository(repoDir, question);
      const textSummary = [
        `CodeSight Ask · "${res.question}" (${res.retrievalMs}ms | saved ${res.savedPercent}% tokens: ${res.retrievedSliceTokens}/${res.wholeRepoTokens})`,
        ...res.hits.map(
          (h, i) =>
            `${i + 1}. ${h.file.path} (${h.file.roleLabel}, RRF ${h.totalScore}) — ${h.file.summary} [${h.matchReasons.join('; ')}]`
        ),
      ].join('\n');

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: textSummary }],
          structuredContent: res,
        },
      };
    }

    if (toolName === 'codesight_trace') {
      const symbol = String(args.symbol ?? '').trim();
      const trace = await traceSymbol(repoDir, symbol);
      const uri = 'ui://codesight/trace/latest';
      const html = renderTraceCardHtml(trace);
      this.uiResources.set(uri, { title: `CodeSight Trace (${symbol})`, html });

      const textSummary =
        trace.matches.length === 0
          ? `No AST symbol matching "${symbol}" found in ${trace.repoName}.`
          : trace.matches
              .map(
                (m) =>
                  `${m.symbol.name} [${m.symbol.kind}] @ ${m.symbol.file}:${m.symbol.startLine}-${m.symbol.endLine}\n` +
                  `  Called by (${m.calledBy.length}): ${m.calledBy.map((e) => `${e.callerName} (${e.callerFile}:${e.callerLine})`).join(', ') || 'none'}\n` +
                  `  Calls out (${m.callsOut.length}): ${m.callsOut.map((e) => `${e.calleeName} (${e.calleeFile}:${e.calleeLine})`).join(', ') || 'none'}`
              )
              .join('\n\n');

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            { type: 'text', text: textSummary },
            { type: 'resource', resource: { uri, mimeType: 'text/html+mcp', text: html } },
          ],
          structuredContent: trace,
        },
      };
    }

    if (toolName === 'codesight_diagnose') {
      const rawError = typeof args.rawError === 'string' ? args.rawError : '';
      const useGit = Boolean(args.useGit);
      const rawDiff = useGit ? safeGitDiff(repoDir).diff : '';
      const { index, graph, callGraph } = await generateRepoMap(repoDir);
      const blueprint = await resolveProjectArchitecture(index, graph);
      const report = await projectProblemOntoRepo(repoDir, { rawError, rawDiff });
      const visualMap = buildVisualProjectMap(index, graph, callGraph, report, blueprint);

      const uri = 'ui://codesight/diagnose/latest';
      const html = renderVisualProjectMapHtml(visualMap);
      this.uiResources.set(uri, { title: `CodeSight Diagnose (${report.repoName})`, html });

      const lines = [
        `CodeSight Diagnose · ${report.repoName} (saved ${report.tokenEconomy.savedPercent}% tokens, ${report.tokenEconomy.retrievalMs}ms)`,
        `Diagnosis: ${report.plainDiagnosis}`,
      ];
      if (report.blastRadius) {
        lines.push(
          `Blast Radius [${report.blastRadius.riskLevel}]: direct=${report.blastRadius.directImpact.length}, indirect=${report.blastRadius.indirectImpact.length}, safeZone=${report.blastRadius.safeZoneCount} files`
        );
      }
      if (report.symbolCallers.length > 0) {
        lines.push(
          `AST Callers: ${report.symbolCallers.slice(0, 5).map((e) => `${e.callerName} (${e.callerFile}:${e.callerLine})`).join(', ')}`
        );
      }
      if (report.silentRegressions.length > 0) {
        lines.push(
          `Silent Regressions (${report.silentRegressions.length}): ` +
            report.silentRegressions.map((r) => `[${r.patternTag}] ${r.file}: ${r.title}`).join(' | ')
        );
      }
      if (report.directions.length > 0) {
        lines.push(
          'Fix Directions (ask the user to choose if high impact):',
          ...report.directions.map((d, i) => `  ${i + 1}. ${d.label} — ${d.strategy}`)
        );
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            { type: 'text', text: lines.join('\n') },
            { type: 'resource', resource: { uri, mimeType: 'text/html+mcp', text: html } },
          ],
          structuredContent: report,
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32602, message: `Unknown tool: ${toolName}` },
    };
  }
}

/** Transport 1: Local Stdio MCP Server (Antigravity, Claude Code, Claude Desktop, Cursor, VS Code, Codex, Orca) */
export function startStdioMcpServer() {
  const handler = new CodeSightMcpHandler();
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
export function startStreamableHttpMcpServer(port = 4318, host = '127.0.0.1') {
  const handler = new CodeSightMcpHandler();

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
