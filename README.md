# @drawcall/webgl

Headless WebGL2 for Node.js that renders three.js scenes on any machine, including small VMs without a GPU, with nothing to install beyond `npm install`. Rendering runs on the CPU through ANGLE and Mesa's lavapipe, the same WebGL implementation Chrome is built on, so images match Chrome's.

```sh
npm install @drawcall/webgl three
```

```js
import * as THREE from "three";
import { createCanvas, installGlobals } from "@drawcall/webgl";

installGlobals(); // createImageBitmap & co. for three.js loaders
const canvas = createCanvas(1280, 720);
const renderer = new THREE.WebGLRenderer({ canvas });
renderer.render(scene, camera);
const pixels = canvas.readPixels(); // RGBA, top row first
```

Supports macOS (arm64, x64), Windows (x64) and Linux (x64, arm64, glibc 2.28+). See [skills/webgl](skills/webgl/SKILL.md) for details.
