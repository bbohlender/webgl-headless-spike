#!/bin/bash
# Builds glslang (the GLSL compiler Mesa uses at build time for lavapipe's internal shaders) into <prefix>.
set -euo pipefail
source "$(dirname "$0")/env.sh"
prefix=$(native_path "$1")
git clone -q --depth 1 --branch 16.0.0 https://github.com/KhronosGroup/glslang.git glslang-src
cmake -S glslang-src -B glslang-build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$prefix" \
  -DENABLE_OPT=OFF -DGLSLANG_TESTS=OFF -DENABLE_HLSL=OFF -DBUILD_SHARED_LIBS=OFF
ninja -C glslang-build install
