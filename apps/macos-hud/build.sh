#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$SCRIPT_DIR/dist"
APP_BUNDLE="$BUILD_DIR/CodeSight.app"
NODE_BIN="$(which node)"

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"

LOGO_PNG="$REPO_ROOT/assets/codesight-logo.png"
if [ -f "$LOGO_PNG" ] && command -v sips >/dev/null 2>&1 && command -v iconutil >/dev/null 2>&1; then
  ICONSET_DIR="$BUILD_DIR/AppIcon.iconset"
  rm -rf "$ICONSET_DIR"
  mkdir -p "$ICONSET_DIR"
  for sz in 16 32 128 256 512; do
    sips -z "$sz" "$sz" "$LOGO_PNG" --out "$ICONSET_DIR/icon_${sz}x${sz}.png" >/dev/null 2>&1 || true
    dbl=$((sz * 2))
    sips -z "$dbl" "$dbl" "$LOGO_PNG" --out "$ICONSET_DIR/icon_${sz}x${sz}@2x.png" >/dev/null 2>&1 || true
  done
  iconutil -c icns "$ICONSET_DIR" -o "$APP_BUNDLE/Contents/Resources/AppIcon.icns" >/dev/null 2>&1 || true
  rm -rf "$ICONSET_DIR"
fi

echo "[CodeSight macOS HUD] Compiling native Swift 6 arm64 binary..."
swiftc \
  -O \
  -framework AppKit \
  -framework SwiftUI \
  -framework Foundation \
  -o "$APP_BUNDLE/Contents/MacOS/CodeSight" \
  "$SCRIPT_DIR/Sources/Models.swift" \
  "$SCRIPT_DIR/Sources/EngineBridge.swift" \
  "$SCRIPT_DIR/Sources/HUDViewModel.swift" \
  "$SCRIPT_DIR/Sources/HUDChromeViews.swift" \
  "$SCRIPT_DIR/Sources/HUDSettingsView.swift" \
  "$SCRIPT_DIR/Sources/HUDMapTabView.swift" \
  "$SCRIPT_DIR/Sources/HUDAskAndDiagnoseViews.swift" \
  "$SCRIPT_DIR/Sources/HUDPanelController.swift" \
  "$SCRIPT_DIR/Sources/main.swift"

cat > "$APP_BUNDLE/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>CodeSight</string>
  <key>CFBundleDisplayName</key>
  <string>CodeSight</string>
  <key>CFBundleIdentifier</key>
  <string>dev.codesight.macos.hud</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleVersion</key>
  <string>1.0.4</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.4</string>
  <key>CFBundleExecutable</key>
  <string>CodeSight</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>CodeSightNodePath</key>
  <string>${NODE_BIN}</string>
  <key>CodeSightEngineRoot</key>
  <string>${REPO_ROOT}</string>
</dict>
</plist>
EOF

codesign --force --deep --sign - "$APP_BUNDLE" >/dev/null 2>&1 || true

echo "✓ Built native macOS Floating HUD: $APP_BUNDLE"
echo "  Binary size: $(du -sh "$APP_BUNDLE/Contents/MacOS/CodeSight" | awk '{print $1}')"
