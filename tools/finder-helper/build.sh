#!/bin/bash
set -euo pipefail
source_dir="$(cd "$(dirname "$0")" && pwd)"
build_dir="$(mktemp -d /tmp/adverse-finder-build.XXXXXX)"
trap 'rm -rf "$build_dir"' EXIT
out="${1:?Informe um diretório de saída}"
mkdir -p "$out"
app="$build_dir/Adverse Finder.app"
mkdir -p "$app/Contents/MacOS"
cp "$source_dir/Info.plist" "$app/Contents/Info.plist"
for arch in arm64 x86_64; do
  xcrun swiftc -O -target "$arch-apple-macos11.0" -module-cache-path "$build_dir/cache-$arch" \
    "$source_dir/FolderTarget.swift" "$source_dir/main.swift" -o "$build_dir/$arch"
done
xcrun lipo -create "$build_dir/arm64" "$build_dir/x86_64" -output "$app/Contents/MacOS/AdverseFinder"
codesign --force --sign - --options runtime "$app"
codesign --verify --strict "$app"
ditto "$app" "$out/Adverse Finder.app"
cp "$source_dir/LEIA-ME.txt" "$out/LEIA-ME.txt"
package="$build_dir/package"
mkdir -p "$package"
ditto "$app" "$package/Adverse Finder.app"
cp "$source_dir/LEIA-ME.txt" "$package/LEIA-ME.txt"
ditto -c -k --sequesterRsrc "$package" "$out/adverse-finder-mac.zip"
shasum -a 256 "$out/adverse-finder-mac.zip"
