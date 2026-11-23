# GlassBox — Code Comprehension & X-Ray Engine for Vibe Coding

> **Graph-RAG helps AI read your code. GlassBox helps *you* understand what AI changed, what broke, and which direction to fix in 3 seconds.**

## Standing on Open-Source Graph-RAG (`v0.2.0`)

GlassBox uses a pluggable **`GraphProvider`** architecture so you never get locked into heavy infrastructure:

1. **Default Zero-Docker Built-in GraphRAG (`BuiltInAstGraphProvider`)**:
   - **Real TypeScript Compiler AST** (`astParser.ts`): extracts exact imports, exports, and **cross-file Function/Component Call Graphs** (zero regex false positives).
   - **Incremental SHA-256 Cache** (`.glassbox/index.json`): unchanged files re-index in ~2ms with 0 extra tokens.
   - **Hybrid GraphRAG Retrieval (RRF)**: fuses **Exact Seed Match + Okapi BM25 + Semantic Vector + Graph 1-hop Propagation** via Reciprocal Rank Fusion.
2. **Pluggable External Open-Source Graph-RAG MCP (`McpEnrichedGraphProvider`)**:
   - Connects over standard MCP JSON-RPC 2.0 (`stdio`) to external MIT Graph-RAG servers such as **`CodeGraphContext` (`cgc mcp start`)**, **`vitali87/code-graph-rag`**, **`sdsrss/code-graph-mcp`**, or **`Serena`**, translating their machine-level graphs into GlassBox's human comprehension & decision layer.

## Modular Architecture

```text
packages/core     # @glassbox/core (browser-safe schema/static analyzer)
                  # @glassbox/core/engine (AST parser, call graph, BM25+Vector RRF, GraphProvider & MCP bridge)
packages/cli      # @glassbox/cli — `map | ask | trace | diagnose [--mcp-cmd "..."] [--json]`
packages/sidecar  # @glassbox/sidecar — local HTTP/SSE live bridge + MCP Apps (ui://) adapter
packages/ui       # @glassbox/ui — host-portable floating HUD React components
apps/macos-hud    # Native Swift 6 + SwiftUI/AppKit Always-on-Top Apple Floating HUD (GlassBoxHUD.app)
apps/hud          # @glassbox/hud — standalone browser HUD preview shell
```

## Quick Start

```bash
npm install

# 0. Build & Launch the Native macOS Apple Floating HUD (Always-on-Top Glass NSPanel)
npm run hud:open

# 1. Build a 10-second human comprehension map of any local repo
npm run gb -- map /path/to/your/project

# 2. Ask in Chinese or English via BM25 + Vector + Graph RRF
npm run gb -- ask "修复提示词 prompt 是怎么拼装出来的"

# 3. Trace cross-file callers & callees of any function or React component
npm run gb -- trace buildSurgicalFixPrompt

# 4. Project an error or git diff onto the dependency & call graph
npm run gb -- diagnose --error "packages/core/src/promptBuilder.ts(55,4): TypeError: Cannot read properties of undefined (reading 'label')"
npm run gb -- diagnose --git /path/to/your/project

# Optional: Enrich with an external open-source Graph-RAG MCP server
npm run gb -- diagnose --mcp-cmd "cgc mcp start" --error "..."

# Run typecheck, unit tests & build
npm run typecheck && npm test && npm run build
```
