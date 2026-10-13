// Node-API addon: loads ANGLE, creates one headless WebGL2 context rendered by the bundled lavapipe
// Vulkan driver, and exposes the OpenGL ES 3.0 entry points (generated into gl_gen.c) plus the few
// that need hand-written marshalling.
#define _POSIX_C_SOURCE 200809L  // setenv under -std=c11
#include "gl.h"

#include <stdio.h>
#include <string.h>
#define EGL_EGL_PROTOTYPES 0
#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <EGL/eglext_angle.h>

#ifdef _WIN32
#include <windows.h>
static void *open_lib(const char *path) { return (void *)LoadLibraryA(path); }
static void *lib_sym(void *lib, const char *name) { return (void *)GetProcAddress((HMODULE)lib, name); }
static void set_env(const char *name, const char *value) { _putenv_s(name, value); }
#define SEP "\\"
#define LIB_EGL "libEGL.dll"
#define LIB_GLES "libGLESv2.dll"
#else
#include <dlfcn.h>
static void *open_lib(const char *path) { return dlopen(path, RTLD_NOW | RTLD_LOCAL); }
static void *lib_sym(void *lib, const char *name) { return dlsym(lib, name); }
static void set_env(const char *name, const char *value) { setenv(name, value, 1); }
#define SEP "/"
#ifdef __APPLE__
#define LIB_EGL "libEGL.dylib"
#define LIB_GLES "libGLESv2.dylib"
#else
#define LIB_EGL "libEGL.so"
#define LIB_GLES "libGLESv2.so"
#endif
#endif

// ---- argument / return helpers ----

static napi_valuetype type_of(napi_env env, napi_value v) {
  napi_valuetype t;
  napi_typeof(env, v, &t);
  return t;
}

void *arg_pointer(napi_env env, napi_value v) {
  napi_valuetype t = type_of(env, v);
  if (t == napi_null || t == napi_undefined) return NULL;
  if (t == napi_number) {
    double d;
    napi_get_value_double(env, v, &d);
    return (void *)(intptr_t)d;
  }
  bool is;
  void *data = NULL;
  size_t length, offset;
  napi_value buffer;
  napi_is_typedarray(env, v, &is);
  if (is) {
    napi_typedarray_type type;
    napi_get_typedarray_info(env, v, &type, &length, &data, &buffer, &offset);
    return data;
  }
  napi_is_dataview(env, v, &is);
  if (is) {
    napi_get_dataview_info(env, v, &length, &data, &buffer, &offset);
    return data;
  }
  napi_is_arraybuffer(env, v, &is);
  if (is) {
    napi_get_arraybuffer_info(env, v, &data, &length);
    return data;
  }
  napi_throw_type_error(env, NULL, "expected TypedArray, ArrayBuffer, DataView, number or null");
  return NULL;
}

char *arg_string(napi_env env, napi_value v) {
  size_t length = 0;
  napi_get_value_string_utf8(env, v, NULL, 0, &length);
  char *s = malloc(length + 1);
  napi_get_value_string_utf8(env, v, s, length + 1, &length);
  return s;
}

static double number_of(napi_env env, napi_value v) {
  napi_valuetype t = type_of(env, v);
  if (t == napi_boolean) {
    bool b;
    napi_get_value_bool(env, v, &b);
    return b;
  }
  if (t != napi_number) return 0;
  double d;
  napi_get_value_double(env, v, &d);
  return d;
}

uint32_t arg_uint(napi_env env, napi_value v) { return (uint32_t)(int64_t)number_of(env, v); }
int32_t arg_int(napi_env env, napi_value v) { return (int32_t)(int64_t)number_of(env, v); }
bool arg_bool(napi_env env, napi_value v) { return number_of(env, v) != 0; }
double arg_double(napi_env env, napi_value v) { return number_of(env, v); }

int64_t arg_wide(napi_env env, napi_value v) {
  if (type_of(env, v) != napi_bigint) return (int64_t)number_of(env, v);
  uint64_t u;
  bool lossless;
  napi_get_value_bigint_uint64(env, v, &u, &lossless);
  return (int64_t)u;
}

