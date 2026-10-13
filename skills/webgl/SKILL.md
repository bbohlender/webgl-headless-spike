---
name: webgl
description: Render WebGL2 / three.js headlessly in Node.js with @drawcall/webgl, on CPU-only machines and VMs. Use when rendering three.js scenes or other WebGL2 content to pixels on a server, in CI, or anywhere without a browser or GPU.
---

# Rendering WebGL2 headlessly with @drawcall/webgl

`@drawcall/webgl` gives Node.js a `WebGL2RenderingContext` that renders on the CPU. three.js uses it like a browser canvas. It installs as one npm package plus a prebuilt native package for the platform; nothing else is needed on the machine.

## Render a three.js scene

```js
import * as THREE from "three";
import { createCanvas, installGlobals } from "@drawcall/webgl";

installGlobals();
const canvas = createCanvas(1280, 720);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1);

// ... build the scene and camera as in the browser ...

renderer.render(scene, camera);
const pixels = canvas.readPixels(); // Uint8Array, RGBA8, width * height * 4 bytes, top row first
```

- `installGlobals()` defines the browser globals three.js needs: `createImageBitmap` and `ImageBitmap` (image decoding for loaders such as `GLTFLoader`), `self`, `requestAnimationFrame` and `cancelAnimationFrame`. Call it once before loading assets.
- `createCanvas(width, height)` returns a canvas for `new THREE.WebGLRenderer({ canvas })`. `renderer.setSize(width, height, false)` or assigning `canvas.width` / `canvas.height` resizes it.
- `canvas.readPixels(out?)` returns the rendered frame. Pass the same `Uint8Array` every frame to avoid allocating one per frame.

## Render loops

Call `canvas.readPixels()` once per rendered frame. It waits for the frame to finish, which also lets the renderer free the frame's temporary resources; a loop that renders frame after frame without ever reading one back grows in memory with every frame.

```js
const frame = new Uint8Array(canvas.width * canvas.height * 4);
for (let i = 0; i < frames; i++) {
  mixer.update(1 / 30);
  renderer.render(scene, camera);
  canvas.readPixels(frame);
  // encode or stream the frame
}
```

To turn pixels into an image file, any raw-RGBA encoder works, for example `sharp(pixels, { raw: { width, height, channels: 4 } }).png().toFile("frame.png")`.

## One context at a time

A process holds one WebGL context at a time. Release it with `renderer.dispose()` and `canvas.destroy()` before creating the next canvas's context. For many scenes, reuse one canvas and renderer: creating a context costs time and memory each time.

## Shader cache

The first render of a scene compiles its shaders, which dominates the first frame (often a second or more for detailed scenes). Compiled shaders are cached on disk and later processes reuse them, so repeated renders of similar scenes start several times faster. The cache lives in Mesa's default location under `~/.cache` (`$XDG_CACHE_HOME`); set `MESA_SHADER_CACHE_DIR` to put it elsewhere, for example into a directory that is restored between CI runs. On Windows there is no disk cache, so every new process compiles again.

## What is supported

- The full WebGL2 API with ANGLE's WebGL validation, plus common extensions: `EXT_color_buffer_float`, `EXT_color_buffer_half_float`, `EXT_float_blend`, `OES_texture_float_linear`, `EXT_texture_filter_anisotropic`, `EXT_texture_norm16`, S3TC, BPTC and RGTC compressed textures, and `OES_draw_buffers_indexed`.
- Texture sources: `ArrayBufferView`s and `ImageBitmap`s from `createImageBitmap(blob)` (PNG, JPEG, WebP, AVIF, ...).
- Platforms: macOS 13+ (arm64, x64), Windows x64, Linux x64 and arm64 with glibc 2.31+ (Debian 11, Ubuntu 20.04 and later).

Not available: 2D canvas (`CanvasTexture`, text drawn with a 2D context), `HTMLImageElement`/`HTMLVideoElement` texture sources, Web Workers (decoders that require workers, such as `DRACOLoader` and `KTX2Loader`, need a worker shim), and WebGL 1 contexts.

## Performance

Rendering uses every CPU core. Cost grows with resolution and shading work: render at the size you need, keep `antialias: false` unless edges matter, and keep one renderer alive for many frames instead of starting a process per frame.
