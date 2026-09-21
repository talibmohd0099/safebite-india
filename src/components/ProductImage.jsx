// src/components/ProductImage.jsx
// The product photo on the result/history screens, with a graceful
// fallback -- many Indian Open Food Facts entries (and anything from a
// text/photo scan, which never has a product photo at all) have no
// image, so this must never show a broken image icon.
//
// Tapping a real photo opens it full-screen -- the thumbnail size here
// is a recognition/context size, not big enough to actually inspect
// against the physical pack, so a bigger look needs to be one tap away.
//
// `expandable` turns that off: some callers (a whole card that should
// just navigate to the report on any tap -- ProductStripCard, the home
// screen's spotlight cards) want a plain, inert thumbnail. Without this,
// the image's own onClick swallows the tap via stopPropagation before it
// ever reaches the card's handler, so tapping the photo silently did
// nothing (well, technically opened an empty lightbox) instead of
// navigating -- found by a click that resolved but never changed the URL.
import { useState } from 'react';
import { createPortal } from 'react-dom';

export default function ProductImage({ src, size = 76, expandable = true }) {
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const showFallback = !src || failed;
  const canExpand = expandable && !showFallback;

  return (
    <>
      <div
        className={`flex-shrink-0 rounded-2xl overflow-hidden flex items-center justify-center ${canExpand ? 'tap-scale cursor-zoom-in' : ''}`}
        style={{ width: size, height: size, background: 'var(--fill)' }}
        onClick={(e) => {
          if (!canExpand) return;
          // A thumbnail often sits inside something else clickable (a
          // history row that navigates on tap) -- this should only ever
          // open the viewer, never also trigger whatever's around it.
          e.stopPropagation();
          setExpanded(true);
        }}
        role={canExpand ? 'button' : undefined}
        aria-label={canExpand ? 'View larger image' : undefined}
      >
        {showFallback ? (
          <span style={{ fontSize: size * 0.4 }}>📦</span>
        ) : (
          <img
            src={src}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setFailed(true)}
          />
        )}
      </div>

      {/* Portalled straight to <body> -- a thumbnail can sit anywhere
          (a history row, a result header), and any of those ancestors
          having so much as a no-op `transform` (an entrance animation
          that's already finished, an active :active scale) turns them
          into a containing block that traps a plain `position: fixed`
          overlay inside that element's box instead of the real
          viewport. A portal sidesteps that entirely -- rendered as a
          direct child of body, guaranteed above everything else. */}
      {expanded && !showFallback && createPortal(
        <div
          className="fixed inset-0 z-[999] bg-black/85 flex items-center justify-center p-6"
          onClick={() => setExpanded(false)}
        >
          <img
            src={src}
            alt=""
            className="max-w-full max-h-full rounded-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setExpanded(false)}
            aria-label="Close"
            className="tap-scale absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 text-white text-2xl leading-none flex items-center justify-center backdrop-blur-sm"
          >
            ×
          </button>
        </div>,
        document.body
      )}
    </>
  );
}
