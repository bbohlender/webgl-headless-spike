// Cold/warm benchmark: each run is a fresh `node render.mjs` process.
// cold = shader cache directory emptied first; warm = cache left from the previous run.
//   CACHE_DIR=/tmp/cache [BACKEND=vulkan] node bench-scenes.mjs [runs=3] [scene...]
// Needs ANGLE_DIR (and VK_ICD_FILENAMES for lavapipe) in the environment. Prints one JSON line per run.
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { SCENES } from "./scenes.js";

const runs = Number(process.argv[2] ?? 3);
const scenes = process.argv.length > 3 ? process.argv.slice(3) : SCENES;
const cacheDir = process.env.CACHE_DIR;
const backend = process.env.BACKEND ?? "vulkan";
if (!cacheDir) throw new Error("set CACHE_DIR");
const env = { ...process.env, MESA_SHADER_CACHE_DIR: cacheDir };

for (const scene of scenes) {
  for (const kind of ["cold", "warm"]) {
    for (let i = 0; i < runs; i++) {
      if (kind === "cold") rmSync(cacheDir, { recursive: true, force: true });
      const out = execFileSync(process.execPath, ["render.mjs", scene, `out/${scene}-${backend}.png`, "--backend", backend], { env, cwd: import.meta.dirname, encoding: "utf8" });
      const result = JSON.parse(out.trim().split("\n").pop());
      console.log(JSON.stringify({ kind, run: i, backend, ...result }));
    }
  }
}
