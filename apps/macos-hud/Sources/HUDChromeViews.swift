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

func symbolForLayer(_ layer: String) -> String {
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

                if vm.isLoading || vm.isRefreshingPrototypes {
                    ProgressView()
                        .controlSize(.small)
                        .scaleEffect(0.72)
                }

                // Generate / Refresh UI Prototypes with LLM
                Button {
                    Task { await vm.refreshUIPrototypesWithLLM() }
                } label: {
                    Image(systemName: "sparkles")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(vm.isRefreshingPrototypes ? Color.accentColor : Color.secondary)
                        .frame(width: 26, height: 26)
                        .background(
                            (vm.isRefreshingPrototypes ? Color.accentColor.opacity(0.14) : Color.primary.opacity(0.05)),
                            in: Circle()
                        )
                }
                .buttonStyle(.plain)
                .disabled(vm.isRefreshingPrototypes)
                .help(vm.isEnglish ? "Generate / Refresh UI Prototypes (LLM)" : "用 LLM 生成 / 刷新 UI 原型示意图")

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

            // 3. Inline Status / Error Banners
            if let status = vm.prototypeStatusMessage {
                HStack(spacing: 8) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 11.5))
                        .foregroundStyle(Color.accentColor)
                    Text(status)
                        .font(.system(size: 11.5))
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                    Spacer()
                    Button { vm.prototypeStatusMessage = nil } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 9.5, weight: .semibold))
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Color.accentColor.opacity(0.11))
            }

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
