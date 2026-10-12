// Writes <dir>/lvp_icd.json pointing at the lavapipe library in the same directory (relative path).
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const lib = readdirSync(dir).find((f) => /^(lib)?vulkan_lvp\.(dll|so|dylib)$/.test(f));
if (!lib) throw new Error(`no lavapipe library in ${dir}`);
const libraryPath = process.platform === "win32" ? `.\\${lib}` : `./${lib}`;
writeFileSync(join(dir, "lvp_icd.json"), JSON.stringify({ file_format_version: "1.0.1", ICD: { library_path: libraryPath, api_version: "1.4.354" } }, null, 2));
console.log(`lvp_icd.json -> ${libraryPath}`);
