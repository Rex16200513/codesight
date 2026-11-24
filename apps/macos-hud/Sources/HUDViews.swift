import AppKit
import SwiftUI

// MARK: - Apple Native Vibrancy & Unified SF Symbol Helpers

struct AppleGlassBackground: NSViewRepresentable {
    var material: NSVisualEffectView.Material = .hudWindow
    var blendingMode: NSVisualEffectView.BlendingMode = .behindWindow

    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = material
        view.blendingMode = blendingMode
        view.state = .active
        view.isEmphasized = true
        return view
    }

    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {
        nsView.material = material
        nsView.blendingMode = blendingMode
    }
}

private func symbolForLayer(_ layer: String) -> String {
    switch layer {
    case "core-logic": return "cpu"
    case "server-api": return "network"
    case "ui-component": return "rectangle.on.rectangle"
    case "entrypoint": return "arrow.right.circle"
    case "style-asset": return "paintbrush"
    case "test": return "checkmark.seal"
    case "config": return "gearshape"
    default: return "shippingbox"
    }
}

/// Crisp Apple-crafted Card Container with distinct surface separation,
/// unified SF Symbol squircle icon well, explicit identity title, and subtle elevation.
struct SightCard<Content: View>: View {
    let icon: String
    let tint: Color
    let title: String
    var trailingText: String? = nil
    var trailingTint: Color = .secondary
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 9) {
                ZStack {
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(tint.opacity(0.14))
                        .frame(width: 24, height: 24)
                    Image(systemName: icon)
                        .font(.system(size: 11.5, weight: .semibold))
                        .foregroundStyle(tint)
                }

                Text(title)
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(.primary)

                Spacer()

                if let trailing = trailingText {
                    Text(trailing)
                        .font(.system(size: 10.5, weight: .semibold, design: .monospaced))
                        .foregroundStyle(trailingTint)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2.5)
                        .background(trailingTint.opacity(0.11), in: Capsule())
                }
            }

            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor).opacity(0.68))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.75)
        )
        .shadow(color: .black.opacity(0.05), radius: 8, y: 2)
    }
}

