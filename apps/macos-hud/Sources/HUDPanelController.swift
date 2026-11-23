import AppKit
import SwiftUI

/// Custom borderless Always-on-Top NSPanel that accepts keyboard input smoothly while floating over any editor/terminal.
final class GlassBoxFloatingPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

@MainActor
final class HUDPanelController: NSObject, NSApplicationDelegate {
    private var panel: GlassBoxFloatingPanel!
    private var statusItem: NSStatusItem!
    private let viewModel = HUDViewModel()

    private let expandedSize = NSSize(width: 404, height: 616)
    private let collapsedSize = NSSize(width: 228, height: 42)

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupPanel()
        setupMenuBarItem()

        viewModel.onCollapseChanged = { [weak self] collapsed in
            self?.animateResize(collapsed: collapsed)
        }

        showPanel()
    }

    private func setupPanel() {
        let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let origin = NSPoint(
            x: screenFrame.maxX - expandedSize.width - 24,
            y: screenFrame.maxY - expandedSize.height - 28
        )

        let p = GlassBoxFloatingPanel(
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
            btn.image = NSImage(systemSymbolName: "cube.transparent", accessibilityDescription: "GlassBox HUD")
            btn.action = #selector(togglePanelVisibility)
            btn.target = self
        }

        let menu = NSMenu()
        menu.addItem(withTitle: "显示 / 隐藏悬浮 HUD", action: #selector(togglePanelVisibility), keyEquivalent: "g")
        menu.addItem(withTitle: "展开 / 收起胶囊", action: #selector(toggleCollapseFromMenu), keyEquivalent: "m")
        menu.addItem(withTitle: "切换本地项目目录…", action: #selector(pickFolderFromMenu), keyEquivalent: "o")
        menu.addItem(NSMenuItem.separator())
        menu.addItem(withTitle: "退出 GlassBox HUD", action: #selector(quitApp), keyEquivalent: "q")
        for item in menu.items { item.target = self }
        statusItem.menu = menu
    }

    private func animateResize(collapsed: Bool) {
        let current = panel.frame
        let targetSize = collapsed ? collapsedSize : expandedSize
        // Anchor top-right corner smoothly so the HUD stays pinned to the edge of your screen
        let nextOrigin = NSPoint(
            x: current.maxX - targetSize.width,
            y: current.maxY - targetSize.height
        )
        let targetFrame = NSRect(origin: nextOrigin, size: targetSize)

        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.24
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

    @objc private func quitApp() {
        NSApp.terminate(nil)
    }
}
