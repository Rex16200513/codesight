import AppKit
import SwiftUI

/// Native Apple NSVisualEffectView wrapper for authentic macOS frosted HUD vibrancy.
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
        .animation(.spring(response: 0.32, dampingFraction: 0.84), value: vm.isCollapsed)
    }
}

// MARK: - Collapsed Dynamic-Island Floating Pill

struct CollapsedPillView: View {
    @ObservedObject var vm: HUDViewModel

    var body: some View {
        Button {
            vm.toggleCollapsed()
        } label: {
            HStack(spacing: 10) {
                Circle()
                    .fill(Color.accentColor)
                    .frame(width: 8, height: 8)
                    .shadow(color: Color.accentColor.opacity(0.5), radius: 4)

                Text("GlassBox")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.primary)

                Text("·")
                    .foregroundStyle(.tertiary)

                Text(vm.repoDisplayName)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                Spacer(minLength: 4)

                Image(systemName: "arrow.up.left.and.arrow.down.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)
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
        .buttonStyle(.plain)
    }
}

// MARK: - Expanded Apple Floating HUD

struct ExpandedHUDView: View {
    @ObservedObject var vm: HUDViewModel

    var body: some View {
        VStack(spacing: 0) {
            // 1. Minimal Native Header (draggable area)
            HStack(spacing: 8) {
                Image(systemName: "cube.transparent")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color.accentColor)

                Text("GlassBox")
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(.primary)

                Button {
                    vm.pickRepositoryFolder()
                } label: {
                    HStack(spacing: 4) {
                        Text(vm.repoDisplayName)
                            .lineLimit(1)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 9, weight: .semibold))
                    }
                    .font(.system(size: 11.5, weight: .medium))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3.5)
                    .background(Color.primary.opacity(0.06), in: Capsule())
                }
                .buttonStyle(.plain)
                .help("切换本地代码仓库目录")

                Spacer()

                if vm.isLoading {
                    ProgressView()
                        .controlSize(.small)
                        .scaleEffect(0.75)
                }

                Button {
                    Task { await vm.loadMap() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.secondary)
                        .frame(width: 26, height: 26)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("增量刷新代码索引")

                Button {
                    vm.toggleCollapsed()
                } label: {
                    Image(systemName: "minus")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 26, height: 26)
                        .background(Color.primary.opacity(0.05), in: Circle())
                }
                .buttonStyle(.plain)
                .help("收起为悬浮胶囊")
            }
            .padding(.horizontal, 18)
            .padding(.top, 14)
            .padding(.bottom, 10)

            // 2. Apple Segmented Tab Bar
            Picker("", selection: $vm.activeTab) {
                ForEach(HUDTab.allCases) { tab in
                    Text(tab.rawValue).tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding(.horizontal, 18)
            .padding(.bottom, 12)

            Divider().opacity(0.35)

            // 3. Error Toast if any
            if let err = vm.errorMessage {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .foregroundStyle(.orange)
                    Text(err)
                        .font(.system(size: 11.5))
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                    Spacer()
                    Button { vm.errorMessage = nil } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 10))
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Color.orange.opacity(0.12))
            }

            // 4. Calm Scrollable Tab Body
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 14) {
                    switch vm.activeTab {
                    case .map:
                        MapTabView(vm: vm)
                    case .ask:
                        AskTabView(vm: vm)
                    case .diagnose:
                        DiagnoseTabView(vm: vm)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 14)
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
                        colors: [.white.opacity(0.42), .white.opacity(0.08)],
                        startPoint: .top,
                        endPoint: .bottom
                    ),
                    lineWidth: 0.9
                )
        )
    }
}

// MARK: - Tab 1: Map (10-second Human Comprehension Map)

struct MapTabView: View {
    @ObservedObject var vm: HUDViewModel

