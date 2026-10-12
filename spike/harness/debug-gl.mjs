// Wraps every WebGL2RenderingContext method to report the first GL error and its call site.
import { WebGL2RenderingContext } from "./webgl2.js";
const proto = WebGL2RenderingContext.prototype;
const seen = new Set();
for (const name of Object.getOwnPropertyNames(proto)) {
  const d = Object.getOwnPropertyDescriptor(proto, name);
  if (typeof d.value !== "function" || name === "getError" || name === "constructor" || name.startsWith("_")) continue;
  const fn = d.value;
  proto[name] = function (...args) {
    const r = fn.apply(this, args);
    const e = fn === proto.getError ? 0 : this.__getError();
    if (e && seen.size < 15) {
      const key = name + e;
      if (!seen.has(key)) { seen.add(key); console.error(`GL error 0x${e.toString(16)} in ${name}(${args.map((a) => (a && typeof a === "object" ? a.constructor.name : String(a))).join(", ")})`); }
    }
    return r;
  };
}
proto.__getError = proto.getError;
proto.getError = () => 0;
