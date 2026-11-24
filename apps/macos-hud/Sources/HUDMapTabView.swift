import SwiftUI

// MARK: - Tab 1: Map (Clear Card Hierarchy, Zero Emojis)

struct MapTabView: View {
    @ObservedObject var vm: HUDViewModel

    var body: some View {
        let en = vm.isEnglish

        if let map = vm.repoMap {
            // Quick Action Row: Refresh UI Prototypes with LLM + Open Interactive Board
            HStack(spacing: 8) {
                Button {
                    Task { await vm.refreshUIPrototypesWithLLM() }
                } label: {
                    Label(
                        vm.isRefreshingPrototypes
                            ? (en ? "Generating…" : "生成中…")
                            : (en ? "AI UI Prototypes" : "LLM 生成 UI 原型"),
                        systemImage: "sparkles"
                    )
                    .font(.system(size: 11.5, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8.5)
                    .background(Color.accentColor.opacity(0.13), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                    .foregroundStyle(Color.accentColor)
                }
                .buttonStyle(.plain)
                .disabled(vm.isRefreshingPrototypes)

                if vm.sidecarOnline {
                    Button {
                        vm.openInteractiveBoardInBrowser()
                    } label: {
                        Label(en ? "Visual Board" : "交互架构图", systemImage: "arrow.up.right.square")
                            .font(.system(size: 11.5, weight: .medium))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8.5)
                            .background(Color(nsColor: .controlBackgroundColor).opacity(0.8), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 11, style: .continuous)
                                    .strokeBorder(Color.primary.opacity(0.1), lineWidth: 0.75)
                            )
                            .foregroundStyle(.primary)
                    }
                    .buttonStyle(.plain)
                }
            }

            // Card 1: Repo Overview & Core Hubs
            SightCard(
                icon: "exclamationmark.shield",
                tint: .orange,
                title: en ? "High-Impact Foundation Files" : "最关键的基础文件（改动要小心）",
                trailingText: "\(map.totalFiles) \(en ? "files" : "文件") · \(map.scanMs)ms",
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
                                Text(en ? "\(hub.downstreamReach) callers" : "被 \(hub.downstreamReach) 处用到")
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
                title: en ? "Layered Architecture Map" : "分层职责地图",
                trailingText: "\(map.totalSymbols) AST \(en ? "symbols" : "符号")"
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
            SightCard(icon: "cpu", tint: .accentColor, title: en ? "Scanning Repository" : "正在扫描仓库结构") {
                HStack(spacing: 10) {
                    ProgressView().controlSize(.small)
                    Text(en ? "Building incremental AST & dependency graph index…" : "通过 AST 与依赖图建立增量索引…")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}
