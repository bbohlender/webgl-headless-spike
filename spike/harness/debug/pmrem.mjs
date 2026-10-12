// Checks the pieces of PMREM generation one by one: half-float targets, cube rendering, PMREM output.
import { createCanvas, installGlobals } from "../env.js";

installGlobals();
const THREE = await import("three");
const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
const canvas = createCanvas(64, 64, { libDir: process.env.ANGLE_DIR });
const gl = canvas.getContext("webgl2");
const renderer = new THREE.WebGLRenderer({ canvas, context: gl });
const half = (arr) => [...arr].map(THREE.DataUtils.fromHalfFloat);
const max = (arr) => half(arr).reduce((m, v) => Math.max(m, v), 0);

const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
renderer.setRenderTarget(rt);
renderer.setClearColor(0x336699, 1);
renderer.clear();
const hb = new Uint16Array(4 * 4 * 4);
renderer.readRenderTargetPixels(rt, 0, 0, 4, 4, hb);
console.log("half-float clear ->", half(hb.slice(0, 4)).map((v) => v.toFixed(3)));

const cubeRT = new THREE.WebGLCubeRenderTarget(16, { type: THREE.HalfFloatType });
const cam = new THREE.CubeCamera(0.1, 100, cubeRT);
renderer.setRenderTarget(null);
cam.update(renderer, new RoomEnvironment());
const cb = new Uint16Array(16 * 16 * 4);
for (let f = 0; f < 6; f++) {
  renderer.readRenderTargetPixels(cubeRT, 0, 0, 16, 16, cb, f);
  console.log("cube face", f, "max", max(cb).toFixed(3));
}

const pmrem = new THREE.PMREMGenerator(renderer);
const prt = pmrem.fromScene(new RoomEnvironment(), 0.04);
const pb = new Uint16Array(prt.width * prt.height * 4);
renderer.readRenderTargetPixels(prt, 0, 0, prt.width, prt.height, pb);
console.log("pmrem", prt.width, prt.height, "max", max(pb).toFixed(3), "glError", gl.getError());
gl.destroy(true);
