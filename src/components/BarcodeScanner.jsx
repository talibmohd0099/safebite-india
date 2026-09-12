// src/components/BarcodeScanner.jsx
// Full-screen live camera barcode reader -- point the phone at the pack
// instead of typing the number by hand. Uses the browser's native
// BarcodeDetector API (no extra library to ship): supported on Chrome/
// Edge and Android's system WebView (which is what the Capacitor APK
// renders through), not on iOS Safari or older browsers. The caller
// feature-detects with `isBarcodeScanSupported()` and only shows the
// "Scan with camera" entry point when it returns true -- manual typing
// keeps working everywhere regardless.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// EAN-13/EAN-8/UPC cover essentially every Indian packaged-food barcode;
// keeping the format list narrow avoids the detector wasting cycles
// matching QR codes some packs also carry (contest/offer codes).
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

export function isBarcodeScanSupported() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
}

export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const doneRef = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function start() {
      let detector;
      try {
        detector = new window.BarcodeDetector({ formats: FORMATS });
      } catch {
        setError("This device doesn't support camera scanning. Type the number below instead.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setError('Camera access was blocked. Allow camera permission and try again, or type the number below.');
        return;
      }

      let lastCheck = 0;
      const loop = async (time) => {
        if (cancelled || doneRef.current) return;
        // Detecting on every frame burns battery for no benefit --
        // ~200ms between attempts is plenty for a barcode held steady.
        if (time - lastCheck > 200 && videoRef.current?.readyState >= 2) {
          lastCheck = time;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0 && !doneRef.current) {
              doneRef.current = true;
              onDetected(codes[0].rawValue);
              return;
            }
          } catch {
            // A transient decode error on one frame isn't fatal -- keep scanning.
          }
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetected]);

  return createPortal(
    <div className="fixed inset-0 z-[999] bg-black flex flex-col">
      <div className="flex-shrink-0 flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-3">
        <span className="text-white text-sm font-semibold">Scan barcode</span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="tap-scale w-9 h-9 rounded-full bg-white/15 text-white text-xl leading-none flex items-center justify-center backdrop-blur-sm"
        >
          ×
        </button>
      </div>

      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {error ? (
          <p className="text-white/90 text-sm text-center px-8 leading-relaxed">{error}</p>
        ) : (
          <>
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
            <div className="relative w-[80%] max-w-xs aspect-[3/2] rounded-2xl border-2 border-white/80" style={{ boxShadow: '0 0 0 2000px rgba(0,0,0,0.45)' }} />
            <p className="absolute bottom-10 left-0 right-0 text-center text-white/85 text-xs px-8">
              Line the barcode up inside the frame
            </p>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
