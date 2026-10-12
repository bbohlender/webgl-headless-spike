// Cold/warm benchmark: each run is a fresh `node render.mjs` process.
// cold = cache directory emptied first; warm = cache left from the previous run.
// The cache directory holds Mesa's shader cache (mesa/) and ANGLE's blob cache (angle/, unless BLOB=0).
//   CACHE_DIR=/tmp/cache [DRIVERS=lavapipe,swiftshader] node bench-scenes.mjs [runs=3] [scene...]
// Needs ANGLE_DIR (the package directory) in the environment. Prints one JSON line per run;
// each run also renders 4 frames so warmFrameMs is the steady-state frame time.
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { BENCH_SCENES } from "./scenes.js";

const runs = Number(process.argv[2] ?? 3);
const scenes = process.argv.length > 3 ? process.argv.slice(3) : BENCH_SCENES;
const drivers = (process.env.DRIVERS ?? "lavapipe").split(",");
const cacheDir = process.env.CACHE_DIR;
const backend = process.env.BACKEND ?? "vulkan";
if (!cacheDir) throw new Error("set CACHE_DIR");
const env = { ...process.env, MESA_SHADER_CACHE_DIR: `${cacheDir}/mesa` };
if (process.env.BLOB !== "0") env.ANGLE_BLOB_CACHE_DIR = `${cacheDir}/angle`;

for (const driver of drivers) {
  for (const scene of scenes) {
    for (const kind of ["cold", "warm"]) {
      for (let i = 0; i < runs; i++) {
        if (kind === "cold") rmSync(cacheDir, { recursive: true, force: true });
        const args = ["render.mjs", scene, `out/${scene}-${driver}.png`, "--driver", driver, "--backend", backend, "--frames", "4"];
        const out = execFileSync(process.execPath, args, { env, cwd: import.meta.dirname, encoding: "utf8" });
        const result = JSON.parse(out.trim().split("\n").pop());
        console.log(JSON.stringify({ kind, run: i, backend, blob: process.env.BLOB !== "0", ...result }));
      }
    }
  }
}
