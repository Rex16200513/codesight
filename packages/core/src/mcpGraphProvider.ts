import { spawn } from 'node:child_process';
import type { ExternalGraphHint, GraphProvider, GraphSnapshot } from './graphProvider.ts';
import type { EmbeddingProviderConfig } from './embeddingIndex.ts';

export interface McpGraphProviderConfig {
  /** Shell command to start the external Graph-RAG MCP server, e.g. "cgc mcp start" or "npx @agntk/codegraph-mcp" */
  command: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
}

interface JsonRpcResponse {
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * Lightweight Zero-Dependency MCP JSON-RPC 2.0 over stdio client.
 * Connects GlassBox directly to external open-source Graph-RAG MCP servers:
 * - vitali87/code-graph-rag (MIT)
 * - CodeGraphContext / `cgc mcp start` (MIT, embedded KuzuDB / FalkorDBLite)
 * - sdsrss/code-graph-mcp / Serena LSP MCP
 */
export async function callMcpStdioTool(
  config: McpGraphProviderConfig,
  preferredTools: string[],
  buildArgs: (toolName: string) => Record<string, unknown>
): Promise<{ toolName: string; text: string } | null> {
  const timeoutMs = config.timeoutMs ?? 6000;
  const parts = config.args && config.args.length > 0 ? config.args : config.command.split(/\s+/);
  const bin = config.args && config.args.length > 0 ? config.command : parts[0];
  const args = config.args && config.args.length > 0 ? config.args : parts.slice(1);

  return new Promise((resolve) => {
    let settled = false;
    let buffer = '';
    const pending = new Map<number, (msg: JsonRpcResponse) => void>();
    let nextId = 1;

    const child = spawn(bin, args, {
      cwd: config.cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const finish = (val: { toolName: string; text: string } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore cleanup error
      }
      resolve(val);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    child.on('error', () => finish(null));
    child.on('exit', () => finish(null));

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as JsonRpcResponse;
          if (typeof msg.id === 'number' && pending.has(msg.id)) {
            const cb = pending.get(msg.id)!;
            pending.delete(msg.id);
            cb(msg);
          }
        } catch {
          // ignore non-JSON log lines on stdout
        }
      }
    });

    const sendRequest = (method: string, params: unknown): Promise<JsonRpcResponse> =>
      new Promise((res) => {
        const id = nextId++;
        pending.set(id, res);
        const frame = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
        child.stdin.write(frame);
      });

    (async () => {
      try {
        // 1. MCP Initialize handshake
        await sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'glassbox-graphrag-bridge', version: '0.2.0' },
        });
        child.stdin.write(
          JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n'
        );

        // 2. Discover tools exposed by the external Graph-RAG MCP server
        const listRes = await sendRequest('tools/list', {});
        const tools =
          ((listRes.result as { tools?: Array<{ name: string }> })?.tools ?? []).map(
            (t) => t.name
          );

        const chosen =
          preferredTools.find((name) => tools.includes(name)) ??
          tools.find((t) => /query|graph|search|caller|impact|relationship/i.test(t));

        if (!chosen) {
          finish(null);
          return;
        }

        // 3. Call the discovered Graph-RAG tool
        const callRes = await sendRequest('tools/call', {
          name: chosen,
          arguments: buildArgs(chosen),
        });

        const content = (
          callRes.result as { content?: Array<{ type?: string; text?: string }> }
        )?.content;
        const text =
          content
            ?.map((c) => c.text ?? '')
            .filter(Boolean)
            .join('\n')
            .trim() || JSON.stringify(callRes.result ?? '');

        finish({ toolName: chosen, text });
      } catch {
        finish(null);
      }
    })();
  });
}

/**
 * Composite GraphProvider:
 * Uses the fast local AST GraphProvider as the reliable zero-Docker backbone,
 * and enriches diagnostics with external Graph-RAG MCP servers when configured!
 */
export class McpEnrichedGraphProvider implements GraphProvider {
  readonly name: string;
  private readonly baseProvider: GraphProvider;
  private readonly mcpConfig: McpGraphProviderConfig;

  constructor(baseProvider: GraphProvider, mcpConfig: McpGraphProviderConfig) {
    this.baseProvider = baseProvider;
    this.mcpConfig = mcpConfig;
    this.name = `${baseProvider.name}+mcp(${mcpConfig.command.split(/\s+/)[0]})`;
  }

  async buildSnapshot(
    rootDir: string,
    options?: { persistCache?: boolean; embeddingConfig?: EmbeddingProviderConfig }
  ): Promise<GraphSnapshot> {
    const snap = await this.baseProvider.buildSnapshot(rootDir, options);
    return { ...snap, providerName: this.name };
  }

  async queryExternalContext(
    rootDir: string,
    query: string,
    symbolName?: string
  ): Promise<ExternalGraphHint | null> {
    const result = await callMcpStdioTool(
      { ...this.mcpConfig, cwd: this.mcpConfig.cwd || rootDir },
      [
        'analyze_code_relationships',
        'query_code_graph',
        'find_callers',
        'impact_analysis',
        'find_code',
        'search_code',
      ],
      (toolName) => {
        if (/caller|relationship/i.test(toolName) && symbolName) {
          return { query_type: 'find_callers', target: symbolName, symbol: symbolName };
        }
        return { query, symbol: symbolName, repo_path: rootDir };
      }
    );

    if (!result || !result.text) return null;

    const fileMatches = Array.from(
      new Set(
        result.text.match(/[a-zA-Z0-9_./-]+\.(?:tsx?|jsx?|py|go|rs)/g) ?? []
      )
    ).slice(0, 8);

    return {
      providerName: this.name,
      toolUsed: result.toolName,
      rawSummary: result.text.slice(0, 600),
      relatedFiles: fileMatches,
    };
  }
}
