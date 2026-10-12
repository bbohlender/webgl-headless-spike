// WebGL2RenderingContext on top of the addon's raw OpenGL ES 3.0 bindings.
// ANGLE runs in WebGL-compatibility mode, so it does WebGL validation and shader translation;
// this layer only maps the WebGL API shape (objects, overloads, getParameter, extensions, unpack flags).
import { createRequire } from "node:module";
import { C } from "./constants.js";

const require = createRequire(import.meta.url);
const native = require("./addon/webgl.node");

class WebGLObject {
  constructor(id) {
    this._id = id;
  }
}
export class WebGLBuffer extends WebGLObject {}
export class WebGLFramebuffer extends WebGLObject {}
export class WebGLProgram extends WebGLObject {}
export class WebGLQuery extends WebGLObject {}
export class WebGLRenderbuffer extends WebGLObject {}
export class WebGLSampler extends WebGLObject {}
export class WebGLShader extends WebGLObject {}
export class WebGLTexture extends WebGLObject {}
export class WebGLTransformFeedback extends WebGLObject {}
export class WebGLVertexArrayObject extends WebGLObject {}
export class WebGLUniformLocation extends WebGLObject {}
export class WebGLSync extends WebGLObject {}
export class WebGLActiveInfo {
  constructor(name, size, type) {
    Object.assign(this, { name, size, type });
  }
}
export class WebGLShaderPrecisionFormat {
  constructor(rangeMin, rangeMax, precision) {
    Object.assign(this, { rangeMin, rangeMax, precision });
  }
}

const id = (o) => (o == null ? 0 : o._id);
const u32 = new Uint32Array(1);
const i32x4 = new Int32Array(4);

// WebGL extension name -> ANGLE GL extension names it needs, plus the object WebGL returns.
const EXTENSIONS = {
  EXT_color_buffer_float: { gl: ["GL_EXT_color_buffer_float"] },
  EXT_color_buffer_half_float: { gl: ["GL_EXT_color_buffer_half_float"], obj: { RGBA16F_EXT: 0x881a, RGB16F_EXT: 0x881b, FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE_EXT: 0x8211, UNSIGNED_NORMALIZED_EXT: 0x8c17 } },
  EXT_float_blend: { gl: ["GL_EXT_float_blend"] },
  OES_texture_float_linear: { gl: ["GL_OES_texture_float_linear"] },
  EXT_texture_filter_anisotropic: { gl: ["GL_EXT_texture_filter_anisotropic"], obj: { TEXTURE_MAX_ANISOTROPY_EXT: 0x84fe, MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84ff } },
  EXT_texture_norm16: { gl: ["GL_EXT_texture_norm16"], obj: { R16_EXT: 0x822a, RG16_EXT: 0x822c, RGB16_EXT: 0x8054, RGBA16_EXT: 0x805b, R16_SNORM_EXT: 0x8f98, RG16_SNORM_EXT: 0x8f99, RGB16_SNORM_EXT: 0x8f9a, RGBA16_SNORM_EXT: 0x8f9b } },
  WEBGL_compressed_texture_s3tc: { gl: ["GL_EXT_texture_compression_dxt1", "GL_ANGLE_texture_compression_dxt3", "GL_ANGLE_texture_compression_dxt5"], obj: { COMPRESSED_RGB_S3TC_DXT1_EXT: 0x83f0, COMPRESSED_RGBA_S3TC_DXT1_EXT: 0x83f1, COMPRESSED_RGBA_S3TC_DXT3_EXT: 0x83f2, COMPRESSED_RGBA_S3TC_DXT5_EXT: 0x83f3 } },
  EXT_texture_compression_bptc: { gl: ["GL_EXT_texture_compression_bptc"], obj: { COMPRESSED_RGBA_BPTC_UNORM_EXT: 0x8e8c, COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT: 0x8e8d, COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT: 0x8e8e, COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT: 0x8e8f } },
  EXT_texture_compression_rgtc: { gl: ["GL_EXT_texture_compression_rgtc"], obj: { COMPRESSED_RED_RGTC1_EXT: 0x8dbb, COMPRESSED_SIGNED_RED_RGTC1_EXT: 0x8dbc, COMPRESSED_RED_GREEN_RGTC2_EXT: 0x8dbd, COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT: 0x8dbe } },
  OES_draw_buffers_indexed: { gl: ["GL_OES_draw_buffers_indexed"] },
  WEBGL_lose_context: { gl: [], obj: { loseContext() {}, restoreContext() {} } },
};

