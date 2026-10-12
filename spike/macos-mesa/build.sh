#!/bin/sh
# Builds Mesa 26.2.4 (llvmpipe + surfaceless EGL + GLES) on macOS arm64 and runs egl_probe.
# Needs: brew install llvm bison zstd pkgconf; python venv with meson ninja mako pyyaml packaging on PATH.
set -e
cd "$(dirname "$0")"
W=${W:-$PWD/work}; mkdir -p "$W"; cd "$W"
[ -d mesa-26.2.4 ] || { curl -sLO https://archive.mesa3d.org/mesa-26.2.4.tar.xz; tar xf mesa-26.2.4.tar.xz; patch -d mesa-26.2.4 -p1 < ../mesa-darwin-egl.patch; }
export PATH=/opt/homebrew/opt/bison/bin:$PATH SDKROOT=$(xcrun --show-sdk-path) CC=/usr/bin/clang CXX=/usr/bin/clang++ OBJC=/usr/bin/clang
printf "[binaries]\nllvm-config = '/opt/homebrew/opt/llvm/bin/llvm-config'\n" > llvm.ini
meson setup mesa-26.2.4/build mesa-26.2.4 --native-file llvm.ini --prefix="$W/install" --buildtype=release -Db_ndebug=true \
  -Dgallium-drivers=llvmpipe -Dvulkan-drivers= -Dplatforms= -Dglx=disabled -Degl=enabled \
  -Dgles1=disabled -Dgles2=enabled -Dopengl=true -Dllvm=enabled -Dshared-llvm=disabled \
  -Dshader-cache=enabled -Dgbm=disabled -Dvideo-codecs= -Dtools= -Dzstd=enabled \
  -Dc_link_args=-L/opt/homebrew/lib -Dcpp_link_args=-L/opt/homebrew/lib
ninja -C mesa-26.2.4/build install
clang ../egl_probe.c -I"$W/install/include" -L"$W/install/lib" -lEGL -lGLESv2 -Wl,-rpath,"$W/install/lib" -o egl_probe
./egl_probe
