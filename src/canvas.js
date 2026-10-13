import { WebGL2RenderingContext } from "./context.js";
import { native } from "./native.js";

// A canvas with one WebGL2 context. Only one context can exist per process at a time.
export class Canvas {
  #width;
  #height;
  #context = null;
  style = {};

  constructor(width, height) {
    this.#width = width;
    this.#height = height;
  }

  get width() {
    return this.#width;
  }
  set width(value) {
    this.#resize(value, this.#height);
  }
  get height() {
    return this.#height;
  }
  set height(value) {
    this.#resize(this.#width, value);
  }
  #resize(width, height) {
    if (width === this.#width && height === this.#height) return;
    this.#width = width;
    this.#height = height;
    if (this.#context) native.resize(width, height);
  }

  getContext(type, attributes) {
    if (type !== "webgl2") return null;
    this.#context ??= new WebGL2RenderingContext(this, attributes);
    return this.#context;
  }

  // The rendered frame as RGBA8, top row first, written into out (allocated when omitted). It waits
  // for the frame to finish, which also lets the driver recycle per-frame resources: render loops that
  // never wait for a frame grow memory with every frame.
  readPixels(out = new Uint8Array(this.#width * this.#height * 4)) {
    if (!this.#context) throw new Error("readPixels needs a context; call getContext('webgl2') first");
    if (out.byteLength !== this.#width * this.#height * 4) throw new RangeError(`readPixels needs ${this.#width * this.#height * 4} bytes`);
    native.readFrame(out);
    return out;
  }

  // Releases the context so another canvas can create one.
  destroy() {
    native.destroyContext();
    this.#context = null;
  }

  // three.js registers context-loss listeners; a headless context is never lost.
  addEventListener() {}
  removeEventListener() {}
}

export function createCanvas(width, height) {
  return new Canvas(width, height);
}