export class WebGL2RenderingContext {
  constructor(canvas, { width, height, backend = "vulkan", libDir, blobCacheDir, alpha = true, depth = true, stencil = false, antialias = false, premultipliedAlpha = true, preserveDrawingBuffer = false } = {}) {
    native.load(libDir);
    native.createContext({ width, height, backend, blobCacheDir, alpha, depth, stencil, antialias });
    this.canvas = canvas;
    this._attrs = { alpha, depth, stencil, antialias, premultipliedAlpha, preserveDrawingBuffer, powerPreference: "default", failIfMajorPerformanceCaveat: false, desynchronized: false, xrCompatible: false };
    this._width = width;
    this._height = height;
    this._flipY = false;
    this._premultiply = false;
    this._enabledExtensions = new Map();
    this._requestable = new Set((native.glGetString(C.REQUESTABLE_EXTENSIONS_ANGLE) || "").split(" "));
    this._objects = new Map(); // "kind:id" -> wrapper, for getParameter on bindings
  }

  get drawingBufferWidth() {
    return this._width;
  }
  get drawingBufferHeight() {
    return this._height;
  }
  get drawingBufferColorSpace() {
    return "srgb";
  }

  _resize(width, height) {
    if (width === this._width && height === this._height) return;
    native.resize(width, height);
    this._width = width;
    this._height = height;
  }

  destroy(terminate = true) {
    native.destroyContext(terminate);
  }

  getContextAttributes() {
    return { ...this._attrs };
  }
  isContextLost() {
    return false;
  }

  // ---- extensions ----
  getSupportedExtensions() {
    return Object.entries(EXTENSIONS)
      .filter(([, e]) => e.gl.every((n) => this._requestable.has(n) || this._enabledGL(n)))
      .map(([name]) => name);
  }
  _enabledGL(name) {
    return (native.glGetString(C.EXTENSIONS) || "").split(" ").includes(name);
  }
  getExtension(name) {
    if (this._enabledExtensions.has(name)) return this._enabledExtensions.get(name);
    const ext = EXTENSIONS[name];
    if (!ext || !ext.gl.every((n) => this._requestable.has(n) || this._enabledGL(n))) return null;
    for (const n of ext.gl) if (!this._enabledGL(n)) native.glRequestExtensionANGLE(n);
    const obj = { ...(ext.obj || {}) };
    this._enabledExtensions.set(name, obj);
    return obj;
  }

  // ---- object creation ----
  _gen(fn, Kind, kind) {
    fn(1, u32);
    const o = new Kind(u32[0]);
    this._objects.set(`${kind}:${u32[0]}`, o);
    return o;
  }
  _del(fn, o, kind) {
    if (!o) return;
    u32[0] = o._id;
    fn(1, u32);
    this._objects.delete(`${kind}:${o._id}`);
  }
  createBuffer() { return this._gen(native.glGenBuffers, WebGLBuffer, "buffer"); }
  createFramebuffer() { return this._gen(native.glGenFramebuffers, WebGLFramebuffer, "framebuffer"); }
  createRenderbuffer() { return this._gen(native.glGenRenderbuffers, WebGLRenderbuffer, "renderbuffer"); }
  createTexture() { return this._gen(native.glGenTextures, WebGLTexture, "texture"); }
  createVertexArray() { return this._gen(native.glGenVertexArrays, WebGLVertexArrayObject, "vao"); }
  createQuery() { return this._gen(native.glGenQueries, WebGLQuery, "query"); }
  createSampler() { return this._gen(native.glGenSamplers, WebGLSampler, "sampler"); }
  createTransformFeedback() { return this._gen(native.glGenTransformFeedbacks, WebGLTransformFeedback, "tf"); }
  deleteBuffer(o) { this._del(native.glDeleteBuffers, o, "buffer"); }
  deleteFramebuffer(o) { this._del(native.glDeleteFramebuffers, o, "framebuffer"); }
  deleteRenderbuffer(o) { this._del(native.glDeleteRenderbuffers, o, "renderbuffer"); }
  deleteTexture(o) { this._del(native.glDeleteTextures, o, "texture"); }
  deleteVertexArray(o) { this._del(native.glDeleteVertexArrays, o, "vao"); }
  deleteQuery(o) { this._del(native.glDeleteQueries, o, "query"); }
  deleteSampler(o) { this._del(native.glDeleteSamplers, o, "sampler"); }
  deleteTransformFeedback(o) { this._del(native.glDeleteTransformFeedbacks, o, "tf"); }
  createProgram() {
    const o = new WebGLProgram(native.glCreateProgram());
    this._objects.set(`program:${o._id}`, o);
    return o;
  }
  createShader(type) {
    const n = native.glCreateShader(type);
    return n ? new WebGLShader(n) : null;
  }
  deleteProgram(o) {
    if (o) native.glDeleteProgram(o._id), this._objects.delete(`program:${o._id}`);
  }
  deleteShader(o) {
    if (o) native.glDeleteShader(o._id);
  }
  isBuffer(o) { return !!o && native.glIsBuffer(o._id); }
  isTexture(o) { return !!o && native.glIsTexture(o._id); }
  isProgram(o) { return !!o && native.glIsProgram(o._id); }
  isShader(o) { return !!o && native.glIsShader(o._id); }
  isFramebuffer(o) { return !!o && native.glIsFramebuffer(o._id); }
  isRenderbuffer(o) { return !!o && native.glIsRenderbuffer(o._id); }
  isVertexArray(o) { return !!o && native.glIsVertexArray(o._id); }