    var body: some View {
        if let map = vm.repoMap {
            // Subtle telemetry whisper
            HStack {
                Text("\(map.totalFiles) 文件 · \(map.totalSymbols) AST 符号")
                    .font(.system(size: 11.5, weight: .medium))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("缓存命中 \(map.cachedFiles)/\(map.totalFiles) · \(map.scanMs)ms")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(.tertiary)
            }

            // Core Hubs Card
            if !map.hubs.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Label("核心枢纽（动这些文件波及最大）", systemImage: "star.circle.fill")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.secondary)

                    VStack(spacing: 8) {
                        ForEach(map.hubs.prefix(4)) { hub in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(URL(fileURLWithPath: hub.path).lastPathComponent)
                                        .font(.system(size: 12.5, weight: .semibold, design: .monospaced))
                                        .foregroundStyle(.primary)
                                    Text(hub.roleLabel)
                                        .font(.system(size: 10.5, weight: .medium))
                                        .foregroundStyle(.secondary)
                                    Spacer()
                                    Text("波及 \(hub.downstreamReach)")
                                        .font(.system(size: 10.5, weight: .semibold))
                                        .foregroundStyle(.orange)
                                        .padding(.horizontal, 7)
                                        .padding(.vertical, 2)
                                        .background(Color.orange.opacity(0.12), in: Capsule())
                                }
                                Text(hub.summary)
                                    .font(.system(size: 12))
                                    .foregroundStyle(.secondary)
                                    .lineSpacing(2)
                            }
                            .padding(11)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                        }
                    }
                }
            }

            // Layered File Map (Progressive Disclosure)
            VStack(alignment: .leading, spacing: 8) {
                Text("每个文件在干什么")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .padding(.top, 2)

                ForEach(map.sections) { sec in
                    let isOpen = vm.expandedLayers.contains(sec.layer)
                    VStack(spacing: 0) {
                        Button {
                            withAnimation(.snappy(duration: 0.2)) {
                                if isOpen { vm.expandedLayers.remove(sec.layer) }
                                else { vm.expandedLayers.insert(sec.layer) }
                            }
                        } label: {
                            HStack {
                                Text(sec.layerTitle)
                                    .font(.system(size: 12.5, weight: .medium))
                                    .foregroundStyle(.primary)
                                Spacer()
                                Text("\(sec.files.count)")
                                    .font(.system(size: 11, design: .monospaced))
                                    .foregroundStyle(.tertiary)
                                Image(systemName: isOpen ? "chevron.down" : "chevron.right")
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundStyle(.tertiary)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 9)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)

                        if isOpen {
                            Divider().opacity(0.25).padding(.horizontal, 12)
                            VStack(spacing: 6) {
                                ForEach(sec.files) { f in
                                    VStack(alignment: .leading, spacing: 4) {
                                        HStack {
                                            Text(f.name)
                                                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                                            Spacer()
                                            Text("入\(f.inDegree) 出\(f.outDegree)")
                                                .font(.system(size: 10.5, design: .monospaced))
                                                .foregroundStyle(.tertiary)
                                        }
                                        Text(f.summary)
                                            .font(.system(size: 11.5))
                                            .foregroundStyle(.secondary)
                                            .lineSpacing(2)

                                        if !f.exports.isEmpty {
                                            ScrollView(.horizontal, showsIndicators: false) {
                                                HStack(spacing: 5) {
                                                    ForEach(f.exports.prefix(3), id: \.self) { sym in
                                                        Button {
                                                            Task { await vm.runTrace(symbol: sym) }
                                                        } label: {
                                                            Text("\(sym) ›")
                                                                .font(.system(size: 10.5, design: .monospaced))
                                                                .foregroundStyle(Color.accentColor)
                                                                .padding(.horizontal, 7)
                                                                .padding(.vertical, 2)
                                                                .background(Color.accentColor.opacity(0.1), in: Capsule())
                                                        }
                                                        .buttonStyle(.plain)
                                                    }
                                                }
                                            }
                                            .padding(.top, 2)
                                        }
                                    }
                                    .padding(10)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(Color.primary.opacity(0.03), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                                }
                            }
                            .padding(8)
                        }
                    }
                    .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
            }
        } else {
            VStack(spacing: 10) {
                ProgressView()
                Text("正在用 AST + GraphRAG 建立项目地图…")
                    .font(.system(size: 12.5))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 48)
        }
    }
}

// MARK: - Tab 2: Ask & Trace (Spotlight-style GraphRAG Search)

struct AskTabView: View {
    @ObservedObject var vm: HUDViewModel

    private let quickQueries = [
        "修复提示词 prompt 在哪",
        "核心数据协议",
        "trace buildSurgicalFixPrompt",
    ]

    var body: some View {
        // Spotlight Search Field
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.secondary)
            TextField("用中文问代码在哪，或 trace 函数名…", text: $vm.askQuery)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .onSubmit {
                    Task { await vm.submitAsk() }
                }
            if !vm.askQuery.isEmpty {
                Button {
                    vm.askQuery = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.tertiary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))

        // Quick Suggestion Chips
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
                            .background(Color.primary.opacity(0.05), in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }

