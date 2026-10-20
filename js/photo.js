// Shrinks a photo on the device before upload: longest side 1600px, JPEG.
// Phone photos (3–8 MB) become roughly 200–400 KB, which keeps uploads quick.
export async function shrink(file, max = 1600) {
  if (!/^image\//.test(file.type || 'image/')) throw new Error(`“${file.name}” isn’t a photo.`);
  let src; let url = null;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    url = URL.createObjectURL(file);
    src = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error(`Couldn’t read “${file.name}”. Try a JPG or PNG.`));
      img.src = url;
    });
  }
  const w = src.width || src.naturalWidth; const h = src.height || src.naturalHeight;
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale)); canvas.height = Math.max(1, Math.round(h * scale));
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);    // transparent PNGs get a white background
  g.drawImage(src, 0, 0, canvas.width, canvas.height);
  src.close?.(); if (url) URL.revokeObjectURL(url);
  let blob = null;
  for (const q of [0.82, 0.7, 0.55]) {
    blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size < 2.8 * 1024 * 1024) break;
  }
  if (!blob) throw new Error(`Couldn’t prepare “${file.name}”.`);
  return blob;
}
