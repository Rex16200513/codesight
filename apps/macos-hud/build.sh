#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$SCRIPT_DIR/dist"
APP_BUNDLE="$BUILD_DIR/GlassBoxHUD.app"
NODE_BIN="$(which node)"

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"

echo "[GlassBox macOS HUD] Compiling native Swift 6 arm64 binary..."
swiftc \
  -O \
  -framework AppKit \
  -framework SwiftUI \
  -framework Foundation \
  -o "$APP_BUNDLE/Contents/MacOS/GlassBoxHUD" \
  "$SCRIPT_DIR/Sources/Models.swift" \
  "$SCRIPT_DIR/Sources/EngineBridge.swift" \
  "$SCRIPT_DIR/Sources/HUDViewModel.swift" \
  "$SCRIPT_DIR/Sources/HUDViews.swift" \
  "$SCRIPT_DIR/Sources/HUDPanelController.swift" \
  "$SCRIPT_DIR/Sources/main.swift"

cat > "$APP_BUNDLE/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>GlassBox HUD</string>
  <key>CFBundleDisplayName</key>
  <string>GlassBox HUD</string>
  <key>CFBundleIdentifier</key>
  <string>dev.glassbox.macos.hud</string>
  <key>CFBundleVersion</key>
  <string>0.3.0</string>
  <key>CFBundleShortVersionString</key>
  <string>0.3.0</string>
  <key>CFBundleExecutable</key>
  <string>GlassBoxHUD</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>GlassBoxNodePath</key>
  <string>${NODE_BIN}</string>
  <key>GlassBoxEngineRoot</key>
  <string>${REPO_ROOT}</string>
</dict>
</plist>
EOF

codesign --force --deep --sign - "$APP_BUNDLE" >/dev/null 2>&1 || true

echo "✓ Built native macOS Floating HUD: $APP_BUNDLE"
echo "  Binary size: $(du -sh "$APP_BUNDLE/Contents/MacOS/GlassBoxHUD" | awk '{print $1}')"
