#!/bin/sh
# Builds the addon as <out>/webgl.node (default: native/webgl.node) against the vendored Node-API
# headers, so no Node.js installation is needed. Windows (Git Bash with MSVC on PATH) links Node's
# import library node.lib, which is downloaded once.
set -e
out=$(mkdir -p "${1:-$(dirname "$0")}" && cd "${1:-$(dirname "$0")}" && pwd)
cd "$(dirname "$0")"
$(command -v python3 || command -v python) gen.py
case "$(uname -s)" in
  Darwin)
    ${CC:-cc} -O2 -std=c11 -fPIC -Wall -Werror -DNODE_GYP_MODULE_NAME=webgl -Iinclude gl.c gl_gen.c \
      -bundle -undefined dynamic_lookup -mmacosx-version-min=12.0 -o "$out/webgl.node" ;;
  Linux)
    ${CC:-cc} -O2 -std=c11 -fPIC -Wall -Werror -DNODE_GYP_MODULE_NAME=webgl -Iinclude gl.c gl_gen.c \
      -shared -ldl -o "$out/webgl.node" ;;
  MINGW*|MSYS*)
    . ../deps/env.sh
    [ -f node.lib ] || curl -fsSL --max-time 300 -o node.lib https://nodejs.org/dist/v22.17.1/win-x64/node.lib
    cl -nologo -O2 -MT -W3 -WX -DNODE_GYP_MODULE_NAME=webgl -Iinclude gl.c gl_gen.c -LD -Fe:"$(cygpath -m "$out")/webgl.node" node.lib
    rm -f webgl.lib webgl.exp ./*.obj ;;
  *) echo "unsupported platform $(uname -s)" >&2; exit 1 ;;
esac
echo "built $out/webgl.node"
