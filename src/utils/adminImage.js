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
 * everything else this app already stores that way. Used as-is (no
 * `maxBytes`) for the ingredients/nutrition extraction photos, which
 * stay at this higher quality on purpose -- they're OCR input for
 * Gemini, never shown to a real user, and small print gets harder to
 * read accurately the more it's compressed.
 *
 * Pass `maxBytes` for the actual product photo instead (what a real
 * user sees, same target as the Blinkit optimize pipeline -- see
 * blinkitImageOptimizer.js): tries decreasing width/quality
 * combinations, largest/highest-quality first, and keeps the first one
 * that fits, same algorithm as that pipeline just run in the browser's
 * canvas instead of Node's sharp.
 */
export function compressImageToDataUrl(file, { maxWidth = 900, quality = 0.82, maxBytes = null } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.onload = () => {
        if (!maxBytes) {
          const scale = Math.min(1, maxWidth / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
          return;
        }

        const dataUrlBytes = (dataUrl) => Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
        const widths = [500, 450, 400, 350, 300, 250];
        const qualities = [0.75, 0.65, 0.55, 0.45, 0.35];
        let smallest = null;

        for (const w of widths) {
          const scale = Math.min(1, w / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

          for (const q of qualities) {
            const out = canvas.toDataURL('image/jpeg', q);
            if (dataUrlBytes(out) <= maxBytes) {
              resolve(out);
              return;
            }
            smallest = out;
          }
        }
        // Never fit even at the smallest width/lowest quality tried --
        // keep the smallest real attempt rather than fail the upload.
        resolve(smallest);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * The reverse of compressImageToDataUrl -- turns an already-compressed
 * data: URL (e.g. a product_submissions photo) back into a File, so it
 * can feed the same sourcePhotos slot / extractIngredientsFromImage path
 * a freshly-picked file would, without re-compressing it.
 */
export async function dataUrlToFile(dataUrl, filename) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}
