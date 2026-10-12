// Minimal browser surface three.js needs in Node: a canvas whose size drives the WebGL2
// default framebuffer, ImageBitmap/createImageBitmap backed by sharp, and requestAnimationFrame.
import sharp from "sharp";
import { WebGL2RenderingContext } from "./webgl2.js";

export class ImageBitmap {
  constructor(width, height, data) {
    this.width = width;
    this.height = height;
    this.data = data; // RGBA8, top row first
  }
  close() {
    this.data = null;
  }
}

async function createImageBitmap(source, options = {}) {
  const bytes = Buffer.from(await source.arrayBuffer());
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const out = options.imageOrientation === "flipY" ? flipRows(px, info.width * 4, info.height) : px;
  return new ImageBitmap(info.width, info.height, out);
}

function flipRows(px, rowBytes, height) {
  const out = new Uint8Array(px.length);
  for (let y = 0; y < height; y++) out.set(px.subarray(y * rowBytes, (y + 1) * rowBytes), (height - 1 - y) * rowBytes);
  return out;
}

export function installGlobals() {
  globalThis.ImageBitmap = ImageBitmap;
  globalThis.createImageBitmap = createImageBitmap;
  globalThis.self ??= globalThis;
  globalThis.requestAnimationFrame ??= (cb) => setTimeout(() => cb(performance.now()), 0);
  globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id);
}

// A canvas stand-in; assigning width/height resizes the context's default framebuffer.
export function createCanvas(width, height, contextOptions) {
  let gl = null;
  const canvas = {
    style: {},
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: canvas.width, height: canvas.height }),
    get clientWidth() {
      return canvas.width;
    },
    get clientHeight() {
      return canvas.height;
    },
    getContext(kind) {
      if (kind !== "webgl2") return null;
      gl ??= new WebGL2RenderingContext(canvas, { width, height, ...contextOptions });
      return gl;
    },
  };
  let w = width;
  let h = height;
  Object.defineProperty(canvas, "width", {
    get: () => w,
    set: (v) => {
      w = v | 0;
      gl?._resize(w, h);
    },
  });
  Object.defineProperty(canvas, "height", {
    get: () => h,
    set: (v) => {
      h = v | 0;
      gl?._resize(w, h);
    },
  });
  return canvas;
}

// Reads the default framebuffer as top-row-first RGBA8.
export function readCanvas(gl) {
  const { drawingBufferWidth: w, drawingBufferHeight: h } = gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return flipRows(px, w * 4, h);
}
