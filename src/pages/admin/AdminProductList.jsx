// src/pages/admin/AdminProductList.jsx
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import PhotoCropModal from './PhotoCropModal';
import { adminListProducts, adminDeleteProduct, adminUpdateProduct } from '../../services/adminProductsRepo';
import { adminOpenFlaggedLookupKeys } from '../../services/adminFlagsRepo';
import { getScoreColor } from '../../utils/storage';
import { CATEGORY_KEYWORDS } from '../../data/categoryKeywords';

const PAGE_SIZE = 25;
const FILTER_DEBOUNCE_MS = 400;

// Real distinct values seen in product_reports.source. Note: OFF's own
// discovery pipeline (discover-off-products.js) saves its rows with
// source: 'barcode' too, since those products DO have real barcodes --
// there's no way to tell "OFF-discovered" apart from "a real user
// scanned this barcode" at this column, so this filter can't offer an
// "off" option that doesn't already exist in the data.
const SOURCES = ['barcode', 'blinkit', 'search', 'image', 'text'];

function ScorePill({ score }) {
  if (typeof score !== 'number') return <span style={{ color: 'var(--label-3)' }}>—</span>;
  const { label, color, bg } = getScoreColor(score);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[12px] font-semibold"
      style={{ background: bg, color }}
    >
      {score} · {label}
    </span>
  );
}

const INITIAL_FILTERS = {
  search: '', brand: '', categoryId: '', flaggedOnly: false,
  source: '', scoreMin: '', scoreMax: '', barcode: '', hasBarcode: '',
};

// Persisted across navigating to Edit and back, or closing the tab
// entirely -- without this, every trip to edit one product from a
// filtered list meant re-typing the same filters again on return.
// localStorage rather than the URL: simpler, and this page is never
// meant to be shared/bookmarked with a particular filter baked in.
const FILTERS_STORAGE_KEY = 'foodguard-admin-product-filters';

function loadStoredFilterState() {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { filters: { ...INITIAL_FILTERS, ...parsed.filters }, page: Number(parsed.page) || 0 };
  } catch {
    return null;
  }
}

