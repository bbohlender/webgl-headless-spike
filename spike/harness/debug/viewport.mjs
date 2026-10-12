import { createCanvas, installGlobals } from "../env.js";
installGlobals();
const THREE = await import("three");
const canvas = createCanvas(64, 64, { libDir: process.env.ANGLE_DIR });
const gl = canvas.getContext("webgl2");
const renderer = new THREE.WebGLRenderer({ canvas, context: gl });
const scene = new THREE.Scene();
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: 0xff0000 })));
const cam = new THREE.PerspectiveCamera(90, 1, 0.1, 100); cam.position.z = 1;
for (const [label, setup] of [
  ["full", (rt) => {}],
  ["viewport+scissor", (rt) => { rt.viewport.set(0, 0, 32, 32); rt.scissor.set(0, 0, 32, 32); rt.scissorTest = true; }],
]) {
  for (const type of [THREE.UnsignedByteType, THREE.HalfFloatType]) {
    const rt = new THREE.WebGLRenderTarget(64, 64, { type, depthBuffer: false });
    setup(rt);
    renderer.setRenderTarget(rt); renderer.autoClear = false; renderer.render(scene, cam);
    const buf = type === THREE.UnsignedByteType ? new Uint8Array(4) : new Uint16Array(4);
    renderer.readRenderTargetPixels(rt, 4, 4, 1, 1, buf);
    console.log(label, type === THREE.UnsignedByteType ? "u8" : "f16", [...buf], "vp", [...gl.getParameter(gl.VIEWPORT)], "sc", [...gl.getParameter(gl.SCISSOR_BOX)], gl.getParameter(gl.SCISSOR_TEST), "err", gl.getError());
  }
}
