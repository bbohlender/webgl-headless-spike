#!/bin/bash
# Builds Mesa's lavapipe (Vulkan on the llvmpipe CPU rasterizer) into <prefix>, with LLVM and glslang
# from <toolchain> (llvm.sh, glslang.sh). Only lavapipe: no OpenGL, EGL or window systems, zlib linked
# in, static C runtime on Windows, no driver config files (xmlconfig) read from the host.
set -euo pipefail
source "$(dirname "$0")/env.sh"
prefix=$(native_path "$1")
toolchain=$(native_path "$2")
version=26.2.4
curl -fsSL --max-time 600 "https://archive.mesa3d.org/mesa-$version.tar.xz" | tar -xJ
cd "mesa-$version"
exe=$([ -f "$toolchain/bin/glslang.exe" ] && echo .exe || true)
printf "[binaries]\nllvm-config = '%s'\nglslangValidator = '%s'\n" "$toolchain/bin/llvm-config$exe" "$toolchain/bin/glslang$exe" > tools.ini
case "$(uname -s)" in
  # Mesa's Windows code needs its "windows" platform (Win32 Vulkan types); the shader disk cache is not
  # implemented on Windows; MSVC 14.44 crashes on u_vbuf.c at /O1 but not at release (/O2).
  MINGW*|MSYS*) platform=(-Dplatforms=windows -Db_vscrt=mt -Dshader-cache=disabled -Dmicrosoft-clc=disabled -Dgallium-d3d12-video=disabled) ;;
  Darwin) export PATH="$(brew --prefix bison)/bin:$PATH" MACOSX_DEPLOYMENT_TARGET=12.0
          platform=(-Dplatforms= -Dstrip=true -Dshader-cache=enabled) ;;
  *) platform=(-Dplatforms= -Dstrip=true -Dshader-cache=enabled) ;;
esac
meson setup build --native-file tools.ini --prefix="$prefix" --buildtype=release -Db_ndebug=true --force-fallback-for=zlib -Dzlib:default_library=static \
  -Dgallium-drivers=llvmpipe -Dvulkan-drivers=swrast -Dglx=disabled -Degl=disabled -Dgles1=disabled -Dgles2=disabled \
  -Dopengl=false -Dllvm=enabled -Dshared-llvm=disabled -Dgbm=disabled -Dvideo-codecs= -Dtools= -Dzstd=disabled \
  -Dspirv-tools=disabled -Dvulkan-layers= -Dxmlconfig=disabled -Dlibunwind=disabled -Dvalgrind=disabled \
  -Dlmsensors=disabled "${platform[@]}"
ninja -C build install
