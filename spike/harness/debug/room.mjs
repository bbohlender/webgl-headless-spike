import { createCanvas, installGlobals } from "../env.js";
installGlobals();
const THREE = await import("three");
const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
const canvas = createCanvas(64, 64, { libDir: process.env.ANGLE_DIR });
const gl = canvas.getContext("webgl2");
const renderer = new THREE.WebGLRenderer({ canvas, context: gl });
const room = new RoomEnvironment();
const cam = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
cam.up.set(0, 1, 0); cam.lookAt(1, 0, 0);
function test(label, w, h, vp, opts = {}) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, ...opts });
  if (vp) { rt.viewport.set(...vp); rt.scissor.set(...vp); rt.scissorTest = true; }
  renderer.autoClear = false;
  renderer.setRenderTarget(rt);
  renderer.render(room, cam);
  const n = vp ? vp[2] : w; const buf = new Uint16Array(n * n * 4);
  renderer.readRenderTargetPixels(rt, vp ? vp[0] : 0, vp ? vp[1] : 0, n, n, buf);
  let m = 0; for (let i = 0; i < buf.length; i += 4) m = Math.max(m, THREE.DataUtils.fromHalfFloat(buf[i]));
  console.log(label.padEnd(36), "red max", m.toFixed(2), "err", gl.getError());
}
test("256x256 full", 256, 256);
test("768x1024 full", 768, 1024);
test("768x1024 vp 0,0,256", 768, 1024, [0, 0, 256, 256]);
test("768x1024 vp 256,256,256", 768, 1024, [256, 256, 256, 256]);