napi_value ret_bool(napi_env env, bool v) {
  napi_value r;
  napi_get_boolean(env, v, &r);
  return r;
}
napi_value ret_uint(napi_env env, uint32_t v) {
  napi_value r;
  napi_create_uint32(env, v, &r);
  return r;
}
napi_value ret_int(napi_env env, int32_t v) {
  napi_value r;
  napi_create_int32(env, v, &r);
  return r;
}
napi_value ret_string(napi_env env, const char *s) {
  napi_value r;
  if (!s) {
    napi_get_null(env, &r);
    return r;
  }
  napi_create_string_utf8(env, s, NAPI_AUTO_LENGTH, &r);
  return r;
}
napi_value ret_bigint(napi_env env, uint64_t v) {
  napi_value r;
  napi_create_bigint_uint64(env, v, &r);
  return r;
}
napi_value throw_arity(napi_env env, const char *name, int expected) {
  char message[160];
  snprintf(message, sizeof message, "%s expects %d arguments", name, expected);
  napi_throw_type_error(env, NULL, message);
  return NULL;
}
void export_fn(napi_env env, napi_value exports, const char *name, napi_callback cb) {
  napi_value fn;
  napi_create_function(env, name, NAPI_AUTO_LENGTH, cb, NULL, &fn);
  napi_set_named_property(env, exports, name, fn);
}

static void args(napi_env env, napi_callback_info info, size_t count, napi_value *argv) {
  size_t argc = count;
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
}

// ---- EGL and the context ----

static void *egl_lib;
static PFNEGLGETPROCADDRESSPROC p_eglGetProcAddress;
static PFNEGLGETPLATFORMDISPLAYEXTPROC p_eglGetPlatformDisplayEXT;
static PFNEGLINITIALIZEPROC p_eglInitialize;
static PFNEGLBINDAPIPROC p_eglBindAPI;
static PFNEGLCHOOSECONFIGPROC p_eglChooseConfig;
static PFNEGLCREATECONTEXTPROC p_eglCreateContext;
static PFNEGLDESTROYCONTEXTPROC p_eglDestroyContext;
static PFNEGLCREATEPBUFFERSURFACEPROC p_eglCreatePbufferSurface;
static PFNEGLDESTROYSURFACEPROC p_eglDestroySurface;
static PFNEGLMAKECURRENTPROC p_eglMakeCurrent;
static PFNEGLGETERRORPROC p_eglGetError;

// GL entry points used by the hand-written functions below.
typedef void(GL_APIENTRY *PFNGLREQUESTEXTENSIONANGLEPROC)(const GLchar *name);
static PFNGLREQUESTEXTENSIONANGLEPROC p_glRequestExtensionANGLE;
static PFNGLSHADERSOURCEPROC p_glShaderSource;
static PFNGLTRANSFORMFEEDBACKVARYINGSPROC p_glTransformFeedbackVaryings;
static PFNGLGETUNIFORMINDICESPROC p_glGetUniformIndices;
static PFNGLMAPBUFFERRANGEPROC p_glMapBufferRange;
static PFNGLUNMAPBUFFERPROC p_glUnmapBuffer;
static PFNGLBINDBUFFERPROC p_glBindBuffer;
static PFNGLGENBUFFERSPROC p_glGenBuffers;
static PFNGLBUFFERDATAPROC p_glBufferData;
static PFNGLBINDFRAMEBUFFERPROC p_glBindFramebuffer;
static PFNGLREADPIXELSPROC p_glReadPixels;
static PFNGLGETINTEGERVPROC p_glGetIntegerv;
static PFNGLPIXELSTOREIPROC p_glPixelStorei;

static EGLDisplay display = EGL_NO_DISPLAY;
static EGLConfig config;
static EGLContext context = EGL_NO_CONTEXT;
static EGLSurface surface = EGL_NO_SURFACE;
static GLsizei surface_width, surface_height;
static GLuint pack_buffer;  // reused by readFrame, sized to the surface
static GLsizeiptr pack_size;

static void *load_gl(const char *name) { return (void *)p_eglGetProcAddress(name); }

static napi_value throw_egl(napi_env env, const char *what) {
  char message[160];
  snprintf(message, sizeof message, "%s failed (EGL error 0x%x)", what, p_eglGetError());
  napi_throw_error(env, NULL, message);
  return NULL;
}

static bool get_prop(napi_env env, napi_value object, const char *key, napi_value *out) {
  bool has = false;
  napi_has_named_property(env, object, key, &has);
  if (!has) return false;
  napi_get_named_property(env, object, key, out);
  napi_valuetype t = type_of(env, *out);
  return t != napi_undefined && t != napi_null;
}

