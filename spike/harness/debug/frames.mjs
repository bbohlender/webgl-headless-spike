// Per-frame times after the first frame (DRIVER env selects the bundled driver).
import { readFile } from "node:fs/promises";
import { createCanvas, installGlobals, readCanvas } from "../env.js";
installGlobals();
const THREE = await import("three");
const { buildScene, rendererOptions } = await import("../scenes.js");
const [name = "tokyo", n = "8"] = process.argv.slice(2);
const opts = rendererOptions(name);
const canvas = createCanvas(1280, 720, { libDir: process.env.ANGLE_DIR, driver: process.env.DRIVER, alpha: opts.alpha });
const gl = canvas.getContext("webgl2");
const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: false, alpha: opts.alpha, preserveDrawingBuffer: true });
renderer.setSize(1280, 720, false);
renderer.shadowMap.enabled = opts.shadows;
const { scene, camera } = await buildScene(name, renderer, (p) => readFile(new URL("../" + p, import.meta.url)).then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), 16 / 9);
const times = [];
for (let i = 0; i < Number(n); i++) {
  const t = performance.now();
  renderer.render(scene, camera);
  readCanvas(gl);
  times.push(Math.round(performance.now() - t));
}
console.log(process.env.DRIVER, name, "frame ms:", times.join(" "), "| draw calls", renderer.info.render.calls, "programs", renderer.info.programs.length);
gl.destroy(true);
