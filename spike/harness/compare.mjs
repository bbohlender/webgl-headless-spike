// Compares two PNGs: share of pixels pixelmatch flags (default threshold 0.1, anti-aliasing
// detection on), share of pixels with any channel differing, and the largest channel delta.
//   node compare.mjs a.png b.png [diff.png]
import pixelmatch from "pixelmatch";
import sharp from "sharp";

const [a, b, diffPath] = process.argv.slice(2);
const load = async (p) => sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const [A, B] = await Promise.all([load(a), load(b)]);
const { width, height } = A.info;
if (width !== B.info.width || height !== B.info.height) throw new Error("size mismatch");
const diff = Buffer.alloc(width * height * 4);
const flagged = pixelmatch(A.data, B.data, diff, width, height, { threshold: 0.1 });
let anyDiff = 0, maxDelta = 0;
for (let i = 0; i < A.data.length; i += 4) {
  let d = 0;
  for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.data[i + c] - B.data[i + c]));
  if (d) anyDiff++;
  maxDelta = Math.max(maxDelta, d);
}
if (diffPath) await sharp(diff, { raw: { width, height, channels: 4 } }).png().toFile(diffPath);
const total = width * height;
console.log(JSON.stringify({ a, b, flaggedPct: +(100 * flagged / total).toFixed(3), anyDiffPct: +(100 * anyDiff / total).toFixed(2), maxDelta }));
