Pixel references: Chrome (headless, `--use-angle=swiftshader`) rendering the same `scenes.js` at 1280x720.
Regenerate with `node reference.mjs swiftshader` and copy `out/<scene>-chrome-swiftshader.png` here.
Chrome's SwiftShader output was identical on macOS arm64, macOS x64 and Linux x64 (CI run 38280159020),
so one set serves every platform, including Linux arm64 where Chrome is not available.
