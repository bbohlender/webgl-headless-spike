// Loads the addon from the platform package (@drawcall/webgl-<platform>-<arch>), which also holds
// ANGLE and the lavapipe driver. DRAWCALL_WEBGL_NATIVE points at a local build directory instead.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const platformPackage = `@drawcall/webgl-${process.platform}-${process.arch}`;

function nativeDir() {
  if (process.env.DRAWCALL_WEBGL_NATIVE) return process.env.DRAWCALL_WEBGL_NATIVE;
  try {
    return dirname(require.resolve(`${platformPackage}/package.json`));
  } catch (cause) {
    throw new Error(`${platformPackage} is not installed; ${process.platform}-${process.arch} may be unsupported`, { cause });
  }
}

const dir = nativeDir();
export const native = require(join(dir, "webgl.node"));
native.load(dir);
