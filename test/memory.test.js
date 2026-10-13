import assert from "node:assert/strict";
import { test } from "node:test";
import { openScene } from "./render.js";

// Rendering the same frame repeatedly must not grow memory: a per-frame leak anywhere in the stack
// shows up here. (Without waiting for frames, ANGLE could not recycle descriptor sets, which lavapipe
// backs with one heap allocation each, and memory grew by about 1 MB per frame.)
test("memory stays flat over 150 frames", async () => {
  const view = await openScene("soldier");
  const rssMB = () => process.memoryUsage().rss / 1048576;
  let growth;
  try {
    for (let i = 0; i < 30; i++) view.render();
    const before = rssMB();
    for (let i = 0; i < 120; i++) view.render();
    growth = rssMB() - before;
  } finally {
    view.close();
  }
  assert.ok(growth < 40, `memory grew by ${growth.toFixed(0)} MB over 120 frames`);
});
