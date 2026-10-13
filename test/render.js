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
// (context + scene), first (first frame incl. shader compiles) and steady (mean of later frames).
export async function renderScene(name, { frames = 1 } = {}) {
  const start = performance.now();
  const view = await openScene(name);
  try {
    const setup = performance.now();
    let pixels = view.render();
    const first = performance.now();
    for (let i = 1; i < frames; i++) pixels = view.render();
    const end = performance.now();
    return {
      pixels,
      glError: view.renderer.getContext().getError(),
      setupMs: setup - start,
      firstMs: first - setup,
      steadyMs: frames > 1 ? (end - first) / (frames - 1) : undefined,
    };
  } finally {
    view.close();
  }
}