/// Brand CodeSight optical code-bracket mark `< • >`
struct CodeSightLogoMark: View {
    var size: CGFloat = 18

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.27, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [Color(red: 0.13, green: 0.13, blue: 0.16), Color(red: 0.05, green: 0.05, blue: 0.07)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
            RoundedRectangle(cornerRadius: size * 0.27, style: .continuous)
                .strokeBorder(Color.white.opacity(0.18), lineWidth: 0.6)

            HStack(spacing: size * 0.07) {
                Image(systemName: "chevron.left")
                    .font(.system(size: size * 0.34, weight: .bold))
                    .foregroundStyle(.white)
                Circle()
                    .fill(Color(red: 0.16, green: 0.59, blue: 1.0))
                    .frame(width: size * 0.18, height: size * 0.18)
                    .overlay(Circle().stroke(Color.white, lineWidth: size * 0.06))
                Image(systemName: "chevron.right")
                    .font(.system(size: size * 0.34, weight: .bold))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Root Switcher

struct HUDRootView: View {
    @ObservedObject var vm: HUDViewModel

    var body: some View {
        Group {
            if vm.isCollapsed {
                CollapsedPillView(vm: vm)
            } else {
                ExpandedHUDView(vm: vm)
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.86), value: vm.isCollapsed)
    }
}

// MARK: - Collapsed Floating Capsule

struct CollapsedPillView: View {
    @ObservedObject var vm: HUDViewModel

    var body: some View {
        HStack(spacing: 8) {
            Button {
                vm.toggleCollapsed()
            } label: {
                HStack(spacing: 8) {
                    CodeSightLogoMark(size: 18)

                    Text("CodeSight")
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(.primary)

                    Text(vm.repoDisplayName)
                        .font(.system(size: 11.5, weight: .medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Spacer(minLength: 4)

            Button {
                vm.requestClose()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 9.5, weight: .bold))
                    .foregroundStyle(.secondary)
                    .frame(width: 20, height: 20)
                    .background(Color.primary.opacity(0.07), in: Circle())
            }
            .buttonStyle(.plain)
            .help("关闭 CodeSight")
        }
        .padding(.horizontal, 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            AppleGlassBackground(material: .hudWindow)
                .clipShape(Capsule(style: .continuous))
        )
        .overlay(
            Capsule(style: .continuous)
                .strokeBorder(
                    LinearGradient(
                        colors: [.white.opacity(0.45), .white.opacity(0.1)],
                        startPoint: .top,
                        endPoint: .bottom
                    ),
                    lineWidth: 0.8
                )
        )
    }
}

// MARK: - Expanded Apple Floating HUD

struct ExpandedHUDView: View {
    @ObservedObject var vm: HUDViewModel

    var body: some View {
        VStack(spacing: 0) {
            // 1. Minimal Native Header (Draggable)
            HStack(spacing: 8) {
                CodeSightLogoMark(size: 20)

                Text("CodeSight")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.primary)

                Button {
                    vm.pickRepositoryFolder()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "folder")
                            .font(.system(size: 10, weight: .medium))
                        Text(vm.repoDisplayName)
                            .lineLimit(1)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 8.5, weight: .semibold))
                    }
                    .font(.system(size: 11.5, weight: .medium))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.primary.opacity(0.06), in: Capsule())
                }
                .buttonStyle(.plain)
                .help("切换本地代码仓库")

                Spacer()

                if vm.isLoading {
                    ProgressView()
                        .controlSize(.small)
                        .scaleEffect(0.72)
                }

                // Settings / BYOK LLM toggle
                Button {
                    withAnimation(.snappy(duration: 0.18)) {
                        vm.showSettings.toggle()
                    }
                } label: {
                    ZStack(alignment: .topTrailing) {
                        Image(systemName: "slider.horizontal.3")
                            .font(.system(size: 11.5, weight: .medium))
                            .foregroundStyle(vm.showSettings ? Color.accentColor : Color.secondary)
                            .frame(width: 26, height: 26)
                            .background(
                                (vm.showSettings ? Color.accentColor.opacity(0.14) : Color.primary.opacity(0.05)),
                                in: Circle()
                            )
                        if vm.llmConfig.enabled {
                            Circle()
                                .fill(Color.green)
                                .frame(width: 6, height: 6)
                                .offset(x: -2, y: 2)
                        }
                    }
                }
                .buttonStyle(.plain)
                .help("模型与连接设置")

                // Collapse to floating capsule
                Button {
                    vm.toggleCollapsed()
                } label: {
                    Image(systemName: "minus")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 26, height: 26)
                        .background(Color.primary.opacity(0.05), in: Circle())
                }
                .buttonStyle(.plain)
                .help("收起为悬浮胶囊")

                // Explicit Close Button
                Button {
                    vm.requestClose()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 10.5, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 26, height: 26)
                        .background(Color.primary.opacity(0.05), in: Circle())
                }
                .buttonStyle(.plain)
                .help("关闭 CodeSight")
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 12)

            // 2. Custom Apple Pill Tab Bar (hidden when Settings sheet is open)
            if !vm.showSettings {
                HStack(spacing: 4) {
                    ForEach(HUDTab.allCases) { tab in
                        let isActive = vm.activeTab == tab
                        Button {
                            withAnimation(.snappy(duration: 0.2)) {
                                vm.activeTab = tab
                            }
                        } label: {
                            HStack(spacing: 5) {
                                Image(systemName: tab.symbol)
                                    .font(.system(size: 11.5, weight: .medium))
                                Text(tab.title(english: vm.isEnglish))
                                    .font(.system(size: 12, weight: isActive ? .semibold : .medium))
                            }
                            .foregroundStyle(isActive ? Color.primary : Color.secondary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6.5)
                            .background(
                                Group {
                                    if isActive {
                                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                                            .fill(Color(nsColor: .controlBackgroundColor).opacity(0.92))
                                            .shadow(color: .black.opacity(0.08), radius: 3, y: 1)
                                    }
                                }
                            )
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(3)
                .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 11.5, style: .continuous))
                .padding(.horizontal, 16)
                .padding(.bottom, 12)
            }

            Divider().opacity(0.28)

            // 3. Inline Error Banner
            if let err = vm.errorMessage {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 11.5))
                        .foregroundStyle(.orange)
                    Text(err)
                        .font(.system(size: 11.5))
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                    Spacer()
                    Button { vm.errorMessage = nil } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 9.5, weight: .semibold))
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 9)
                .background(Color.orange.opacity(0.11))
            }

            // 4. Calm Scrollable Content Area
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 12) {
                    if vm.showSettings {
                        SettingsCardView(vm: vm)
                    } else {
                        switch vm.activeTab {
                        case .map:
                            MapTabView(vm: vm)
                        case .ask:
                            AskTabView(vm: vm)
                        case .diagnose:
                            DiagnoseTabView(vm: vm)
                        }
                    }
                }
                .padding(16)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            AppleGlassBackground(material: .hudWindow)
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(
                    LinearGradient(
                        colors: [.white.opacity(0.45), .white.opacity(0.08)],
                        startPoint: .top,
                        endPoint: .bottom
                    ),
                    lineWidth: 0.9
                )
        )
    }
}

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

        // 3. Optional BYOK LLM
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

