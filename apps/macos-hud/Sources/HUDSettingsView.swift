import SwiftUI

// MARK: - Unified Settings Bar (Synced with ~/.codesight/config.json & Agent Plugins)

struct SettingsCardView: View {
    @ObservedObject var vm: HUDViewModel

    private let presets: [(String, String, String)] = [
        ("OpenAI", "https://api.openai.com/v1", "gpt-4o-mini"),
        ("DeepSeek", "https://api.deepseek.com/v1", "deepseek-chat"),
        ("Gemini", "https://openrouter.ai/api/v1", "google/gemini-2.5-flash"),
        ("Ollama", "http://127.0.0.1:11434/v1", "qwen2.5-coder:7b"),
    ]

    var body: some View {
        let en = vm.isEnglish

        // 1. General & Window Controls
        SightCard(
            icon: "gearshape",
            tint: .primary,
            title: en ? "General" : "通用与窗口",
            trailingText: "~/.codesight",
            trailingTint: .secondary
        ) {
            HStack {
                Text(en ? "Language" : "语言")
                    .font(.system(size: 12, weight: .medium))
                Spacer()
                HStack(spacing: 4) {
                    ForEach([("zh", "中文"), ("en", "EN")], id: \.0) { code, label in
                        Button {
                            vm.config.language = code
                        } label: {
                            Text(label)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(vm.config.language == code ? Color.primary : Color.secondary)
                                .padding(.horizontal, 9)
                                .padding(.vertical, 4)
                                .background(
                                    vm.config.language == code ? Color(nsColor: .controlBackgroundColor) : Color.clear,
                                    in: RoundedRectangle(cornerRadius: 6, style: .continuous)
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(2)
                .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }

            Divider().opacity(0.22)

            Toggle(en ? "Always on top" : "窗口置顶悬浮", isOn: $vm.config.hud.alwaysOnTop)
                .toggleStyle(.switch)
                .font(.system(size: 12, weight: .medium))

            HStack(spacing: 10) {
                Text(en ? "Opacity" : "透明度")
                    .font(.system(size: 12, weight: .medium))
                Slider(value: $vm.config.hud.opacity, in: 0.78...1.0)
                    .controlSize(.small)
                Text("\(Int(vm.config.hud.opacity * 100))%")
                    .font(.system(size: 10.5, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .frame(width: 34, alignment: .trailing)
            }
        }

        // 2. Analysis & Visual Graph Preferences (Shared with MCP Agent Plugins)
        SightCard(
            icon: "point.3.connected.trianglepath.dotted",
            tint: .accentColor,
            title: en ? "Analysis & Map" : "分析与视图",
            trailingText: en ? "Synced" : "与插件同步",
            trailingTint: .green
        ) {
            Toggle(en ? "Silent regression guard" : "静默回归拦截", isOn: $vm.config.silentRegressionGuard)
                .toggleStyle(.switch)
                .font(.system(size: 12, weight: .medium))

            HStack {
                Text(en ? "Flow lines" : "关联虚线")
                    .font(.system(size: 12, weight: .medium))
                Spacer()
                HStack(spacing: 4) {
                    ForEach([("always", en ? "Always" : "常显"), ("hover", en ? "Hover" : "悬停")], id: \.0) { mode, label in
                        Button {
                            vm.config.dashedLines = mode
                        } label: {
                            Text(label)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(vm.config.dashedLines == mode ? Color.primary : Color.secondary)
                                .padding(.horizontal, 9)
                                .padding(.vertical, 4)
                                .background(
                                    vm.config.dashedLines == mode ? Color(nsColor: .controlBackgroundColor) : Color.clear,
                                    in: RoundedRectangle(cornerRadius: 6, style: .continuous)
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(2)
                .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }

            HStack {
                Text(en ? "Architecture" : "架构分层")
                    .font(.system(size: 12, weight: .medium))
                Spacer()
                HStack(spacing: 4) {
                    ForEach([("auto", en ? "Auto" : "自动"), ("heuristic", en ? "Local" : "本地"), ("llm", "LLM")], id: \.0) { mode, label in
                        Button {
                            vm.config.architectureMode = mode
                        } label: {
                            Text(label)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(vm.config.architectureMode == mode ? Color.primary : Color.secondary)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(
                                    vm.config.architectureMode == mode ? Color(nsColor: .controlBackgroundColor) : Color.clear,
                                    in: RoundedRectangle(cornerRadius: 6, style: .continuous)
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(2)
                .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }

        // 3. Optional BYOK LLM + On-Demand UI Prototype Generation
        SightCard(
            icon: "sparkles",
            tint: .accentColor,
            title: en ? "Model (BYOK)" : "小模型增强（可选）",
            trailingText: vm.config.llm.enabled ? "On" : "0-Token",
            trailingTint: vm.config.llm.enabled ? .green : .secondary
        ) {
            Toggle(en ? "Enable BYOK model" : "启用小模型解读", isOn: $vm.config.llm.enabled)
                .toggleStyle(.switch)
                .font(.system(size: 12, weight: .medium))

            if vm.config.llm.enabled {
                HStack(spacing: 6) {
                    ForEach(presets, id: \.0) { preset in
                        Button {
                            vm.config.llm = BYOKLLMConfig(
                                enabled: true,
                                baseUrl: preset.1,
                                apiKey: vm.config.llm.apiKey,
                                model: preset.2
                            )
                        } label: {
                            Text(preset.0)
                                .font(.system(size: 10.5, weight: .medium))
                                .foregroundStyle(vm.config.llm.model == preset.2 ? Color.accentColor : Color.secondary)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(
                                    vm.config.llm.model == preset.2 ? Color.accentColor.opacity(0.14) : Color.primary.opacity(0.05),
                                    in: Capsule()
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }

                VStack(spacing: 7) {
                    TextField("Base URL", text: $vm.config.llm.baseUrl)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 11.5, design: .monospaced))

                    TextField("Model", text: $vm.config.llm.model)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 11.5, design: .monospaced))

                    SecureField("API Key", text: $vm.config.llm.apiKey)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 11.5, design: .monospaced))
                }

                Button {
                    Task { await vm.refreshUIPrototypesWithLLM() }
                } label: {
                    Label(
                        vm.isRefreshingPrototypes
                            ? (en ? "Generating UI Wireframes…" : "正在用 LLM 生成 UI 原型…")
                            : (en ? "Generate / Refresh UI Prototypes" : "立即用 LLM 生成 / 刷新 UI 原型"),
                        systemImage: "sparkles"
                    )
                    .font(.system(size: 11.5, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(Color.accentColor.opacity(0.14), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                    .foregroundStyle(Color.accentColor)
                }
                .buttonStyle(.plain)
                .disabled(vm.isRefreshingPrototypes)
            }
        }

        // 4. Engine & Quick Actions
        HStack(spacing: 8) {
            if vm.sidecarOnline {
                Button {
                    vm.openInteractiveBoardInBrowser()
                } label: {
                    Label(en ? "Open Board" : "浏览器打开全图", systemImage: "arrow.up.right.square")
                        .font(.system(size: 12, weight: .medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(Color(nsColor: .controlBackgroundColor).opacity(0.85), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color.primary.opacity(0.1), lineWidth: 0.75))
                        .foregroundStyle(.primary)
                }
                .buttonStyle(.plain)
            }

            Button {
                withAnimation(.snappy(duration: 0.18)) { vm.showSettings = false }
            } label: {
                Text(en ? "Done" : "完成")
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .buttonStyle(.plain)
        }
    }
}