  // ---- shaders and programs ----
  shaderSource(s, src) { native.glShaderSource(s._id, src); }
  getShaderParameter(s, pname) {
    native.glGetShaderiv(s._id, pname, i32x4);
    return pname === C.SHADER_TYPE ? i32x4[0] : !!i32x4[0];
  }
  getProgramParameter(p, pname) {
    native.glGetProgramiv(p._id, pname, i32x4);
    switch (pname) {
      case C.DELETE_STATUS:
      case C.LINK_STATUS:
      case C.VALIDATE_STATUS:
      case C.COMPLETION_STATUS_KHR:
        return !!i32x4[0];
      default:
        return i32x4[0];
    }
  }
  _log(getiv, getLog, obj) {
    getiv(obj._id, C.INFO_LOG_LENGTH, i32x4);
    const len = i32x4[0];
    if (!len) return "";
    const buf = new Uint8Array(len);
    getLog(obj._id, len, i32x4, buf);
    return Buffer.from(buf.subarray(0, i32x4[0])).toString("utf8");
  }
  getShaderInfoLog(s) { return this._log(native.glGetShaderiv, native.glGetShaderInfoLog, s); }
  getProgramInfoLog(p) { return this._log(native.glGetProgramiv, native.glGetProgramInfoLog, p); }
  getShaderSource(s) {
    native.glGetShaderiv(s._id, C.SHADER_SOURCE_LENGTH, i32x4);
    const buf = new Uint8Array(i32x4[0] || 1);
    native.glGetShaderSource(s._id, buf.length, i32x4, buf);
    return Buffer.from(buf.subarray(0, i32x4[0])).toString("utf8");
  }
  getShaderPrecisionFormat(shaderType, precisionType) {
    const range = new Int32Array(2);
    const precision = new Int32Array(1);
    native.glGetShaderPrecisionFormat(shaderType, precisionType, range, precision);
    return new WebGLShaderPrecisionFormat(range[0], range[1], precision[0]);
  }
  _active(fn, maxLenPname, p, index) {
    native.glGetProgramiv(p._id, maxLenPname, i32x4);
    const buf = new Uint8Array(Math.max(i32x4[0], 1));
    const len = new Int32Array(1), size = new Int32Array(1), type = new Uint32Array(1);
    fn(p._id, index, buf.length, len, size, type, buf);
    if (!len[0]) return null;
    return new WebGLActiveInfo(Buffer.from(buf.subarray(0, len[0])).toString("utf8"), size[0], type[0]);
  }
  getActiveUniform(p, i) { return this._active(native.glGetActiveUniform, C.ACTIVE_UNIFORM_MAX_LENGTH, p, i); }
  getActiveAttrib(p, i) { return this._active(native.glGetActiveAttrib, C.ACTIVE_ATTRIBUTE_MAX_LENGTH, p, i); }
  getTransformFeedbackVarying(p, i) {
    native.glGetProgramiv(p._id, C.TRANSFORM_FEEDBACK_VARYING_MAX_LENGTH, i32x4);
    const buf = new Uint8Array(Math.max(i32x4[0], 1));
    const len = new Int32Array(1), size = new Int32Array(1), type = new Uint32Array(1);
    native.glGetTransformFeedbackVarying(p._id, i, buf.length, len, size, type, buf);
    return new WebGLActiveInfo(Buffer.from(buf.subarray(0, len[0])).toString("utf8"), size[0], type[0]);
  }
  getUniformLocation(p, name) {
    const loc = native.glGetUniformLocation(p._id, name);
    return loc < 0 ? null : new WebGLUniformLocation(loc);
  }
  getAttribLocation(p, name) { return native.glGetAttribLocation(p._id, name); }
  getFragDataLocation(p, name) { return native.glGetFragDataLocation(p._id, name); }
  getUniformBlockIndex(p, name) { return native.glGetUniformBlockIndex(p._id, name); }
  getActiveUniformBlockName(p, index) {
    native.glGetActiveUniformBlockiv(p._id, index, C.UNIFORM_BLOCK_NAME_LENGTH, i32x4);
    const buf = new Uint8Array(Math.max(i32x4[0], 1));
    native.glGetActiveUniformBlockName(p._id, index, buf.length, i32x4, buf);
    return Buffer.from(buf.subarray(0, i32x4[0])).toString("utf8");
  }
  getActiveUniformBlockParameter(p, index, pname) {
    if (pname === C.UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES) {
      native.glGetActiveUniformBlockiv(p._id, index, C.UNIFORM_BLOCK_ACTIVE_UNIFORMS, i32x4);
      const out = new Uint32Array(i32x4[0]);
      native.glGetActiveUniformBlockiv(p._id, index, pname, out);
      return out;
    }
    native.glGetActiveUniformBlockiv(p._id, index, pname, i32x4);
    if (pname === C.UNIFORM_BLOCK_REFERENCED_BY_VERTEX_SHADER || pname === C.UNIFORM_BLOCK_REFERENCED_BY_FRAGMENT_SHADER) return !!i32x4[0];
    return i32x4[0];
  }
  getActiveUniforms(p, indices, pname) {
    const idx = Uint32Array.from(indices);
    const out = new Int32Array(idx.length);
    native.glGetActiveUniformsiv(p._id, idx.length, idx, pname, out);
    return pname === C.UNIFORM_IS_ROW_MAJOR ? [...out].map(Boolean) : [...out];
  }
  getUniformIndices(p, names) {
    const out = new Uint32Array(names.length);
    native.glGetUniformIndices(p._id, names, out);
    return [...out];
  }
  transformFeedbackVaryings(p, names, mode) { native.glTransformFeedbackVaryings(p._id, names, mode); }
  getAttachedShaders(p) {
    const out = new Uint32Array(8);
    native.glGetAttachedShaders(p._id, 8, i32x4, out);
    return [...out.subarray(0, i32x4[0])].map((n) => new WebGLShader(n));
  }