// MARK: - Tab 1: Map (Clear Card Hierarchy, Zero Emojis)

struct MapTabView: View {
    @ObservedObject var vm: HUDViewModel

    var body: some View {
        if let map = vm.repoMap {
            // Card 1: Repo Overview & Core Hubs
            SightCard(
                icon: "exclamationmark.shield",
                tint: .orange,
                title: "最关键的基础文件（改动要小心）",
                trailingText: "\(map.totalFiles) 文件 · \(map.scanMs)ms",
                trailingTint: .secondary
            ) {
                VStack(spacing: 0) {
                    ForEach(Array(map.hubs.prefix(4).enumerated()), id: \.element.id) { idx, hub in
                        if idx > 0 {
                            Divider().opacity(0.28).padding(.vertical, 9)
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 6) {
                                Text(URL(fileURLWithPath: hub.path).lastPathComponent)
                                    .font(.system(size: 12.5, weight: .semibold, design: .monospaced))
                                    .foregroundStyle(.primary)
                                Text(hub.roleLabel)
                                    .font(.system(size: 11))
                                    .foregroundStyle(.secondary)
                                Spacer()
                                Text("被 \(hub.downstreamReach) 处用到")
                                    .font(.system(size: 10.5, weight: .semibold))
                                    .foregroundStyle(.orange)
                            }
                            Text(hub.summary)
                                .font(.system(size: 11.5))
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                                .lineSpacing(2)
                        }
                    }
                }
            }

            // Card 2: Layered Architecture Directory (Clean Inset List)
            SightCard(
                icon: "square.stack.3d.up",
                tint: .accentColor,
                title: "分层职责地图",
                trailingText: "\(map.totalSymbols) AST 符号"
            ) {
                VStack(spacing: 0) {
                    ForEach(Array(map.sections.enumerated()), id: \.element.id) { sIdx, sec in
                        let isOpen = vm.expandedLayers.contains(sec.layer)
                        if sIdx > 0 {
                            Divider().opacity(0.25)
                        }

                        VStack(spacing: 0) {
                            Button {
                                withAnimation(.snappy(duration: 0.2)) {
                                    if isOpen { vm.expandedLayers.remove(sec.layer) }
                                    else { vm.expandedLayers.insert(sec.layer) }
                                }
                            } label: {
                                HStack(spacing: 9) {
                                    Image(systemName: symbolForLayer(sec.layer))
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundStyle(.secondary)
                                        .frame(width: 18)

                                    Text(sec.layerTitle)
                                        .font(.system(size: 12.5, weight: .medium))
                                        .foregroundStyle(.primary)

                                    Spacer()

                                    Text("\(sec.files.count)")
                                        .font(.system(size: 11, design: .monospaced))
                                        .foregroundStyle(.tertiary)

                                    Image(systemName: isOpen ? "chevron.down" : "chevron.right")
                                        .font(.system(size: 9.5, weight: .semibold))
                                        .foregroundStyle(.tertiary)
                                }
                                .padding(.vertical, 9)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)

                            if isOpen {
                                VStack(alignment: .leading, spacing: 10) {
                                    ForEach(sec.files) { f in
                                        VStack(alignment: .leading, spacing: 3) {
                                            HStack {
                                                Text(f.name)
                                                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                                                    .foregroundStyle(.primary)
                                                Spacer()
                                                Text("入 \(f.inDegree) · 出 \(f.outDegree)")
                                                    .font(.system(size: 10, design: .monospaced))
                                                    .foregroundStyle(.tertiary)
                                            }
                                            Text(f.summary)
                                                .font(.system(size: 11.5))
                                                .foregroundStyle(.secondary)
                                                .lineLimit(2)
                                                .lineSpacing(2)

                                            if !f.exports.isEmpty {
                                                HStack(spacing: 5) {
                                                    ForEach(f.exports.prefix(2), id: \.self) { sym in
                                                        Button {
                                                            Task { await vm.runTrace(symbol: sym) }
                                                        } label: {
                                                            HStack(spacing: 3) {
                                                                Image(systemName: "arrow.turn.down.right")
                                                                    .font(.system(size: 9))
                                                                Text(sym)
                                                            }
                                                            .font(.system(size: 10.5, design: .monospaced))
                                                            .foregroundStyle(Color.accentColor)
                                                            .padding(.horizontal, 7)
                                                            .padding(.vertical, 2.5)
                                                            .background(Color.accentColor.opacity(0.1), in: Capsule())
                                                        }
                                                        .buttonStyle(.plain)
                                                    }
                                                }
                                                .padding(.top, 2)
                                            }
                                        }
                                        .padding(.leading, 27)
                                    }
                                }
                                .padding(.bottom, 10)
                            }
                        }
                    }
                }
            }
        } else {
            SightCard(icon: "cpu", tint: .accentColor, title: "正在扫描仓库结构") {
                HStack(spacing: 10) {
                    ProgressView().controlSize(.small)
                    Text("通过 AST 与依赖图建立增量索引…")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

// MARK: - Tab 2: Ask & Trace

struct AskTabView: View {
    @ObservedObject var vm: HUDViewModel

    private let quickQueries = [
        "修复提示词 prompt 在哪",
        "核心数据协议",
        "trace buildSurgicalFixPrompt",
    ]

    var body: some View {
        // Spotlight Search Bar
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.secondary)
            TextField("问代码逻辑在哪，或 trace 函数名…", text: $vm.askQuery)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .onSubmit { Task { await vm.submitAsk() } }
            if !vm.askQuery.isEmpty {
                Button { vm.askQuery = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.tertiary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor).opacity(0.75))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.1), lineWidth: 0.75)
        )

        // Quick Prompts
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(quickQueries, id: \.self) { q in
                    Button {
                        Task { await vm.submitAsk(q) }
                    } label: {
                        Text(q)
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 4.5)
                            .background(Color.primary.opacity(0.06), in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }

        // Trace Card
        if let trace = vm.traceResult {
            SightCard(
                icon: "point.3.connected.trianglepath.dotted",
                tint: .purple,
                title: "函数调用图追踪",
                trailingText: "\(trace.traceMs)ms"
            ) {
                if trace.matches.isEmpty {
                    Text("未在 AST 符号表中找到「\(trace.querySymbol)」")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(trace.matches.enumerated()), id: \.element.id) { idx, m in
                            if idx > 0 { Divider().opacity(0.28).padding(.vertical, 10) }
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Text(m.symbol.name)
                                        .font(.system(size: 13, weight: .semibold, design: .monospaced))
                                    Spacer()
                                    Text("\(URL(fileURLWithPath: m.symbol.file).lastPathComponent):\(m.symbol.startLine)")
                                        .font(.system(size: 11, design: .monospaced))
                                        .foregroundStyle(.secondary)
                                }

                                VStack(alignment: .leading, spacing: 4) {
                                    Text("被谁调用 (\(m.calledBy.count))")
                                        .font(.system(size: 11, weight: .semibold))
                                        .foregroundStyle(.secondary)
                                    if m.calledBy.isEmpty {
                                        Text("无跨文件调用方")
                                            .font(.system(size: 11.5))
                                            .foregroundStyle(.tertiary)
                                    } else {
                                        ForEach(m.calledBy) { edge in
                                            HStack(spacing: 6) {
                                                Image(systemName: "arrow.left")
                                                    .font(.system(size: 9.5))
                                                    .foregroundStyle(.purple)
                                                Text("\(edge.callerName)  (\(URL(fileURLWithPath: edge.callerFile).lastPathComponent):\(edge.callerLine))")
                                                    .font(.system(size: 11.5, design: .monospaced))
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Ask Results: Optional AI Synthesis Card + Evidence Card
        if let res = vm.askResult {
            if let answer = res.aiAnswer {
                SightCard(
                    icon: "sparkles",
                    tint: .green,
                    title: "AI 深度解读",
                    trailingText: res.llmModel ?? "BYOK",
                    trailingTint: .green
                ) {
                    Text(answer)
                        .font(.system(size: 13))
                        .foregroundStyle(.primary)
                        .lineSpacing(4)
                }
            }

            SightCard(
                icon: "doc.text.magnifyingglass",
                tint: .accentColor,
                title: "定位到的核心文件",
                trailingText: "省 \(String(format: "%.1f", res.savedPercent))% · \(res.retrievalMs)ms",
                trailingTint: .green
            ) {
                VStack(spacing: 0) {
                    ForEach(Array(res.hits.prefix(4).enumerated()), id: \.element.id) { idx, hit in
                        if idx > 0 { Divider().opacity(0.26).padding(.vertical, 10) }
                        VStack(alignment: .leading, spacing: 5) {
                            HStack {
                                Text(hit.file.name)
                                    .font(.system(size: 12.5, weight: .semibold, design: .monospaced))
                                Text(hit.file.roleLabel)
                                    .font(.system(size: 11))
                                    .foregroundStyle(.secondary)
                                Spacer()
                                Text("RRF \(String(format: "%.1f", hit.totalScore))")
                                    .font(.system(size: 10.5, design: .monospaced))
                                    .foregroundStyle(.tertiary)
                            }
                            Text(hit.file.summary)
                                .font(.system(size: 11.5))
                                .foregroundStyle(.secondary)
                                .lineSpacing(2)

                            if !hit.file.exports.isEmpty {
                                HStack(spacing: 5) {
                                    ForEach(hit.file.exports.prefix(2), id: \.self) { sym in
                                        Button {
                                            Task { await vm.runTrace(symbol: sym) }
                                        } label: {
                                            HStack(spacing: 3) {
                                                Image(systemName: "point.3.connected.trianglepath.dotted")
                                                    .font(.system(size: 9))
                                                Text(sym)
                                            }
                                            .font(.system(size: 10.5, design: .monospaced))
                                            .foregroundStyle(Color.accentColor)
                                            .padding(.horizontal, 7)
                                            .padding(.vertical, 2.5)
                                            .background(Color.accentColor.opacity(0.1), in: Capsule())
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                                .padding(.top, 2)
                            }
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Tab 3: Diagnose (3 Explicit Cards: Diagnosis / Blast Radius / Decision)

struct DiagnoseTabView: View {
    @ObservedObject var vm: HUDViewModel

    var body: some View {
        // Quick Action Bar
        HStack(spacing: 8) {
            Button {
                Task { await vm.diagnoseFromClipboard() }
            } label: {
                Label("读取剪贴板报错", systemImage: "doc.on.clipboard")
                    .font(.system(size: 12, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9.5)
                    .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                    .foregroundStyle(.white)
            }
            .buttonStyle(.plain)

            Button {
                Task { await vm.runDiagnoseGitDiff() }
            } label: {
                Label("扫描 Git Diff", systemImage: "arrow.triangle.branch")
                    .font(.system(size: 12, weight: .medium))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9.5)
                    .background(Color(nsColor: .controlBackgroundColor).opacity(0.8), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 11, style: .continuous)
                            .strokeBorder(Color.primary.opacity(0.1), lineWidth: 0.75)
                    )
                    .foregroundStyle(.primary)
            }
            .buttonStyle(.plain)
        }

        // Progressive disclosure manual input
        Button {
            withAnimation(.snappy(duration: 0.2)) { vm.showManualInput.toggle() }
        } label: {
            HStack(spacing: 5) {
                Image(systemName: vm.showManualInput ? "chevron.down" : "chevron.right")
                    .font(.system(size: 9.5, weight: .semibold))
                Text(vm.showManualInput ? "收起手动输入框" : "手动粘贴报错文本")
                    .font(.system(size: 11.5))
            }
            .foregroundStyle(.secondary)
        }
        .buttonStyle(.plain)

        if vm.showManualInput {
            SightCard(icon: "text.alignleft", tint: .secondary, title: "粘贴终端报错") {
                TextEditor(text: $vm.diagnoseInput)
                    .font(.system(size: 11.5, design: .monospaced))
                    .frame(height: 80)
                    .scrollContentBackground(.hidden)

                Button {
                    Task { await vm.runDiagnose() }
                } label: {
                    Text("开始投影分析")
                        .font(.system(size: 12, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 7.5)
                        .background(Color.accentColor.opacity(0.14), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                        .foregroundStyle(Color.accentColor)
                }
                .buttonStyle(.plain)
            }
        }

        if let report = vm.diagnoseReport {
            // Card 1: Plain-Language Diagnosis
            SightCard(
                icon: "stethoscope",
                tint: .red,
                title: "问题诊断",
                trailingText: "省 \(String(format: "%.1f", report.tokenEconomy.savedPercent))% · \(report.tokenEconomy.retrievalMs)ms",
                trailingTint: .green
            ) {
                Text(report.aiSummary ?? report.plainDiagnosis)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.primary)
                    .lineSpacing(4)
            }

            // Card 2: Impact Scope & Safe Files
            if let br = report.blastRadius {
                let (riskLabel, riskColor): (String, Color) =
                    br.riskLevel == "high-hub" ? ("改动影响较大", .red) :
                    br.riskLevel == "medium-bridge" ? ("影响少量文件", .orange) :
                    ("只影响这 1 个文件", .green)

                SightCard(
                    icon: "circle.dashed.inset.filled",
                    tint: riskColor,
                    title: "改这里会影响谁",
                    trailingText: riskLabel,
                    trailingTint: riskColor
                ) {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 6) {
                            Image(systemName: "checkmark.shield.fill")
                                .font(.system(size: 12))
                                .foregroundStyle(.green)
                            Text("另外 \(br.safeZoneCount) 个文件完全不受影响，不用管")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(.primary)
                        }

                        if !br.directImpact.isEmpty {
                            Divider().opacity(0.25)
                            Text("直接用到它：\(br.directImpact.map { $0.name }.joined(separator: "、"))")
                                .font(.system(size: 11.5))
                                .foregroundStyle(.secondary)
                        }

                        if !report.symbolCallers.isEmpty {
                            Text("具体调用位置：\(report.symbolCallers.prefix(3).map { "\($0.callerName) (\($0.callerFile.split(separator: "/").last ?? ""))" }.joined(separator: " · "))")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

            // Card 3 (Conditional): Silent Regressions
            if !report.silentRegressions.isEmpty {
                SightCard(
                    icon: "exclamationmark.triangle.fill",
                    tint: .orange,
                    title: "AI 静默退化预警",
                    trailingText: "\(report.silentRegressions.count) 处",
                    trailingTint: .orange
                ) {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(report.silentRegressions) { reg in
                            Text("• \(reg.title)：\(reg.riskImpact)")
                                .font(.system(size: 11.5))
                                .foregroundStyle(.secondary)
                                .lineSpacing(2)
                        }
                    }
                }
            }

            // Card 4: Decision Fork + Copy Prompt
            if !report.directions.isEmpty {
                SightCard(
                    icon: "arrow.triangle.branch",
                    tint: .accentColor,
                    title: "修复方向决策",
                    trailingText: "选 1 个方向"
                ) {
                    VStack(spacing: 0) {
                        ForEach(Array(report.directions.enumerated()), id: \.element.id) { idx, dir in
                            let isSelected = vm.selectedDirectionId == dir.id
                            if idx > 0 { Divider().opacity(0.25).padding(.vertical, 8) }

                            Button {
                                vm.selectedDirectionId = dir.id
                            } label: {
                                HStack(alignment: .top, spacing: 10) {
                                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                                        .font(.system(size: 15))
                                        .foregroundStyle(isSelected ? Color.accentColor : Color.secondary.opacity(0.6))
                                        .padding(.top, 1)

                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(dir.label)
                                            .font(.system(size: 12.5, weight: .semibold))
                                            .foregroundStyle(.primary)
                                            .multilineTextAlignment(.leading)
                                        Text(dir.strategy)
                                            .font(.system(size: 11.5))
                                            .foregroundStyle(.secondary)
                                            .multilineTextAlignment(.leading)
                                            .lineSpacing(2)
                                    }
                                    Spacer(minLength: 0)
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    Button {
                        vm.copySelectedPrompt()
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: vm.copiedToast ? "checkmark" : "doc.on.doc")
                            Text(vm.copiedToast ? "已复制精确修复指令" : "复制精确修复指令给 Agent")
                        }
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(vm.copiedToast ? Color.green : Color.accentColor, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 4)
                }
            }
        } else {
            SightCard(icon: "waveform.path.ecg", tint: .secondary, title: "准备就绪") {
                Text("复制任意终端报错并点击「读取剪贴板报错」，或点击「扫描 Git Diff」。CodeSight 会将问题投影到真实依赖图上，给出爆炸半径与修复方向。")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineSpacing(3)
            }
        }
    }
}
