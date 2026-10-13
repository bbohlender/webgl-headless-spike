// WebGL2RenderingContext on top of the addon's OpenGL ES 3.0 bindings. ANGLE runs in
// WebGL-compatibility mode and does WebGL's validation and shader translation; this layer maps the
// WebGL API shape onto GLES: objects instead of names, overloads, typed-array slicing, queries,
// extensions and the WebGL-only unpack flags.
import { C } from "./constants.js";
import { ImageBitmap } from "./image.js";
import { native } from "./native.js";

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

// WebGL extension -> the ANGLE extensions it needs and the object getExtension returns.
const EXTENSIONS = {
  EXT_color_buffer_float: { gl: ["GL_EXT_color_buffer_float"] },
  EXT_color_buffer_half_float: { gl: ["GL_EXT_color_buffer_half_float"], constants: { RGBA16F_EXT: 0x881a, RGB16F_EXT: 0x881b, FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE_EXT: 0x8211, UNSIGNED_NORMALIZED_EXT: 0x8c17 } },
  EXT_float_blend: { gl: ["GL_EXT_float_blend"] },
  OES_texture_float_linear: { gl: ["GL_OES_texture_float_linear"] },
  EXT_texture_filter_anisotropic: { gl: ["GL_EXT_texture_filter_anisotropic"], constants: { TEXTURE_MAX_ANISOTROPY_EXT: 0x84fe, MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84ff } },
  EXT_texture_norm16: { gl: ["GL_EXT_texture_norm16"], constants: { R16_EXT: 0x822a, RG16_EXT: 0x822c, RGB16_EXT: 0x8054, RGBA16_EXT: 0x805b, R16_SNORM_EXT: 0x8f98, RG16_SNORM_EXT: 0x8f99, RGB16_SNORM_EXT: 0x8f9a, RGBA16_SNORM_EXT: 0x8f9b } },
  WEBGL_compressed_texture_s3tc: { gl: ["GL_EXT_texture_compression_dxt1", "GL_ANGLE_texture_compression_dxt3", "GL_ANGLE_texture_compression_dxt5"], constants: { COMPRESSED_RGB_S3TC_DXT1_EXT: 0x83f0, COMPRESSED_RGBA_S3TC_DXT1_EXT: 0x83f1, COMPRESSED_RGBA_S3TC_DXT3_EXT: 0x83f2, COMPRESSED_RGBA_S3TC_DXT5_EXT: 0x83f3 } },
  EXT_texture_compression_bptc: { gl: ["GL_EXT_texture_compression_bptc"], constants: { COMPRESSED_RGBA_BPTC_UNORM_EXT: 0x8e8c, COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT: 0x8e8d, COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT: 0x8e8e, COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT: 0x8e8f } },
  EXT_texture_compression_rgtc: { gl: ["GL_EXT_texture_compression_rgtc"], constants: { COMPRESSED_RED_RGTC1_EXT: 0x8dbb, COMPRESSED_SIGNED_RED_RGTC1_EXT: 0x8dbc, COMPRESSED_RED_GREEN_RGTC2_EXT: 0x8dbd, COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT: 0x8dbe } },
  OES_draw_buffers_indexed: { gl: ["GL_OES_draw_buffers_indexed"] },
};

