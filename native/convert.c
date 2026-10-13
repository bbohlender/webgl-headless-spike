// JS <-> C value conversion for the Node-API wrappers (gl.c and the generated gl_gen.c).
#include <stdio.h>

#include "gl.h"

napi_valuetype type_of(napi_env env, napi_value v) {
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
