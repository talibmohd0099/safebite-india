// src/components/ProductImage.jsx
// The product photo on the result screen, with a graceful fallback --
// many Indian Open Food Facts entries (and anything from a text/photo
// scan, which never has a product photo at all) have no image, so this
// must never show a broken image icon.
import { useState } from 'react';

export default function ProductImage({ src, size = 76 }) {
  const [failed, setFailed] = useState(false);
  const showFallback = !src || failed;

  return (
    <div
      className="flex-shrink-0 rounded-2xl overflow-hidden flex items-center justify-center"
      style={{ width: size, height: size, background: 'var(--fill)' }}
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
  );
}
