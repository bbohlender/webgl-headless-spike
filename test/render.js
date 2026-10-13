// Renders the test scenes through the public API, the way a user would.
import * as THREE from "three";
import { createCanvas, installGlobals } from "../src/index.js";
import { decodeModels, loadBytes } from "./models.js";
import { buildScene, HEIGHT, rendererOptions, WIDTH } from "./scenes.js";

// A scene ready to render: { canvas, renderer, render(), close() }, where render() draws one
// frame and returns its pixels (RGBA, top row first) via canvas.readPixels. close() releases it.
export async function openScene(name) {
  await decodeModels();
  installGlobals();
  const options = rendererOptions(name);
  const canvas = createCanvas(WIDTH, HEIGHT);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: options.antialias, alpha: options.alpha });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = options.shadows;
  const { scene, camera } = await buildScene(name, renderer, loadBytes, WIDTH / HEIGHT);
  const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
  return {
    canvas,
    renderer,
    render() {
      renderer.render(scene, camera);
      return canvas.readPixels(pixels);
    },
    close() {
      try {
        renderer.dispose();
      } finally {
        canvas.destroy();
      }
    },
  };
}

// Renders `frames` frames and returns the last frame's pixels with timings in milliseconds: setup
// (context + scene) and frames (each frame's render and readback; the first includes shader compiles).
export async function renderScene(name, { frames = 1 } = {}) {
  const start = performance.now();
  const view = await openScene(name);
  try {
    const setupMs = performance.now() - start;
    const frameMs = [];
    let pixels;
    for (let i = 0; i < frames; i++) {
      const frameStart = performance.now();
      pixels = view.render();
      frameMs.push(performance.now() - frameStart);
    }
    return { pixels, glError: view.renderer.getContext().getError(), setupMs, frameMs };
  } finally {
    view.close();
  }
}
