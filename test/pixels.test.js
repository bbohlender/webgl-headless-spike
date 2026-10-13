import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { test } from "node:test";
import pixelmatch from "pixelmatch";
import sharp from "sharp";
import { renderScene } from "./render.js";
import { HEIGHT, SCENES, WIDTH } from "./scenes.js";

// Each scene against Chrome's rendering of the same scene (reference/, regenerate with reference.js):
// at most 0.2% of the pixels may differ visibly (pixelmatch threshold 0.1).
for (const name of SCENES) {
  test(`${name} matches Chrome`, async () => {
    const { pixels, glError } = await renderScene(name);
    assert.equal(glError, 0);
    const reference = await sharp(new URL(`reference/${name}.png`, import.meta.url).pathname).ensureAlpha().raw().toBuffer();
    const share = pixelmatch(pixels, reference, null, WIDTH, HEIGHT, { threshold: 0.1 }) / (WIDTH * HEIGHT);
    if (share > 0.002) {
      mkdirSync(new URL("out/", import.meta.url), { recursive: true });
      await sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).png().toFile(new URL(`out/${name}.png`, import.meta.url).pathname);
    }
    assert.ok(share <= 0.002, `${(share * 100).toFixed(3)}% of the pixels differ from reference/${name}.png (output in out/)`);
  });
}
