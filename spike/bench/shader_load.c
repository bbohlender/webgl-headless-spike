// Compiles N distinct PBR-like programs, draws each once at 1280x720, then tears down
// (which flushes the shader disk cache). Same source for every stack:
//   build without -DUSE_ANGLE  -> links a native EGL (Mesa llvmpipe, surfaceless)
//   build with    -DUSE_ANGLE  -> links ANGLE; BACKEND env picks the ANGLE backend:
//     vulkan      ANGLE Vulkan backend, driver chosen by VK_ICD_FILENAMES (lavapipe)
//     swiftshader ANGLE Vulkan backend on its bundled SwiftShader
//     gles        ANGLE OpenGL ES backend on a native EGL (Mesa llvmpipe, surfaceless)
// Usage: shader_load [N]   Prints timings and GL_RENDERER/GL_VERSION.
#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <GLES3/gl3.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#ifdef USE_ANGLE
#include <EGL/eglext_angle.h>
#endif

static double now(void) {
  struct timespec t;
  clock_gettime(CLOCK_MONOTONIC, &t);
  return t.tv_sec + t.tv_nsec * 1e-9;
}

static void fail(const char *what) {
  fprintf(stderr, "FAIL %s (egl 0x%x)\n", what, eglGetError());
  exit(1);
}

static GLuint compile(GLenum type, const char *src) {
  GLuint s = glCreateShader(type);
  glShaderSource(s, 1, &src, NULL);
  glCompileShader(s);
  GLint ok;
  glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
  if (!ok) {
    char log[2048];
    glGetShaderInfoLog(s, sizeof log, NULL, log);
    fprintf(stderr, "shader: %s\n", log);
    exit(1);
  }
  return s;
}

static const char *VS =
    "#version 300 es\n"
    "const vec2 v[3]=vec2[](vec2(-1,-1),vec2(3,-1),vec2(-1,3));\n"
    "out vec2 uv;\n"
    "void main(){uv=v[gl_VertexID]*0.5+0.5;gl_Position=vec4(v[gl_VertexID],0,1);}";

static const char *FS =
    "#version 300 es\nprecision highp float; in vec2 uv; out vec4 o;\n"
    "const float SEED = %d.0; const int LIGHTS = %d;\n"
    "float D(float nh,float r){float a=r*r;float a2=a*a;float d=nh*nh*(a2-1.0)+1.0;return a2/(3.14159*d*d);}\n"
    "float G(float nv,float nl,float r){float k=(r+1.0)*(r+1.0)/8.0;return nv/(nv*(1.0-k)+k)*nl/(nl*(1.0-k)+k);}\n"
    "vec3 F(float c,vec3 f0){return f0+(1.0-f0)*pow(1.0-c,5.0);}\n"
    "float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+SEED)*43758.5453);}\n"
    "float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}\n"
    "void main(){vec3 N=normalize(vec3(uv*2.0-1.0+vec2(noise(uv*8.0),noise(uv*8.0+3.0))*0.2,1.0));vec3 V=vec3(0,0,1);\n"
    "vec3 alb=vec3(noise(uv*4.0+SEED),noise(uv*5.0),noise(uv*6.0));float rough=0.2+0.6*noise(uv*3.0);float metal=step(0.5,noise(uv*2.0));\n"
    "vec3 f0=mix(vec3(0.04),alb,metal);vec3 c=vec3(0);\n"
    "for(int i=0;i<LIGHTS;i++){float fi=float(i);vec3 lp=vec3(sin(fi*1.3+SEED),cos(fi*0.7),1.5);vec3 L=normalize(lp-vec3(uv*2.0-1.0,0));vec3 H=normalize(L+V);\n"
    "float nl=max(dot(N,L),0.0),nv=max(dot(N,V),1e-3),nh=max(dot(N,H),0.0);vec3 Fr=F(max(dot(H,V),0.0),f0);\n"
    "vec3 spec=D(nh,rough)*G(nv,nl,rough)*Fr/(4.0*nv*nl+1e-3);vec3 kd=(1.0-Fr)*(1.0-metal);c+=(kd*alb/3.14159+spec)*nl*vec3(1.0,0.9,0.8)/(1.0+fi);}\n"
    "c=c/(c+1.0);o=vec4(pow(c,vec3(1.0/2.2)),1);}\n";