// getParameter results that are WebGL objects, typed arrays, booleans or floats (everything else is an integer).
const BINDINGS = {
  [C.ARRAY_BUFFER_BINDING]: "buffer", [C.ELEMENT_ARRAY_BUFFER_BINDING]: "buffer", [C.UNIFORM_BUFFER_BINDING]: "buffer",
  [C.COPY_READ_BUFFER_BINDING]: "buffer", [C.COPY_WRITE_BUFFER_BINDING]: "buffer", [C.PIXEL_PACK_BUFFER_BINDING]: "buffer",
  [C.PIXEL_UNPACK_BUFFER_BINDING]: "buffer", [C.TRANSFORM_FEEDBACK_BUFFER_BINDING]: "buffer",
  [C.CURRENT_PROGRAM]: "program", [C.FRAMEBUFFER_BINDING]: "framebuffer", [C.READ_FRAMEBUFFER_BINDING]: "framebuffer",
  [C.RENDERBUFFER_BINDING]: "renderbuffer", [C.TEXTURE_BINDING_2D]: "texture", [C.TEXTURE_BINDING_CUBE_MAP]: "texture",
  [C.TEXTURE_BINDING_3D]: "texture", [C.TEXTURE_BINDING_2D_ARRAY]: "texture", [C.VERTEX_ARRAY_BINDING]: "vertexArray",
  [C.SAMPLER_BINDING]: "sampler", [C.TRANSFORM_FEEDBACK_BINDING]: "transformFeedback",
};
const ARRAYS = {
  [C.VIEWPORT]: [Int32Array, 4], [C.SCISSOR_BOX]: [Int32Array, 4], [C.MAX_VIEWPORT_DIMS]: [Int32Array, 2],
  [C.COLOR_CLEAR_VALUE]: [Float32Array, 4], [C.BLEND_COLOR]: [Float32Array, 4], [C.DEPTH_RANGE]: [Float32Array, 2],
  [C.ALIASED_LINE_WIDTH_RANGE]: [Float32Array, 2], [C.ALIASED_POINT_SIZE_RANGE]: [Float32Array, 2],
};
const BOOLEANS = new Set([C.BLEND, C.CULL_FACE, C.DEPTH_TEST, C.DEPTH_WRITEMASK, C.DITHER, C.POLYGON_OFFSET_FILL, C.SAMPLE_ALPHA_TO_COVERAGE, C.SAMPLE_COVERAGE, C.SAMPLE_COVERAGE_INVERT, C.SCISSOR_TEST, C.STENCIL_TEST, C.RASTERIZER_DISCARD, C.TRANSFORM_FEEDBACK_ACTIVE, C.TRANSFORM_FEEDBACK_PAUSED]);
const FLOATS = new Set([C.DEPTH_CLEAR_VALUE, C.LINE_WIDTH, C.POLYGON_OFFSET_FACTOR, C.POLYGON_OFFSET_UNITS, C.SAMPLE_COVERAGE_VALUE, C.MAX_TEXTURE_LOD_BIAS, C.MAX_TEXTURE_MAX_ANISOTROPY_EXT]);
const INT64 = new Set([C.MAX_ELEMENT_INDEX, C.MAX_SERVER_WAIT_TIMEOUT, C.MAX_UNIFORM_BLOCK_SIZE, C.MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS, C.MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS]);

const int1 = new Int32Array(1);
const uint1 = new Uint32Array(1);
const decoder = new TextDecoder();

// Reads a GL string out-parameter: query its length, then fill a buffer.
function readString(lengthQuery, fill) {
  const length = lengthQuery();
  if (!length) return "";
  const buffer = new Uint8Array(length);
  fill(buffer);
  return decoder.decode(buffer.subarray(0, int1[0]));
}

// WebGL slices typed arrays by element and DataViews/ArrayBuffers by byte.
function bytes(data, offset = 0, length = 0) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data, offset, length || data.byteLength - offset);
  if (data instanceof DataView) return new Uint8Array(data.buffer, data.byteOffset + offset, length || data.byteLength - offset);
  return offset || length ? data.subarray(offset, length ? offset + length : undefined) : data;
}

function flipRows(pixels, rowBytes, rows) {
  const flipped = new Uint8Array(pixels.byteLength);
  const source = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  for (let y = 0; y < rows; y++) flipped.set(source.subarray(y * rowBytes, (y + 1) * rowBytes), (rows - 1 - y) * rowBytes);
  return flipped;
}

export class WebGL2RenderingContext {
  #objects = new Map(); // "kind:id" -> WebGL object, for queries that return bindings
  #extensions = new Map();
  #requestable;
  #attributes;
  #flipY = false;
  #premultiplyAlpha = false;

  constructor(canvas, { alpha = true, depth = true, stencil = false, antialias = false, premultipliedAlpha = true, preserveDrawingBuffer = false } = {}) {
    native.createContext(canvas.width, canvas.height, { alpha, depth, stencil, antialias });
    this.canvas = canvas;
    this.#attributes = { alpha, depth, stencil, antialias, premultipliedAlpha, preserveDrawingBuffer, powerPreference: "default", failIfMajorPerformanceCaveat: false, desynchronized: false, xrCompatible: false };
    this.#requestable = new Set(native.glGetString(C.REQUESTABLE_EXTENSIONS_ANGLE).split(" "));
  }

