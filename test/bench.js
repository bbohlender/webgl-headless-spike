// Benchmark: each run is a fresh process rendering one scene for 8 frames. "cold" empties the shader
// cache first, "warm" reuses it. Prints one JSON line per run with milliseconds for setup (context +
// scene), the first frame (including shader compiles) and a steady frame (median of the last three:
// the frames right after the first can still compile shader variants), and the peak resident memory.
//   node test/bench.js [runs=3] [scene...]
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCENES } from "./scenes.js";

const self = fileURLToPath(import.meta.url);

if (process.argv[2] === "--run") {
  const { renderScene } = await import("./render.js");
  const scene = process.argv[3];
  const { glError, setupMs, frameMs } = await renderScene(scene, { frames: 8 });
  const steadyMs = frameMs.slice(-3).sort((a, b) => a - b)[1];
  const peakMB = Math.round(process.resourceUsage().maxRSS / 1024);
  console.log(JSON.stringify({ scene, setupMs: Math.round(setupMs), firstMs: Math.round(frameMs[0]), steadyMs: Math.round(steadyMs), peakMB, glError }));
} else {
  const runs = Number(process.argv[2] ?? 3);
  const scenes = process.argv.length > 3 ? process.argv.slice(3) : ["empty", ...SCENES];
  const cache = join(tmpdir(), "drawcall-webgl-bench-cache");
  const env = { ...process.env, MESA_SHADER_CACHE_DIR: cache };
  for (const scene of scenes) {
    for (const kind of ["cold", "warm"]) {
      for (let run = 0; run < runs; run++) {
        if (kind === "cold") rmSync(cache, { recursive: true, force: true });
        const output = execFileSync(process.execPath, [self, "--run", scene], { env, encoding: "utf8" });
        console.log(JSON.stringify({ kind, run, cores: availableParallelism(), ...JSON.parse(output.trim().split("\n").pop()) }));
      }
    }
  }
}
