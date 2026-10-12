// Reads the PMREM cubeUV target after each internal stage.
import { createCanvas, installGlobals } from "../env.js";
installGlobals();
const THREE = await import("three");
const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
const canvas = createCanvas(64, 64, { libDir: process.env.ANGLE_DIR });
const gl = canvas.getContext("webgl2");
const renderer = new THREE.WebGLRenderer({ canvas, context: gl });
const pmrem = new THREE.PMREMGenerator(renderer);
function stat(label, rt) {
  const pb = new Uint16Array(rt.width * rt.height * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, pb);
  let m = 0, nz = 0;
  for (let i = 0; i < pb.length; i += 4) { const r = THREE.DataUtils.fromHalfFloat(pb[i]); m = Math.max(m, r); if (r > 0) nz++; }
  console.log(label, "red max", m.toFixed(3), "nonzero px", nz, "glError", gl.getError());
}
for (const name of ["_sceneToCubeUV", "_blur", "_applyPMREM"]) {
  const orig = pmrem[name].bind(pmrem);
  pmrem[name] = (...args) => { const r = orig(...args); const rt = args.find((a) => a && a.isWebGLRenderTarget); stat("after " + name, rt); return r; };
}
pmrem.fromScene(new RoomEnvironment(), 0.04);
