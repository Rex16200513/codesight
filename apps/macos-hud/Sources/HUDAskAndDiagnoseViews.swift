import SwiftUI

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