  // ---- uniforms ----
  _uv(fn, loc, data, srcOffset = 0, srcLength = 0, comps, Type) {
    if (!loc) return;
    let arr = Array.isArray(data) ? Type.from(data) : data;
    if (srcOffset || srcLength) arr = arr.subarray(srcOffset, srcLength ? srcOffset + srcLength : undefined);
    fn(loc._id, arr.length / comps, arr);
  }
  _um(fn, loc, transpose, data, srcOffset = 0, srcLength = 0, comps) {
    if (!loc) return;
    let arr = Array.isArray(data) ? Float32Array.from(data) : data;
    if (srcOffset || srcLength) arr = arr.subarray(srcOffset, srcLength ? srcOffset + srcLength : undefined);
    fn(loc._id, arr.length / comps, transpose, arr);
  }
  uniform1fv(l, d, o, n) { this._uv(native.glUniform1fv, l, d, o, n, 1, Float32Array); }
  uniform2fv(l, d, o, n) { this._uv(native.glUniform2fv, l, d, o, n, 2, Float32Array); }
  uniform3fv(l, d, o, n) { this._uv(native.glUniform3fv, l, d, o, n, 3, Float32Array); }
  uniform4fv(l, d, o, n) { this._uv(native.glUniform4fv, l, d, o, n, 4, Float32Array); }
  uniform1iv(l, d, o, n) { this._uv(native.glUniform1iv, l, d, o, n, 1, Int32Array); }
  uniform2iv(l, d, o, n) { this._uv(native.glUniform2iv, l, d, o, n, 2, Int32Array); }
  uniform3iv(l, d, o, n) { this._uv(native.glUniform3iv, l, d, o, n, 3, Int32Array); }
  uniform4iv(l, d, o, n) { this._uv(native.glUniform4iv, l, d, o, n, 4, Int32Array); }
  uniform1uiv(l, d, o, n) { this._uv(native.glUniform1uiv, l, d, o, n, 1, Uint32Array); }
  uniform2uiv(l, d, o, n) { this._uv(native.glUniform2uiv, l, d, o, n, 2, Uint32Array); }
  uniform3uiv(l, d, o, n) { this._uv(native.glUniform3uiv, l, d, o, n, 3, Uint32Array); }
  uniform4uiv(l, d, o, n) { this._uv(native.glUniform4uiv, l, d, o, n, 4, Uint32Array); }
  uniformMatrix2fv(l, t, d, o, n) { this._um(native.glUniformMatrix2fv, l, t, d, o, n, 4); }
  uniformMatrix3fv(l, t, d, o, n) { this._um(native.glUniformMatrix3fv, l, t, d, o, n, 9); }
  uniformMatrix4fv(l, t, d, o, n) { this._um(native.glUniformMatrix4fv, l, t, d, o, n, 16); }
  uniformMatrix2x3fv(l, t, d, o, n) { this._um(native.glUniformMatrix2x3fv, l, t, d, o, n, 6); }
  uniformMatrix3x2fv(l, t, d, o, n) { this._um(native.glUniformMatrix3x2fv, l, t, d, o, n, 6); }
  uniformMatrix2x4fv(l, t, d, o, n) { this._um(native.glUniformMatrix2x4fv, l, t, d, o, n, 8); }
  uniformMatrix4x2fv(l, t, d, o, n) { this._um(native.glUniformMatrix4x2fv, l, t, d, o, n, 8); }
  uniformMatrix3x4fv(l, t, d, o, n) { this._um(native.glUniformMatrix3x4fv, l, t, d, o, n, 12); }
  uniformMatrix4x3fv(l, t, d, o, n) { this._um(native.glUniformMatrix4x3fv, l, t, d, o, n, 12); }

