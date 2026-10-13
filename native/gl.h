#pragma once
#define NAPI_VERSION 8
#define GL_GLES_PROTOTYPES 0
#include <GLES3/gl3.h>
#include <node_api.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>

// JS -> C argument conversion and C -> JS results, shared by gl.c and the generated gl_gen.c.
void *arg_pointer(napi_env env, napi_value v);
char *arg_string(napi_env env, napi_value v);
uint32_t arg_uint(napi_env env, napi_value v);
int32_t arg_int(napi_env env, napi_value v);
bool arg_bool(napi_env env, napi_value v);
double arg_double(napi_env env, napi_value v);
int64_t arg_wide(napi_env env, napi_value v);

napi_value ret_bool(napi_env env, bool v);
napi_value ret_uint(napi_env env, uint32_t v);
napi_value ret_int(napi_env env, int32_t v);
napi_value ret_string(napi_env env, const char *s);
napi_value ret_bigint(napi_env env, uint64_t v);
napi_value throw_arity(napi_env env, const char *name, int expected);
void export_fn(napi_env env, napi_value exports, const char *name, napi_callback cb);

// Defined in the generated gl_gen.c.
void gl_gen_load(void *(*load)(const char *));
void gl_gen_export(napi_env env, napi_value exports);
