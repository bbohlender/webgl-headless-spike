// ImageBitmap and createImageBitmap for three.js loaders (GLTFLoader, ImageBitmapLoader).

let sharp;

export class ImageBitmap {
  #pixels;

  constructor(width, height, pixels) {
    this.width = width;
    this.height = height;
    this.#pixels = pixels; // RGBA8, top row first
  }

  // RGBA8 pixels, top row first. Kept until close(): three.js may upload one image several times,
  // once per distinct sampler configuration of the textures sharing it.
  pixels() {
    if (!this.#pixels) throw new Error("ImageBitmap is closed");
    return this.#pixels;
  }

  close() {
    this.#pixels = undefined;
  }
}

// Decodes an encoded image (PNG, JPEG, WebP, ...) from a Blob. Honors imageOrientation: "flipY".
export async function createImageBitmap(source, options = {}) {
  if (!(source instanceof Blob)) throw new TypeError("createImageBitmap supports Blob sources only");
  if (!sharp) {
    sharp = (await import("sharp")).default;
    sharp.cache(false); // decoded images go to the GPU; caching them in libvips only costs memory
  }
  let image = sharp(Buffer.from(await source.arrayBuffer())).ensureAlpha();
  if (options.imageOrientation === "flipY") image = image.flip();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  return new ImageBitmap(info.width, info.height, new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
}