  get drawingBufferWidth() {
    return this.canvas.width;
  }
  get drawingBufferHeight() {
    return this.canvas.height;
  }
  get drawingBufferColorSpace() {
    return "srgb";
  }
  getContextAttributes() {
    return { ...this.#attributes };
  }
  isContextLost() {
    return false;
  }

  // ---- extensions ----
  #available(name) {
    const enabled = native.glGetString(C.EXTENSIONS).split(" ");
    return EXTENSIONS[name].gl.every((gl) => this.#requestable.has(gl) || enabled.includes(gl));
  }
  getSupportedExtensions() {
    return Object.keys(EXTENSIONS).filter((name) => this.#available(name));
  }
  getExtension(name) {
    if (this.#extensions.has(name)) return this.#extensions.get(name);
    if (!EXTENSIONS[name] || !this.#available(name)) return null;
    const enabled = native.glGetString(C.EXTENSIONS).split(" ");
    for (const gl of EXTENSIONS[name].gl) if (!enabled.includes(gl)) native.glRequestExtensionANGLE(gl);
    const extension = { ...EXTENSIONS[name].constants };
    this.#extensions.set(name, extension);
    return extension;
  }

  // ---- objects ----
  #create(gen, Kind, kind) {
    gen(1, uint1);
    const object = new Kind(uint1[0]);
    this.#objects.set(`${kind}:${object._id}`, object);
    return object;
  }
  #delete(del, object, kind) {
    if (!object) return;
    uint1[0] = object._id;
    del(1, uint1);
    this.#objects.delete(`${kind}:${object._id}`);
  }
  #lookup(kind, id) {
    return id ? (this.#objects.get(`${kind}:${id}`) ?? null) : null;
  }
  createBuffer() { return this.#create(native.glGenBuffers, WebGLBuffer, "buffer"); }
  createFramebuffer() { return this.#create(native.glGenFramebuffers, WebGLFramebuffer, "framebuffer"); }
  createRenderbuffer() { return this.#create(native.glGenRenderbuffers, WebGLRenderbuffer, "renderbuffer"); }
  createTexture() { return this.#create(native.glGenTextures, WebGLTexture, "texture"); }
  createVertexArray() { return this.#create(native.glGenVertexArrays, WebGLVertexArrayObject, "vertexArray"); }
  createQuery() { return this.#create(native.glGenQueries, WebGLQuery, "query"); }
  createSampler() { return this.#create(native.glGenSamplers, WebGLSampler, "sampler"); }
  createTransformFeedback() { return this.#create(native.glGenTransformFeedbacks, WebGLTransformFeedback, "transformFeedback"); }
  deleteBuffer(o) { this.#delete(native.glDeleteBuffers, o, "buffer"); }
  deleteFramebuffer(o) { this.#delete(native.glDeleteFramebuffers, o, "framebuffer"); }
  deleteRenderbuffer(o) { this.#delete(native.glDeleteRenderbuffers, o, "renderbuffer"); }
  deleteTexture(o) { this.#delete(native.glDeleteTextures, o, "texture"); }
  deleteVertexArray(o) { this.#delete(native.glDeleteVertexArrays, o, "vertexArray"); }
  deleteQuery(o) { this.#delete(native.glDeleteQueries, o, "query"); }
  deleteSampler(o) { this.#delete(native.glDeleteSamplers, o, "sampler"); }
  deleteTransformFeedback(o) { this.#delete(native.glDeleteTransformFeedbacks, o, "transformFeedback"); }
  createProgram() {
    const program = new WebGLProgram(native.glCreateProgram());
    this.#objects.set(`program:${program._id}`, program);
    return program;
  }
  deleteProgram(program) {
    if (!program) return;
    native.glDeleteProgram(program._id);
    this.#objects.delete(`program:${program._id}`);
  }
  createShader(type) {
    const id = native.glCreateShader(type);
    return id ? new WebGLShader(id) : null;
  }
  fenceSync(condition, flags) {
    return new WebGLSync(native.glFenceSync(condition, flags));
  }

  // ---- shaders and programs ----
  shaderSource(shader, source) {
    native.glShaderSource(shader._id, source);
  }
  getShaderParameter(shader, pname) {
    native.glGetShaderiv(shader._id, pname, int1);
    return pname === C.SHADER_TYPE ? int1[0] : Boolean(int1[0]);
  }
  getProgramParameter(program, pname) {
    native.glGetProgramiv(program._id, pname, int1);
    return pname === C.DELETE_STATUS || pname === C.LINK_STATUS || pname === C.VALIDATE_STATUS ? Boolean(int1[0]) : int1[0];
  }
  getShaderInfoLog(shader) {
    return readString(() => this.#shaderInt(shader, C.INFO_LOG_LENGTH), (b) => native.glGetShaderInfoLog(shader._id, b.length, int1, b));
  }
  getProgramInfoLog(program) {
    return readString(() => this.#programInt(program, C.INFO_LOG_LENGTH), (b) => native.glGetProgramInfoLog(program._id, b.length, int1, b));
  }
  getShaderSource(shader) {
    return readString(() => this.#shaderInt(shader, C.SHADER_SOURCE_LENGTH), (b) => native.glGetShaderSource(shader._id, b.length, int1, b));
  }
  #shaderInt(shader, pname) {
    native.glGetShaderiv(shader._id, pname, int1);
    return int1[0];
  }
  #programInt(program, pname) {
    native.glGetProgramiv(program._id, pname, int1);
    return int1[0];
  }
  getShaderPrecisionFormat(shaderType, precisionType) {
    const range = new Int32Array(2);
    native.glGetShaderPrecisionFormat(shaderType, precisionType, range, int1);
    return new WebGLShaderPrecisionFormat(range[0], range[1], int1[0]);
  }
  #activeInfo(get, maxLengthPname, program, index) {
    const name = new Uint8Array(Math.max(this.#programInt(program, maxLengthPname), 1));
    const size = new Int32Array(1);
    const type = new Uint32Array(1);
    get(program._id, index, name.length, int1, size, type, name);
    return int1[0] ? new WebGLActiveInfo(decoder.decode(name.subarray(0, int1[0])), size[0], type[0]) : null;
  }
  getActiveUniform(program, index) {
    return this.#activeInfo(native.glGetActiveUniform, C.ACTIVE_UNIFORM_MAX_LENGTH, program, index);
  }
  getActiveAttrib(program, index) {
    return this.#activeInfo(native.glGetActiveAttrib, C.ACTIVE_ATTRIBUTE_MAX_LENGTH, program, index);
  }
  getTransformFeedbackVarying(program, index) {
    return this.#activeInfo(native.glGetTransformFeedbackVarying, C.TRANSFORM_FEEDBACK_VARYING_MAX_LENGTH, program, index);
  }
  getUniformLocation(program, name) {
    const location = native.glGetUniformLocation(program._id, name);
    return location < 0 ? null : new WebGLUniformLocation(location);
  }
  getActiveUniformBlockName(program, index) {
    native.glGetActiveUniformBlockiv(program._id, index, C.UNIFORM_BLOCK_NAME_LENGTH, int1);
    return readString(() => int1[0], (b) => native.glGetActiveUniformBlockName(program._id, index, b.length, int1, b));
  }
  getActiveUniformBlockParameter(program, index, pname) {
    if (pname === C.UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES) {
      native.glGetActiveUniformBlockiv(program._id, index, C.UNIFORM_BLOCK_ACTIVE_UNIFORMS, int1);
      const indices = new Uint32Array(int1[0]);
      native.glGetActiveUniformBlockiv(program._id, index, pname, indices);
      return indices;
    }
    native.glGetActiveUniformBlockiv(program._id, index, pname, int1);
    const isBoolean = pname === C.UNIFORM_BLOCK_REFERENCED_BY_VERTEX_SHADER || pname === C.UNIFORM_BLOCK_REFERENCED_BY_FRAGMENT_SHADER;
    return isBoolean ? Boolean(int1[0]) : int1[0];
  }
  getActiveUniforms(program, indices, pname) {
    const values = new Int32Array(indices.length);
    native.glGetActiveUniformsiv(program._id, indices.length, Uint32Array.from(indices), pname, values);
    return pname === C.UNIFORM_IS_ROW_MAJOR ? Array.from(values, Boolean) : Array.from(values);
  }
  getUniformIndices(program, names) {
    const indices = new Uint32Array(names.length);
    native.glGetUniformIndices(program._id, names, indices);
    return Array.from(indices);
  }
  transformFeedbackVaryings(program, names, bufferMode) {
    native.glTransformFeedbackVaryings(program._id, names, bufferMode);
  }
  getAttachedShaders(program) {
    const ids = new Uint32Array(this.#programInt(program, C.ATTACHED_SHADERS));
    native.glGetAttachedShaders(program._id, ids.length, int1, ids);
    return Array.from(ids, (id) => new WebGLShader(id));
  }

  // ---- uniforms: arrays are sliced by srcOffset/srcLength in elements ----
  #uniform(set, location, data, srcOffset = 0, srcLength = 0, components, Type) {
    if (!location) return;
    const values = bytes(Array.isArray(data) ? Type.from(data) : data, srcOffset, srcLength);
    set(location._id, values.length / components, values);
  }
  #matrix(set, location, transpose, data, srcOffset = 0, srcLength = 0, components) {
    if (!location) return;
    const values = bytes(Array.isArray(data) ? Float32Array.from(data) : data, srcOffset, srcLength);
    set(location._id, values.length / components, transpose, values);
  }
  uniform1fv(l, d, o, n) { this.#uniform(native.glUniform1fv, l, d, o, n, 1, Float32Array); }
  uniform2fv(l, d, o, n) { this.#uniform(native.glUniform2fv, l, d, o, n, 2, Float32Array); }
  uniform3fv(l, d, o, n) { this.#uniform(native.glUniform3fv, l, d, o, n, 3, Float32Array); }
  uniform4fv(l, d, o, n) { this.#uniform(native.glUniform4fv, l, d, o, n, 4, Float32Array); }
  uniform1iv(l, d, o, n) { this.#uniform(native.glUniform1iv, l, d, o, n, 1, Int32Array); }
  uniform2iv(l, d, o, n) { this.#uniform(native.glUniform2iv, l, d, o, n, 2, Int32Array); }
  uniform3iv(l, d, o, n) { this.#uniform(native.glUniform3iv, l, d, o, n, 3, Int32Array); }
  uniform4iv(l, d, o, n) { this.#uniform(native.glUniform4iv, l, d, o, n, 4, Int32Array); }
  uniform1uiv(l, d, o, n) { this.#uniform(native.glUniform1uiv, l, d, o, n, 1, Uint32Array); }
  uniform2uiv(l, d, o, n) { this.#uniform(native.glUniform2uiv, l, d, o, n, 2, Uint32Array); }
  uniform3uiv(l, d, o, n) { this.#uniform(native.glUniform3uiv, l, d, o, n, 3, Uint32Array); }
  uniform4uiv(l, d, o, n) { this.#uniform(native.glUniform4uiv, l, d, o, n, 4, Uint32Array); }
  uniformMatrix2fv(l, t, d, o, n) { this.#matrix(native.glUniformMatrix2fv, l, t, d, o, n, 4); }
  uniformMatrix3fv(l, t, d, o, n) { this.#matrix(native.glUniformMatrix3fv, l, t, d, o, n, 9); }
  uniformMatrix4fv(l, t, d, o, n) { this.#matrix(native.glUniformMatrix4fv, l, t, d, o, n, 16); }
  uniformMatrix2x3fv(l, t, d, o, n) { this.#matrix(native.glUniformMatrix2x3fv, l, t, d, o, n, 6); }
  uniformMatrix3x2fv(l, t, d, o, n) { this.#matrix(native.glUniformMatrix3x2fv, l, t, d, o, n, 6); }
  uniformMatrix2x4fv(l, t, d, o, n) { this.#matrix(native.glUniformMatrix2x4fv, l, t, d, o, n, 8); }
  uniformMatrix4x2fv(l, t, d, o, n) { this.#matrix(native.glUniformMatrix4x2fv, l, t, d, o, n, 8); }
  uniformMatrix3x4fv(l, t, d, o, n) { this.#matrix(native.glUniformMatrix3x4fv, l, t, d, o, n, 12); }
  uniformMatrix4x3fv(l, t, d, o, n) { this.#matrix(native.glUniformMatrix4x3fv, l, t, d, o, n, 12); }

  // ---- buffers ----
  bufferData(target, sizeOrData, usage, srcOffset = 0, length = 0) {
    if (typeof sizeOrData === "number") return native.glBufferData(target, sizeOrData, null, usage);
    const data = bytes(sizeOrData, srcOffset, length);
    native.glBufferData(target, data.byteLength, data, usage);
  }
  bufferSubData(target, dstByteOffset, data, srcOffset = 0, length = 0) {
    const source = bytes(data, srcOffset, length);
    native.glBufferSubData(target, dstByteOffset, source.byteLength, source);
  }
  getBufferSubData(target, srcByteOffset, dst, dstOffset = 0, length = 0) {
    const destination = bytes(dst, dstOffset, length);
    native.getBufferSubData(target, srcByteOffset, destination, destination.byteLength);
  }

  // ---- textures ----
  pixelStorei(pname, value) {
    if (pname === C.UNPACK_FLIP_Y_WEBGL) this.#flipY = Boolean(value);
    else if (pname === C.UNPACK_PREMULTIPLY_ALPHA_WEBGL) this.#premultiplyAlpha = Boolean(value);
    else if (pname !== C.UNPACK_COLORSPACE_CONVERSION_WEBGL) native.glPixelStorei(pname, value);
  }
  // Pixels for an ArrayBufferView upload, with the WebGL unpack flags applied. ImageBitmaps ignore the
  // flags, as in browsers (the flip and premultiplication are decided when the bitmap is created).
  #pixels(source, height, depth = 1) {
    if (source instanceof ImageBitmap) return source.pixels();
    if (source != null && !ArrayBuffer.isView(source)) throw new TypeError("unsupported texture source; use an ArrayBufferView or an ImageBitmap from createImageBitmap");
    if (!source || (!this.#flipY && !this.#premultiplyAlpha)) return source;
    if (this.#premultiplyAlpha) throw new Error("UNPACK_PREMULTIPLY_ALPHA_WEBGL is not supported for ArrayBufferView uploads");
    const rowBytes = source.byteLength / (height * depth);
    const slices = [];
    for (let z = 0; z < depth; z++) slices.push(flipRows(new Uint8Array(source.buffer, source.byteOffset + z * rowBytes * height, rowBytes * height), rowBytes, height));
    return depth === 1 ? slices[0] : Buffer.concat(slices);
  }
  texImage2D(target, level, internalformat, ...rest) {
    if (rest.length === 3) {
      const [format, type, source] = rest; // (target, level, internalformat, format, type, source)
      return native.glTexImage2D(target, level, internalformat, source.width, source.height, 0, format, type, this.#pixels(source));
    }
    const [width, height, border, format, type, source, srcOffset] = rest;
    if (typeof source === "number") return native.glTexImage2D(target, level, internalformat, width, height, border, format, type, source);
    const data = this.#pixels(srcOffset ? source.subarray(srcOffset) : source, height);
    native.glTexImage2D(target, level, internalformat, width, height, border, format, type, data);
  }
  texSubImage2D(target, level, x, y, ...rest) {
    if (rest.length === 3) {
      const [format, type, source] = rest; // (target, level, x, y, format, type, source)
      return native.glTexSubImage2D(target, level, x, y, source.width, source.height, format, type, this.#pixels(source));
    }
    const [width, height, format, type, source, srcOffset] = rest;
    if (typeof source === "number") return native.glTexSubImage2D(target, level, x, y, width, height, format, type, source);
    native.glTexSubImage2D(target, level, x, y, width, height, format, type, this.#pixels(srcOffset ? source.subarray(srcOffset) : source, height));
  }
  texImage3D(target, level, internalformat, width, height, depth, border, format, type, source, srcOffset) {
    const data = typeof source === "number" ? source : this.#pixels(srcOffset ? source.subarray(srcOffset) : source, height, depth);
    native.glTexImage3D(target, level, internalformat, width, height, depth, border, format, type, data);
  }
  texSubImage3D(target, level, x, y, z, width, height, depth, format, type, source, srcOffset) {
    const data = typeof source === "number" ? source : this.#pixels(srcOffset ? source.subarray(srcOffset) : source, height, depth);
    native.glTexSubImage3D(target, level, x, y, z, width, height, depth, format, type, data);
  }
  compressedTexImage2D(target, level, internalformat, width, height, border, source, srcOffset = 0, srcLength = 0) {
    if (typeof source === "number") return native.glCompressedTexImage2D(target, level, internalformat, width, height, border, srcOffset, source);
    const data = bytes(source, srcOffset, srcLength);
    native.glCompressedTexImage2D(target, level, internalformat, width, height, border, data.byteLength, data);
  }
  compressedTexSubImage2D(target, level, x, y, width, height, format, source, srcOffset = 0, srcLength = 0) {
    if (typeof source === "number") return native.glCompressedTexSubImage2D(target, level, x, y, width, height, format, srcOffset, source);
    const data = bytes(source, srcOffset, srcLength);
    native.glCompressedTexSubImage2D(target, level, x, y, width, height, format, data.byteLength, data);
  }
  compressedTexImage3D(target, level, internalformat, width, height, depth, border, source, srcOffset = 0, srcLength = 0) {
    if (typeof source === "number") return native.glCompressedTexImage3D(target, level, internalformat, width, height, depth, border, srcOffset, source);
    const data = bytes(source, srcOffset, srcLength);
    native.glCompressedTexImage3D(target, level, internalformat, width, height, depth, border, data.byteLength, data);
  }
  compressedTexSubImage3D(target, level, x, y, z, width, height, depth, format, source, srcOffset = 0, srcLength = 0) {
    if (typeof source === "number") return native.glCompressedTexSubImage3D(target, level, x, y, z, width, height, depth, format, srcOffset, source);
    const data = bytes(source, srcOffset, srcLength);
    native.glCompressedTexSubImage3D(target, level, x, y, z, width, height, depth, format, data.byteLength, data);
  }
  getTexParameter(target, pname) {
    native.glGetTexParameteriv(target, pname, int1);
    return pname === C.TEXTURE_IMMUTABLE_FORMAT ? Boolean(int1[0]) : int1[0];
  }

  // ---- drawing and framebuffers ----
  drawBuffers(buffers) {
    native.glDrawBuffers(buffers.length, Uint32Array.from(buffers));
  }
  invalidateFramebuffer(target, attachments) {
    native.glInvalidateFramebuffer(target, attachments.length, Uint32Array.from(attachments));
  }
  invalidateSubFramebuffer(target, attachments, x, y, width, height) {
    native.glInvalidateSubFramebuffer(target, attachments.length, Uint32Array.from(attachments), x, y, width, height);
  }
  clearBufferfv(buffer, drawbuffer, values, srcOffset = 0) {
    native.glClearBufferfv(buffer, drawbuffer, Float32Array.from(values).subarray(srcOffset));
  }
  clearBufferiv(buffer, drawbuffer, values, srcOffset = 0) {
    native.glClearBufferiv(buffer, drawbuffer, Int32Array.from(values).subarray(srcOffset));
  }
  clearBufferuiv(buffer, drawbuffer, values, srcOffset = 0) {
    native.glClearBufferuiv(buffer, drawbuffer, Uint32Array.from(values).subarray(srcOffset));
  }
  readPixels(x, y, width, height, format, type, dst, dstOffset = 0) {
    native.glReadPixels(x, y, width, height, format, type, typeof dst === "number" || !dstOffset ? dst : dst.subarray(dstOffset));
  }
  vertexAttrib1fv(index, values) { native.glVertexAttrib1fv(index, Float32Array.from(values)); }
  vertexAttrib2fv(index, values) { native.glVertexAttrib2fv(index, Float32Array.from(values)); }
  vertexAttrib3fv(index, values) { native.glVertexAttrib3fv(index, Float32Array.from(values)); }
  vertexAttrib4fv(index, values) { native.glVertexAttrib4fv(index, Float32Array.from(values)); }
  vertexAttribI4iv(index, values) { native.glVertexAttribI4iv(index, Int32Array.from(values)); }
  vertexAttribI4uiv(index, values) { native.glVertexAttribI4uiv(index, Uint32Array.from(values)); }

  // ---- queries ----
  getFramebufferAttachmentParameter(target, attachment, pname) {
    native.glGetFramebufferAttachmentParameteriv(target, attachment, pname, int1);
    if (pname !== C.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME) return int1[0];
    const id = int1[0];
    native.glGetFramebufferAttachmentParameteriv(target, attachment, C.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE, int1);
    return this.#lookup(int1[0] === C.TEXTURE ? "texture" : "renderbuffer", id);
  }
  getRenderbufferParameter(target, pname) {
    native.glGetRenderbufferParameteriv(target, pname, int1);
    return int1[0];
  }
  getInternalformatParameter(target, internalformat, pname) {
    native.glGetInternalformativ(target, internalformat, C.NUM_SAMPLE_COUNTS, 1, int1);
    const values = new Int32Array(int1[0]);
    native.glGetInternalformativ(target, internalformat, pname, values.length, values);
    return values;
  }
  getVertexAttrib(index, pname) {
    if (pname === C.CURRENT_VERTEX_ATTRIB) {
      const values = new Float32Array(4);
      native.glGetVertexAttribfv(index, pname, values);
      return values;
    }
    native.glGetVertexAttribiv(index, pname, int1);
    if (pname === C.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING) return this.#lookup("buffer", int1[0]);
    const isBoolean = pname === C.VERTEX_ATTRIB_ARRAY_ENABLED || pname === C.VERTEX_ATTRIB_ARRAY_NORMALIZED || pname === C.VERTEX_ATTRIB_ARRAY_INTEGER;
    return isBoolean ? Boolean(int1[0]) : int1[0];
  }
  getVertexAttribOffset(index, pname) {
    native.glGetVertexAttribiv(index, pname, int1);
    return int1[0];
  }
  getIndexedParameter(target, index) {
    const value = new BigInt64Array(1);
    native.glGetInteger64i_v(target, index, value);
    const isBinding = target === C.UNIFORM_BUFFER_BINDING || target === C.TRANSFORM_FEEDBACK_BUFFER_BINDING;
    return isBinding ? this.#lookup("buffer", Number(value[0])) : Number(value[0]);
  }
  getQuery(target, pname) {
    native.glGetQueryiv(target, pname, int1);
    return this.#lookup("query", int1[0]);
  }
  getQueryParameter(query, pname) {
    native.glGetQueryObjectuiv(query._id, pname, uint1);
    return pname === C.QUERY_RESULT_AVAILABLE ? Boolean(uint1[0]) : uint1[0];
  }
  getSamplerParameter(sampler, pname) {
    native.glGetSamplerParameteriv(sampler._id, pname, int1);
    return int1[0];
  }
  getSyncParameter(sync, pname) {
    native.glGetSynciv(sync._id, pname, 1, null, int1);
    return int1[0];
  }
  getParameter(pname) {
    switch (pname) {
      case C.VERSION: return "WebGL 2.0 (OpenGL ES 3.0 ANGLE)";
      case C.SHADING_LANGUAGE_VERSION: return "WebGL GLSL ES 3.00 (OpenGL ES GLSL ES 3.0 ANGLE)";
      case C.VENDOR: return "WebKit";
      case C.RENDERER: return "WebKit WebGL";
      case C.UNMASKED_VENDOR_WEBGL: return native.glGetString(C.VENDOR);
      case C.UNMASKED_RENDERER_WEBGL: return native.glGetString(C.RENDERER);
      case C.UNPACK_FLIP_Y_WEBGL: return this.#flipY;
      case C.UNPACK_PREMULTIPLY_ALPHA_WEBGL: return this.#premultiplyAlpha;
    }
    if (BINDINGS[pname]) {
      native.glGetIntegerv(pname, int1);
      return this.#lookup(BINDINGS[pname], int1[0]);
    }
    if (ARRAYS[pname]) {
      const [Type, length] = ARRAYS[pname];
      const values = new Type(length);
      (Type === Float32Array ? native.glGetFloatv : native.glGetIntegerv)(pname, values);
      return values;
    }
    if (pname === C.COLOR_WRITEMASK) {
      const values = new Uint8Array(4);
      native.glGetBooleanv(pname, values);
      return Array.from(values, Boolean);
    }
    if (BOOLEANS.has(pname)) {
      const value = new Uint8Array(1);
      native.glGetBooleanv(pname, value);
      return Boolean(value[0]);
    }
    if (FLOATS.has(pname)) {
      const value = new Float32Array(1);
      native.glGetFloatv(pname, value);
      return value[0];
    }
    if (INT64.has(pname)) {
      const value = new BigInt64Array(1);
      native.glGetInteger64v(pname, value);
      return Number(value[0]);
    }
    native.glGetIntegerv(pname, int1);
    return int1[0];
  }
}

// Every WebGL constant on the prototype, and every remaining OpenGL ES entry point whose arguments are
// numbers, strings or WebGL objects as a generic method: glBlendFunc -> blendFunc.
Object.assign(WebGL2RenderingContext.prototype, C);
const RENAMES = { glClearDepthf: "clearDepth", glDepthRangef: "depthRange" };
for (const [name, fn] of Object.entries(native)) {
  if (!name.startsWith("gl")) continue;
  const method = RENAMES[name] ?? name[2].toLowerCase() + name.slice(3);
  if (Object.hasOwn(WebGL2RenderingContext.prototype, method)) continue;
  // WebGL: uniform*() with a null location is a no-op (location 0 is a real uniform).
  const takesLocation = /^uniform[1-4](f|i|ui)$/.test(method);
  WebGL2RenderingContext.prototype[method] = function (...args) {
    if (takesLocation && args[0] == null) return;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === null) args[i] = 0;
      else if (arg instanceof WebGLObject) args[i] = arg._id;
    }
    return fn(...args);
  };
}