static bool prop_bool(napi_env env, napi_value object, const char *key, bool fallback) {
  napi_value v;
  return get_prop(env, object, key, &v) ? arg_bool(env, v) : fallback;
}

// load(dir): loads ANGLE from dir and makes the Vulkan loader use only the lavapipe driver in dir.
static napi_value w_load(napi_env env, napi_callback_info info) {
  napi_value argv[1];
  args(env, info, 1, argv);
  if (egl_lib) return NULL;
  char *dir = arg_string(env, argv[0]);
#ifdef _WIN32
  // The Vulkan loader resolves the manifest's relative library path only from a backslash path.
  for (char *c = dir; *c; c++)
    if (*c == '/') *c = '\\';
#endif
  char path[4096];
  // Only the bundled driver and no layers, whatever Vulkan drivers or implicit layers (overlays,
  // capture tools) the host has installed. Must be set before ANGLE loads the Vulkan loader.
  snprintf(path, sizeof path, "%s" SEP "lvp_icd.json", dir);
  set_env("VK_DRIVER_FILES", path);
  set_env("VK_ICD_FILENAMES", path);
  set_env("VK_LOADER_LAYERS_DISABLE", "~all~");
#ifdef _WIN32
  // Load the bundled Vulkan loader first so ANGLE's LoadLibrary("vulkan-1.dll") reuses it instead of
  // a copy from System32.
  snprintf(path, sizeof path, "%s" SEP "vulkan-1.dll", dir);
  open_lib(path);
#endif
  snprintf(path, sizeof path, "%s" SEP LIB_GLES, dir);
  open_lib(path);  // so libEGL finds it regardless of the library search path
  snprintf(path, sizeof path, "%s" SEP LIB_EGL, dir);
  free(dir);
  egl_lib = open_lib(path);
  if (!egl_lib) {
    char message[4200];
    snprintf(message, sizeof message, "cannot load %s", path);
    napi_throw_error(env, NULL, message);
    return NULL;
  }
  p_eglGetProcAddress = (PFNEGLGETPROCADDRESSPROC)lib_sym(egl_lib, "eglGetProcAddress");
#define LOAD(type, name) p_##name = (type)p_eglGetProcAddress(#name)
  LOAD(PFNEGLGETPLATFORMDISPLAYEXTPROC, eglGetPlatformDisplayEXT);
  LOAD(PFNEGLINITIALIZEPROC, eglInitialize);
  LOAD(PFNEGLBINDAPIPROC, eglBindAPI);
  LOAD(PFNEGLCHOOSECONFIGPROC, eglChooseConfig);
  LOAD(PFNEGLCREATECONTEXTPROC, eglCreateContext);
  LOAD(PFNEGLDESTROYCONTEXTPROC, eglDestroyContext);
  LOAD(PFNEGLCREATEPBUFFERSURFACEPROC, eglCreatePbufferSurface);
  LOAD(PFNEGLDESTROYSURFACEPROC, eglDestroySurface);
  LOAD(PFNEGLMAKECURRENTPROC, eglMakeCurrent);
  LOAD(PFNEGLGETERRORPROC, eglGetError);
  LOAD(PFNGLREQUESTEXTENSIONANGLEPROC, glRequestExtensionANGLE);
  LOAD(PFNGLSHADERSOURCEPROC, glShaderSource);
  LOAD(PFNGLTRANSFORMFEEDBACKVARYINGSPROC, glTransformFeedbackVaryings);
  LOAD(PFNGLGETUNIFORMINDICESPROC, glGetUniformIndices);
  LOAD(PFNGLMAPBUFFERRANGEPROC, glMapBufferRange);
  LOAD(PFNGLUNMAPBUFFERPROC, glUnmapBuffer);
  LOAD(PFNGLBINDBUFFERPROC, glBindBuffer);
  LOAD(PFNGLGENBUFFERSPROC, glGenBuffers);
  LOAD(PFNGLBUFFERDATAPROC, glBufferData);
  LOAD(PFNGLBINDFRAMEBUFFERPROC, glBindFramebuffer);
  LOAD(PFNGLREADPIXELSPROC, glReadPixels);
  LOAD(PFNGLGETINTEGERVPROC, glGetIntegerv);
  LOAD(PFNGLPIXELSTOREIPROC, glPixelStorei);
#undef LOAD
  gl_gen_load(load_gl);
  return NULL;
}

