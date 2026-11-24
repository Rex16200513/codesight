<p align="center">
  <img src="./assets/codesight-social.png" alt="CodeSight" width="760" />
</p>

<p align="center">
  <strong>看懂 AI 改了什么——在它改坏项目之前。</strong>
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./CHANGELOG.md">更新日志</a> ·
  <a href="./LICENSE">MIT License</a>
</p>

---

**CodeSight** 是一款本地优先（Local-first）的 GraphRAG 代码理解与排错引擎，专为 AI 编程（Cursor、Claude Code、Antigravity、Codex、ChatGPT 等）打造。

它通过真实 **TypeScript 编译器 AST + Python 解析器** 构建文件依赖图与跨文件函数调用图，以 **0 Token 成本** 拦截 AI 静默回归（`as any`、空 `catch`、偷删校验），并在 AI 对话内或 macOS 桌面悬浮窗中呈现极简可交互架构图。

## 核心特性

- **确定性本地分析**：真 AST 解析 + Python 相对/点号 import 追踪 + 混合 BM25 / 向量 / 1-hop 依赖图 RRF 检索，默认不上传任何代码。
- **极简竖排架构卡（MCP Apps）**：前后端 / 核心分层竖排、悬停 1 跳带箭头虚线、点击弹出原型线框与 `↗` 关联跳转、一键折叠成 44px 单行条、100% 中英即时切换。
- **静默回归拦截**：当 AI 通过偷删鉴权守卫、空 `catch {}` 或 `as any` “掩盖”报错时，直接标红拦截并给出安全修复方向。
- **全端统一设置**：所有偏好统一保存在 `~/.codesight/config.json`，在 Agent 对话（`codesight_settings` 工具 / 卡片右上角 `⚙`）、CLI（`codesight config`）、浏览器全图及 macOS 悬浮 HUD（`⌘,`）之间实时同步。
- **全生态适配**：支持 Stdio 与 Streamable HTTP (`/mcp`) 双传输，一条命令安装到 Antigravity、Claude Code、Claude Desktop、Cursor、VS Code、Codex 与 ChatGPT Apps；同时为 VS Code / 传统 IDE 用户提供原生 SwiftUI macOS 悬浮 HUD。

## 快速开始

```bash
git clone https://github.com/Rex16200513/codesight.git
cd codesight
npm install && npm run build
```

### 1. 一键安装到 AI Agent

```bash
node packages/cli/dist/cli.js install --target cursor
node packages/cli/dist/cli.js install --target claude-code
node packages/cli/dist/cli.js install --target antigravity
# 或安装全部: --target all
```

| MCP 工具 | 用途 |
| --- | --- |
| `codesight_map` | 生成竖排架构图 + 交互式 HTML 卡片 |
| `codesight_ask` | 中英混合 GraphRAG 检索，精准定位文件与上下文 |
| `codesight_trace` | 追踪任意函数 / 组件的跨文件调用链 |
| `codesight_diagnose` | 将报错栈或 `git diff` 投影到依赖图，计算影响范围、静默回归与修复方向 |
| `codesight_settings` | 读取/修改统一设置（中英文、虚线模式、默认折叠、静默回归拦截、可选 BYOK 模型） |

### 2. 在浏览器打开全图

```bash
# 单次静态预览
node packages/cli/dist/cli.js map --open

# 或启动本地 Sidecar（实时图谱 + 持久化设置，访问 http://127.0.0.1:4317）
npm run dev:sidecar
```

### 3. 可选：macOS 原生悬浮 HUD（适合 VS Code / 传统 IDE 用户）

```bash
npm run hud:open
```

点击顶栏滑块按钮或按 `⌘,` 打开设置栏，可调整语言、窗口置顶、透明度、静默回归拦截与可选 BYOK 模型。

## 开源协议

[MIT](./LICENSE)
