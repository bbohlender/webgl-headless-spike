// Node-API addon: loads ANGLE at runtime, creates a headless WebGL2-compatible EGL context,
// and exposes the OpenGL ES 3.0 entry points (generated in gl_gen.c) plus a few hand-written ones.
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
#define LIB_EGL "libEGL.dll"
#define LIB_GLES "libGLESv2.dll"
#else
#include <dlfcn.h>
static void *open_lib(const char *path) { return dlopen(path, RTLD_NOW | RTLD_LOCAL); }
static void *lib_sym(void *lib, const char *name) { return dlsym(lib, name); }
#ifdef __APPLE__
#define LIB_EGL "libEGL.dylib"
#define LIB_GLES "libGLESv2.dylib"
#else
#define LIB_EGL "libEGL.so"
#define LIB_GLES "libGLESv2.so"
#endif
#endif

// ---- argument / return helpers (used by gl_gen.c) ----

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
  napi_is_typedarray(env, v, &is);
  if (is) {
    napi_typedarray_type tt;
    size_t len, offset;
    napi_value ab;
    napi_get_typedarray_info(env, v, &tt, &len, &data, &ab, &offset);
    return data;
  }
  napi_is_dataview(env, v, &is);
  if (is) {
    size_t len, offset;
    napi_value ab;
    napi_get_dataview_info(env, v, &len, &data, &ab, &offset);
    return data;
  }
  napi_is_arraybuffer(env, v, &is);
  if (is) {
    size_t len;
    napi_get_arraybuffer_info(env, v, &data, &len);
    return data;
  }
  napi_throw_type_error(env, NULL, "expected TypedArray, ArrayBuffer, DataView, number or null");
  return NULL;
}

