// src/pages/admin/AdminBarcodeCheck.jsx
//
// Resolves every barcode's GS1 country prefix (gs1CountryPrefixes.js)
// and groups the ones that DON'T say India for a human to look at.
// This never auto-corrects or auto-flags anything as "wrong" -- a
// genuinely imported product (Samyang Ramen, 880 South Korea) and a
// multinational brand's one global barcode (Cadbury, 762 Switzerland)
// are both completely legitimate. What's actually worth a look is
// a 100%-Indian brand carrying a country prefix that makes no sense
// (a real example found this session: Patanjali Corn Flakes under a
// Japan-range prefix) -- the admin has to make that call, this tool
// just surfaces the candidates instead of them being invisible inside
// 1,300+ barcode rows.
import { useEffect, useMemo, useState } from 'react';
import AdminLayout from './AdminLayout';
import { adminListAllBarcodeProductsLight } from '../../services/adminProductsRepo';
import { resolveGs1Prefix } from '../../data/gs1CountryPrefixes';

export default function AdminBarcodeCheck() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminListAllBarcodeProductsLight().then(setRows).catch((err) => setError(err.message));
  }, []);

  const resolved = useMemo(() => {
    if (!rows) return null;
    return rows.map((r) => ({ ...r, gs1: resolveGs1Prefix(r.barcode) }));
  }, [rows]);

  const foreignCountry = resolved?.filter((r) => r.gs1.type === 'country').sort((a, b) => a.gs1.label.localeCompare(b.gs1.label));
  const otherUnusual = resolved?.filter((r) => ['restricted', 'domestic-other', 'other', 'unknown'].includes(r.gs1.type));

  const groupedByCountry = useMemo(() => {
    if (!foreignCountry) return [];
    const groups = new Map();
    for (const r of foreignCountry) {
      if (!groups.has(r.gs1.label)) groups.set(r.gs1.label, []);
      groups.get(r.gs1.label).push(r);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [foreignCountry]);

  return (
    <AdminLayout>
      <p className="text-[22px] font-bold tracking-tight mb-1" style={{ color: 'var(--label-1)' }}>Barcode check</p>
      <p className="text-[13px] mb-4" style={{ color: 'var(--label-3)' }}>
        GS1 India's own country prefix is <strong>890</strong> — every barcode-sourced product below resolves to a different
        country. Most are legitimate (a real import, or a multinational brand's one global barcode); a few are likely
        wrong barcodes. You decide which — nothing here is changed automatically.
      </p>

      {error && <p className="text-[13px] mb-3" style={{ color: 'var(--v-poor)' }}>{error}</p>}
      {resolved === null && !error && <p className="text-[13px]" style={{ color: 'var(--label-3)' }}>Checking every barcode…</p>}

      {resolved && (
        <p className="text-[12.5px] mb-4" style={{ color: 'var(--label-3)' }}>
          {resolved.length} barcode-sourced products checked — {resolved.length - foreignCountry.length - otherUnusual.length} resolve to India,{' '}
          <strong>{foreignCountry.length} resolve to another country</strong>, {otherUnusual.length} fall in a special/non-country GS1 range.
        </p>
      )}

      {groupedByCountry.map(([country, items]) => (
        <div key={country} className="rounded-[14px] overflow-hidden mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--separator)' }}>
          <div className="px-4 py-2.5 text-[13px] font-semibold" style={{ background: 'var(--fill)', color: 'var(--label-1)' }}>
            {country} <span style={{ color: 'var(--label-3)', fontWeight: 500 }}>({items.length})</span>
          </div>
          {items.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px]" style={{ borderBottom: '1px solid var(--separator)' }}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate" style={{ color: 'var(--label-1)' }}>{r.productName || 'Unnamed product'}</p>
                <p className="text-[11.5px] truncate" style={{ color: 'var(--label-3)' }}>{r.brand || '—'} · {r.barcode}</p>
              </div>
              <a href={`#/admin/products/${r.id}/edit`} target="_blank" rel="noreferrer" className="tap-scale text-[13px] font-semibold flex-shrink-0" style={{ color: 'var(--tint)' }}>
                Edit
              </a>
            </div>
          ))}
        </div>
      ))}

      {otherUnusual?.length > 0 && (
        <details className="rounded-[14px] overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--separator)' }}>
          <summary className="px-4 py-2.5 text-[13px] font-semibold cursor-pointer" style={{ color: 'var(--label-2)' }}>
            Other unusual prefixes ({otherUnusual.length}) — not foreign countries, but worth a glance
          </summary>
          {otherUnusual.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px]" style={{ borderBottom: '1px solid var(--separator)' }}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate" style={{ color: 'var(--label-1)' }}>{r.productName || 'Unnamed product'}</p>
                <p className="text-[11.5px] truncate" style={{ color: 'var(--label-3)' }}>{r.gs1.label} · {r.brand || '—'} · {r.barcode}</p>
              </div>
              <a href={`#/admin/products/${r.id}/edit`} target="_blank" rel="noreferrer" className="tap-scale text-[13px] font-semibold flex-shrink-0" style={{ color: 'var(--tint)' }}>
                Edit
              </a>
            </div>
          ))}
        </details>
      )}
    </AdminLayout>
  );
}
