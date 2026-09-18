// src/utils/adminImage.js
//
// Admin panel's photo input: a file picker AND a direct clipboard paste
// (screenshot or a copied product photo pasted straight into the page),
// per the admin's own request. Compressed client-side before it's ever
// sent anywhere -- a phone photo can be several MB, and this is stored
// as a plain data: URL in the report JSON (see adminProductsRepo.js),
// not a separate Storage bucket, so keeping it small matters.

/** Pulls the first pasted image out of a clipboard paste event, if any. */
export function imageFileFromClipboard(event) {
  const items = event.clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (item.type && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

/**
 * Resizes and re-encodes an image file into a compact JPEG data: URL.
 * maxWidth 900 / quality 0.82 keeps a typical pack photo well under
 * ~150KB -- small enough to live inline in the report JSON alongside
 * everything else this app already stores that way.
 */
export function compressImageToDataUrl(file, { maxWidth = 900, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
