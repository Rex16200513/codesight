/**
 * Lightweight, zero-lockin Cordis & DeepSeek Harness (dsh) structural contracts.
 * Compatible with `@deepseek-ai/cordis`, `@deepseek-ai/dsh-tools`, and `@deepseek-ai/dsh-client-ui-tool`
 * without pinning an unpublished alpha peer version at build time.
 */

export type Disposer = () => void;

export interface DshContentBlock {
  type: 'text';
  text: string;
}

export interface DshToolPresentationMeta {
  kind: 'codesight-card';
  toolName: string;
  title: string;
  repoName?: string;
  html: string;
  warnFilesCount?: number;
}

export interface DshToolOutputSpec<TValue = unknown> {
  schema?: Record<string, unknown>;
  render(args: Record<string, unknown>, value: TValue): DshContentBlock[];
  presentationMeta?(args: Record<string, unknown>, value: TValue): DshToolPresentationMeta | undefined;
}

export interface DshToolDefinition<TValue = unknown> {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  output: DshToolOutputSpec<TValue>;
  execute(args: Record<string, unknown>, exec?: { signal?: AbortSignal; cwd?: string }): Promise<TValue>;
}

export interface DshToolRegistry {
  register<TValue = unknown>(tool: DshToolDefinition<TValue>): Disposer | void;
}

export interface CordisHostContext {
  tools: DshToolRegistry;
  effect?: (callback: () => Disposer | void, label?: string) => void;
  logger?: (name: string) => { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void };
}

export interface DshToolCallBlock {
  name: string;
  arguments?: Record<string, unknown>;
  content?: DshContentBlock[];
  meta?: DshToolPresentationMeta | Record<string, unknown>;
  isError?: boolean;
}

export interface DshSlotRegistration {
  name: string;
  id?: string;
  key?: string;
  render?: (props: {
    block?: DshToolCallBlock;
    sendMessage?: (text: string) => void;
    callTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  }) => unknown;
  component?: (props: {
    block?: DshToolCallBlock;
    sendMessage?: (text: string) => void;
    callTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  }) => unknown;
}

export interface DshSlotRegistry {
  register: (entry: DshSlotRegistration) => Disposer | void;
  inject?: (slotName: string, factory: () => Disposer | void) => Disposer | void;
}

export interface CordisClientContext {
  slots: DshSlotRegistry;
  effect?: (callback: () => Disposer | void, label?: string) => void;
}