static bool make_surface(GLsizei width, GLsizei height) {
  EGLint attrs[] = {EGL_WIDTH, width, EGL_HEIGHT, height, EGL_NONE};
  surface = p_eglCreatePbufferSurface(display, config, attrs);
  surface_width = width;
  surface_height = height;
  return surface != EGL_NO_SURFACE;
}

// createContext(width, height, {alpha, depth, stencil, antialias}): one context per process; its
// default framebuffer is a width x height pbuffer.
static napi_value w_createContext(napi_env env, napi_callback_info info) {
  napi_value argv[3];
  args(env, info, 3, argv);
  if (!egl_lib) {
    napi_throw_error(env, NULL, "load() must be called first");
    return NULL;
  }
  if (context != EGL_NO_CONTEXT) {
    napi_throw_error(env, NULL, "only one WebGL context can exist at a time; destroy the other one first");
    return NULL;
  }
  GLsizei width = arg_int(env, argv[0]), height = arg_int(env, argv[1]);
  bool alpha = prop_bool(env, argv[2], "alpha", true);
  bool depth = prop_bool(env, argv[2], "depth", true);
  bool stencil = prop_bool(env, argv[2], "stencil", false);
  bool antialias = prop_bool(env, argv[2], "antialias", false);

  if (display == EGL_NO_DISPLAY) {
    EGLint displayAttrs[] = {EGL_PLATFORM_ANGLE_TYPE_ANGLE, EGL_PLATFORM_ANGLE_TYPE_VULKAN_ANGLE, EGL_NONE};
    display = p_eglGetPlatformDisplayEXT(EGL_PLATFORM_ANGLE_ANGLE, (void *)EGL_DEFAULT_DISPLAY, displayAttrs);
    if (display == EGL_NO_DISPLAY) return throw_egl(env, "eglGetPlatformDisplay");
    if (!p_eglInitialize(display, NULL, NULL)) {
      display = EGL_NO_DISPLAY;
      return throw_egl(env, "eglInitialize");
    }
  }
  p_eglBindAPI(EGL_OPENGL_ES_API);
  EGLint configAttrs[] = {EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT,
                          EGL_SURFACE_TYPE, EGL_PBUFFER_BIT,
                          EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8,
                          EGL_ALPHA_SIZE, alpha ? 8 : 0,
                          EGL_DEPTH_SIZE, depth ? 24 : 0,
                          EGL_STENCIL_SIZE, stencil ? 8 : 0,
                          EGL_SAMPLE_BUFFERS, antialias ? 1 : 0,
                          EGL_SAMPLES, antialias ? 4 : 0,
                          EGL_NONE};
  EGLint count = 0;
  if (!p_eglChooseConfig(display, configAttrs, &config, 1, &count) || count == 0)
    return throw_egl(env, "eglChooseConfig");
  // The attributes Chrome uses for WebGL contexts: WebGL validation, zero-initialized resources,
  // no client-side arrays, and no implicit object creation on bind.
  EGLint contextAttrs[] = {EGL_CONTEXT_MAJOR_VERSION, 3,
                           EGL_CONTEXT_MINOR_VERSION, 0,
                           EGL_CONTEXT_WEBGL_COMPATIBILITY_ANGLE, EGL_TRUE,
                           EGL_CONTEXT_OPENGL_ROBUST_ACCESS_EXT, EGL_TRUE,
                           EGL_ROBUST_RESOURCE_INITIALIZATION_ANGLE, EGL_TRUE,
                           EGL_CONTEXT_CLIENT_ARRAYS_ENABLED_ANGLE, EGL_FALSE,
                           EGL_CONTEXT_BIND_GENERATES_RESOURCE_CHROMIUM, EGL_FALSE,
                           EGL_CONTEXT_OPENGL_BACKWARDS_COMPATIBLE_ANGLE, EGL_FALSE,
                           EGL_NONE};
  context = p_eglCreateContext(display, config, EGL_NO_CONTEXT, contextAttrs);
  if (context == EGL_NO_CONTEXT) return throw_egl(env, "eglCreateContext");
  if (!make_surface(width, height)) return throw_egl(env, "eglCreatePbufferSurface");
  if (!p_eglMakeCurrent(display, surface, surface, context)) return throw_egl(env, "eglMakeCurrent");
  return NULL;
}

