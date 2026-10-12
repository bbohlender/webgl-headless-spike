// Stability: (1) renders N frames of one scene in one process, (2) creates, renders and destroys
// the context + renderer M times. Prints RSS along the way; a leak shows up as steady growth.
//   ANGLE_DIR=... node stress.mjs [scene=soldier] [frames=100] [cycles=50]
import { readFile } from "node:fs/promises";
import { createCanvas, installGlobals, readCanvas } from "./env.js";

installGlobals();
const THREE = await import("three");
const { buildScene, rendererOptions } = await import("./scenes.js");
const [name = "soldier", frames = "100", cycles = "50"] = process.argv.slice(2);
const [width, height] = [640, 360];
const rssMB = () => { const m = process.memoryUsage(); return `${Math.round(m.rss / 1048576)} heap=${Math.round(m.heapUsed / 1048576)} ext=${Math.round(m.external / 1048576)}`; };
const loadBytes = (p) => readFile(new URL(p, import.meta.url)).then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

async function session(renderFrames) {
  const opts = rendererOptions(name);
  const canvas = createCanvas(width, height, { libDir: process.env.ANGLE_DIR, driver: process.env.DRIVER ?? "lavapipe", alpha: opts.alpha, depth: true });
  const gl = canvas.getContext("webgl2");
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: false, alpha: opts.alpha });
  renderer.setSize(width, height, false);
  renderer.shadowMap.enabled = opts.shadows;
  const { scene, camera } = await buildScene(name, renderer, loadBytes, width / height);
  for (let i = 0; i < renderFrames; i++) {
    scene.rotation.y = i * 0.01;
    renderer.render(scene, camera);
    readCanvas(gl);
    if (renderFrames > 1 && i % 20 === 0) console.log(JSON.stringify({ phase: "frames", frame: i, rssMB: rssMB() }));
  }
  if (gl.getError()) throw new Error(`GL error ${gl.getError()}`);
  scene.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [o.material].flat()) if (m) { for (const v of Object.values(m)) if (v?.isTexture) { v.source?.data?.close?.(); v.dispose(); } m.dispose(); }
  });
  scene.environment?.dispose();
  renderer.dispose();
  gl.destroy(process.env.TERMINATE !== "0");
}

const t = performance.now();
await session(Number(frames));
console.log(JSON.stringify({ phase: "frames-done", frames: Number(frames), msPerFrame: Math.round((performance.now() - t) / Number(frames)), rssMB: rssMB() }));
for (let c = 0; c < Number(cycles); c++) {
  await session(1);
  globalThis.gc?.();
  if (c % 10 === 0 || c === Number(cycles) - 1) console.log(JSON.stringify({ phase: "cycles", cycle: c, rssMB: rssMB() }));
}
console.log(JSON.stringify({ phase: "done", rssMB: rssMB() }));
