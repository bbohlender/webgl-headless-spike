// Turns dist/<platform>-<arch> (ANGLE, lavapipe and the addon) into the npm package
// @drawcall/webgl-<platform>-<arch>: writes the Vulkan driver manifest and package.json.
//   node deps/package.js dist/<platform>-<arch>
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const dir = process.argv[2];
const [platform, arch] = basename(dir).split("-");
const driver = readdirSync(dir).find((file) => /^(lib)?vulkan_lvp\.(dll|so|dylib)$/.test(file));
if (!driver) throw new Error(`no lavapipe library in ${dir}`);
// The Vulkan loader resolves a relative library_path against the manifest's directory.
const libraryPath = platform === "win32" ? `.\\${driver}` : `./${driver}`;
writeFileSync(join(dir, "lvp_icd.json"), JSON.stringify({ file_format_version: "1.0.1", ICD: { library_path: libraryPath, api_version: "1.4.0" } }));
const root = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const manifest = {
  name: `@drawcall/webgl-${platform}-${arch}`,
  version: root.version,
  description: `Native part of @drawcall/webgl for ${platform}-${arch}: the addon, ANGLE and Mesa lavapipe`,
  license: root.license,
  repository: root.repository,
  os: [platform],
  cpu: [arch],
};
writeFileSync(join(dir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${manifest.name}: ${readdirSync(dir).join(" ")}`);