// resize(width, height): replaces the default framebuffer.
static napi_value w_resize(napi_env env, napi_callback_info info) {
  napi_value argv[2];
  args(env, info, 2, argv);
  EGLSurface old = surface;
  if (!make_surface(arg_int(env, argv[0]), arg_int(env, argv[1]))) return throw_egl(env, "eglCreatePbufferSurface");
  if (!p_eglMakeCurrent(display, surface, surface, context)) return throw_egl(env, "eglMakeCurrent");
  p_eglDestroySurface(display, old);
  return NULL;
}

// readFrame(out: Uint8Array): copies the default framebuffer into out as RGBA8 rows, top row first,
// through one reused pixel pack buffer, so it allocates nothing. Mapping the buffer waits for the GPU
// to finish the frame, which is also what lets ANGLE recycle per-frame resources such as descriptor
// sets; without such a wait they pile up, and lavapipe backs each with its own heap allocation.
static napi_value w_readFrame(napi_env env, napi_callback_info info) {
  napi_value argv[1];
  args(env, info, 1, argv);
  uint8_t *out = arg_pointer(env, argv[0]);
  size_t row = (size_t)surface_width * 4;
  GLsizeiptr size = (GLsizeiptr)row * surface_height;

  GLint readFramebuffer, packBinding, alignment, rowLength, skipPixels, skipRows;
  p_glGetIntegerv(GL_READ_FRAMEBUFFER_BINDING, &readFramebuffer);
  p_glGetIntegerv(GL_PIXEL_PACK_BUFFER_BINDING, &packBinding);
  p_glGetIntegerv(GL_PACK_ALIGNMENT, &alignment);
  p_glGetIntegerv(GL_PACK_ROW_LENGTH, &rowLength);
  p_glGetIntegerv(GL_PACK_SKIP_PIXELS, &skipPixels);
  p_glGetIntegerv(GL_PACK_SKIP_ROWS, &skipRows);

  if (!pack_buffer) p_glGenBuffers(1, &pack_buffer);
  p_glBindBuffer(GL_PIXEL_PACK_BUFFER, pack_buffer);
  if (pack_size != size) {
    p_glBufferData(GL_PIXEL_PACK_BUFFER, size, NULL, GL_STREAM_READ);
    pack_size = size;
  }
  p_glBindFramebuffer(GL_READ_FRAMEBUFFER, 0);
  p_glPixelStorei(GL_PACK_ALIGNMENT, 4);
  p_glPixelStorei(GL_PACK_ROW_LENGTH, 0);
  p_glPixelStorei(GL_PACK_SKIP_PIXELS, 0);
  p_glPixelStorei(GL_PACK_SKIP_ROWS, 0);
  p_glReadPixels(0, 0, surface_width, surface_height, GL_RGBA, GL_UNSIGNED_BYTE, NULL);
  const uint8_t *pixels = p_glMapBufferRange(GL_PIXEL_PACK_BUFFER, 0, size, GL_MAP_READ_BIT);
  if (pixels) {
    for (GLsizei y = 0; y < surface_height; y++)
      memcpy(out + (size_t)(surface_height - 1 - y) * row, pixels + (size_t)y * row, row);
    p_glUnmapBuffer(GL_PIXEL_PACK_BUFFER);
  }

  p_glPixelStorei(GL_PACK_ALIGNMENT, alignment);
  p_glPixelStorei(GL_PACK_ROW_LENGTH, rowLength);
  p_glPixelStorei(GL_PACK_SKIP_PIXELS, skipPixels);
  p_glPixelStorei(GL_PACK_SKIP_ROWS, skipRows);
  p_glBindFramebuffer(GL_READ_FRAMEBUFFER, (GLuint)readFramebuffer);
  p_glBindBuffer(GL_PIXEL_PACK_BUFFER, (GLuint)packBinding);
  if (!pixels) napi_throw_error(env, NULL, "readFrame: glMapBufferRange failed");
  return NULL;
}

