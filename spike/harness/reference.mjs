// Renders the same scenes in the installed Google Chrome (headless) as the pixel reference.
//   node reference.mjs [swiftshader|gpu] [scene...]
// Writes out/<scene>-chrome-<mode>.png using the identical scenes.js code and readback path.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { SCENES } from "./scenes.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const mode = process.argv[2] ?? "swiftshader";
const scenes = process.argv.length > 3 ? process.argv.slice(3) : SCENES;
const [width, height] = [1280, 720];

const PAGE = `<!doctype html><html><body style="margin:0">
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from "three";
import { buildScene, rendererOptions } from "/scenes.js";
window.renderScene = async (name, width, height) => {
  const opts = rendererOptions(name);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: opts.antialias, alpha: opts.alpha, preserveDrawingBuffer: opts.preserveDrawingBuffer });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.shadowMap.enabled = opts.shadows;
  const { scene, camera } = await buildScene(name, renderer, (p) => fetch("/" + p).then((r) => r.arrayBuffer()), width / height);
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const px = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let bin = ""; for (let i = 0; i < px.length; i += 0x8000) bin += String.fromCharCode(...px.subarray(i, i + 0x8000));
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  return { pixels: btoa(bin), renderer: gl.getParameter(info.UNMASKED_RENDERER_WEBGL) };
};
window.ready = true;
</script></body></html>`;

const TYPES = { ".js": "text/javascript", ".glb": "model/gltf-binary", ".html": "text/html" };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/") return res.writeHead(200, { "content-type": "text/html" }).end(PAGE);
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;

const args = mode === "swiftshader" ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--enable-gpu"];
const browser = await chromium.launch({ channel: "chrome", headless: true, args });
for (const name of scenes) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("console", (m) => m.type() === "error" && console.error(`[chrome] ${m.text()}`));
  await page.goto(url);
  await page.waitForFunction(() => window.ready);
  const t = Date.now();
  const { pixels, renderer } = await page.evaluate(([n, w, h]) => window.renderScene(n, w, h), [name, width, height]);
  const raw = Buffer.from(pixels, "base64");
  const flipped = Buffer.alloc(raw.length);
  for (let y = 0; y < height; y++) raw.copy(flipped, (height - 1 - y) * width * 4, y * width * 4, (y + 1) * width * 4);
  await sharp(flipped, { raw: { width, height, channels: 4 } }).png().toFile(`out/${name}-chrome-${mode}.png`);
  console.log(JSON.stringify({ scene: name, mode, renderer, ms: Date.now() - t }));
  await page.close();
}
await browser.close();
server.close();
