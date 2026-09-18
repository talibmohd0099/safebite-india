// src/pages/admin/AdminFlagsList.jsx
//
// Real users have been able to report a problem with a result for a
// while (productFlags.js), but nothing ever showed what they'd sent in
// -- this is that missing other half.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { adminListFlags, adminResolveFlag, adminReopenFlag, adminFindProductByLookupKey } from '../../services/adminFlagsRepo';
import { FLAG_REASONS } from '../../services/productFlags';

const REASON_LABEL = Object.fromEntries(FLAG_REASONS.map((r) => [r.key, r.label]));

export default function AdminFlagsList() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('open');
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (statusValue) => {
    setLoading(true);
    setError('');
    try {
      const { rows: r, count: c } = await adminListFlags({ status: statusValue, limit: 100 });
      setRows(r);
      setCount(c);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(status); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResolve = async (id, productName) => {
    try {
      await adminResolveFlag(id, productName);
      load(status);
    } catch (err) {
      window.alert(err.message);
    }
  };

  const handleReopen = async (id, productName) => {
    try {
      await adminReopenFlag(id, productName);
      load(status);
    } catch (err) {
      window.alert(err.message);
    }
  };

  const handleGoToProduct = async (lookupKey) => {
    const product = await adminFindProductByLookupKey(lookupKey);
    if (product) navigate(`/admin/products/${product.id}/edit`);
    else window.alert('This scan was never saved to the shared cache, so there’s nothing to edit.');
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--label-1)' }}>
          Reported issues <span style={{ color: 'var(--label-3)', fontWeight: 500 }}>({count})</span>
        </p>
        <div className="flex gap-2">
          {['open', 'resolved', 'all'].map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className="tap-scale px-3 py-1.5 rounded-full text-[13px] font-semibold capitalize"
              style={{ background: status === s ? 'var(--tint)' : 'var(--fill)', color: status === s ? '#fff' : 'var(--label-1)' }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-[13px] mb-3" style={{ color: 'var(--v-poor)' }}>{error}</p>}
      {loading && <p className="text-[13px]" style={{ color: 'var(--label-3)' }}>Loading…</p>}
      {!loading && rows.length === 0 && (
        <p className="text-[13px] text-center py-10" style={{ color: 'var(--label-3)' }}>
          {status === 'open' ? 'Nothing reported right now.' : 'No flags here.'}
        </p>
      )}

      {rows.map((flag) => (
        <div key={flag.id} className="rounded-[14px] p-4 mb-2.5" style={{ background: 'var(--bg-card)', border: '1px solid var(--separator)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[14.5px] font-semibold" style={{ color: 'var(--label-1)' }}>{flag.product_name || 'Unnamed product'}</p>
              <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--tint)' }}>{REASON_LABEL[flag.reason] || flag.reason}</p>
              {flag.remarks && <p className="text-[13px] mt-1.5" style={{ color: 'var(--label-2)' }}>“{flag.remarks}”</p>}
              <p className="text-[11.5px] mt-1.5" style={{ color: 'var(--label-3)' }}>
                Seen as {flag.score_at_flag ?? '—'}/100 ({flag.verdict_at_flag || '—'}) · {new Date(flag.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              {flag.lookup_key && (
                <button onClick={() => handleGoToProduct(flag.lookup_key)} className="tap-scale text-[13px] font-semibold" style={{ color: 'var(--tint)' }}>
                  Edit product
                </button>
              )}
              {flag.status === 'open' ? (
                <button onClick={() => handleResolve(flag.id, flag.product_name)} className="tap-scale text-[13px] font-semibold" style={{ color: 'var(--v-good)' }}>
                  Mark resolved
                </button>
              ) : (
                <button onClick={() => handleReopen(flag.id, flag.product_name)} className="tap-scale text-[13px] font-semibold" style={{ color: 'var(--label-3)' }}>
                  Re-open
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </AdminLayout>
  );
}