  // ---- buffers ----
  bufferData(target, sizeOrData, usage, srcOffset = 0, length = 0) {
    if (typeof sizeOrData === "number") return native.glBufferData(target, sizeOrData, null, usage);
    const view = this._byteView(sizeOrData, srcOffset, length);
    native.glBufferData(target, view.byteLength, view, usage);
  }
  bufferSubData(target, dstOffset, data, srcOffset = 0, length = 0) {
    const view = this._byteView(data, srcOffset, length);
    native.glBufferSubData(target, dstOffset, view.byteLength, view);
  }
  getBufferSubData() {
    throw new Error("getBufferSubData is not implemented in the spike");
  }
  // Element-based slicing as in WebGL (offsets count elements for typed arrays, bytes for DataView/ArrayBuffer).
  _byteView(data, srcOffset, length) {
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data) && !(data instanceof DataView)) {
      if (!srcOffset && !length) return data;
      return data.subarray(srcOffset, length ? srcOffset + length : undefined);
    }
    return new Uint8Array(data.buffer, data.byteOffset + srcOffset, length || data.byteLength - srcOffset);
  }

  // ---- textures ----
  pixelStorei(pname, value) {
    if (pname === C.UNPACK_FLIP_Y_WEBGL) return void (this._flipY = !!value);
    if (pname === C.UNPACK_PREMULTIPLY_ALPHA_WEBGL) return void (this._premultiply = !!value);
    if (pname === C.UNPACK_COLORSPACE_CONVERSION_WEBGL) return;
    native.glPixelStorei(pname, value);
  }
  // Images from our createImageBitmap polyfill / ImageData-like objects: {width, height, data: RGBA8}.
  _isImage(src) {
    return src && typeof src === "object" && !ArrayBuffer.isView(src) && "width" in src && "height" in src;
  }
  _imagePixels(src) {
    if (!src.data) throw new Error("unsupported TexImageSource (no pixel data)");
    let px = src.data instanceof Uint8ClampedArray ? new Uint8Array(src.data.buffer, src.data.byteOffset, src.data.byteLength) : src.data;
    if (this._premultiply && !src.premultiplied) {
      px = Uint8Array.from(px);
      for (let i = 0; i < px.length; i += 4) {
        const a = px[i + 3] / 255;
        px[i] = Math.round(px[i] * a);
        px[i + 1] = Math.round(px[i + 1] * a);
        px[i + 2] = Math.round(px[i + 2] * a);
      }
    }
    return this._flipY ? flipRows(px, src.width * 4, src.height) : px;
  }
  _flipped(data, width, height, format, type, depth = 1) {
    if (!this._flipY || !data || !ArrayBuffer.isView(data)) return data;
    const rowBytes = (data.byteLength / (height * depth)) | 0;
    const out = new Uint8Array(data.byteLength);
    const src = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    for (let z = 0; z < depth; z++) out.set(flipRows(src.subarray(z * rowBytes * height, (z + 1) * rowBytes * height), rowBytes, height), z * rowBytes * height);
    return out;
  }
  texImage2D(target, level, internalformat, a, b, c, d, e, f, g) {
    if (arguments.length === 6) {
      // (target, level, internalformat, format, type, source)
      const src = arguments[5];
      return native.glTexImage2D(target, level, internalformat, src.width, src.height, 0, a, b, this._imagePixels(src));
    }
    // (target, level, internalformat, width, height, border, format, type, source|offset|null, srcOffset?)
    const [width, height, border, format, type, src, srcOffset] = [a, b, c, d, e, f, g];
    if (this._isImage(src)) return native.glTexImage2D(target, level, internalformat, width, height, border, format, type, this._imagePixels(src));
    let data = src;
    if (ArrayBuffer.isView(data) && srcOffset) data = data.subarray(srcOffset);
    native.glTexImage2D(target, level, internalformat, width, height, border, format, type, this._flipped(data, width, height, format, type));
  }
  texSubImage2D(target, level, x, y, a, b, c, d, e, f) {
    if (arguments.length === 7) {
      const src = arguments[6];
      return native.glTexSubImage2D(target, level, x, y, src.width, src.height, a, b, this._imagePixels(src));
    }
    const [width, height, format, type, src, srcOffset] = [a, b, c, d, e, f];
    if (this._isImage(src)) return native.glTexSubImage2D(target, level, x, y, width, height, format, type, this._imagePixels(src));
    let data = src;
    if (ArrayBuffer.isView(data) && srcOffset) data = data.subarray(srcOffset);
    native.glTexSubImage2D(target, level, x, y, width, height, format, type, this._flipped(data, width, height, format, type));
  }
  texImage3D(target, level, internalformat, width, height, depth, border, format, type, src, srcOffset) {
    let data = this._isImage(src) ? this._imagePixels(src) : src;
    if (ArrayBuffer.isView(data) && srcOffset) data = data.subarray(srcOffset);
    native.glTexImage3D(target, level, internalformat, width, height, depth, border, format, type, this._flipped(data, width, height, format, type, depth));
  }
  texSubImage3D(target, level, x, y, z, width, height, depth, format, type, src, srcOffset) {
    let data = this._isImage(src) ? this._imagePixels(src) : src;
    if (ArrayBuffer.isView(data) && srcOffset) data = data.subarray(srcOffset);
    native.glTexSubImage3D(target, level, x, y, z, width, height, depth, format, type, this._flipped(data, width, height, format, type, depth));
  }
  compressedTexImage2D(target, level, internalformat, width, height, border, src, srcOffset = 0, srcLength = 0) {
    const data = typeof src === "number" ? null : this._byteView(src, srcOffset, srcLength);
    native.glCompressedTexImage2D(target, level, internalformat, width, height, border, typeof src === "number" ? srcOffset : data.byteLength, typeof src === "number" ? src : data);
  }
  compressedTexSubImage2D(target, level, x, y, width, height, format, src, srcOffset = 0, srcLength = 0) {
    const data = this._byteView(src, srcOffset, srcLength);
    native.glCompressedTexSubImage2D(target, level, x, y, width, height, format, data.byteLength, data);
  }
  compressedTexImage3D(target, level, internalformat, width, height, depth, border, src, srcOffset = 0, srcLength = 0) {
    const data = this._byteView(src, srcOffset, srcLength);
    native.glCompressedTexImage3D(target, level, internalformat, width, height, depth, border, data.byteLength, data);
  }
  compressedTexSubImage3D(target, level, x, y, z, width, height, depth, format, src, srcOffset = 0, srcLength = 0) {
    const data = this._byteView(src, srcOffset, srcLength);
    native.glCompressedTexSubImage3D(target, level, x, y, z, width, height, depth, format, data.byteLength, data);
  }
  getTexParameter(target, pname) {
    native.glGetTexParameteriv(target, pname, i32x4);
    return pname === C.TEXTURE_IMMUTABLE_FORMAT ? !!i32x4[0] : i32x4[0];
  }

  // ---- drawing / framebuffers ----
  vertexAttribPointer(index, size, type, normalized, stride, offset) { native.glVertexAttribPointer(index, size, type, normalized, stride, offset); }
  vertexAttribIPointer(index, size, type, stride, offset) { native.glVertexAttribIPointer(index, size, type, stride, offset); }
  drawElements(mode, count, type, offset) { native.glDrawElements(mode, count, type, offset); }
  drawElementsInstanced(mode, count, type, offset, instances) { native.glDrawElementsInstanced(mode, count, type, offset, instances); }
  drawRangeElements(mode, start, end, count, type, offset) { native.glDrawRangeElements(mode, start, end, count, type, offset); }
  drawBuffers(buffers) { native.glDrawBuffers(buffers.length, Uint32Array.from(buffers)); }
  invalidateFramebuffer(target, attachments) { native.glInvalidateFramebuffer(target, attachments.length, Uint32Array.from(attachments)); }
  invalidateSubFramebuffer(target, attachments, x, y, w, h) { native.glInvalidateSubFramebuffer(target, attachments.length, Uint32Array.from(attachments), x, y, w, h); }
  clearBufferfv(buffer, drawbuffer, values, srcOffset = 0) { native.glClearBufferfv(buffer, drawbuffer, Float32Array.from(values).subarray(srcOffset)); }
  clearBufferiv(buffer, drawbuffer, values, srcOffset = 0) { native.glClearBufferiv(buffer, drawbuffer, Int32Array.from(values).subarray(srcOffset)); }
  clearBufferuiv(buffer, drawbuffer, values, srcOffset = 0) { native.glClearBufferuiv(buffer, drawbuffer, Uint32Array.from(values).subarray(srcOffset)); }
  readPixels(x, y, width, height, format, type, dst, dstOffset = 0) {
    if (typeof dst === "number") return native.glReadPixels(x, y, width, height, format, type, dst);
    native.glReadPixels(x, y, width, height, format, type, dstOffset ? dst.subarray(dstOffset) : dst);
  }
  vertexAttrib1fv(i, v) { native.glVertexAttrib1fv(i, Float32Array.from(v)); }
  vertexAttrib2fv(i, v) { native.glVertexAttrib2fv(i, Float32Array.from(v)); }
  vertexAttrib3fv(i, v) { native.glVertexAttrib3fv(i, Float32Array.from(v)); }
  vertexAttrib4fv(i, v) { native.glVertexAttrib4fv(i, Float32Array.from(v)); }
  vertexAttribI4iv(i, v) { native.glVertexAttribI4iv(i, Int32Array.from(v)); }
  vertexAttribI4uiv(i, v) { native.glVertexAttribI4uiv(i, Uint32Array.from(v)); }
  getFramebufferAttachmentParameter(target, attachment, pname) {
    native.glGetFramebufferAttachmentParameteriv(target, attachment, pname, i32x4);
    if (pname === C.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME) {
      native.glGetFramebufferAttachmentParameteriv(target, attachment, C.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE, u32);
      const kind = u32[0] === C.TEXTURE ? "texture" : "renderbuffer";
      return this._objects.get(`${kind}:${i32x4[0]}`) ?? null;
    }
    return i32x4[0];
  }
  getRenderbufferParameter(target, pname) {
    native.glGetRenderbufferParameteriv(target, pname, i32x4);
    return i32x4[0];
  }
  getInternalformatParameter(target, internalformat, pname) {
    native.glGetInternalformativ(target, internalformat, C.NUM_SAMPLE_COUNTS, 1, i32x4);
    const out = new Int32Array(Math.max(i32x4[0], 1));
    native.glGetInternalformativ(target, internalformat, pname, out.length, out);
    return out.subarray(0, i32x4[0]);
  }
  getVertexAttrib(index, pname) {
    if (pname === C.CURRENT_VERTEX_ATTRIB) {
      const out = new Float32Array(4);
      native.glGetVertexAttribfv(index, pname, out);
      return out;
    }
    native.glGetVertexAttribiv(index, pname, i32x4);
    if (pname === C.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING) return this._objects.get(`buffer:${i32x4[0]}`) ?? null;
    if (pname === C.VERTEX_ATTRIB_ARRAY_ENABLED || pname === C.VERTEX_ATTRIB_ARRAY_NORMALIZED || pname === C.VERTEX_ATTRIB_ARRAY_INTEGER) return !!i32x4[0];
    return i32x4[0];
  }
  getVertexAttribOffset(index, pname) {
    native.glGetVertexAttribiv(index, pname, i32x4);
    return i32x4[0];
  }
  getIndexedParameter(target, index) {
    const out = new BigInt64Array(1);
    native.glGetInteger64i_v(target, index, out);
    return Number(out[0]);
  }
  getQueryParameter(q, pname) {
    native.glGetQueryObjectuiv(q._id, pname, u32);
    return pname === C.QUERY_RESULT_AVAILABLE ? !!u32[0] : u32[0];
  }
  getQuery(target, pname) {
    native.glGetQueryiv(target, pname, i32x4);
    return this._objects.get(`query:${i32x4[0]}`) ?? null;
  }
  getSamplerParameter(s, pname) {
    native.glGetSamplerParameteriv(s._id, pname, i32x4);
    return i32x4[0];
  }
  getSyncParameter(s, pname) {
    native.glGetSynciv(s._id, pname, 1, null, i32x4);
    return i32x4[0];
  }
  fenceSync(condition, flags) { return new WebGLSync(native.glFenceSync(condition, flags)); }
  clientWaitSync(s, flags, timeout) { return native.glClientWaitSync(s._id, flags, BigInt(timeout)); }
  waitSync(s, flags, timeout) { native.glWaitSync(s._id, flags, BigInt(timeout)); }
  deleteSync(s) { if (s) native.glDeleteSync(s._id); }
  isSync(s) { return !!s && native.glIsSync(s._id); }

  // ---- state queries ----
  getParameter(pname) {
    switch (pname) {
      case C.VERSION: return "WebGL 2.0 (OpenGL ES 3.0 ANGLE)";
      case C.SHADING_LANGUAGE_VERSION: return "WebGL GLSL ES 3.00 (OpenGL ES GLSL ES 3.0 ANGLE)";
      case C.VENDOR: return "WebKit";
      case C.RENDERER: return "WebKit WebGL";
      case C.UNMASKED_VENDOR_WEBGL: return native.glGetString(C.VENDOR);
      case C.UNMASKED_RENDERER_WEBGL: return native.glGetString(C.RENDERER);
    }
    const kind = BINDINGS[pname];
    if (kind) {
      native.glGetIntegerv(pname, i32x4);
      return i32x4[0] ? this._objects.get(`${kind}:${i32x4[0]}`) ?? null : null;
    }
    const shape = SHAPES[pname];
    if (shape) {
      const out = new shape.Type(shape.n);
      if (shape.Type === Float32Array) native.glGetFloatv(pname, out);
      else if (shape.Type === Uint8Array) native.glGetBooleanv(pname, out);
      else native.glGetIntegerv(pname, out);
      return shape.Type === Uint8Array ? [...out].map(Boolean) : out;
    }
    if (BOOLEANS.has(pname)) {
      const out = new Uint8Array(1);
      native.glGetBooleanv(pname, out);
      return !!out[0];
    }
    if (FLOATS.has(pname)) {
      const out = new Float32Array(1);
      native.glGetFloatv(pname, out);
      return out[0];
    }
    if (pname === C.MAX_ELEMENT_INDEX || pname === C.MAX_SERVER_WAIT_TIMEOUT || pname === C.MAX_UNIFORM_BLOCK_SIZE || pname === C.MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS || pname === C.MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS) {
      const out = new BigInt64Array(1);
      native.glGetInteger64v(pname, out);
      return Number(out[0]);
    }
    native.glGetIntegerv(pname, i32x4);
    return i32x4[0];
  }
}

