import { createImageBitmap, ImageBitmap } from "./image.js";

export { Canvas, createCanvas } from "./canvas.js";
export { WebGL2RenderingContext } from "./context.js";
export { createImageBitmap, ImageBitmap };

// The browser globals three.js uses: loaders decode textures with createImageBitmap, check for
// ImageBitmap and reach other globals through self; the renderer's animation loop uses
// requestAnimationFrame, which runs on the next tick since there is no display to sync to.
export function installGlobals() {
  globalThis.self ??= globalThis;
  globalThis.requestAnimationFrame ??= (callback) => setTimeout(() => callback(performance.now()));
  globalThis.cancelAnimationFrame ??= (handle) => clearTimeout(handle);
  globalThis.createImageBitmap = createImageBitmap;
  globalThis.ImageBitmap = ImageBitmap;
}
