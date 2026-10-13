#!/bin/bash
# Builds the LLVM libraries lavapipe links statically into <prefix>: one target (<cpu>: x64 or arm64),
# no optional dependencies, static C runtime on Windows.
set -euo pipefail
source "$(dirname "$0")/env.sh"
prefix=$(native_path "$1")
target=$([ "$2" = arm64 ] && echo AArch64 || echo X86)
version=23.1.3
src="llvm-project-$version.src"
curl -fsSL --max-time 900 -o llvm.tar.xz "https://github.com/llvm/llvm-project/releases/download/llvmorg-$version/$src.tar.xz"
# GNU tar, also in Git Bash on Windows: Windows' own tar.exe (bsdtar 3.8.4) hangs on this archive.
# Three symlinks that LLVM's libraries do not use cannot be created on Windows, so tar exits non-zero there.
tar -xJf llvm.tar.xz "$src/llvm" "$src/cmake" "$src/third-party" "$src/libc" || test -f "$src/llvm/CMakeLists.txt"
platform=()
case "$(uname -s)" in
  Darwin) platform=(-DCMAKE_OSX_DEPLOYMENT_TARGET=12.0) ;;
  MINGW*|MSYS*) platform=(-DCMAKE_C_COMPILER=cl -DCMAKE_CXX_COMPILER=cl -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded) ;;
esac
cmake -S "$src/llvm" -B llvm-build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$prefix" \
  -DLLVM_TARGETS_TO_BUILD="$target" -DLLVM_BUILD_TOOLS=OFF -DLLVM_INCLUDE_TESTS=OFF -DLLVM_INCLUDE_EXAMPLES=OFF \
  -DLLVM_INCLUDE_BENCHMARKS=OFF -DLLVM_INCLUDE_DOCS=OFF -DLLVM_ENABLE_ZLIB=OFF -DLLVM_ENABLE_ZSTD=OFF \
  -DLLVM_ENABLE_LIBXML2=OFF -DLLVM_ENABLE_TERMINFO=OFF -DLLVM_ENABLE_LIBEDIT=OFF -DLLVM_ENABLE_RTTI=ON "${platform[@]}"
ninja -C llvm-build install-llvm-libraries install-llvm-headers install-cmake-exports llvm-config
mkdir -p "$prefix/bin"
cp llvm-build/bin/llvm-config* "$prefix/bin/"