static EGLDisplay open_display(void) {
  PFNEGLGETPLATFORMDISPLAYEXTPROC getPlatformDisplay =
      (PFNEGLGETPLATFORMDISPLAYEXTPROC)eglGetProcAddress("eglGetPlatformDisplayEXT");
  if (!getPlatformDisplay) fail("eglGetPlatformDisplayEXT");
#ifdef USE_ANGLE
  const char *backend = getenv("BACKEND") ? getenv("BACKEND") : "vulkan";
  EGLint attrs[16];
  int n = 0;
  if (!strcmp(backend, "gles")) {
    attrs[n++] = EGL_PLATFORM_ANGLE_TYPE_ANGLE;
    attrs[n++] = EGL_PLATFORM_ANGLE_TYPE_OPENGLES_ANGLE;
    attrs[n++] = EGL_PLATFORM_ANGLE_DEVICE_TYPE_ANGLE;
    attrs[n++] = EGL_PLATFORM_ANGLE_DEVICE_TYPE_EGL_ANGLE;
    attrs[n++] = EGL_PLATFORM_ANGLE_NATIVE_PLATFORM_TYPE_ANGLE;
    attrs[n++] = EGL_PLATFORM_SURFACELESS_MESA;
  } else {
    attrs[n++] = EGL_PLATFORM_ANGLE_TYPE_ANGLE;
    attrs[n++] = EGL_PLATFORM_ANGLE_TYPE_VULKAN_ANGLE;
    if (!strcmp(backend, "swiftshader")) {
      attrs[n++] = EGL_PLATFORM_ANGLE_DEVICE_TYPE_ANGLE;
      attrs[n++] = EGL_PLATFORM_ANGLE_DEVICE_TYPE_SWIFTSHADER_ANGLE;
    }
  }
  attrs[n++] = EGL_NONE;
  return getPlatformDisplay(EGL_PLATFORM_ANGLE_ANGLE, (void *)EGL_DEFAULT_DISPLAY, attrs);
#else
  return getPlatformDisplay(EGL_PLATFORM_SURFACELESS_MESA, (void *)EGL_DEFAULT_DISPLAY, NULL);
#endif
}

int main(int argc, char **argv) {
  int count = argc > 1 ? atoi(argv[1]) : 150;
  double t0 = now();

  EGLDisplay dpy = open_display();
  if (dpy == EGL_NO_DISPLAY) fail("eglGetPlatformDisplay");
  if (!eglInitialize(dpy, NULL, NULL)) fail("eglInitialize");
  if (!eglBindAPI(EGL_OPENGL_ES_API)) fail("eglBindAPI");
  EGLint configAttrs[] = {EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT, EGL_SURFACE_TYPE, EGL_PBUFFER_BIT, EGL_NONE};
  EGLConfig config;
  EGLint configCount;
  if (!eglChooseConfig(dpy, configAttrs, &config, 1, &configCount) || configCount == 0) fail("eglChooseConfig");
#ifdef USE_ANGLE
  EGLint contextAttrs[] = {EGL_CONTEXT_MAJOR_VERSION, 3, EGL_CONTEXT_WEBGL_COMPATIBILITY_ANGLE, EGL_TRUE, EGL_NONE};
#else
  EGLint contextAttrs[] = {EGL_CONTEXT_MAJOR_VERSION, 3, EGL_NONE};
#endif
  EGLContext ctx = eglCreateContext(dpy, config, EGL_NO_CONTEXT, contextAttrs);
  if (ctx == EGL_NO_CONTEXT) fail("eglCreateContext");
  EGLint pbufferAttrs[] = {EGL_WIDTH, 1, EGL_HEIGHT, 1, EGL_NONE};
  EGLSurface surface = eglCreatePbufferSurface(dpy, config, pbufferAttrs);
  if (!eglMakeCurrent(dpy, surface, surface, ctx)) fail("eglMakeCurrent");
  fprintf(stderr, "GL_RENDERER=%s | GL_VERSION=%s\n", glGetString(GL_RENDERER), glGetString(GL_VERSION));

  GLuint rb, fb, vao;
  glGenRenderbuffers(1, &rb);
  glBindRenderbuffer(GL_RENDERBUFFER, rb);
  glRenderbufferStorage(GL_RENDERBUFFER, GL_RGBA8, 1280, 720);
  glGenFramebuffers(1, &fb);
  glBindFramebuffer(GL_FRAMEBUFFER, fb);
  glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_RENDERBUFFER, rb);
  if (glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) fail("framebuffer");
  glGenVertexArrays(1, &vao);
  glBindVertexArray(vao);
  glViewport(0, 0, 1280, 720);
  GLuint vs = compile(GL_VERTEX_SHADER, VS);
  char src[8192];
  unsigned char px[4];
  double t1 = now();

  for (int i = 0; i < count; i++) {
    snprintf(src, sizeof src, FS, i, 4 + i % 5);
    GLuint p = glCreateProgram();
    glAttachShader(p, vs);
    glAttachShader(p, compile(GL_FRAGMENT_SHADER, src));
    glLinkProgram(p);
    GLint linked;
    glGetProgramiv(p, GL_LINK_STATUS, &linked);
    if (!linked) fail("link");
    glUseProgram(p);
    glDrawArrays(GL_TRIANGLES, 0, 3);
    glReadPixels(0, 0, 1, 1, GL_RGBA, GL_UNSIGNED_BYTE, px);
  }
  double t2 = now();
  if (glGetError() != GL_NO_ERROR) fail("glGetError");

  eglMakeCurrent(dpy, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
  eglDestroySurface(dpy, surface);
  eglDestroyContext(dpy, ctx);
  eglTerminate(dpy);
  double t3 = now();
  printf("init %.3f  compile+draw %.3f  teardown %.3f  total %.3f s\n", t1 - t0, t2 - t1, t3 - t2, t3 - t0);
  return 0;
}
