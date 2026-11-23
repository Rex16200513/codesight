# CodeSight — GraphRAG Code Comprehension & Apple Floating HUD for Vibe Coding

> **Graph-RAG helps AI read your code. CodeSight helps *you* understand what every file does, what actually broke, and which architectural direction to fix in seconds.**

## Core Capabilities (`v0.4.0`)

1. **Native macOS Apple Floating HUD (`CodeSight.app`, ~1.3 MB)**:
   - Pure Swift 6 + SwiftUI + AppKit (`NSPanel` `.floating` + `NSVisualEffectView.Material.hudWindow`), unified Apple SF Symbols (zero emojis), explicit card boundaries (`SightCard`), collapsible floating capsule, and explicit Close button.
   - Connects first to the local Sidecar (`http://127.0.0.1:4317`) for ~5ms warm responses and zero repeated macOS TCC file permission prompts, with isolated CLI fallback (`GIT_CEILING_DIRECTORIES` + `GIT_CONFIG_GLOBAL=/dev/null`).
2. **Built-in Zero-Docker GraphRAG + Pluggable Open-Source Graph-RAG MCP**:
   - **TypeScript Compiler AST** (`astParser.ts`) + Cross-file Function/Component Call Graph.
   - **Hybrid Retrieval (RRF)**: Exact Match + Okapi BM25 + Semantic Vector + 1-hop Graph Propagation.
   - **External MCP Graph-RAG Bridge**: Plug in `CodeGraphContext` (`cgc mcp start`), `vitali87/code-graph-rag`, `sdsrss/code-graph-mcp`, or `Serena` via `--mcp-cmd`.
3. **Optional BYOK Lightweight LLM Synthesis**:
   - Works 100% locally at 0 Token cost out of the box; optionally bind OpenAI mini / DeepSeek / Gemini Flash / local Ollama so only ~600 pruned tokens are sent for deep plain-Chinese code explanations.

## Quick Start

```bash
npm install

# 1. Start local Sidecar (recommended: ~5ms warm GraphRAG API + zero macOS TCC popups)
npm run dev:sidecar

# 2. Build & launch native macOS Floating HUD (CodeSight.app)
npm run hud:open

# 3. Or run CLI directly on any local project
npm run cs -- map /path/to/project
npm run cs -- ask "修复提示词 prompt 是怎么拼装出来的"
npm run cs -- trace buildSurgicalFixPrompt
npm run cs -- diagnose --git /path/to/project
```
