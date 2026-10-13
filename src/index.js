import { createImageBitmap, ImageBitmap } from "./image.js";

class ProgressEvent extends Event {
  constructor(type, { lengthComputable = false, loaded = 0, total = 0 } = {}) {
    super(type);
    Object.assign(this, { lengthComputable, loaded, total });
  }
}

export { Canvas, createCanvas } from "./canvas.js";
export { WebGL2RenderingContext } from "./context.js";
export { createImageBitmap, ImageBitmap };

// The browser globals three.js uses: loaders decode textures with createImageBitmap, check for
// ImageBitmap, reach other globals through self, and FileLoader reports download progress with
// ProgressEvent; the renderer's animation loop uses requestAnimationFrame, which runs on the next tick
// since there is no display to sync to.
export function installGlobals() {
  globalThis.self ??= globalThis;
  globalThis.ProgressEvent ??= ProgressEvent;
  globalThis.requestAnimationFrame ??= (callback) => setTimeout(() => callback(performance.now()));
  globalThis.cancelAnimationFrame ??= (handle) => clearTimeout(handle);
  globalThis.createImageBitmap = createImageBitmap;
  globalThis.ImageBitmap = ImageBitmap;
}
