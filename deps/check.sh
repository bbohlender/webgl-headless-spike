#!/bin/bash
# Fails if a native file in <dir> needs anything beyond the operating system itself: on Linux only
# core system libraries and glibc symbols up to 2.28, on macOS only /usr/lib and system frameworks,
# on Windows no Visual C++ runtime DLLs (the C runtime is linked statically).
set -euo pipefail
dir="$1"
status=0
fail() { echo "::error::$1"; status=1; }
case "$(uname -s)" in
  Linux)
    for file in "$dir"/*.so "$dir"/webgl.node; do
      for lib in $(objdump -p "$file" | awk '/NEEDED/ {print $2}'); do
        [[ "$lib" =~ ^(libc|libm|libdl|libpthread|librt|libstdc\+\+|libgcc_s|ld-linux.*)\.so ]] || fail "$(basename "$file") needs $lib"
      done
      glibc=$(objdump -T "$file" | grep -o 'GLIBC_[0-9.]*' | sort -uV | tail -1)
      echo "$(basename "$file"): newest symbol $glibc"
      [ "$(printf '%s\nGLIBC_2.28\n' "$glibc" | sort -V | tail -1)" = GLIBC_2.28 ] || fail "$(basename "$file") needs $glibc (> 2.28)"
    done ;;
  Darwin)
    for file in "$dir"/*.dylib "$dir"/webgl.node; do
      id=$(otool -D "$file" | tail -n +2)  # a dylib's own install name, listed first by otool -L
      otool -L "$file" | tail -n +2 | awk '{print $1}' | grep -vxF "${id:-none}" | while read -r lib; do
        [[ "$lib" =~ ^(/usr/lib/|/System/Library/|@rpath/|@loader_path/) ]] || { echo "::error::$(basename "$file") needs $lib"; exit 1; }
      done || status=1
      echo "$(basename "$file"): $(otool -l "$file" | awk '/minos/ {print "macOS " $2; exit}')"
    done ;;
  MINGW*|MSYS*)
    for file in "$dir"/*.dll "$dir"/webgl.node; do
      deps=$(dumpbin -nologo -dependents "$file" | grep -iE '^\s+\S+\.dll\s*$' | tr -d ' \r')
      echo "$(basename "$file"): $(echo $deps)"
      if echo "$deps" | grep -qiE '^(vcruntime|msvcp|vccorlib)'; then fail "$(basename "$file") needs the Visual C++ runtime"; fi
    done ;;
esac
exit $status
