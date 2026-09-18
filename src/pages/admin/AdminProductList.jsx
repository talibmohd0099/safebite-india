// src/pages/admin/AdminProductList.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { adminListProducts, adminDeleteProduct } from '../../services/adminProductsRepo';
import { adminOpenFlaggedLookupKeys } from '../../services/adminFlagsRepo';
import { getScoreColor } from '../../utils/storage';
import { CATEGORY_KEYWORDS } from '../../data/categoryKeywords';

const PAGE_SIZE = 25;

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

export default function AdminProductList() {
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (filters, pageValue) => {
    setLoading(true);
    setError('');
    try {
      let lookupKeys = null;
      if (filters.flaggedOnly) {
        lookupKeys = await adminOpenFlaggedLookupKeys();
      }
      const category = CATEGORY_KEYWORDS.find((c) => c.id === filters.categoryId);
      const { rows: r, count: c } = await adminListProducts({
        search: filters.search,
        brand: filters.brand,
        categoryKeywords: category?.keywords || null,
        lookupKeys,
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

  const currentFilters = () => ({ search, brand, categoryId, flaggedOnly });

  useEffect(() => { load(currentFilters(), page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    setPage(0);
    load(currentFilters(), 0);
  };

  const handleFlaggedToggle = (checked) => {
    setFlaggedOnly(checked);
    setPage(0);
    load({ ...currentFilters(), flaggedOnly: checked }, 0);
  };

  const handleCategoryChange = (value) => {
    setCategoryId(value);
    setPage(0);
    load({ ...currentFilters(), categoryId: value }, 0);
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name || 'this product'}"? This can't be undone.`)) return;
    try {
      await adminDeleteProduct(id, name);
      load(currentFilters(), page);
    } catch (err) {
      window.alert(err.message);
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

      <form onSubmit={handleFilterSubmit} className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Product name</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="admin-field w-full px-3 py-2 rounded-[10px] text-[14px]"
          />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Brand</label>
          <input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Any brand"
            className="admin-field w-full px-3 py-2 rounded-[10px] text-[14px]"
          />
        </div>
        <div className="min-w-[170px]">
          <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Category</label>
          <select
            value={categoryId}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="admin-field w-full px-3 py-2 rounded-[10px] text-[14px]"
          >
            <option value="">All categories</option>
            {CATEGORY_KEYWORDS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 px-3 py-2 rounded-[10px] text-[13px] font-semibold cursor-pointer" style={{ background: 'var(--fill)', color: 'var(--label-1)' }}>
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => handleFlaggedToggle(e.target.checked)} />
          Flagged only
        </label>
        <button type="submit" className="tap-scale px-4 py-2 rounded-[10px] text-[13.5px] font-semibold" style={{ background: 'var(--tint-bg)', color: 'var(--tint)' }}>
          Apply
        </button>
      </form>

      {error && <p className="text-[13px] mb-3" style={{ color: 'var(--v-poor)' }}>{error}</p>}
      {loading && <p className="text-[13px]" style={{ color: 'var(--label-3)' }}>Loading…</p>}
      {!loading && rows.length === 0 && (
        <p className="text-[13px] text-center py-10" style={{ color: 'var(--label-3)' }}>No products match these filters.</p>
      )}

      {rows.length > 0 && (
        <div className="rounded-[14px] overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--separator)' }}>
          <div
            className="grid gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide"
            style={{ gridTemplateColumns: '48px 2.2fr 1fr 1fr 1fr 100px 130px', color: 'var(--label-3)', borderBottom: '1px solid var(--separator)' }}
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
                style={{ gridTemplateColumns: '48px 2.2fr 1fr 1fr 1fr 100px 130px', borderBottom: '1px solid var(--separator)' }}
              >
                <div className="w-9 h-9 rounded-[8px] overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: 'var(--fill)' }}>
                  {r.imageUrl ? <img src={r.imageUrl} alt="" className="w-full h-full object-cover" /> : <span style={{ fontSize: 16 }}>🍽️</span>}
                </div>
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
                <div className="flex items-center gap-3 justify-end">
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
    </AdminLayout>
  );
}
