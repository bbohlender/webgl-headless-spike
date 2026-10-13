// The test models. Draco-decoded copies are made on first use so Node and Chrome (reference.js)
// load identical geometry without a Draco decoder.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const MODELS = new URL("models/", import.meta.url);

export async function decodeModels() {
  const plain = new URL("LittlestTokyo.plain.glb", MODELS);
  if (existsSync(plain)) return;
  const { NodeIO } = await import("@gltf-transform/core");
  const { ALL_EXTENSIONS, KHRDracoMeshCompression } = await import("@gltf-transform/extensions");
  const { default: draco3d } = await import("draco3dgltf");
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "draco3d.decoder": await draco3d.createDecoderModule() });
  const document = await io.read(new URL("LittlestTokyo.glb", MODELS).pathname);
  for (const extension of document.getRoot().listExtensionsUsed()) {
    if (extension.extensionName === KHRDracoMeshCompression.EXTENSION_NAME) extension.dispose();
  }
  await io.write(plain.pathname, document);
}

// Reads a file relative to test/ (scenes.js refers to models as "models/<name>.glb").
export async function loadBytes(path) {
  const bytes = await readFile(new URL(path, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
