/**
 * Turn any photo the browser can decode into a small square JPEG data URL for avatars.
 * Phone photos are several MB; a 256px avatar is ~20-40 KB, so it saves quickly and stays
 * well under the server's size limit. Respects EXIF rotation and centre-crops to a square.
 */
export async function toAvatarDataUrl(file: File, size = 256, quality = 0.88): Promise<string> {
  let source: CanvasImageSource & { width: number; height: number };
  let release = () => {};
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      source = bmp; release = () => bmp.close();
    } catch { source = await decodeWithImg(file); }
  } else {
    source = await decodeWithImg(file);
  }
  try {
    const side = Math.min(source.width, source.height);
    if (!side) throw new Error('Empty image');
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.fillStyle = '#ffffff'; // JPEG has no transparency
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, (source.width - side) / 2, (source.height - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    release();
  }
}

async function decodeWithImg(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Render the square region of `img` starting at (sx, sy) with the given side (all in image
 * pixels) into a JPEG data URL. Starts at 512px for a crisp full-screen view and steps down
 * only if the result would exceed the server's photo limit.
 */
export function cropToDataUrl(img: CanvasImageSource, sx: number, sy: number, side: number, out = 512): string {
  const attempts: Array<[number, number]> = [[out, 0.88], [out, 0.78], [384, 0.8], [256, 0.8]];
  for (const [size, quality] of attempts) {
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.fillStyle = '#ffffff'; // JPEG has no transparency
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, Math.max(0, sx), Math.max(0, sy), side, side, 0, 0, size, size);
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length < 600000) return url;
  }
  throw new Error('This photo is too large');
}
