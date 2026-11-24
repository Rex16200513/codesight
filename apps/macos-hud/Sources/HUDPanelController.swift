import AppKit
import SwiftUI

final class CodeSightFloatingPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

@MainActor
final class HUDPanelController: NSObject, NSApplicationDelegate {
    private var panel: CodeSightFloatingPanel!
    private var statusItem: NSStatusItem!
    private let viewModel = HUDViewModel()

    private let expandedSize = NSSize(width: 412, height: 632)
    private let collapsedSize = NSSize(width: 232, height: 42)

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupPanel()
        setupMenuBarItem()

        viewModel.onCollapseChanged = { [weak self] collapsed in
            self?.animateResize(collapsed: collapsed)
        }
        viewModel.onCloseRequested = {
            NSApp.terminate(nil)
        }
        viewModel.onWindowSettingsChanged = { [weak self] alwaysOnTop, opacity in
            guard let panel = self?.panel else { return }
            panel.level = alwaysOnTop ? .floating : .normal
            panel.alphaValue = CGFloat(max(0.75, min(1.0, opacity)))
        }

        panel.level = viewModel.config.hud.alwaysOnTop ? .floating : .normal
        panel.alphaValue = CGFloat(max(0.75, min(1.0, viewModel.config.hud.opacity)))

        showPanel()
    }

    private func setupPanel() {
        let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let origin = NSPoint(
            x: screenFrame.maxX - expandedSize.width - 24,
            y: screenFrame.maxY - expandedSize.height - 28
        )

        let p = CodeSightFloatingPanel(
            contentRect: NSRect(origin: origin, size: expandedSize),
            styleMask: [.borderless, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )

        p.level = .floating
        p.isOpaque = false
        p.backgroundColor = .clear
        p.hasShadow = true
        p.isMovableByWindowBackground = true
        p.hidesOnDeactivate = false
        p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]

        let hosting = NSHostingView(rootView: HUDRootView(vm: viewModel))
        hosting.wantsLayer = true
        hosting.layer?.backgroundColor = NSColor.clear.cgColor
        p.contentView = hosting

        self.panel = p
    }

    private func setupMenuBarItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let btn = statusItem.button {
            btn.image = NSImage(systemSymbolName: "viewfinder.circle", accessibilityDescription: "CodeSight")
            btn.action = #selector(togglePanelVisibility)
            btn.target = self
        }

        let menu = NSMenu()
        menu.addItem(withTitle: "显示 / 隐藏 CodeSight", action: #selector(togglePanelVisibility), keyEquivalent: "g")
        menu.addItem(withTitle: "展开 / 收起胶囊", action: #selector(toggleCollapseFromMenu), keyEquivalent: "m")
        menu.addItem(withTitle: "切换本地项目目录…", action: #selector(pickFolderFromMenu), keyEquivalent: "o")
        menu.addItem(withTitle: "设置…", action: #selector(openSettingsFromMenu), keyEquivalent: ",")
        menu.addItem(NSMenuItem.separator())
        menu.addItem(withTitle: "退出 CodeSight", action: #selector(quitApp), keyEquivalent: "q")
        for item in menu.items { item.target = self }
        statusItem.menu = menu
    }

    private func animateResize(collapsed: Bool) {
        let current = panel.frame
        let targetSize = collapsed ? collapsedSize : expandedSize
        let nextOrigin = NSPoint(
            x: current.maxX - targetSize.width,
            y: current.maxY - targetSize.height
        )
        let targetFrame = NSRect(origin: nextOrigin, size: targetSize)

        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.22
            ctx.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            panel.animator().setFrame(targetFrame, display: true)
        }
    }

    func showPanel() {
        panel.orderFrontRegardless()
        panel.makeKey()
    }

    @objc private func togglePanelVisibility() {
        if panel.isVisible {
            panel.orderOut(nil)
        } else {
            showPanel()
        }
    }

    @objc private func toggleCollapseFromMenu() {
        if !panel.isVisible { showPanel() }
        viewModel.toggleCollapsed()
    }

    @objc private func pickFolderFromMenu() {
        if !panel.isVisible { showPanel() }
        viewModel.pickRepositoryFolder()
    }

    @objc private func openSettingsFromMenu() {
        if !panel.isVisible { showPanel() }
        if viewModel.isCollapsed { viewModel.toggleCollapsed() }
        viewModel.showSettings = true
    }

    @objc private func quitApp() {
        NSApp.terminate(nil)
    }
}
