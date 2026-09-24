// src/pages/admin/PhotoCropModal.jsx
//
// Manual crop tool for the admin product photo -- built for exactly the
// case the automated Blinkit trim/crop can't handle: a source photo
// showing more than one physical unit (e.g. two ice cream cones side by
// side, confirmed live as a real ~28% of Blinkit photos), where the
// admin wants to keep just one. Drag to select a rectangle, Crop applies
// it; closing without cropping just previews the photo full-size.
//
// "AI clean-up" sends the photo (or just the selected part) to Gemini to
// remove props/extra objects and whiten the background -- the result is
// shown here as a preview, and only saved once the admin accepts it.
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cleanProductPhoto } from '../../services/geminiImageService';

// Same ~20KB target as the Blinkit optimize pipeline and the hero-photo
// upload (adminImage.js) -- a manual crop or AI clean-up is still a real
// product photo, same size budget as every other one.
const MAX_BYTES = 20 * 1024;
const WIDTHS = [500, 450, 400, 350, 300, 250];
const QUALITIES = [0.75, 0.65, 0.55, 0.45, 0.35];
const dataUrlBytes = (dataUrl) => Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);

// Largest-width-first, decreasing quality -- the first JPEG that fits the
// budget wins. White fill first, so a transparent PNG (AI output can be
// one) doesn't turn black as a JPEG.
function compressToJpeg(source) {
  let result = null;
  for (const w of WIDTHS) {
    const scale = Math.min(1, w / source.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    for (const q of QUALITIES) {
      result = canvas.toDataURL('image/jpeg', q);
      if (dataUrlBytes(result) <= MAX_BYTES) return result;
    }
  }
  return result;
}

export default function PhotoCropModal({ imageUrl, onCropped, onClose }) {
  const imgRef = useRef(null);
  const [naturalSize, setNaturalSize] = useState(null);
  const [displaySize, setDisplaySize] = useState(null);
  const [dragStart, setDragStart] = useState(null);
  const [rect, setRect] = useState(null); // { x, y, w, h } in on-screen (display) pixels
  const [error, setError] = useState('');
  const [src, setSrc] = useState(imageUrl); // swapped for the AI result once cleaned
  const [cleaned, setCleaned] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const handleImgLoad = (e) => {
    const img = e.target;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    setDisplaySize({ w: img.clientWidth, h: img.clientHeight });
    setError('');
  };

  // Cross-origin images without a permissive CORS response (Blinkit's
  // own raw, not-yet-optimized CDN -- confirmed live it sends no
  // Access-Control-Allow-Origin header, unlike Supabase Storage/Open
  // Food Facts, which both do) fail to load at all once crossOrigin is
  // set. Rather than a silently broken image, this explains why and
  // points at the one workaround that always works: re-upload a local
  // copy, which becomes a same-origin data: URL with no such issue.
  const handleImgError = () => {
    setError("Can't load this photo for cropping (it's hosted somewhere that blocks that). Use \"Choose file\" to upload a local copy instead, then crop that.");
  };

  const getRelativePoint = (e) => {
    const box = imgRef.current.getBoundingClientRect();
    return {
      x: Math.min(Math.max(e.clientX - box.left, 0), box.width),
      y: Math.min(Math.max(e.clientY - box.top, 0), box.height),
    };
  };

  const handleMouseDown = (e) => {
    if (!naturalSize) return;
    const p = getRelativePoint(e);
    setDragStart(p);
    setRect({ x: p.x, y: p.y, w: 0, h: 0 });
  };

  const handleMouseMove = (e) => {
    if (!dragStart) return;
    const p = getRelativePoint(e);
    setRect({
      x: Math.min(dragStart.x, p.x),
      y: Math.min(dragStart.y, p.y),
      w: Math.abs(p.x - dragStart.x),
      h: Math.abs(p.y - dragStart.y),
    });
  };

  const handleMouseUp = () => setDragStart(null);

  const hasSelection = rect && rect.w >= 10 && rect.h >= 10;

  // The selected part of the photo (or all of it), at full resolution, as
  // a canvas. Throws on a cross-origin (tainted) photo -- callers catch.
  const sourceCanvas = () => {
    let sx = 0, sy = 0, sw = naturalSize.w, sh = naturalSize.h;
    if (hasSelection && displaySize) {
      const scaleX = naturalSize.w / displaySize.w;
      const scaleY = naturalSize.h / displaySize.h;
      sx = Math.round(rect.x * scaleX);
      sy = Math.round(rect.y * scaleY);
      sw = Math.round(rect.w * scaleX);
      sh = Math.round(rect.h * scaleY);
    }
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, sw, sh);
    ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas;
  };

  const blockedMessage = (action) =>
    `Can't ${action} this photo (it's hosted somewhere that blocks that). Use "Choose file" to upload a local copy instead, then ${action} that.`;

  const applyCrop = () => {
    if (!naturalSize || (!hasSelection && !cleaned)) return;
    try {
      onCropped(compressToJpeg(sourceCanvas()));
    } catch {
      // A tainted canvas throws here even when the <img> itself loaded
      // fine -- same cross-origin cause as handleImgError, just caught
      // at crop time instead of load time.
      setError(blockedMessage('crop'));
    }
  };

  const runCleanup = async () => {
    if (!naturalSize || cleaning) return;
    let input;
    try {
      input = sourceCanvas().toDataURL('image/jpeg', 0.92);
    } catch {
      setError(blockedMessage('clean up'));
      return;
    }
    setCleaning(true);
    setError('');
    try {
      const result = await cleanProductPhoto(input);
      setNaturalSize(null);
      setRect(null);
      setSrc(result);
      setCleaned(true);
    } catch (err) {
      setError(`AI clean-up failed: ${err.message}`);
    } finally {
      setCleaning(false);
    }
  };

  const undoCleanup = () => {
    setNaturalSize(null);
    setRect(null);
    setSrc(imageUrl);
    setCleaned(false);
    setError('');
  };

  return createPortal(
    <div className="fixed inset-0 z-[999] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="rounded-2xl p-4 max-w-2xl w-full"
        style={{ background: 'var(--bg-card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-[15px] font-bold" style={{ color: 'var(--label-1)' }}>Product photo</p>
          <button onClick={onClose} className="tap-scale text-[13px] font-semibold" style={{ color: 'var(--label-3)' }}>Close</button>
        </div>

        {error ? (
          <p className="text-[13px] mb-3" style={{ color: 'var(--v-poor)' }}>{error}</p>
        ) : (
          <p className="text-[12px] mb-2" style={{ color: 'var(--label-3)' }}>
            {cleaning
              ? 'AI is cleaning up the photo -- this can take 10-20 seconds...'
              : cleaned
                ? 'AI-cleaned preview. Check the pack text and logo look right, then use it -- or Undo to go back to the original.'
                : 'Drag over the photo to select the part you want to keep, then Crop -- e.g. to keep just one item out of a photo showing several. "AI clean-up" removes props and extra objects and whitens the background (of the selection, if there is one).'}
          </p>
        )}

        <div
          className="relative select-none"
          style={{ cursor: naturalSize ? 'crosshair' : 'default', lineHeight: 0 }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <img
            ref={imgRef}
            src={src}
            alt="Product"
            crossOrigin="anonymous"
            onLoad={handleImgLoad}
            onError={handleImgError}
            className="w-full rounded-[10px]"
            style={{ opacity: cleaning ? 0.5 : 1 }}
            draggable={false}
          />
          {rect && rect.w > 0 && rect.h > 0 && (
            <div
              className="absolute border-2 border-green-500 bg-green-500/10 pointer-events-none"
              style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
            />
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 mt-3">
          {rect && (
            <button onClick={() => setRect(null)} className="tap-scale text-[13px] font-semibold px-3 py-2 rounded-[10px]" style={{ background: 'var(--fill)', color: 'var(--label-2)' }}>
              Clear selection
            </button>
          )}
          {cleaned ? (
            <button onClick={undoCleanup} disabled={cleaning} className="tap-scale text-[13px] font-semibold px-3 py-2 rounded-[10px]" style={{ background: 'var(--fill)', color: 'var(--label-2)' }}>
              Undo AI
            </button>
          ) : (
            <button
              onClick={runCleanup}
              disabled={!naturalSize || cleaning}
              className="tap-scale text-[13px] font-semibold px-3 py-2 rounded-[10px]"
              style={{ background: 'var(--fill)', color: 'var(--tint)', opacity: !naturalSize || cleaning ? 0.5 : 1 }}
            >
              {cleaning ? 'Cleaning up...' : '\u2728 AI clean-up'}
            </button>
          )}
          <button
            onClick={applyCrop}
            disabled={cleaning || (!hasSelection && !cleaned)}
            className="tap-scale text-[13px] font-semibold px-4 py-2 rounded-[10px]"
            style={{ background: 'var(--tint)', color: '#fff', opacity: cleaning || (!hasSelection && !cleaned) ? 0.5 : 1 }}
          >
            {hasSelection ? 'Crop & use this' : 'Use this photo'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
