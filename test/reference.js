// Regenerates reference/<scene>.png: the scenes rendered by headless Google Chrome with SwiftShader,
// Chrome's software WebGL, through the identical scenes.js code. Chrome's SwiftShader output was
// identical on macOS arm64, macOS x64 and Linux x64, so one set serves every platform.
//   node test/reference.js [scene...]    (needs Google Chrome installed)
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname } from "node:path";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { decodeModels } from "./models.js";
import { HEIGHT, SCENES, WIDTH } from "./scenes.js";

const ROOT = new URL("../", import.meta.url);
const scenes = process.argv.length > 2 ? process.argv.slice(2) : SCENES;

const PAGE = `<!doctype html><html><body>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from "three";
import { buildScene, rendererOptions } from "/test/scenes.js";
window.renderScene = async (name, width, height) => {
  const options = rendererOptions(name);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: options.antialias, alpha: options.alpha, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = options.shadows;
  const { scene, camera } = await buildScene(name, renderer, (path) => fetch("/test/" + path).then((r) => r.arrayBuffer()), width / height);
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return Array.from(pixels);
};
window.ready = true;
</script></body></html>`;

const TYPES = { ".js": "text/javascript", ".glb": "model/gltf-binary" };
const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  if (path === "/") return response.writeHead(200, { "content-type": "text/html" }).end(PAGE);
  try {
    const body = await readFile(new URL(path.slice(1), ROOT));
    response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }).end(body);
  } catch {
    response.writeHead(404).end();
  }
});

await decodeModels();
await new Promise((resolve) => server.listen(0, resolve));
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  for (const name of scenes) {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${server.address().port}/`);
    await page.waitForFunction(() => window.ready);
    const pixels = Buffer.from(await page.evaluate(([n, w, h]) => window.renderScene(n, w, h), [name, WIDTH, HEIGHT]));
    // readPixels returns the bottom row first.
    await sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).flip().png().toFile(new URL(`reference/${name}.png`, import.meta.url).pathname);
    console.log(`wrote reference/${name}.png`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
