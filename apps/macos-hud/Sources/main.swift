import AppKit

MainActor.assumeIsolated {
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)
    let controller = HUDPanelController()
    app.delegate = controller
    app.run()
}
