import type {
  CordisClientContext,
  Disposer,
  DshToolCallBlock,
  DshToolPresentationMeta,
} from './types.ts';

export const name = 'codesight-ui';
export const inject = ['slots'] as const;

export const VISUAL_TOOL_KEYS = [
  'codesight_map',
  'codesight_diagnose',
  'codesight_trace',
  'codesight_settings',
] as const;

export function extractCodeSightCardMeta(block?: DshToolCallBlock): DshToolPresentationMeta | null {
  const meta = block?.meta;
  if (!meta || typeof meta !== 'object') return null;
  if ((meta as DshToolPresentationMeta).kind !== 'codesight-card') return null;
  const html = (meta as DshToolPresentationMeta).html;
  if (typeof html !== 'string' || !html.trim()) return null;
  return meta as DshToolPresentationMeta;
}

/**
 * Bridges CodeSight's standard MCP Apps JSON-RPC postMessage protocol (`ui/message` & `tools/call`)
 * directly into the DeepSeek Harness Web UI session so clicking "AI 原型", "拆分建议", or
 * "复制修复指令" dispatches directly to the active DeepSeek agent without manual copy-paste.
 */
export function attachCodeSightFrameBridge(
  iframeWindow: Window | null,
  handlers: {
    sendMessage?: (text: string) => void;
    callTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  }
): Disposer {
  if (typeof window === 'undefined' || !iframeWindow) return () => {};

  const onMessage = (event: MessageEvent) => {
    if (event.source !== iframeWindow) return;
    const msg = event.data as
      | { jsonrpc?: string; id?: string | number; method?: string; params?: Record<string, unknown>; type?: string; prompt?: string }
      | undefined;
    if (!msg || typeof msg !== 'object') return;

    if (msg.jsonrpc === '2.0' && msg.method === 'ui/message' && handlers.sendMessage) {
      const content = Array.isArray(msg.params?.content)
        ? (msg.params?.content as Array<{ text?: string }>)
        : [];
      const text = content.map((c) => c.text ?? '').join('\n').trim();
      if (text) {
        handlers.sendMessage(text);
        iframeWindow.postMessage({ jsonrpc: '2.0', id: msg.id, result: { ok: true } }, '*');
      }
      return;
    }

    if (msg.jsonrpc === '2.0' && msg.method === 'tools/call' && handlers.callTool) {
      const toolName = String(msg.params?.name ?? '');
      const toolArgs = (msg.params?.arguments as Record<string, unknown> | undefined) ?? {};
      void handlers
        .callTool(toolName, toolArgs)
        .then((res) => {
          iframeWindow.postMessage({ jsonrpc: '2.0', id: msg.id, result: res ?? { ok: true } }, '*');
        })
        .catch((err) => {
          iframeWindow.postMessage(
            { jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: String(err) } },
            '*'
          );
        });
      return;
    }

    if (msg.type === 'codesight:actionPrompt' && typeof msg.prompt === 'string' && handlers.sendMessage) {
      handlers.sendMessage(msg.prompt);
    }
  };

  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

/**
 * Cordis Web Client entry point for DeepSeek Harness (`dsh web`).
 * Registers keyed `tool.call.toolview` visual cards for every visual CodeSight tool.
 */
export function apply(ctx: CordisClientContext): Disposer {
  const disposers: Disposer[] = [];

  for (const toolKey of VISUAL_TOOL_KEYS) {
    const dispose = ctx.slots.register({
      name: 'tool.call.toolview',
      id: `codesight-card-${toolKey}`,
      key: toolKey,
      render: ({ block, sendMessage, callTool }) => {
        const card = extractCodeSightCardMeta(block);
        if (!card) return null;
        return {
          type: 'codesight-iframe-card',
          title: card.title,
          srcDoc: card.html,
          sandbox: 'allow-scripts allow-same-origin',
          onMountFrame: (iframe: HTMLIFrameElement | null) =>
            attachCodeSightFrameBridge(iframe?.contentWindow ?? null, { sendMessage, callTool }),
        };
      },
    });
    if (typeof dispose === 'function') disposers.push(dispose);
  }

  const cleanup: Disposer = () => {
    for (const fn of disposers) fn();
    disposers.length = 0;
  };
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => cleanup, 'codesight-ui: toolview slots');
  }
  return cleanup;
}
