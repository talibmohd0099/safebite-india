// src/pages/admin/AdminDataIssuesList.jsx
//
// Products the audit scripts (scripts/fix-sodium-outliers.js and
// friends) checked against their real source and still couldn't resolve
// automatically -- see supabase/product_data_issues_schema.sql. Same
// shape as AdminFlagsList.jsx (real user reports), just a different
// origin and a free-text "reason" instead of a fixed category.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { adminListDataIssues, adminResolveDataIssue, adminReopenDataIssue, adminFindProductByLookupKey } from '../../services/adminDataIssuesRepo';

export default function AdminDataIssuesList() {
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
      const { rows: r, count: c } = await adminListDataIssues({ status: statusValue, limit: 100 });
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
      await adminResolveDataIssue(id, productName);
      load(status);
    } catch (err) {
      window.alert(err.message);
    }
  };

  const handleReopen = async (id, productName) => {
    try {
      await adminReopenDataIssue(id, productName);
      load(status);
    } catch (err) {
      window.alert(err.message);
    }
  };

  const handleGoToProduct = async (lookupKey) => {
    const product = await adminFindProductByLookupKey(lookupKey);
    if (product) navigate(`/admin/products/${product.id}/edit`);
    else window.alert('No saved product matches this anymore -- it may have already been removed or re-keyed.');
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--label-1)' }}>
          Manual review <span style={{ color: 'var(--label-3)', fontWeight: 500 }}>({count})</span>
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
      <p className="text-[12.5px] mb-4" style={{ color: 'var(--label-3)' }}>
        Data-quality issues the audit scripts checked against their real source (Open Food Facts / Blinkit's own page)
        and still couldn't resolve on their own -- usually because the source itself is ambiguous or looks wrong. Fix the
        product's numbers by hand (Edit product), then mark it resolved so it drops off this list.
      </p>

      {error && <p className="text-[13px] mb-3" style={{ color: 'var(--v-poor)' }}>{error}</p>}
      {loading && <p className="text-[13px]" style={{ color: 'var(--label-3)' }}>Loading…</p>}
      {!loading && rows.length === 0 && (
        <p className="text-[13px] text-center py-10" style={{ color: 'var(--label-3)' }}>
          {status === 'open' ? 'Nothing waiting on manual review right now.' : 'No issues here.'}
        </p>
      )}

      {rows.map((issue) => (
        <div key={issue.id} className="rounded-[14px] p-4 mb-2.5" style={{ background: 'var(--bg-card)', border: '1px solid var(--separator)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[14.5px] font-semibold" style={{ color: 'var(--label-1)' }}>{issue.product_name || 'Unnamed product'}</p>
              {issue.nutrient && (
                <p className="text-[12.5px] mt-0.5 font-semibold" style={{ color: 'var(--tint)' }}>
                  {issue.nutrient}: {issue.current_value ?? '—'}{issue.unit || ''} <span style={{ color: 'var(--label-3)', fontWeight: 400 }}>(per 100g/ml)</span>
                </p>
              )}
              <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: 'var(--label-2)' }}>{issue.reason}</p>
              <p className="text-[11.5px] mt-1.5" style={{ color: 'var(--label-3)' }}>
                {issue.source ? `${issue.source} · ` : ''}Seen as {issue.score_at_detection ?? '—'}/100 ({issue.verdict_at_detection || '—'}) ·{' '}
                {new Date(issue.detected_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              {issue.lookup_key && (
                <button onClick={() => handleGoToProduct(issue.lookup_key)} className="tap-scale text-[13px] font-semibold" style={{ color: 'var(--tint)' }}>
                  Edit product
                </button>
              )}
              {issue.status === 'open' ? (
                <button onClick={() => handleResolve(issue.id, issue.product_name)} className="tap-scale text-[13px] font-semibold" style={{ color: 'var(--v-good)' }}>
                  Mark resolved
                </button>
              ) : (
                <button onClick={() => handleReopen(issue.id, issue.product_name)} className="tap-scale text-[13px] font-semibold" style={{ color: 'var(--label-3)' }}>
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
