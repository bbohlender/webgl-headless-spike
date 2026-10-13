"""Generates the bindings from the Khronos headers in include/:
  gl_gen.c          one Node-API wrapper per OpenGL ES 3.0 entry point in GLES3/gl3.h
  ../src/constants.js   every GL_* enum (without the prefix) plus the WebGL-only ones

Argument mapping (JS -> C):
  GLenum/GLuint/GLbitfield/GLint/GLsizei/GLboolean   number (booleans accepted)
  GLfloat, GLintptr/GLsizeiptr                        number
  GLint64/GLuint64                                    number or BigInt
  GLsync                                              BigInt (opaque pointer)
  const GLchar *                                      string
  any other pointer                                   TypedArray / ArrayBuffer / DataView (data pointer),
                                                      number (byte offset into a bound buffer), or null
Return values: GLboolean -> boolean, const GLubyte * -> string, GLsync -> BigInt, other scalars -> number.
Entry points taking string arrays or returning raw pointers are written by hand in gl.c.
"""

import json
import re
from pathlib import Path

HERE = Path(__file__).parent
HANDWRITTEN = {"glShaderSource", "glTransformFeedbackVaryings", "glGetUniformIndices",
               "glGetVertexAttribPointerv", "glGetBufferPointerv", "glMapBufferRange"}
UNSIGNED = {"GLenum", "GLuint", "GLbitfield"}
SIGNED = {"GLint", "GLsizei"}
WEBGL_CONSTANTS = {
    "UNPACK_FLIP_Y_WEBGL": 0x9240, "UNPACK_PREMULTIPLY_ALPHA_WEBGL": 0x9241, "CONTEXT_LOST_WEBGL": 0x9242,
    "UNPACK_COLORSPACE_CONVERSION_WEBGL": 0x9243, "BROWSER_DEFAULT_WEBGL": 0x9244, "UNMASKED_VENDOR_WEBGL": 0x9245,
    "UNMASKED_RENDERER_WEBGL": 0x9246, "MAX_CLIENT_WAIT_TIMEOUT_WEBGL": 0x9247,
    "REQUESTABLE_EXTENSIONS_ANGLE": 0x93A8, "MAX_TEXTURE_MAX_ANISOTROPY_EXT": 0x84FF,
}


def prototypes():
    proto = re.compile(r"^GL_APICALL (.+?)\s*GL_APIENTRY (gl\w+) \((.*)\);$")
    for line in (HERE / "include/GLES3/gl3.h").read_text().splitlines():
        m = proto.match(line)
        if not m or m.group(2) in HANDWRITTEN:
            continue
        params = m.group(3).strip()
        args = [] if params == "void" else [re.match(r"^(.*?)(\w+)$", p.strip()).groups() for p in params.split(",")]
        yield m.group(1).strip(), m.group(2), [(t.strip(), n) for t, n in args]


def arg(ctype: str, name: str, i: int) -> str:
    if ctype.replace(" ", "") == "constGLchar*":
        return f"char *{name} = arg_string(env, argv[{i}]);"
    if "*" in ctype:
        return f"{ctype} {name} = ({ctype})arg_pointer(env, argv[{i}]);"
    if ctype in UNSIGNED:
        return f"{ctype} {name} = ({ctype})arg_uint(env, argv[{i}]);"
    if ctype in SIGNED:
        return f"{ctype} {name} = ({ctype})arg_int(env, argv[{i}]);"
    if ctype == "GLboolean":
        return f"GLboolean {name} = (GLboolean)arg_bool(env, argv[{i}]);"
    if ctype in ("GLfloat", "GLintptr", "GLsizeiptr"):
        return f"{ctype} {name} = ({ctype})arg_double(env, argv[{i}]);"
    if ctype in ("GLint64", "GLuint64"):
        return f"{ctype} {name} = ({ctype})arg_wide(env, argv[{i}]);"
    if ctype == "GLsync":
        return f"GLsync {name} = (GLsync)(uintptr_t)arg_wide(env, argv[{i}]);"
    raise ValueError(f"unhandled type {ctype}")


def ret(ctype: str) -> str:
    if ctype == "void":
        return "return NULL;"
    if ctype == "GLboolean":
        return "return ret_bool(env, r);"
    if ctype == "const GLubyte *":
        return "return ret_string(env, (const char *)r);"
    if ctype == "GLsync":
        return "return ret_bigint(env, (uint64_t)(uintptr_t)r);"
    if ctype in UNSIGNED:
        return "return ret_uint(env, r);"
    if ctype in SIGNED:
        return "return ret_int(env, r);"
    raise ValueError(f"unhandled return type {ctype}")


def wrapper(rtype: str, name: str, args: list) -> str:
    n = max(len(args), 1)
    lines = [f"static PFN{name.upper()}PROC p_{name};",
             f"static napi_value w_{name}(napi_env env, napi_callback_info info) {{",
             f"  size_t argc = {n};", f"  napi_value argv[{n}];",
             "  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);",
             f"  if (argc < {len(args)}) return throw_arity(env, \"{name}\", {len(args)});"]
    lines += [f"  {arg(t, a, i)}" for i, (t, a) in enumerate(args)]
    call = f"p_{name}({', '.join(a for _, a in args)})"
    lines.append(f"  {call};" if rtype == "void" else f"  {rtype} r = {call};")
    lines += [f"  free({a});" for t, a in args if t.replace(" ", "") == "constGLchar*"]
    lines += [f"  {ret(rtype)}", "}", ""]
    return "\n".join(lines)


def constants() -> dict:
    values = {}
    for header in ["include/GLES2/gl2.h", "include/GLES3/gl3.h"]:
        for m in re.finditer(r"^#define GL_(\w+)\s+(0x[0-9A-Fa-f]+|\d+)u?\s*$", (HERE / header).read_text(), re.M):
            if not re.match(r"(ES_VERSION|GLES|VERSION_ES)", m.group(1)):
                values.setdefault(m.group(1), int(m.group(2), 0))
    return {**values, **WEBGL_CONSTANTS}


def main():
    funcs = list(prototypes())
    out = ['// Generated by gen.py from include/GLES3/gl3.h. Do not edit.\n#include "gl.h"\n\n']
    out += [wrapper(*f) for f in funcs]
    out.append("void gl_gen_load(void *(*load)(const char *)) {")
    out += [f"  p_{name} = (PFN{name.upper()}PROC)load(\"{name}\");" for _, name, _ in funcs]
    out.append("}\n\nvoid gl_gen_export(napi_env env, napi_value exports) {")
    out += [f"  export_fn(env, exports, \"{name}\", w_{name});" for _, name, _ in funcs]
    out.append("}\n")
    (HERE / "gl_gen.c").write_text("\n".join(out))
    js = "// Generated by native/gen.py from the Khronos headers. Do not edit.\n"
    js += f"export const C = Object.freeze({json.dumps(constants(), indent=1)});\n"
    (HERE.parent / "src/constants.js").write_text(js)


main()
