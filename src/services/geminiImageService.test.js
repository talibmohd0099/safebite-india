// src/services/geminiImageService.test.js
//
// Only the pure request/response helpers -- no network, no API key.
// Run with: node --test src/services/geminiImageService.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCleanupRequest, extractImage, cleanProductPhoto, CLEANUP_PROMPT } from './geminiImageService.js';
import { GEMINI_API_KEYS } from './geminiService.js';

test('request sends the photo first, then the clean-up instructions, and asks for an image back', () => {
  const body = buildCleanupRequest('AAAA', 'image/jpeg');
  const [imagePart, textPart] = body.contents[0].parts;
  assert.deepEqual(imagePart, { inline_data: { mime_type: 'image/jpeg', data: 'AAAA' } });
  assert.equal(textPart.text, CLEANUP_PROMPT);
  assert.ok(body.generationConfig.responseModalities.includes('IMAGE'));
});

test('finds the image part even when text comes first (camelCase REST shape)', () => {
  const response = {
    candidates: [{ content: { parts: [
      { text: 'Here is the edited photo.' },
      { inlineData: { mimeType: 'image/png', data: 'BBBB' } },
    ] } }],
  };
  assert.deepEqual(extractImage(response), { mimeType: 'image/png', data: 'BBBB' });
});

test('accepts the snake_case shape too', () => {
  const response = { candidates: [{ content: { parts: [{ inline_data: { mime_type: 'image/webp', data: 'CCCC' } }] } }] };
  assert.deepEqual(extractImage(response), { mimeType: 'image/webp', data: 'CCCC' });
});

test('returns null for a text-only or empty response', () => {
  assert.equal(extractImage({ candidates: [{ content: { parts: [{ text: 'No product found.' }] } }] }), null);
  assert.equal(extractImage({}), null);
  assert.equal(extractImage(null), null);
});

test('rejects a photo that is not a base64 data URL, before any API call', async () => {
  await assert.rejects(cleanProductPhoto('https://example.com/pack.jpg'), /could not be read/);
  await assert.rejects(cleanProductPhoto(null), /could not be read/);
});

test('fails with a readable message when no API key is configured', { skip: GEMINI_API_KEYS.length > 0 }, async () => {
  await assert.rejects(cleanProductPhoto('data:image/jpeg;base64,AAAA'), /No Gemini API key configured/);
});
