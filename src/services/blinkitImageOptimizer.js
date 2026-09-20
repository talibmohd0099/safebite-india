// src/services/blinkitImageOptimizer.js
//
// Blinkit's own product photos are 1000x1000 with a lot of white padding
// around the actual pack -- confirmed live (a real sample trimmed down to
// a 721x511 real-content box, a ~63% area reduction) and re-confirmed
// across a 50-product pilot (avg 78.9KB -> 18.4KB, range 15.0-19.9KB, 0
// failures, every sample still clearly legible when zoomed).
//
// Shared by scripts/optimize-blinkit-images.js (one-off backfill for
// already-scraped products) and scripts/generate-reports.js (so every
// NEW Blinkit product gets this automatically, going forward, at the
// moment it becomes a real report -- not a separate pass to remember to
// run later).
//
// Node-only: uses sharp, never imported by app/browser code.
import sharp from 'sharp';
import { supabase } from './supabaseClient.js';

const BUCKET = 'blinkit-images';
const MAX_BYTES = 20 * 1024;

// Largest-width-first, decreasing quality -- the first combination that
// fits under MAX_BYTES is kept, so a simple/plain photo (which
// compresses well) keeps more real resolution than a busy one forced
// through the same fixed setting would allow. Quality floor of 35 --
// below that, JPEG blockiness starts working against the entire point of
// this (staying legible when zoomed).
const WIDTHS = [500, 450, 400, 350, 300, 250];
const QUALITIES = [75, 65, 55, 45, 35];

async function trimZoomCompress(originalBuffer) {
  const trimmed = sharp(originalBuffer).trim({ threshold: 15 });
  let smallestTried = null;

  for (const width of WIDTHS) {
    for (const quality of QUALITIES) {
      const out = await trimmed.clone().resize({ width, withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
      if (out.length <= MAX_BYTES) return out;
      smallestTried = out;
    }
  }
  // Never fit under MAX_BYTES even at the smallest width/lowest quality
  // tried -- an unusually complex photo. Better to keep the smallest
  // real attempt than fail this product outright.
  return smallestTried;
}

/**
 * Downloads a Blinkit image, crops the white border away, compresses it,
 * and uploads the result to the blinkit-images Storage bucket (see
 * supabase/blinkit_images_storage_setup.sql, which must be run first).
 *
 * @param {string} imageUrl - Blinkit's original image_url.
 * @param {string} objectId - unique id used as the storage path (the
 *   blinkit_products row's own id) -- deterministic, so reprocessing the
 *   same product overwrites its old file instead of leaking orphans.
 * @returns {Promise<{ url: string, bytes: number } | null>} null on any
 *   failure (bad URL, download error, upload error) -- callers should
 *   fall back to the original imageUrl rather than block on this.
 */
export async function optimizeAndUploadBlinkitImage(imageUrl, objectId) {
  if (!imageUrl || !objectId) return null;
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const original = Buffer.from(await res.arrayBuffer());

    const optimized = await trimZoomCompress(original);

    const path = `${objectId}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, optimized, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) return null;

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: pub.publicUrl, bytes: optimized.length };
  } catch {
    return null;
  }
}
