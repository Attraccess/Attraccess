#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != Darwin ]]; then
  echo 'Attractap macOS packaging must run on a Mac.' >&2
  exit 1
fi

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
app_source="$repo_root/dist/apps/attractap-desktop/attractap-desktop.app"
output_dir="${1:-$repo_root/dist/apps/attractap-desktop/packages}"
arch="$(uname -m)"
app_name='Attractap Simulator.app'
package_name="attractap-simulator-macos-${arch}.dmg"

if [[ ! -d "$app_source" ]]; then
  echo "Build the simulator first: pnpm nx build attractap-desktop" >&2
  exit 1
fi

mkdir -p "$output_dir"
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT
ditto "$app_source" "$staging/$app_name"
cmake -DAPP_BUNDLE="$staging/$app_name" -P "$repo_root/apps/attractap/desktop/bundle-dependencies.cmake"
binary="$staging/$app_name/Contents/MacOS/attractap-desktop"
if [[ "$(lipo -archs "$binary")" != "$arch" ]]; then
  echo "The built app architecture does not match this Mac ($arch)." >&2
  exit 1
fi
minimum_os="$(otool -l "$binary" | awk '/LC_BUILD_VERSION/ { in_version=1 } in_version && /minos/ { print $2; exit }')"

while IFS= read -r -d '' dylib; do
  codesign --force --sign - "$dylib"
done < <(find "$staging/$app_name/Contents/Frameworks" -type f -name '*.dylib' -print0)
codesign --force --sign - "$staging/$app_name"
codesign --verify --deep --strict --verbose=2 "$staging/$app_name"

cat > "$staging/START HERE.txt" <<EOF
Attractap Simulator for macOS

This build requires macOS $minimum_os or newer.

1. Drag Attractap Simulator.app to Applications.
2. Open it and enter the URL of your Attraccess server.
   For the imec demo: https://detlef.apps.attraccess.org
3. In Attraccess, add the newly connected reader's resources and enroll a
   virtual NFC card. Click the simulator's NFC pad and hold Card 1 to scan.

This build has no Apple Developer ID signature or notarization. If macOS blocks
the first launch, open System Settings > Privacy & Security, scroll to Security,
click Open Anyway for Attractap Simulator, and confirm. Later launches work
normally.
EOF
ln -s /Applications "$staging/Applications"

rm -f "$output_dir/$package_name"
hdiutil create -quiet -volname 'Attractap Simulator' -srcfolder "$staging" -format UDZO "$output_dir/$package_name"
echo "$output_dir/$package_name"
