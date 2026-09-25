// src/services/geminiImageService.js
//
// AI clean-up for admin product photos: removes whatever else is sitting
// next to the pack (a bowl of the contents, a spoon, props, a second
// unit) and puts the pack alone on a plain white background, so every
// product photo in the app looks the same. Uses a Gemini image model
// through the same round-robin key pool as the text analysis.
//
// Works on any source photo -- Open Food Facts, a user submission, or an
// admin upload. Admin-only: the result is always shown as a preview first
// and only saved when the admin accepts it.
import { callGeminiRaw } from './geminiService.js';

// Tried in order: the full image model gives cleaner edits on busy
// photos; the lite one is the fallback when the first is unavailable
// (not enabled for the key, renamed, or out of quota).
export const IMAGE_MODELS = ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image'];

export const CLEANUP_PROMPT = `Edit this packaged-food product photo for a product catalogue.

1. Keep ONLY the main product package (the pack, bottle, box, jar or pouch). If there are several identical units, keep just one.
2. Remove everything else: loose food or contents placed around the pack, bowls, plates, spoons, garnish, props, hands, text overlays, badges and stickers that are not printed on the pack.
3. Replace the background with plain pure white (#FFFFFF) and add a very soft natural shadow under the pack.
4. Centre the pack and leave a small even margin around it.

Do NOT change the package itself: keep its shape, colours, brand name, logo, printed text, and label artwork exactly as they are. Do not add anything new.`;

/** The generateContent body for one clean-up. Pure -- exported for testing. */
export function buildCleanupRequest(base64, mimeType) {
  return {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: CLEANUP_PROMPT },
      ],
    }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  };
}

/**
 * Pulls the first image out of a generateContent response, as
 * { mimeType, data } (base64), or null when the model returned only text
 * (e.g. it declined, or said it couldn't find a product). The REST API
 * uses camelCase here, but snake_case is accepted too. Pure -- exported
 * for testing.
 */
export function extractImage(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const inline = part.inlineData || part.inline_data;
    if (inline?.data) {
      return { mimeType: inline.mimeType || inline.mime_type || 'image/png', data: inline.data };
    }
  }
  return null;
}

/** Any text the model sent back alongside (or instead of) an image. */
function extractText(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text).filter(Boolean).join(' ').trim();
}

/**
 * Cleans one product photo.
 *
 * @param {string} dataUrl - the source photo as a data: URL.
 * @returns {Promise<string>} the cleaned photo as a data: URL.
 * @throws with a readable message when every model failed.
 */
export async function cleanProductPhoto(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) throw new Error('Photo could not be read.');
  const [, mimeType, base64] = match;

  let lastError = 'AI clean-up failed.';
  for (const model of IMAGE_MODELS) {
    try {
      const response = await callGeminiRaw(buildCleanupRequest(base64, mimeType), model);
      const image = extractImage(response);
      if (image) return `data:${image.mimeType};base64,${image.data}`;
      lastError = extractText(response) || 'The AI returned no image.';
    } catch (err) {
      lastError = err.message || lastError;
    }
  }
  throw new Error(friendlyCleanupError(lastError));
}

// Confirmed live (2026-09-25): every configured key, on both image
// models, gets this immediately -- Gemini's free tier has NO allocation
// at all for image-generation models (Google's own pricing page lists
// both as "Not available" on the free tier), unlike the text model this
// app otherwise runs on. That's a billing-plan fact, not a quota that
// retrying, waiting, or rotating keys can work around, so it deserves
// its own message instead of surfacing the raw "retry in 3s" API text,
// which reads like a transient problem it isn't.
const FREE_TIER_IMAGE_UNAVAILABLE_RE = /free_tier|free tier/i;

export function friendlyCleanupError(message) {
  if (FREE_TIER_IMAGE_UNAVAILABLE_RE.test(message || '')) {
    return 'AI clean-up needs a paid Gemini plan -- image generation isn’t included in the free tier at all (confirmed on every configured key). Enable billing on the Google Cloud project for a Gemini key, then try again.';
  }
  return `AI clean-up failed: ${message}`;
}
