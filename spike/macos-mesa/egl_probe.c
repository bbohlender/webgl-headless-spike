#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <GLES3/gl3.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CHECK(x) do { if (!(x)) { fprintf(stderr, "FAIL %s (egl 0x%x)\n", #x, eglGetError()); return 1; } } while (0)
static GLuint sh(GLenum t, const char *src) {
  GLuint s = glCreateShader(t); glShaderSource(s, 1, &src, NULL); glCompileShader(s);
  GLint ok; glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
  if (!ok) { char log[1024]; glGetShaderInfoLog(s, 1024, NULL, log); fprintf(stderr, "shader: %s\n", log); exit(1); }
  return s;
}
int main(void) {
  PFNEGLGETPLATFORMDISPLAYEXTPROC getPlatformDisplay =
    (PFNEGLGETPLATFORMDISPLAYEXTPROC)eglGetProcAddress("eglGetPlatformDisplayEXT");
  CHECK(getPlatformDisplay);
  printf("client extensions: %s\n", eglQueryString(EGL_NO_DISPLAY, EGL_EXTENSIONS));
  EGLDisplay dpy = getPlatformDisplay(EGL_PLATFORM_SURFACELESS_MESA, EGL_DEFAULT_DISPLAY, NULL);
  CHECK(dpy != EGL_NO_DISPLAY);
  EGLint major, minor; CHECK(eglInitialize(dpy, &major, &minor));
  printf("EGL %d.%d vendor=%s\n", major, minor, eglQueryString(dpy, EGL_VENDOR));
  CHECK(eglBindAPI(EGL_OPENGL_ES_API));
  EGLint cfgAttr[] = { EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT, EGL_SURFACE_TYPE, EGL_PBUFFER_BIT, EGL_NONE };
  EGLConfig cfg; EGLint n; CHECK(eglChooseConfig(dpy, cfgAttr, &cfg, 1, &n) && n > 0);
  EGLint ctxAttr[] = { EGL_CONTEXT_MAJOR_VERSION, 3, EGL_CONTEXT_MINOR_VERSION, 0, EGL_NONE };
  EGLContext ctx = eglCreateContext(dpy, cfg, EGL_NO_CONTEXT, ctxAttr); CHECK(ctx != EGL_NO_CONTEXT);
  CHECK(eglMakeCurrent(dpy, EGL_NO_SURFACE, EGL_NO_SURFACE, ctx));
  printf("GL_RENDERER=%s\nGL_VERSION=%s\nGLSL=%s\n", glGetString(GL_RENDERER), glGetString(GL_VERSION), glGetString(GL_SHADING_LANGUAGE_VERSION));
  const int W = 64, H = 64;
  GLuint rb, fb; glGenRenderbuffers(1, &rb); glBindRenderbuffer(GL_RENDERBUFFER, rb);
  glRenderbufferStorage(GL_RENDERBUFFER, GL_RGBA8, W, H);
  glGenFramebuffers(1, &fb); glBindFramebuffer(GL_FRAMEBUFFER, fb);
  glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_RENDERBUFFER, rb);
  CHECK(glCheckFramebufferStatus(GL_FRAMEBUFFER) == GL_FRAMEBUFFER_COMPLETE);
  GLuint p = glCreateProgram();
  glAttachShader(p, sh(GL_VERTEX_SHADER, "#version 300 es\nconst vec2 v[3]=vec2[](vec2(-1,-1),vec2(3,-1),vec2(-1,3));\nvoid main(){gl_Position=vec4(v[gl_VertexID],0,1);}"));
  glAttachShader(p, sh(GL_FRAGMENT_SHADER, "#version 300 es\nprecision highp float; out vec4 o;\nvoid main(){o=vec4(gl_FragCoord.x/64.0,gl_FragCoord.y/64.0,0.5,1);}"));
  glLinkProgram(p); glUseProgram(p);
  GLuint vao; glGenVertexArrays(1, &vao); glBindVertexArray(vao);
  glViewport(0, 0, W, H); glClearColor(0, 0, 0, 1); glClear(GL_COLOR_BUFFER_BIT);
  glDrawArrays(GL_TRIANGLES, 0, 3);
  unsigned char px[64 * 64 * 4]; glReadPixels(0, 0, W, H, GL_RGBA, GL_UNSIGNED_BYTE, px);
  printf("pixel(0,0)=%d,%d,%d,%d pixel(63,63)=%d,%d,%d,%d glError=0x%x\n", px[0], px[1], px[2], px[3],
         px[(63 * 64 + 63) * 4], px[(63 * 64 + 63) * 4 + 1], px[(63 * 64 + 63) * 4 + 2], px[(63 * 64 + 63) * 4 + 3], glGetError());
  return 0;
}
