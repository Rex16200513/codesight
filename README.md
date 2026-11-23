# GlassBox — Code Comprehension & X-Ray Engine for Vibe Coding

> Stop blindly reading raw stack traces or huge AI diffs. Understand **what every file does**, **what actually broke (and its exact blast radius)**, and **which architectural direction to tell your AI** — at near-zero token cost.

## Core Methodology (3-Layer Cognitive Compression)

1. **Incremental Repo Map (`map`)**: SHA-256 cached file scanning + real dependency graph resolution (relative imports & monorepo workspaces) + 0-Token human-readable role cards.
2. **Hybrid Graph + Embedding Retrieval (`ask`)**: Combines exact symbol matching, bilingual local/BYOK semantic vectors, and 1-hop dependency graph propagation to compress whole-repo context by ~97% in milliseconds.
3. **Problem Projection & Decision Framing (`diagnose`)**: Projects real errors or `git diff` onto the live dependency graph, revealing direct/indirect **Blast Radius**, unaffected **Safe Zones**, silent regressions (removed guards, swallowed errors, `as any`), and graph-informed **AI Fix Directions**.

## Modular Architecture (Low Upgrade & Migration Cost)

```text
packages/core     # @glassbox/core (browser-safe schema/static analyzer)
                  # @glassbox/core/engine (Node incremental indexer, codeGraph, embeddingIndex, comprehensionEngine)
packages/cli      # @glassbox/cli — `glassbox map | ask | diagnose [--json]`
packages/sidecar  # @glassbox/sidecar — local HTTP/SSE live bridge + MCP Apps (ui://) adapter
packages/ui       # @glassbox/ui — host-portable floating HUD React components (Claude/ChatGPT aesthetic)
apps/hud          # @glassbox/hud — standalone browser HUD preview shell
```

Because every command outputs clean structured JSON (`--json`) and `@glassbox/core/engine` is decoupled from any UI shell, the exact same engine can power:
- A native macOS Always-on-Top floating HUD (Tauri / Electron / SwiftUI)
- IDE / Agent Webviews (Codex, Orca, Cursor, VS Code)
- MCP Apps (`io.modelcontextprotocol/ui`)

## Quick Start

```bash
npm install

# 1. Build a 10-second human comprehension map of any local repo
npm run gb -- map /path/to/your/project

# 2. Ask in Chinese or English where logic lives & what depends on it
npm run gb -- ask "修复提示词 prompt 是怎么拼装出来的"

# 3. Project an error or git diff onto the real dependency graph
npm run gb -- diagnose --error "packages/core/src/schema.ts(104,3): error TS2322: Type 'string' is not assignable to type 'number'."
npm run gb -- diagnose --git /path/to/your/project

# 4. Run unit tests & build all workspaces
npm run typecheck && npm test && npm run build
```
