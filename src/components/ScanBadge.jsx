// src/components/ScanBadge.jsx
// A small animated "scan" badge -- a barcode with a glowing line
// sweeping across it on a loop, echoing the app's actual scanning
// feature instead of being decoration for its own sake. Used both as a
// compact accent on the home hero and, larger, as the loading screen's
// centerpiece -- `tone` picks colours that read against each background:
// 'light' for the saturated green hero, 'soft' for a plain page background.
export default function ScanBadge({ size = 56, tone = 'light' }) {
  const isLight = tone === 'light';
  const barcodeSize = size * 0.5;
  const amplitude = size * 0.28;

  const boxClass = isLight ? 'bg-white/15 backdrop-blur-sm' : 'bg-green-100';
  const barsClass = isLight ? 'text-white/90' : 'text-green-700';
  const lineColor = isLight ? '#bef264' : '#65a30d';
  const lineGlow = isLight ? 'rgba(190,242,100,0.85)' : 'rgba(101,163,13,0.6)';

  return (
    <div
      className={`relative flex-shrink-0 rounded-2xl flex items-center justify-center overflow-hidden ${boxClass}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" style={{ width: barcodeSize, height: barcodeSize }} className={barsClass}>
        <rect x="1.5" y="4" width="1.6" height="16" fill="currentColor" />
        <rect x="4.5" y="4" width="0.9" height="16" fill="currentColor" />
        <rect x="6.7" y="4" width="2.2" height="16" fill="currentColor" />
        <rect x="10.5" y="4" width="0.9" height="16" fill="currentColor" />
        <rect x="13" y="4" width="1.6" height="16" fill="currentColor" />
        <rect x="16" y="4" width="0.9" height="16" fill="currentColor" />
        <rect x="18.2" y="4" width="2.2" height="16" fill="currentColor" />
        <rect x="21.9" y="4" width="0.9" height="16" fill="currentColor" />
      </svg>
      <div
        className="scan-sweep absolute left-1.5 right-1.5 h-[2px] rounded-full"
        style={{ background: lineColor, boxShadow: `0 0 6px 1px ${lineGlow}`, '--scan-amplitude': `${amplitude}px` }}
      />
    </div>
  );
}
