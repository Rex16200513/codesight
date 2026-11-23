# CodeSight — Universal GraphRAG Plugin (MCP Apps) & Apple Floating HUD for Vibe Coding

> **Graph-RAG helps AI read your code. CodeSight plugs into Antigravity, Claude Code, Cursor, VS Code, Codex, and ChatGPT to help *you* see what every file does, what broke, and which fix direction to choose in seconds.**

## Works Inside All Mainstream AI Agent Products (`v0.5.0`)

| Platform | Transport & Integration | One-Command Setup |
| :--- | :--- | :--- |
| **Antigravity** | Native Plugin (`plugin.json` + `mcp_config.json` + `SKILL.md` + `rules/AGENTS.md`) + `ui://` MCP App cards | `npm run cs -- install --target antigravity` (add `--global` for all projects) |
| **Claude Code** | Local Stdio MCP (`.mcp.json`) + `.claude-plugin` manifest | `npm run cs -- install --target claude-code` |
| **Claude Desktop** | Local Stdio MCP + inline `ui://` MCP App cards | `npm run cs -- install --target claude-desktop` |
| **Cursor** | Local Stdio MCP (`.cursor/mcp.json`) | `npm run cs -- install --target cursor` |
| **VS Code / Copilot** | Local Stdio MCP (`.vscode/mcp.json`) | `npm run cs -- install --target vscode` |
| **OpenAI Codex CLI** | Local Stdio MCP (`~/.codex/config.toml`) | `npm run cs -- install --target codex` |
| **ChatGPT Apps** | Streamable HTTP MCP (`/mcp`) + interactive `ui://` cards | `npm run mcp:http` (exposes `http://127.0.0.1:4318/mcp`) |
| **macOS Desktop HUD** | Optional 1.5MB native Swift 6 floating glass HUD (`CodeSight.app`) | `npm run dev:sidecar` + `npm run hud:open` |

> Preview every config safely before writing anything:
> ```bash
> npm run cs -- install --target all --dry-run
> ```

## MCP Tools & Interactive Cards Exposed

- `codesight_map` — Incremental AST repo comprehension map + core hub blast radius + `ui://codesight/map/latest`
- `codesight_ask` — Hybrid GraphRAG retrieval (Exact + Okapi BM25 + Bilingual Vector + 1-hop Graph RRF, ~97% token savings)
- `codesight_trace` — Cross-file AST function/component call graph + `ui://codesight/trace/latest`
- `codesight_diagnose` — Error & `git diff` projection onto the live dependency graph: Plain Diagnosis, Blast Radius, Safe Zones, Silent Regression detection (removed guards, empty `catch`, `as any`), and Fix Direction cards (`ui://codesight/diagnose/latest`)

## Modular Architecture

```text
packages/core        # Browser-safe schema & static analyzer + Node GraphRAG engine (AST, Call Graph, RRF, MCP GraphProvider)
packages/mcp-server  # Dual-transport MCP + MCP Apps server (Stdio + Streamable HTTP /mcp + Apple-styled ui:// HTML cards)
packages/cli         # CLI (`map | ask | trace | diagnose | install`)
packages/sidecar     # Warm local HTTP/SSE bridge (zero macOS TCC popups)
packages/ui          # Host-portable React HUD components
plugins/codesight    # Native Antigravity & Claude Code plugin bundle (plugin.json, SKILL.md, rules/AGENTS.md)
apps/macos-hud       # Native macOS Swift 6 / SwiftUI Always-on-Top Apple Floating HUD (CodeSight.app)
```

## Quick Verification

```bash
npm install
npm run typecheck && npm test && npm run build
```
