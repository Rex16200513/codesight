import {
  SERVER_INFO,
  TOOL_DEFINITIONS,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type UiResourceEntry,
} from './protocol.ts';
import { executeCodeSightTool } from './toolHandlers.ts';
import { startStdioTransport, startStreamableHttpTransport } from './transports.ts';

export { SERVER_INFO, TOOL_DEFINITIONS, type JsonRpcRequest, type JsonRpcResponse, type UiResourceEntry };

/**
 * Core protocol handler shared identically between Stdio (local agents) and Streamable HTTP (ChatGPT / Remote MCP).
 */
export class CodeSightMcpHandler {
  private readonly uiResources = new Map<string, UiResourceEntry>();

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
          return await executeCodeSightTool(msg.id, msg.params ?? {}, this.uiResources);

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
}

/** Transport 1: Local Stdio MCP Server (Antigravity, Claude Code, Claude Desktop, Cursor, VS Code, Codex, Orca) */
export function startStdioMcpServer() {
  return startStdioTransport(new CodeSightMcpHandler());
}

/** Transport 2: Streamable HTTP MCP Server (`/mcp`, compatible with ChatGPT Apps SDK & Antigravity Remote MCP) */
export function startStreamableHttpMcpServer(port = 4318, host = '127.0.0.1') {
  return startStreamableHttpTransport(new CodeSightMcpHandler(), port, host);
}