        // Symbol Trace View
        if let trace = vm.traceResult {
            HStack {
                Label("AST 跨文件调用图", systemImage: "point.3.connected.trianglepath.dotted")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(trace.traceMs)ms")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(.tertiary)
            }

            if trace.matches.isEmpty {
                Text("未在 AST 符号表中找到「\(trace.querySymbol)」")
                    .font(.system(size: 12.5))
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 16)
            } else {
                ForEach(trace.matches) { m in
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text(m.symbol.name)
                                .font(.system(size: 13.5, weight: .semibold, design: .monospaced))
                            Spacer()
                            Text("\(URL(fileURLWithPath: m.symbol.file).lastPathComponent):\(m.symbol.startLine)")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(.secondary)
                        }

                        Text(m.symbol.signature)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(.secondary)
                            .padding(8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 8))

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
                                    Text("← \(edge.callerName)  (\(URL(fileURLWithPath: edge.callerFile).lastPathComponent):\(edge.callerLine))")
                                        .font(.system(size: 11.5, design: .monospaced))
                                        .foregroundStyle(.primary)
                                }
                            }
                        }

                        if !m.callsOut.isEmpty {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("内部调用 (\(m.callsOut.count))")
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundStyle(.secondary)
                                ForEach(m.callsOut.prefix(5)) { edge in
                                    Text("→ \(edge.calleeName)  (\(URL(fileURLWithPath: edge.calleeFile).lastPathComponent):\(edge.calleeLine))")
                                        .font(.system(size: 11.5, design: .monospaced))
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                }
            }
        }

        // Hybrid RRF Ask Results
        if let res = vm.askResult {
            HStack {
                Text("最相关文件")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("省 \(String(format: "%.1f", res.savedPercent))% Token · \(res.retrievalMs)ms")
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(.green)
            }

            ForEach(res.hits.prefix(4)) { hit in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(hit.file.name)
                            .font(.system(size: 13, weight: .semibold, design: .monospaced))
                        Text(hit.file.roleLabel)
                            .font(.system(size: 10.5))
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text("RRF \(String(format: "%.1f", hit.totalScore))")
                            .font(.system(size: 10.5, design: .monospaced))
                            .foregroundStyle(.tertiary)
                    }
                    Text(hit.file.summary)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .lineSpacing(2)

                    if !hit.matchReasons.isEmpty {
                        Text(hit.matchReasons.prefix(2).joined(separator: " · "))
                            .font(.system(size: 10.5))
                            .foregroundStyle(.tertiary)
                    }

                    if !hit.file.exports.isEmpty {
                        HStack(spacing: 5) {
                            ForEach(hit.file.exports.prefix(2), id: \.self) { sym in
                                Button {
                                    Task { await vm.runTrace(symbol: sym) }
                                } label: {
                                    Text("追踪 \(sym) ›")
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
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
    }
}

// MARK: - Tab 3: Diagnose (Blast Radius Projection & Decision)

struct DiagnoseTabView: View {
    @ObservedObject var vm: HUDViewModel

    var body: some View {
        // Two ultra-clean Apple quick actions
        HStack(spacing: 8) {
            Button {
                Task { await vm.diagnoseFromClipboard() }
            } label: {
                Label("读取剪贴板报错", systemImage: "doc.on.clipboard")
                    .font(.system(size: 12, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(Color.accentColor.opacity(0.14), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                    .foregroundStyle(Color.accentColor)
            }
            .buttonStyle(.plain)

            Button {
                Task { await vm.runDiagnoseGitDiff() }
            } label: {
                Label("扫描 Git Diff", systemImage: "arrow.triangle.branch")
                    .font(.system(size: 12, weight: .medium))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                    .foregroundStyle(.primary)
            }
            .buttonStyle(.plain)
        }

        // Progressive disclosure manual error input
        Button {
            withAnimation(.snappy(duration: 0.2)) { vm.showManualInput.toggle() }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: vm.showManualInput ? "chevron.down" : "chevron.right")
                    .font(.system(size: 9.5, weight: .semibold))
                Text(vm.showManualInput ? "收起手动输入" : "或手动粘贴报错文本")
                    .font(.system(size: 11.5))
            }
            .foregroundStyle(.secondary)
        }
        .buttonStyle(.plain)

        if vm.showManualInput {
            VStack(spacing: 8) {
                TextEditor(text: $vm.diagnoseInput)
                    .font(.system(size: 11.5, design: .monospaced))
                    .frame(height: 84)
                    .scrollContentBackground(.hidden)
                    .padding(8)
                    .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 10))

                Button {
                    Task { await vm.runDiagnose() }
                } label: {
                    Text("投影分析")
                        .font(.system(size: 12, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 7)
                        .background(Color.primary.opacity(0.1), in: RoundedRectangle(cornerRadius: 9))
                }
                .buttonStyle(.plain)
            }
        }

        if let report = vm.diagnoseReport {
            // 1. Plain Diagnosis Card
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("一句话看懂")
                        .font(.system(size: 11.5, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("省 \(String(format: "%.1f", report.tokenEconomy.savedPercent))% · \(report.tokenEconomy.retrievalMs)ms")
                        .font(.system(size: 10.5, design: .monospaced))
                        .foregroundStyle(.green)
                }

                Text(report.plainDiagnosis)
                    .font(.system(size: 13.5, weight: .medium))
                    .foregroundStyle(.primary)
                    .lineSpacing(4)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 15, style: .continuous))

            // 2. Blast Radius & Safe Zone Card
            if let br = report.blastRadius {
                VStack(alignment: .leading, spacing: 9) {
                    HStack {
                        let (label, color): (String, Color) =
                            br.riskLevel == "high-hub" ? ("高风险核心枢纽", .red) :
                            br.riskLevel == "medium-bridge" ? ("中游桥接节点", .orange) :
                            ("低风险末梢节点", .green)

                        Text(label)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(color)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(color.opacity(0.13), in: Capsule())

                        Spacer()

                        Label("其余 \(br.safeZoneCount) 文件安全免读", systemImage: "checkmark.shield.fill")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(.green)
                    }

                    if !br.directImpact.isEmpty {
                        Text("直接波及：\(br.directImpact.map { $0.name }.joined(separator: "、"))")
                            .font(.system(size: 11.5))
                            .foregroundStyle(.secondary)
                    }
                    if !report.symbolCallers.isEmpty {
                        Text("函数调用方：\(report.symbolCallers.prefix(3).map { "\($0.callerName) (\($0.callerFile.split(separator: "/").last ?? ""))" }.joined(separator: " · "))")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(13)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }

            // 3. Silent Regressions (if any)
            if !report.silentRegressions.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Label("捕获 AI 静默风险 (\(report.silentRegressions.count))", systemImage: "exclamationmark.triangle.fill")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.orange)
                    ForEach(report.silentRegressions) { reg in
                        Text("• \(reg.title)：\(reg.riskImpact)")
                            .font(.system(size: 11.5))
                            .foregroundStyle(.secondary)
                            .lineSpacing(2)
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
            }

            // 4. Decision Fork & 1-Click Copy CTA
            if !report.directions.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("让 AI 怎么改？（选一个方向）")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.secondary)

                    ForEach(report.directions) { dir in
                        let isSelected = vm.selectedDirectionId == dir.id
                        Button {
                            vm.selectedDirectionId = dir.id
                        } label: {
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: isSelected ? "largecircle.fill.circle" : "circle")
                                    .font(.system(size: 14))
                                    .foregroundStyle(isSelected ? Color.accentColor : Color.secondary)
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
                            }
                            .padding(11)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(
                                isSelected ? Color.accentColor.opacity(0.11) : Color.primary.opacity(0.04),
                                in: RoundedRectangle(cornerRadius: 13, style: .continuous)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 13, style: .continuous)
                                    .strokeBorder(isSelected ? Color.accentColor.opacity(0.45) : .clear, lineWidth: 1)
                            )
                        }
                        .buttonStyle(.plain)
                    }

                    Button {
                        vm.copySelectedPrompt()
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: vm.copiedToast ? "checkmark" : "doc.on.doc")
                            Text(vm.copiedToast ? "已复制精确修复指令" : "复制精确修复指令给 Agent")
                        }
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(vm.copiedToast ? Color.green : Color.accentColor, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 4)
                }
            }
        } else {
            VStack(spacing: 8) {
                Image(systemName: "sparkles.rectangle.stack")
                    .font(.system(size: 26))
                    .foregroundStyle(.tertiary)
                Text("复制任意终端报错，点击上方「读取剪贴板报错」")
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(.secondary)
                Text("GlassBox 会立刻把错误投影到真实依赖图上，告诉你波及哪些文件、怎么让 AI 改最稳。")
                    .font(.system(size: 11.5))
                    .foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(3)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 32)
            .padding(.horizontal, 12)
        }
    }
}
