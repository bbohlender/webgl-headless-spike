// Context-only cycles (no three.js): isolates native leaks in ANGLE/lavapipe/addon.
import { createCanvas } from "../env.js";
const mb = (n) => Math.round(n / 1048576);
const terminate = process.env.TERMINATE !== "0";
for (let c = 0; c < 200; c++) {
  const canvas = createCanvas(640, 360, { libDir: process.env.ANGLE_DIR });
  const gl = canvas.getContext("webgl2");
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1024, 1024, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(1024 * 1024 * 4));
  gl.clearColor(1, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  gl.deleteTexture(tex);
  gl.destroy(terminate);
  globalThis.gc?.();
  if (c % 40 === 0 || c === 199) { const m = process.memoryUsage(); console.log(JSON.stringify({ cycle: c, rss: mb(m.rss), heap: mb(m.heapUsed), external: mb(m.external) })); }
}
