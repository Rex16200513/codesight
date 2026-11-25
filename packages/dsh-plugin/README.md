# @codesight/dsh-plugin — DeepSeek Harness (`dsh`) Plugin

Native **Cordis** plugin bundle & MCP overlay for [DeepSeek Harness (`deepseek-ai/deepseek-harness`)](https://github.com/deepseek-ai/deepseek-harness).

## Option A: Native Cordis Bundle (Recommended — In-Process + Web UI Slot)

```bash
# From the CodeSight repo root (after `npm run build`)
dsh plugin --profile default add ./packages/dsh-plugin
dsh --profile default web
```

This registers:
- **Host plugin (`@codesight/dsh-plugin`)**: mounts `codesight_map`, `codesight_ask`, `codesight_trace`, `codesight_diagnose`, and `codesight_settings` directly into `ctx.tools` with zero extra child process overhead.
- **Web UI slot (`@codesight/dsh-plugin/client`)**: registers `tool.call.toolview` interactive visual cards and bridges `ui/message` + `tools/call` directly back to the active DeepSeek session.

## Option B: Zero-Install MCP Overlay (`--patch`)

```bash
dsh web --patch ./packages/dsh-plugin/codesight.mcp.cordis.yml
```

Or run CodeSight's unified installer:
```bash
npm run cs -- install --target deepseek-harness
```
