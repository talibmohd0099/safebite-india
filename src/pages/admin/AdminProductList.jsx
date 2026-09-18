// src/pages/admin/AdminProductList.jsx
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { adminListProducts, adminDeleteProduct } from '../../services/adminProductsRepo';

const PAGE_SIZE = 25;

export default function AdminProductList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (searchValue, pageValue) => {
    setLoading(true);
    setError('');
    try {
      const { rows: r, count: c } = await adminListProducts({
        search: searchValue,
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

  useEffect(() => { load(search, page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(0);
    load(search, 0);
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name || 'this product'}"? This can't be undone.`)) return;
    try {
      await adminDeleteProduct(id);
      load(search, page);
    } catch (err) {
      window.alert(err.message);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/admin', { replace: true });
  };

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="page-in max-w-2xl mx-auto px-4 py-6 pb-24">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--label-1)' }}>Products</p>
        <button onClick={handleSignOut} className="tap-scale text-[13px] font-semibold" style={{ color: 'var(--label-3)' }}>
          Sign out
        </button>
      </div>

      <form onSubmit={handleSearchSubmit} className="flex gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by product name…"
          className="flex-1 px-3.5 py-2.5 rounded-[12px] text-[15px] outline-none"
          style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
        />
        <button type="submit" className="tap-scale px-4 rounded-[12px] text-[14px] font-semibold" style={{ background: 'var(--fill)', color: 'var(--tint)' }}>
          Search
        </button>
      </form>

      <Link
        to="/admin/products/new"
        className="tap-scale block text-center w-full py-3 rounded-[12px] text-[15px] font-semibold text-white mb-4"
        style={{ background: 'var(--tint)' }}
      >
        + Add new product
      </Link>

      {error && <p className="text-[13px] mb-3" style={{ color: 'var(--v-poor)' }}>{error}</p>}
      {loading && <p className="text-[13px]" style={{ color: 'var(--label-3)' }}>Loading…</p>}

      {!loading && rows.length === 0 && (
        <p className="text-[13px] text-center py-8" style={{ color: 'var(--label-3)' }}>No products found.</p>
      )}

      {rows.map((row) => (
        <div key={row.id} className="rounded-[14px] p-3.5 mb-2.5 item-in" style={{ background: 'var(--bg-card)' }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[14.5px] font-semibold truncate" style={{ color: 'var(--label-1)' }}>
                {row.product_name || 'Unnamed product'}
              </p>
              <p className="text-[11.5px] truncate mt-0.5" style={{ color: 'var(--label-3)' }}>
                {row.source} · {row.lookup_key}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Link to={`/admin/products/${row.id}/edit`} className="tap-scale text-[13px] font-semibold" style={{ color: 'var(--tint)' }}>
                Edit
              </Link>
              <button
                onClick={() => handleDelete(row.id, row.product_name)}
                className="tap-scale text-[13px] font-semibold"
                style={{ color: 'var(--v-poor)' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}

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
    </div>
  );
}
