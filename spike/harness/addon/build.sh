#!/bin/sh
# Builds webgl.node next to this script (macOS / Linux). Windows: see build.cmd.
set -e
cd "$(dirname "$0")"
python3 gen.py
NODE_INC="$(dirname "$(dirname "$(command -v node)")")/include/node"
case "$(uname)" in
  Darwin) LINK="-bundle -undefined dynamic_lookup" ;;
  *) LINK="-shared -fPIC" ;;
esac
${CC:-cc} -O2 -std=c11 -fPIC -Wall -Wno-unused-function -DNODE_GYP_MODULE_NAME=webgl \
  -Iinclude -I"$NODE_INC" gl.c gl_gen.c $LINK -o webgl.node
echo "built $(pwd)/webgl.node"
