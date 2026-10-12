#pragma once
#define NAPI_VERSION 8
#include <node_api.h>
#include <stdint.h>
#include <stdlib.h>
#define GL_GLES_PROTOTYPES 0
#include <GLES3/gl3.h>

void *arg_pointer(napi_env env, napi_value v);
char *arg_string(napi_env env, napi_value v);
uint32_t arg_uint(napi_env env, napi_value v);
int32_t arg_int(napi_env env, napi_value v);
int arg_bool(napi_env env, napi_value v);
double arg_double(napi_env env, napi_value v);
int64_t arg_wide(napi_env env, napi_value v);

napi_value ret_bool(napi_env env, int v);
napi_value ret_uint(napi_env env, uint32_t v);
napi_value ret_int(napi_env env, int32_t v);
napi_value ret_string(napi_env env, const char *s);
napi_value ret_bigint(napi_env env, uint64_t v);
napi_value throw_arity(napi_env env, const char *name, int expected);
void export_fn(napi_env env, napi_value exports, const char *name, napi_callback cb);

void gl_gen_load(void *(*load)(const char *));
void gl_gen_export(napi_env env, napi_value exports);