// destroyContext(): releases the context and its default framebuffer; the display stays initialized
// so the next context starts faster.
static napi_value w_destroyContext(napi_env env, napi_callback_info info) {
  if (context == EGL_NO_CONTEXT) return NULL;
  p_eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
  p_eglDestroySurface(display, surface);
  p_eglDestroyContext(display, context);
  context = EGL_NO_CONTEXT;
  surface = EGL_NO_SURFACE;
  pack_buffer = 0;
  pack_size = 0;
  return NULL;
}

// ---- GL entry points that need hand-written marshalling ----

// getBufferSubData(target, srcOffset, dst: ArrayBufferView, byteLength)
static napi_value w_getBufferSubData(napi_env env, napi_callback_info info) {
  napi_value argv[4];
  args(env, info, 4, argv);
  GLenum target = arg_uint(env, argv[0]);
  GLintptr offset = (GLintptr)arg_double(env, argv[1]);
  void *dst = arg_pointer(env, argv[2]);
  GLsizeiptr length = (GLsizeiptr)arg_double(env, argv[3]);
  const void *src = p_glMapBufferRange(target, offset, length, GL_MAP_READ_BIT);
  if (!src) return NULL;  // ANGLE recorded the GL error, which WebGL reports through getError()
  memcpy(dst, src, (size_t)length);
  p_glUnmapBuffer(target);
  return NULL;
}

static napi_value w_glRequestExtensionANGLE(napi_env env, napi_callback_info info) {
  napi_value argv[1];
  args(env, info, 1, argv);
  char *name = arg_string(env, argv[0]);
  p_glRequestExtensionANGLE(name);
  free(name);
  return NULL;
}

// glShaderSource(shader, source: string)
static napi_value w_glShaderSource(napi_env env, napi_callback_info info) {
  napi_value argv[2];
  args(env, info, 2, argv);
  char *source = arg_string(env, argv[1]);
  const GLchar *sources[1] = {source};
  p_glShaderSource(arg_uint(env, argv[0]), 1, sources, NULL);
  free(source);
  return NULL;
}

static char **string_array(napi_env env, napi_value array, uint32_t *count) {
  napi_get_array_length(env, array, count);
  char **strings = calloc(*count ? *count : 1, sizeof(char *));
  for (uint32_t i = 0; i < *count; i++) {
    napi_value v;
    napi_get_element(env, array, i, &v);
    strings[i] = arg_string(env, v);
  }
  return strings;
}

static void free_strings(char **strings, uint32_t count) {
  for (uint32_t i = 0; i < count; i++) free(strings[i]);
  free(strings);
}

// glTransformFeedbackVaryings(program, names: string[], bufferMode)
static napi_value w_glTransformFeedbackVaryings(napi_env env, napi_callback_info info) {
  napi_value argv[3];
  args(env, info, 3, argv);
  uint32_t count;
  char **names = string_array(env, argv[1], &count);
  p_glTransformFeedbackVaryings(arg_uint(env, argv[0]), (GLsizei)count, (const GLchar *const *)names, arg_uint(env, argv[2]));
  free_strings(names, count);
  return NULL;
}

// glGetUniformIndices(program, names: string[], out: Uint32Array)
static napi_value w_glGetUniformIndices(napi_env env, napi_callback_info info) {
  napi_value argv[3];
  args(env, info, 3, argv);
  uint32_t count;
  char **names = string_array(env, argv[1], &count);
  p_glGetUniformIndices(arg_uint(env, argv[0]), (GLsizei)count, (const GLchar *const *)names, arg_pointer(env, argv[2]));
  free_strings(names, count);
  return NULL;
}

static napi_value init(napi_env env, napi_value exports) {
  export_fn(env, exports, "load", w_load);
  export_fn(env, exports, "createContext", w_createContext);
  export_fn(env, exports, "resize", w_resize);
  export_fn(env, exports, "readFrame", w_readFrame);
  export_fn(env, exports, "destroyContext", w_destroyContext);
  export_fn(env, exports, "getBufferSubData", w_getBufferSubData);
  export_fn(env, exports, "glRequestExtensionANGLE", w_glRequestExtensionANGLE);
  export_fn(env, exports, "glShaderSource", w_glShaderSource);
  export_fn(env, exports, "glTransformFeedbackVaryings", w_glTransformFeedbackVaryings);
  export_fn(env, exports, "glGetUniformIndices", w_glGetUniformIndices);
  gl_gen_export(env, exports);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