const BINDINGS = {
  [C.ARRAY_BUFFER_BINDING]: "buffer", [C.ELEMENT_ARRAY_BUFFER_BINDING]: "buffer", [C.UNIFORM_BUFFER_BINDING]: "buffer",
  [C.COPY_READ_BUFFER_BINDING]: "buffer", [C.COPY_WRITE_BUFFER_BINDING]: "buffer", [C.PIXEL_PACK_BUFFER_BINDING]: "buffer",
  [C.PIXEL_UNPACK_BUFFER_BINDING]: "buffer", [C.TRANSFORM_FEEDBACK_BUFFER_BINDING]: "buffer",
  [C.CURRENT_PROGRAM]: "program", [C.FRAMEBUFFER_BINDING]: "framebuffer", [C.READ_FRAMEBUFFER_BINDING]: "framebuffer",
  [C.RENDERBUFFER_BINDING]: "renderbuffer", [C.TEXTURE_BINDING_2D]: "texture", [C.TEXTURE_BINDING_CUBE_MAP]: "texture",
  [C.TEXTURE_BINDING_3D]: "texture", [C.TEXTURE_BINDING_2D_ARRAY]: "texture", [C.VERTEX_ARRAY_BINDING]: "vao",
  [C.SAMPLER_BINDING]: "sampler", [C.TRANSFORM_FEEDBACK_BINDING]: "tf",
};
const SHAPES = {
  [C.VIEWPORT]: { Type: Int32Array, n: 4 }, [C.SCISSOR_BOX]: { Type: Int32Array, n: 4 }, [C.MAX_VIEWPORT_DIMS]: { Type: Int32Array, n: 2 },
  [C.COLOR_CLEAR_VALUE]: { Type: Float32Array, n: 4 }, [C.BLEND_COLOR]: { Type: Float32Array, n: 4 }, [C.DEPTH_RANGE]: { Type: Float32Array, n: 2 },
  [C.ALIASED_LINE_WIDTH_RANGE]: { Type: Float32Array, n: 2 }, [C.ALIASED_POINT_SIZE_RANGE]: { Type: Float32Array, n: 2 },
  [C.COLOR_WRITEMASK]: { Type: Uint8Array, n: 4 },
};
const BOOLEANS = new Set([C.BLEND, C.CULL_FACE, C.DEPTH_TEST, C.DEPTH_WRITEMASK, C.DITHER, C.POLYGON_OFFSET_FILL, C.SAMPLE_ALPHA_TO_COVERAGE, C.SAMPLE_COVERAGE, C.SAMPLE_COVERAGE_INVERT, C.SCISSOR_TEST, C.STENCIL_TEST, C.RASTERIZER_DISCARD, C.TRANSFORM_FEEDBACK_ACTIVE, C.TRANSFORM_FEEDBACK_PAUSED, C.UNPACK_FLIP_Y_WEBGL, C.UNPACK_PREMULTIPLY_ALPHA_WEBGL]);
const FLOATS = new Set([C.DEPTH_CLEAR_VALUE, C.LINE_WIDTH, C.POLYGON_OFFSET_FACTOR, C.POLYGON_OFFSET_UNITS, C.SAMPLE_COVERAGE_VALUE, C.MAX_TEXTURE_LOD_BIAS, C.MAX_TEXTURE_MAX_ANISOTROPY_EXT]);