export default function AdminProductList() {
  const [filters, setFilters] = useState(() => loadStoredFilterState()?.filters || INITIAL_FILTERS);
  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(() => loadStoredFilterState()?.page || 0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // The row currently open in the crop modal -- built for exactly the
  // "same product shown twice in one photo" case, without needing a
  // trip into the full Edit page just to fix a photo.
  const [croppingRow, setCroppingRow] = useState(null);
  const [savingCrop, setSavingCrop] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify({ filters, page }));
    } catch {
      // Private-mode/blocked storage -- filters just won't survive a
      // navigation in that case, same as before this feature existed.
    }
  }, [filters, page]);

  const load = async (f, pageValue) => {
    setLoading(true);
    setError('');
    try {
      let lookupKeys = null;
      if (f.flaggedOnly) lookupKeys = await adminOpenFlaggedLookupKeys();
      const category = CATEGORY_KEYWORDS.find((c) => c.id === f.categoryId);
      const { rows: r, count: c } = await adminListProducts({
        search: f.search,
        brand: f.brand,
        categoryKeywords: category?.keywords || null,
        lookupKeys,
        source: f.source,
        scoreMin: f.scoreMin !== '' ? Number(f.scoreMin) : null,
        scoreMax: f.scoreMax !== '' ? Number(f.scoreMax) : null,
        barcode: f.barcode,
        hasBarcode: f.hasBarcode,
        limit: PAGE_SIZE,
        offset: pageValue * PAGE_SIZE,
      });
      setRows(r);
      setCount(c);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // One debounce for every filter -- typing in Product name/Brand/
  // Barcode "auto fetches" (re-queries as you type) without a separate
  // Apply button; a select/checkbox change waits the same short beat,
  // which is unnoticeable for a click but avoids a double-fetch when
  // several filters change together. A page-only change (Prev/Next)
  // fetches immediately, no debounce. The very first run (mount, with
  // filters/page possibly restored from localStorage) also fetches
  // immediately, at whatever page was restored, instead of resetting.
  const prevFiltersRef = useRef(filters);
  const mountedRef = useRef(false);

  useEffect(() => {
    const filtersChanged = prevFiltersRef.current !== filters;
    prevFiltersRef.current = filters;

    // A genuine filter change while deeper than page 1 -- reset to
    // page 0 first (the effect re-runs from the `page` dependency
    // below) rather than fetching page 5 of a completely different
    // filtered set.
    if (filtersChanged && mountedRef.current && page !== 0) {
      setPage(0);
      return;
    }

    const delay = mountedRef.current && filtersChanged ? FILTER_DEBOUNCE_MS : 0;
    const timer = setTimeout(() => load(filters, page), delay);
    mountedRef.current = true;
    return () => clearTimeout(timer);
  }, [filters, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name || 'this product'}"? This can't be undone.`)) return;
    try {
      await adminDeleteProduct(id, name);
      load(filters, page);
    } catch (err) {
      window.alert(err.message);
    }
  };

  // The row's own already-loaded report/lookup_key/etc. (adminListProducts
  // selects the full row, not a thin one) is everything adminUpdateProduct
  // needs -- no re-fetch, just the image field replaced.
  const handleCropped = async (dataUrl) => {
    const row = croppingRow;
    setSavingCrop(true);
    try {
      await adminUpdateProduct(row.id, {
        lookupKey: row.lookup_key,
        source: row.source,
        productName: row.product_name,
        ingredientsText: row.ingredients_text,
        report: { ...row.report, imageUrl: dataUrl },
      });
      setCroppingRow(null);
      load(filters, page);
    } catch (err) {
      window.alert(err.message);
    } finally {
      setSavingCrop(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--label-1)' }}>
          Products <span style={{ color: 'var(--label-3)', fontWeight: 500 }}>({count})</span>
        </p>
        <Link
          to="/admin/products/new"
          className="tap-scale px-4 py-2.5 rounded-[10px] text-[14px] font-semibold text-white"
          style={{ background: 'var(--tint)' }}
        >
          + Add new product
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-2">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Product name</label>
          <input
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            placeholder="e.g. cad → Cadbury..."
            className="admin-field w-full px-3 py-2 rounded-[10px] text-[14px]"
          />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Brand</label>
          <input
            value={filters.brand}
            onChange={(e) => setFilter('brand', e.target.value)}
            placeholder="Any brand"
            className="admin-field w-full px-3 py-2 rounded-[10px] text-[14px]"
          />
        </div>
        <div className="min-w-[170px]">
          <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Category</label>
          <select value={filters.categoryId} onChange={(e) => setFilter('categoryId', e.target.value)} className="admin-field w-full px-3 py-2 rounded-[10px] text-[14px]">
            <option value="">All categories</option>
            {CATEGORY_KEYWORDS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div className="min-w-[140px]">
          <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Source</label>
          <select value={filters.source} onChange={(e) => setFilter('source', e.target.value)} className="admin-field w-full px-3 py-2 rounded-[10px] text-[14px]">
            <option value="">Any source</option>
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="min-w-[160px]">
          <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Score range</label>
          <div className="flex items-center gap-1.5">
            <input type="number" min="0" max="100" value={filters.scoreMin} onChange={(e) => setFilter('scoreMin', e.target.value)} placeholder="0" className="admin-field w-16 px-2 py-2 rounded-[10px] text-[14px]" />
            <span style={{ color: 'var(--label-3)' }}>–</span>
            <input type="number" min="0" max="100" value={filters.scoreMax} onChange={(e) => setFilter('scoreMax', e.target.value)} placeholder="100" className="admin-field w-16 px-2 py-2 rounded-[10px] text-[14px]" />
          </div>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Barcode</label>
          <input
            value={filters.barcode}
            onChange={(e) => setFilter('barcode', e.target.value)}
            placeholder="Search by barcode number"
            className="admin-field w-full px-3 py-2 rounded-[10px] text-[14px]"
          />
        </div>
        <div className="min-w-[150px]">
          <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Barcode available</label>
          <select value={filters.hasBarcode} onChange={(e) => setFilter('hasBarcode', e.target.value)} className="admin-field w-full px-3 py-2 rounded-[10px] text-[14px]">
            <option value="">Any</option>
            <option value="yes">Has barcode</option>
            <option value="no">No barcode</option>
          </select>
        </div>
        <label className="flex items-center gap-2 px-3 py-2 rounded-[10px] text-[13px] font-semibold cursor-pointer" style={{ background: 'var(--fill)', color: 'var(--label-1)' }}>
          <input type="checkbox" checked={filters.flaggedOnly} onChange={(e) => setFilter('flaggedOnly', e.target.checked)} />
          Flagged only
        </label>
        {filters !== INITIAL_FILTERS && (
          <button onClick={() => setFilters(INITIAL_FILTERS)} className="tap-scale text-[13px] font-semibold" style={{ color: 'var(--label-3)' }}>
            Clear filters
          </button>
        )}
      </div>

      {error && <p className="text-[13px] mb-3" style={{ color: 'var(--v-poor)' }}>{error}</p>}
      {loading && <p className="text-[13px]" style={{ color: 'var(--label-3)' }}>Loading…</p>}
      {!loading && rows.length === 0 && (
        <p className="text-[13px] text-center py-10" style={{ color: 'var(--label-3)' }}>No products match these filters.</p>
      )}

      {rows.length > 0 && (
        <div className="rounded-[14px] overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--separator)' }}>
          <div
            className="grid gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide"
            style={{ gridTemplateColumns: '88px 2.2fr 1fr 1fr 1fr 100px 220px', color: 'var(--label-3)', borderBottom: '1px solid var(--separator)' }}
          >
            <span></span>
            <span>Product</span>
            <span>Brand</span>
            <span>Score</span>
            <span>Source</span>
            <span>Updated</span>
            <span></span>
          </div>
          {rows.map((row) => {
            const r = row.report || {};
            return (
              <div
                key={row.id}
                className="grid gap-3 px-4 py-2.5 items-center text-[13.5px]"
                style={{ gridTemplateColumns: '88px 2.2fr 1fr 1fr 1fr 100px 220px', borderBottom: '1px solid var(--separator)' }}
              >
                <button
                  onClick={() => r.imageUrl && setCroppingRow(row)}
                  title={r.imageUrl ? 'Click to view larger / crop' : 'No photo'}
                  className="tap-scale w-16 h-16 rounded-[8px] overflow-hidden flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--fill)', cursor: r.imageUrl ? 'pointer' : 'default' }}
                >
                  {r.imageUrl ? <img src={r.imageUrl} alt="" className="w-full h-full object-cover" /> : <span style={{ fontSize: 22 }}>🍽️</span>}
                </button>
                <div className="min-w-0">
                  <p className="font-semibold truncate" style={{ color: 'var(--label-1)' }}>{row.product_name || 'Unnamed product'}</p>
                  <p className="text-[11px] truncate" style={{ color: 'var(--label-3)' }}>{row.lookup_key}</p>
                </div>
                <span className="truncate" style={{ color: 'var(--label-2)' }}>{r.brand || '—'}</span>
                <ScorePill score={r.overallScore} />
                <span style={{ color: 'var(--label-2)' }}>{row.source}</span>
                <span className="text-[12px]" style={{ color: 'var(--label-3)' }}>
                  {row.updated_at ? new Date(row.updated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                </span>
                <div className="flex items-center gap-2.5 justify-end">
                  <a href={`#/p/${row.id}`} target="_blank" rel="noreferrer" title="View in the app" className="tap-scale text-[13px] font-semibold" style={{ color: 'var(--label-2)' }}>View</a>
                  <Link to={`/admin/products/${row.id}/history`} title="History" className="tap-scale text-[15px]" style={{ color: 'var(--label-3)' }}>🕐</Link>
                  {r.imageUrl && (
                    <button onClick={() => setCroppingRow(row)} title="Crop photo" className="tap-scale text-[13px] font-semibold" style={{ color: 'var(--label-2)' }}>Crop</button>
                  )}
                  <Link to={`/admin/products/${row.id}/edit`} className="tap-scale text-[13px] font-semibold" style={{ color: 'var(--tint)' }}>Edit</Link>
                  <button onClick={() => handleDelete(row.id, row.product_name)} className="tap-scale text-[13px] font-semibold" style={{ color: 'var(--v-poor)' }}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && count > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="tap-scale px-4 py-2 rounded-[10px] text-[13px] font-semibold"
            style={{ background: 'var(--fill)', color: 'var(--label-1)', opacity: page === 0 ? 0.4 : 1 }}
          >
            ← Prev
          </button>
          <span className="text-[12px]" style={{ color: 'var(--label-3)' }}>Page {page + 1} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="tap-scale px-4 py-2 rounded-[10px] text-[13px] font-semibold"
            style={{ background: 'var(--fill)', color: 'var(--label-1)', opacity: page >= totalPages - 1 ? 0.4 : 1 }}
          >
            Next →
          </button>
        </div>
      )}

      {croppingRow && (
        <PhotoCropModal
          imageUrl={croppingRow.report?.imageUrl}
          onCropped={handleCropped}
          onClose={() => !savingCrop && setCroppingRow(null)}
        />
      )}
      {savingCrop && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40">
          <p className="px-4 py-2.5 rounded-full text-[13px] font-semibold text-white" style={{ background: 'rgba(0,0,0,0.7)' }}>Saving…</p>
        </div>
      )}
    </AdminLayout>
  );
}
