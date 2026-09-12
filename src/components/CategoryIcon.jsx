// src/components/CategoryIcon.jsx
// One consistent line-art icon per food category, replacing a mix of
// emoji (which vary in visual weight/style depending on category and
// render differently per platform/font) with a single uniform style:
// same stroke width, same construction, colored via `currentColor` so
// it always matches whatever accent color it's placed on.
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

const PATHS = {
  biscuits: (
    <>
      <circle cx="12" cy="12" r="8" {...stroke} />
      <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="9.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="14.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="15" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  noodles: (
    <>
      <path d="M4.5 11c1-2 2.5-2 3.5-.5s2.5 1.5 3.5 0 2.5-1.5 3.5 0 2.5 1.5 3.5.5" {...stroke} />
      <path d="M5 11l1 7c.1 1.2 1.8 1.8 6 1.8s5.9-.6 6-1.8l1-7" {...stroke} />
    </>
  ),
  beverages: (
    <>
      <path d="M7 8h10l-1 11c-.1 1-1 1.5-4 1.5S8.1 20 8 19z" {...stroke} />
      <path d="M9.5 4v4M15 4v4M12.3 3v5" {...stroke} />
    </>
  ),
  snacks: (
    <>
      <path d="M8.5 4h7l-2 16h-3z" {...stroke} />
      <path d="M9.7 8.5h4.6M9.3 12.5h5.4M9.7 16.5h4.6" {...stroke} />
    </>
  ),
  chocolates: (
    <>
      <rect x="4" y="7.5" width="16" height="9" rx="1.5" {...stroke} />
      <path d="M9.3 7.5v9M14.7 7.5v9M4 12h16" {...stroke} />
    </>
  ),
  spices: (
    <>
      <path d="M9.3 3h5.4v3.2H9.3z" {...stroke} />
      <path d="M8 6.2h8l-1 13.3c-.1.9-1 1.5-3 1.5s-2.9-.6-3-1.5z" {...stroke} />
      <path d="M11 10.5v.01M13.2 12.3v.01M11.5 15v.01" {...stroke} />
    </>
  ),
  dairy: (
    <>
      <path d="M9.3 3h5.4v3.6l2 2.6V20c0 .9-.8 1.3-4.7 1.3S7.3 20.9 7.3 20V9.2l2-2.6z" {...stroke} />
      <path d="M7.3 13.2h9.4" {...stroke} />
    </>
  ),
  essentials: (
    <>
      <path d="M5 11h14c0 4.7-3.1 8.3-7 8.3S5 15.7 5 11z" {...stroke} />
      <path d="M12 11V5.3M9.2 6.3c0-1.4 1.3-2 2.8-2" {...stroke} />
    </>
  ),
};

export default function CategoryIcon({ id, className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      {PATHS[id] || PATHS.essentials}
    </svg>
  );
}
