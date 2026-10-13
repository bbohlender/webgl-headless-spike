#!/bin/bash
# Builds Mesa's lavapipe (Vulkan on the llvmpipe CPU rasterizer) into <prefix>, with LLVM and glslang
# from <toolchain> (llvm.sh, glslang.sh). Only lavapipe: no OpenGL, EGL or window systems, zlib and
# (Linux) libdrm built from Mesa's bundled sources and linked in, static C runtime on Windows, no
# driver config files (xmlconfig) read from the host.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
source "$here/../env.sh"
prefix=$(native_path "$1")
toolchain=$(native_path "$2")
version=26.2.4
curl -fsSL --max-time 600 "https://archive.mesa3d.org/mesa-$version.tar.xz" | tar -xJ
cd "mesa-$version"
python3 "$here/patch.py"
exe=$([ -f "$toolchain/bin/glslang.exe" ] && echo .exe || true)
printf "[binaries]\nllvm-config = '%s'\nglslangValidator = '%s'\n" "$toolchain/bin/llvm-config$exe" "$toolchain/bin/glslang$exe" > tools.ini
if [ -n "${ChocolateyInstall:-}" ]; then  # Windows: winflexbison from Chocolatey, which Meson may not find on PATH
  tools=$(native_path "$(cygpath -u "$ChocolateyInstall")/lib/winflexbison3/tools")
  printf "win_flex = '%s'\nwin_bison = '%s'\n" "$tools/win_flex.exe" "$tools/win_bison.exe" >> tools.ini
fi
case "$(uname -s)" in
  # Mesa's Windows code needs its "windows" platform (Win32 Vulkan types); the shader disk cache is not
  # implemented on Windows; MSVC 14.44 crashes on u_vbuf.c at /O1 but not at release (/O2).
  MINGW*|MSYS*) platform=(-Dplatforms=windows -Db_vscrt=mt -Dshader-cache=disabled -Dmicrosoft-clc=disabled -Dgallium-d3d12-video=disabled) ;;
  # Mesa's lavapipe target does not apply its own export list (src/vulkan/vulkan.sym), so the driver
  # exports all of LLVM and the linker keeps all of LLVM; exporting only the three Vulkan ICD entry
  # points lets it drop the unused parts (Windows already exports through a .def file).
  Darwin) export PATH="$(brew --prefix bison)/bin:$PATH" MACOSX_DEPLOYMENT_TARGET=12.0
          exports="-Wl,-dead_strip -Wl,-exported_symbol,_vk_icd*"
          platform=(-Dplatforms= -Dstrip=true -Dshader-cache=enabled "-Dc_link_args=$exports" "-Dcpp_link_args=$exports") ;;
  *) exports="-Wl,--version-script=$PWD/src/vulkan/vulkan.sym"
     platform=(-Dplatforms= -Dstrip=true -Dshader-cache=enabled "-Dc_link_args=$exports" "-Dcpp_link_args=$exports") ;;
esac
meson setup build --native-file tools.ini --prefix="$prefix" --buildtype=release -Db_ndebug=true --force-fallback-for=zlib,libdrm -Dallow-fallback-for=libdrm -Dzlib:default_library=static -Dlibdrm:default_library=static \
  -Dgallium-drivers=llvmpipe -Dvulkan-drivers=swrast -Dglx=disabled -Degl=disabled -Dgles1=disabled -Dgles2=disabled \
  -Dopengl=false -Dllvm=enabled -Dshared-llvm=disabled -Dgbm=disabled -Dvideo-codecs= -Dtools= -Dzstd=disabled \
  -Dspirv-tools=disabled -Dvulkan-layers= -Dxmlconfig=disabled -Dlibunwind=disabled -Dvalgrind=disabled \
  -Dlmsensors=disabled "${platform[@]}"
ninja -C build install