char *arg_string(napi_env env, napi_value v) {
  size_t len = 0;
  napi_get_value_string_utf8(env, v, NULL, 0, &len);
  char *s = malloc(len + 1);
  napi_get_value_string_utf8(env, v, s, len + 1, &len);
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
int arg_bool(napi_env env, napi_value v) { return number_of(env, v) != 0; }
double arg_double(napi_env env, napi_value v) { return number_of(env, v); }

int64_t arg_wide(napi_env env, napi_value v) {
  if (type_of(env, v) == napi_bigint) {
    uint64_t u;
    bool lossless;
    napi_get_value_bigint_uint64(env, v, &u, &lossless);
    return (int64_t)u;
  }
  return (int64_t)number_of(env, v);
}

napi_value ret_bool(napi_env env, int v) {
  napi_value r;
  napi_get_boolean(env, v != 0, &r);
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
  char msg[160];
  snprintf(msg, sizeof msg, "%s expects %d arguments", name, expected);
  napi_throw_type_error(env, NULL, msg);
  return NULL;
}
void export_fn(napi_env env, napi_value exports, const char *name, napi_callback cb) {
  napi_value fn;
  napi_create_function(env, name, NAPI_AUTO_LENGTH, cb, NULL, &fn);
  napi_set_named_property(env, exports, name, fn);
}

// ---- EGL ----

static void *egl_lib;
static PFNEGLGETPROCADDRESSPROC p_eglGetProcAddress;
static PFNEGLGETPLATFORMDISPLAYEXTPROC p_eglGetPlatformDisplayEXT;
static PFNEGLINITIALIZEPROC p_eglInitialize;
static PFNEGLTERMINATEPROC p_eglTerminate;
static PFNEGLBINDAPIPROC p_eglBindAPI;
static PFNEGLCHOOSECONFIGPROC p_eglChooseConfig;
static PFNEGLCREATECONTEXTPROC p_eglCreateContext;
static PFNEGLDESTROYCONTEXTPROC p_eglDestroyContext;
static PFNEGLCREATEPBUFFERSURFACEPROC p_eglCreatePbufferSurface;
static PFNEGLDESTROYSURFACEPROC p_eglDestroySurface;
static PFNEGLMAKECURRENTPROC p_eglMakeCurrent;
static PFNEGLGETERRORPROC p_eglGetError;
static PFNEGLRELEASETHREADPROC p_eglReleaseThread;

typedef void(GL_APIENTRY *PFN_glRequestExtensionANGLE)(const GLchar *name);
static PFN_glRequestExtensionANGLE p_glRequestExtensionANGLE;
typedef void(GL_APIENTRY *PFN_glShaderSource)(GLuint, GLsizei, const GLchar *const *, const GLint *);
static PFN_glShaderSource p_glShaderSource;
typedef void(GL_APIENTRY *PFN_glTransformFeedbackVaryings)(GLuint, GLsizei, const GLchar *const *, GLenum);
static PFN_glTransformFeedbackVaryings p_glTransformFeedbackVaryings;
typedef void(GL_APIENTRY *PFN_glGetUniformIndices)(GLuint, GLsizei, const GLchar *const *, GLuint *);
static PFN_glGetUniformIndices p_glGetUniformIndices;

static EGLDisplay display = EGL_NO_DISPLAY;
static EGLConfig config;
static EGLContext context = EGL_NO_CONTEXT;
static EGLSurface surface = EGL_NO_SURFACE;

static void *load_gl(const char *name) { return (void *)p_eglGetProcAddress(name); }

// ---- persistent blob cache (EGL_ANDROID_blob_cache) ----
// ANGLE stores translated programs and Vulkan pipeline caches through these callbacks.
// One file per entry, named by a 64-bit FNV-1a hash of the key; the file holds the key and value.

static char blob_dir[4096];

static uint64_t fnv1a(const void *data, size_t size) {
  const unsigned char *p = data;
  uint64_t h = 1469598103934665603ull;
  for (size_t i = 0; i < size; i++) h = (h ^ p[i]) * 1099511628211ull;
  return h;
}

static void blob_path(char *out, size_t outSize, const void *key, EGLsizeiANDROID keySize, const char *suffix) {
  snprintf(out, outSize, "%s/%016llx%s", blob_dir, (unsigned long long)fnv1a(key, (size_t)keySize), suffix);
}

static void blob_set(const void *key, EGLsizeiANDROID keySize, const void *value, EGLsizeiANDROID valueSize) {
  char path[4200], tmp[4200];
  blob_path(path, sizeof path, key, keySize, "");
  blob_path(tmp, sizeof tmp, key, keySize, ".tmp");
  FILE *f = fopen(tmp, "wb");
  if (!f) return;
  uint64_t ks = (uint64_t)keySize;
  bool ok = fwrite(&ks, sizeof ks, 1, f) == 1 && fwrite(key, 1, (size_t)keySize, f) == (size_t)keySize &&
            fwrite(value, 1, (size_t)valueSize, f) == (size_t)valueSize;
  fclose(f);
  if (ok) {
    remove(path);  // Windows rename does not replace
    rename(tmp, path);
  } else {
    remove(tmp);
  }
}

// Returns the value size; copies the value only when it fits (ANGLE first asks with valueSize 0).
static EGLsizeiANDROID blob_get(const void *key, EGLsizeiANDROID keySize, void *value, EGLsizeiANDROID valueSize) {
  char path[4200];
  blob_path(path, sizeof path, key, keySize, "");
  FILE *f = fopen(path, "rb");
  if (!f) return 0;
  EGLsizeiANDROID result = 0;
  uint64_t ks = 0;
  if (fread(&ks, sizeof ks, 1, f) == 1 && ks == (uint64_t)keySize) {
    void *stored = malloc((size_t)ks);
    if (fread(stored, 1, (size_t)ks, f) == (size_t)ks && memcmp(stored, key, (size_t)ks) == 0) {
      fseek(f, 0, SEEK_END);
      long total = ftell(f);
      EGLsizeiANDROID size = (EGLsizeiANDROID)(total - (long)sizeof ks - (long)ks);
      result = size;
      if (value && valueSize >= size) {
        fseek(f, (long)(sizeof ks + ks), SEEK_SET);
        if (fread(value, 1, (size_t)size, f) != (size_t)size) result = 0;
      }
    }
    free(stored);
  }
  fclose(f);
  return result;
}

static napi_value throw_egl(napi_env env, const char *what) {
  char msg[160];
  snprintf(msg, sizeof msg, "%s failed (EGL error 0x%x)", what, p_eglGetError ? p_eglGetError() : 0);
  napi_throw_error(env, NULL, msg);
  return NULL;
}

static bool get_prop(napi_env env, napi_value obj, const char *key, napi_value *out) {
  bool has = false;
  napi_has_named_property(env, obj, key, &has);
  if (!has) return false;
  napi_get_named_property(env, obj, key, out);
  napi_valuetype t = type_of(env, *out);
  return t != napi_undefined && t != napi_null;
}

static int prop_int(napi_env env, napi_value obj, const char *key, int fallback) {
  napi_value v;
  return get_prop(env, obj, key, &v) ? (int)number_of(env, v) : fallback;
}

// load(libDir: string, icdFile: string) -> pins the Vulkan driver to <libDir>/<icdFile> (e.g. lvp_icd.json
// or vk_swiftshader_icd.json) and loads ANGLE's libEGL from libDir (libEGL finds libGLESv2 next to itself).
static napi_value w_load(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (egl_lib) return NULL;
  char *dir = arg_string(env, argv[0]);
  char *icd = arg_string(env, argv[1]);
  char path[4096];
#ifdef _WIN32
  // Native separators: the Vulkan loader resolves the manifest's relative library_path against the
  // manifest's directory, which it finds only by backslashes.
  for (char *c = dir; *c; c++)
    if (*c == '/') *c = '\\';
#endif
  // Use only the bundled Vulkan driver and no layers, whatever Vulkan drivers or implicit
  // layers (overlays, capture tools) the host has installed. Must happen before ANGLE loads.
#ifdef _WIN32
  snprintf(path, sizeof path, "%s\\%s", dir, icd);
  _putenv_s("VK_DRIVER_FILES", path);
  _putenv_s("VK_ICD_FILENAMES", path);
  _putenv_s("VK_LOADER_LAYERS_DISABLE", "~all~");
  // Load the bundled Vulkan loader by full path first, so ANGLE's later LoadLibrary("vulkan-1.dll")
  // reuses it instead of a copy from System32 installed by the host's GPU driver.
  snprintf(path, sizeof path, "%s\\vulkan-1.dll", dir);
  open_lib(path);
  snprintf(path, sizeof path, "%s\\" LIB_GLES, dir);
  open_lib(path);  // preload so libEGL's lookup succeeds regardless of the DLL search path
  snprintf(path, sizeof path, "%s\\" LIB_EGL, dir);
#else
  snprintf(path, sizeof path, "%s/%s", dir, icd);
  setenv("VK_DRIVER_FILES", path, 1);
  setenv("VK_ICD_FILENAMES", path, 1);
  setenv("VK_LOADER_LAYERS_DISABLE", "~all~", 1);
  snprintf(path, sizeof path, "%s/" LIB_GLES, dir);
  open_lib(path);
  snprintf(path, sizeof path, "%s/" LIB_EGL, dir);
#endif
  free(dir);
  free(icd);
  egl_lib = open_lib(path);
  if (!egl_lib) {
    char msg[4200];
#ifdef _WIN32
    snprintf(msg, sizeof msg, "cannot load %s", path);
#else
    snprintf(msg, sizeof msg, "cannot load %s: %s", path, dlerror());
#endif
    napi_throw_error(env, NULL, msg);
    return NULL;
  }
  p_eglGetProcAddress = (PFNEGLGETPROCADDRESSPROC)lib_sym(egl_lib, "eglGetProcAddress");
#define EGLFN(T, n) p_##n = (T)p_eglGetProcAddress(#n)
  EGLFN(PFNEGLGETPLATFORMDISPLAYEXTPROC, eglGetPlatformDisplayEXT);
  EGLFN(PFNEGLINITIALIZEPROC, eglInitialize);
  EGLFN(PFNEGLTERMINATEPROC, eglTerminate);
  EGLFN(PFNEGLBINDAPIPROC, eglBindAPI);
  EGLFN(PFNEGLCHOOSECONFIGPROC, eglChooseConfig);
  EGLFN(PFNEGLCREATECONTEXTPROC, eglCreateContext);
  EGLFN(PFNEGLDESTROYCONTEXTPROC, eglDestroyContext);
  EGLFN(PFNEGLCREATEPBUFFERSURFACEPROC, eglCreatePbufferSurface);
  EGLFN(PFNEGLDESTROYSURFACEPROC, eglDestroySurface);
  EGLFN(PFNEGLMAKECURRENTPROC, eglMakeCurrent);
  EGLFN(PFNEGLGETERRORPROC, eglGetError);
  EGLFN(PFNEGLRELEASETHREADPROC, eglReleaseThread);
  gl_gen_load(load_gl);
  p_glRequestExtensionANGLE = (PFN_glRequestExtensionANGLE)load_gl("glRequestExtensionANGLE");
  p_glShaderSource = (PFN_glShaderSource)load_gl("glShaderSource");
  p_glTransformFeedbackVaryings = (PFN_glTransformFeedbackVaryings)load_gl("glTransformFeedbackVaryings");
  p_glGetUniformIndices = (PFN_glGetUniformIndices)load_gl("glGetUniformIndices");
  return NULL;
}

static bool make_surface(int width, int height) {
  EGLint attrs[] = {EGL_WIDTH, width, EGL_HEIGHT, height, EGL_NONE};
  surface = p_eglCreatePbufferSurface(display, config, attrs);
  return surface != EGL_NO_SURFACE;
}

// createContext({width, height, backend: "vulkan"|"swiftshader", alpha, depth, stencil, antialias})
// One context per process; the default framebuffer is a pbuffer of width x height.
static napi_value w_createContext(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (!egl_lib) {
    napi_throw_error(env, NULL, "call load(libDir) first");
    return NULL;
  }
  if (context != EGL_NO_CONTEXT) {
    napi_throw_error(env, NULL, "a context already exists; destroyContext() first");
    return NULL;
  }
  napi_value opts = argv[0];
  int width = prop_int(env, opts, "width", 300);
  int height = prop_int(env, opts, "height", 150);
  int alpha = prop_int(env, opts, "alpha", 1);
  int depth = prop_int(env, opts, "depth", 1);
  int stencil = prop_int(env, opts, "stencil", 0);
  int antialias = prop_int(env, opts, "antialias", 0);
  // backend: "vulkan" (driver from VK_ICD_FILENAMES), "swiftshader" (ANGLE's bundled Vulkan driver),
  // or "gles" (ANGLE's OpenGL ES backend on a native surfaceless EGL, i.e. Mesa llvmpipe; Linux only).
  EGLint displayAttrs[] = {
      EGL_PLATFORM_ANGLE_TYPE_ANGLE, EGL_PLATFORM_ANGLE_TYPE_VULKAN_ANGLE,
      EGL_PLATFORM_ANGLE_DEVICE_TYPE_ANGLE, EGL_PLATFORM_ANGLE_DEVICE_TYPE_HARDWARE_ANGLE,
      EGL_NONE, EGL_NONE, EGL_NONE};
  napi_value backend;
  if (get_prop(env, opts, "backend", &backend)) {
    char *b = arg_string(env, backend);
    if (strcmp(b, "swiftshader") == 0) {
      displayAttrs[3] = EGL_PLATFORM_ANGLE_DEVICE_TYPE_SWIFTSHADER_ANGLE;
    } else if (strcmp(b, "gles") == 0) {
      displayAttrs[1] = EGL_PLATFORM_ANGLE_TYPE_OPENGLES_ANGLE;
      displayAttrs[3] = EGL_PLATFORM_ANGLE_DEVICE_TYPE_EGL_ANGLE;
      displayAttrs[4] = EGL_PLATFORM_ANGLE_NATIVE_PLATFORM_TYPE_ANGLE;
      displayAttrs[5] = EGL_PLATFORM_SURFACELESS_MESA;
    }
    free(b);
  }

  if (display == EGL_NO_DISPLAY) {
    display = p_eglGetPlatformDisplayEXT(EGL_PLATFORM_ANGLE_ANGLE, (void *)EGL_DEFAULT_DISPLAY, displayAttrs);
    if (display == EGL_NO_DISPLAY) return throw_egl(env, "eglGetPlatformDisplay");
    if (!p_eglInitialize(display, NULL, NULL)) {
      display = EGL_NO_DISPLAY;
      return throw_egl(env, "eglInitialize");
    }
    napi_value cacheDir;
    if (get_prop(env, opts, "blobCacheDir", &cacheDir)) {
      char *dir = arg_string(env, cacheDir);
      snprintf(blob_dir, sizeof blob_dir, "%s", dir);
      free(dir);
      PFNEGLSETBLOBCACHEFUNCSANDROIDPROC setFuncs =
          (PFNEGLSETBLOBCACHEFUNCSANDROIDPROC)p_eglGetProcAddress("eglSetBlobCacheFuncsANDROID");
      if (setFuncs) setFuncs(display, blob_set, blob_get);
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
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  EGLSurface old = surface;
  if (!make_surface(arg_int(env, argv[0]), arg_int(env, argv[1]))) return throw_egl(env, "eglCreatePbufferSurface");
  if (!p_eglMakeCurrent(display, surface, surface, context)) return throw_egl(env, "eglMakeCurrent");
  p_eglDestroySurface(display, old);
  return NULL;
}

// destroyContext(terminate: boolean): releases the context; terminate also tears down the display.
static napi_value w_destroyContext(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (context == EGL_NO_CONTEXT) return NULL;
  p_eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
  p_eglDestroySurface(display, surface);
  p_eglDestroyContext(display, context);
  context = EGL_NO_CONTEXT;
  surface = EGL_NO_SURFACE;
  if (argc > 0 && arg_bool(env, argv[0])) {
    p_eglTerminate(display);
    p_eglReleaseThread();
    display = EGL_NO_DISPLAY;
  }
  return NULL;
}

// ---- hand-written GL entry points ----

static napi_value w_glRequestExtensionANGLE(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  char *name = arg_string(env, argv[0]);
  p_glRequestExtensionANGLE(name);
  free(name);
  return NULL;
}

// glShaderSource(shader, source: string)
static napi_value w_glShaderSource(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  GLuint shader = arg_uint(env, argv[0]);
  char *src = arg_string(env, argv[1]);
  const GLchar *srcs[1] = {src};
  p_glShaderSource(shader, 1, srcs, NULL);
  free(src);
  return NULL;
}

static char **string_array(napi_env env, napi_value arr, uint32_t *count) {
  napi_get_array_length(env, arr, count);
  char **out = calloc(*count ? *count : 1, sizeof(char *));
  for (uint32_t i = 0; i < *count; i++) {
    napi_value v;
    napi_get_element(env, arr, i, &v);
    out[i] = arg_string(env, v);
  }
  return out;
}

static void free_strings(char **s, uint32_t count) {
  for (uint32_t i = 0; i < count; i++) free(s[i]);
  free(s);
}

// glTransformFeedbackVaryings(program, names: string[], bufferMode)
static napi_value w_glTransformFeedbackVaryings(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  uint32_t count;
  char **names = string_array(env, argv[1], &count);
  p_glTransformFeedbackVaryings(arg_uint(env, argv[0]), (GLsizei)count, (const GLchar *const *)names, arg_uint(env, argv[2]));
  free_strings(names, count);
  return NULL;
}

// glGetUniformIndices(program, names: string[], out: Uint32Array)
static napi_value w_glGetUniformIndices(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  uint32_t count;
  char **names = string_array(env, argv[1], &count);
  p_glGetUniformIndices(arg_uint(env, argv[0]), (GLsizei)count, (const GLchar *const *)names, (GLuint *)arg_pointer(env, argv[2]));
  free_strings(names, count);
  return NULL;
}

static napi_value init(napi_env env, napi_value exports) {
  export_fn(env, exports, "load", w_load);
  export_fn(env, exports, "createContext", w_createContext);
  export_fn(env, exports, "resize", w_resize);
  export_fn(env, exports, "destroyContext", w_destroyContext);
  export_fn(env, exports, "glRequestExtensionANGLE", w_glRequestExtensionANGLE);
  export_fn(env, exports, "glShaderSource", w_glShaderSource);
  export_fn(env, exports, "glTransformFeedbackVaryings", w_glTransformFeedbackVaryings);
  export_fn(env, exports, "glGetUniformIndices", w_glGetUniformIndices);
  gl_gen_export(env, exports);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