function flipRows(px, rowBytes, height) {
  const out = new Uint8Array(px.length);
  for (let y = 0; y < height; y++) out.set(px.subarray(y * rowBytes, (y + 1) * rowBytes), (height - 1 - y) * rowBytes);
  return out;
}

// Every WebGL constant on the prototype, and every remaining OpenGL ES entry point that maps
// one-to-one (scalars and WebGL objects only) as a generic method: glBlendFunc -> blendFunc.
Object.assign(WebGL2RenderingContext.prototype, C);
const RENAMES = { glClearDepthf: "clearDepth", glDepthRangef: "depthRange" };
for (const name of Object.keys(native)) {
  if (!name.startsWith("gl")) continue;
  const method = RENAMES[name] ?? name[2].toLowerCase() + name.slice(3);
  if (Object.prototype.hasOwnProperty.call(WebGL2RenderingContext.prototype, method)) continue;
  const fn = native[name];
  WebGL2RenderingContext.prototype[method] = function (...args) {
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a !== null && typeof a === "object" && "_id" in a) args[i] = a._id;
      else if (a === null) args[i] = 0;
    }
    return fn(...args);
  };
}
// Generic boolean-returning queries come back as booleans already; WebGL-only names:
WebGL2RenderingContext.prototype.isQuery = function (q) { return !!q && native.glIsQuery(q._id); };
WebGL2RenderingContext.prototype.isSampler = function (s) { return !!s && native.glIsSampler(s._id); };
WebGL2RenderingContext.prototype.isTransformFeedback = function (t) { return !!t && native.glIsTransformFeedback(t._id); };
