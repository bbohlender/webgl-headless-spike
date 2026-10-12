# Headless WebGL2 renderer: cross-platform feasibility

Oct 12, 2026 · @Bela Bohlender

## Goal

One Node.js library that turns a three.js scene (WebGLRenderer, WebGL2) into an image fast on any machine, including cheap VMs without a GPU, with nothing to install beyond `npm install`.

Hard requirement: **one rendering stack that works on Linux, macOS and Windows.** If the fastest candidate cannot run on all three, we use the stack that can.

## Candidate stack

**Preferred:** Node-API addon → ANGLE (WebGL2 layer, OpenGL ES backend) → Mesa llvmpipe (CPU rasterizer) with Mesa's shader disk cache.

**Fallback:** ANGLE → Vulkan → SwiftShader, the software path Chrome already ships on all three OSes.

Measured on Linux x64 (2-vCPU VM, no GPU), three.js example *Littlest Tokyo*, 1280×720, cold one-shot render to PNG:

| Setup | Cold render | Peak memory |
| --- | --- | --- |
| Playwright (Chrome, SwiftShader) | 10.8 s | 825 MB |
| Node + ANGLE + SwiftShader | 9.3 s | 518 MB |
| Node + ANGLE + llvmpipe + shader cache | 2.8 s | 592 MB |

Output matches Chrome (0.18% of pixels differ, all on geometry edges) and passes our WebGL2 feature suite. Only proven on Linux x64 so far.

## Process

macOS goes first because it is the highest risk: there, ANGLE's OpenGL backend normally targets Apple's own OpenGL, and there is no well-trodden headless Mesa build. Each phase is time-boxed to 1–2 weeks (estimate).

1. **macOS (Apple Silicon)**
   1. Build Mesa with only llvmpipe and a headless (surfaceless) EGL; check Homebrew's Mesa first as a quick probe.
   2. Build or configure ANGLE so its OpenGL ES backend targets that Mesa EGL instead of Apple's OpenGL.
   3. Wire both into the addon and run the test set (below).
2. **Windows x64**: same test set, using Mesa's self-contained Windows llvmpipe build with ANGLE's OpenGL backend pointed at the bundled `opengl32.dll`.
3. **Linux x64 and arm64**: productise only after both pass (minimal ANGLE + Mesa builds, one npm package per platform).

**Test set, identical on every OS:** WebGL2 feature suite; three scenes (simple PBR, Soldier character, Littlest Tokyo); pixel comparison against Chrome; cold timing with empty and populated shader cache; peak memory.

**A phase passes when** all tests pass, pixels differ from Chrome by at most 0.2%, the shader cache cuts Littlest Tokyo's cold render roughly in half or better, and nothing is needed beyond the npm package.

## Decision rule

&#91;embedded content: decision flow · 2 spikes, 2 outcomes\]

If either spike fails within its time box, ANGLE + SwiftShader becomes the single stack everywhere: proven on all OSes, but slower cold renders for complex scenes (about 9 s versus 3 s for Littlest Tokyo). We never ship both.

## Needed to start

- [ ] A GitHub repository for the spike, with a CI matrix of macOS arm64, Windows x64 and Linux x64/arm64 runners (or access to a Mac and a Windows machine)
- [ ] Decide the time box per spike

**Open questions**

- Can ANGLE's OpenGL backend on macOS be pointed at Mesa's EGL at all, or does it need patching?
- How large is a minimal Mesa + LLVM build per platform? Estimated 13–20 MB compressed, not yet measured.
- Is the shader cache stable across CI runners of the same type, so it can be populated once per machine type?
