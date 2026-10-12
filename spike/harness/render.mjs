// Renders one scene headlessly to PNG and prints a JSON line with timings and peak memory.
//   ANGLE_DIR=<dir with libEGL/libGLESv2> VK_ICD_FILENAMES=<lavapipe icd json> \
//   node render.mjs <pbr|soldier|tokyo> [out.png] [--width 1280 --height 720 --frames 1 --backend vulkan]
// "cold" = process start until the first frame's pixels are read back.
const t0 = performance.now();
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { createCanvas, installGlobals, readCanvas } from "./env.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    width: { type: "string", default: "1280" },
    height: { type: "string", default: "720" },
    frames: { type: "string", default: "1" },
    backend: { type: "string", default: "vulkan" },
  },
});
const [name, out] = positionals;
const width = Number(values.width);
const height = Number(values.height);
const libDir = process.env.ANGLE_DIR;
if (!name || !libDir) {
  console.error("usage: ANGLE_DIR=... node render.mjs <scene> [out.png]");
  process.exit(2);
}

installGlobals();
const THREE = await import("three");
const { buildScene, rendererOptions } = await import("./scenes.js");
const tImport = performance.now();

const opts = rendererOptions(name);
const canvas = createCanvas(width, height, { libDir, backend: values.backend, alpha: opts.alpha, antialias: opts.antialias, preserveDrawingBuffer: opts.preserveDrawingBuffer, depth: true, stencil: false });
const gl = canvas.getContext("webgl2");
const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: opts.antialias, alpha: opts.alpha, preserveDrawingBuffer: opts.preserveDrawingBuffer });
renderer.setPixelRatio(1);
renderer.setSize(width, height, false);
renderer.shadowMap.enabled = opts.shadows;
const tContext = performance.now();

const { scene, camera } = await buildScene(name, renderer, (path) => readFile(new URL(path, import.meta.url)).then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), width / height);
const tScene = performance.now();

renderer.render(scene, camera);
const pixels = readCanvas(gl);
const tFirst = performance.now();

let frameMs = 0;
const frames = Number(values.frames);
if (frames > 1) {
  const s = performance.now();
  for (let i = 1; i < frames; i++) {
    renderer.render(scene, camera);
    readCanvas(gl);
  }
  frameMs = (performance.now() - s) / (frames - 1);
}

const glError = gl.getError();
if (out) await sharp(Buffer.from(pixels.buffer), { raw: { width, height, channels: 4 } }).png().toFile(out);
const info = renderer.info;
console.log(JSON.stringify({
  scene: name,
  renderer: gl.getParameter(gl.UNMASKED_RENDERER_WEBGL),
  coldMs: Math.round(tFirst - t0),
  importMs: Math.round(tImport - t0),
  contextMs: Math.round(tContext - tImport),
  sceneMs: Math.round(tScene - tContext),
  firstFrameMs: Math.round(tFirst - tScene),
  warmFrameMs: frames > 1 ? Math.round(frameMs) : undefined,
  programs: info.programs?.length,
  triangles: info.render.triangles,
  glError,
  peakRssMB: Math.round(process.resourceUsage().maxRSS / 1024),
}));
renderer.dispose();
gl.destroy(true);
