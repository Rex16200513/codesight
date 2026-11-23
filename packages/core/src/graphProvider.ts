import type { ParsedSymbol } from './astParser.ts';
import type { CodeDependencyGraph } from './codeGraph.ts';
import type { EmbeddingProviderConfig } from './embeddingIndex.ts';
import type { RepoIndex } from './repoIndexer.ts';

export interface SymbolCallEdge {
  callerSymbolId: string;
  callerName: string;
  callerFile: string;
  callerLine: number;
  calleeSymbolId: string;
  calleeName: string;
  calleeFile: string;
  calleeLine: number;
}

export interface SymbolCallGraph {
  symbolsById: Record<string, ParsedSymbol>;
  /** Symbol ID -> edges of symbols it calls */
  outgoing: Record<string, SymbolCallEdge[]>;
  /** Symbol ID -> edges of symbols that call it */
  incoming: Record<string, SymbolCallEdge[]>;
}

export interface ExternalGraphHint {
  providerName: string;
  toolUsed: string;
  rawSummary: string;
  relatedFiles: string[];
}

export interface GraphSnapshot {
  providerName: string;
  index: RepoIndex;
  fileGraph: CodeDependencyGraph;
  callGraph: SymbolCallGraph;
  embeddingMode: string;
}

/**
 * Pluggable GraphProvider Contract:
 * Allows GlassBox's Human Comprehension & Decision Layer to sit cleanly on top of:
 * 1. Built-in Zero-Docker AST + SQLite/JSON GraphRAG (`BuiltInAstGraphProvider`)
 * 2. External open-source Graph-RAG MCP servers (`McpGraphProvider` -> CodeGraphContext, vitali87/code-graph-rag, sdsrss/code-graph-mcp, Serena)
 */
export interface GraphProvider {
  readonly name: string;
  buildSnapshot(
    rootDir: string,
    options?: {
      persistCache?: boolean;
      embeddingConfig?: EmbeddingProviderConfig;
    }
  ): Promise<GraphSnapshot>;
  queryExternalContext?(
    rootDir: string,
    query: string,
    symbolName?: string
  ): Promise<ExternalGraphHint | null>;
}

/**
 * Builds a cross-file Function/Component Call Graph from AST-extracted symbols.
 */
export function buildSymbolCallGraph(index: RepoIndex): SymbolCallGraph {
  const symbolsById: Record<string, ParsedSymbol> = {};
  const exportedByName = new Map<string, ParsedSymbol[]>();
  const outgoing: Record<string, SymbolCallEdge[]> = {};
  const incoming: Record<string, SymbolCallEdge[]> = {};

  for (const fileNode of Object.values(index.files)) {
    for (const sym of fileNode.symbols ?? []) {
      symbolsById[sym.id] = sym;
      outgoing[sym.id] = [];
      incoming[sym.id] = [];
      if (sym.exported) {
        const list = exportedByName.get(sym.name) ?? [];
        list.push(sym);
        exportedByName.set(sym.name, list);
      }
    }
  }

  for (const fileNode of Object.values(index.files)) {
    const importedFiles = new Set(fileNode.resolvedImports);
    const localSymbolsByName = new Map<string, ParsedSymbol>();
    for (const sym of fileNode.symbols ?? []) {
      localSymbolsByName.set(sym.name, sym);
    }

    for (const caller of fileNode.symbols ?? []) {
      for (const calleeName of caller.calls) {
        if (calleeName === caller.name) continue;

        // Priority 1: symbol defined in same file
        let target: ParsedSymbol | undefined = localSymbolsByName.get(calleeName);

        // Priority 2: exported symbol defined in a directly imported file (or barrel re-export)
        if (!target) {
          const candidates = exportedByName.get(calleeName) ?? [];
          target =
            candidates.find((c) => importedFiles.has(c.file)) ??
            (candidates.length === 1 ? candidates[0] : undefined);
        }

        if (!target || target.id === caller.id) continue;

        const edge: SymbolCallEdge = {
          callerSymbolId: caller.id,
          callerName: caller.name,
          callerFile: caller.file,
          callerLine: caller.startLine,
          calleeSymbolId: target.id,
          calleeName: target.name,
          calleeFile: target.file,
          calleeLine: target.startLine,
        };

        outgoing[caller.id].push(edge);
        incoming[target.id].push(edge);
      }
    }
  }

  return { symbolsById, outgoing, incoming };
}
