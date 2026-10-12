// Decodes Draco geometry so Node and the browser load identical, decoder-free GLBs.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "draco3d.decoder": await draco3d.createDecoderModule() });
const doc = await io.read("models/LittlestTokyo.glb");
doc.getRoot().listExtensionsUsed().filter((e) => e.extensionName === KHRDracoMeshCompression.EXTENSION_NAME).forEach((e) => e.dispose());
await io.write("models/LittlestTokyo.plain.glb", doc);
console.log("wrote models/LittlestTokyo.plain.glb");
