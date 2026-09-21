// src/pages/admin/AdminSubmissionsList.jsx
//
// Users have been able to submit a product FoodGuard couldn't find by
// barcode (SubmitProduct.jsx -> product_submissions), but nothing ever
// showed what they'd sent in -- this is that missing other half, same
// shape as AdminFlagsList.jsx.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { adminListSubmissions, adminRejectSubmission, adminReopenSubmission } from '../../services/adminSubmissionsRepo';

function Photo({ label, dataUrl }) {
  if (!dataUrl) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="w-20 h-20 rounded-[10px] flex items-center justify-center text-[11px]" style={{ background: 'var(--fill)', color: 'var(--label-3)' }}>
          none
        </div>
        <span className="text-[10.5px]" style={{ color: 'var(--label-3)' }}>{label}</span>
      </div>
    );
  }
  return (
    <a href={dataUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1">
      <img src={dataUrl} alt={label} className="w-20 h-20 rounded-[10px] object-cover" style={{ border: '1px solid var(--separator)' }} />
      <span className="text-[10.5px]" style={{ color: 'var(--label-3)' }}>{label}</span>
    </a>
  );
}

export default function AdminSubmissionsList() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (statusValue) => {
    setLoading(true);
    setError('');
    try {
      const { rows: r, count: c } = await adminListSubmissions({ status: statusValue, limit: 100 });
      setRows(r);
      setCount(c);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(status); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateProduct = (sub) => {
    navigate('/admin/products/new', {
      state: {
        fromSubmission: {
          submissionId: sub.id,
          barcode: sub.barcode,
          productName: sub.product_name,
          productPhoto: sub.product_photo,
          ingredientsPhoto: sub.ingredients_photo,
          nutritionPhoto: sub.nutrition_photo,
        },
      },
    });
  };

  const handleReject = async (id) => {
    const reason = window.prompt('Why reject this submission? (optional)') || null;
    try {
      await adminRejectSubmission(id, reason);
      load(status);
    } catch (err) {
      window.alert(err.message);
    }
  };

  const handleReopen = async (id) => {
    try {
      await adminReopenSubmission(id);
      load(status);
    } catch (err) {
      window.alert(err.message);
    }
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--label-1)' }}>
          Submitted products <span style={{ color: 'var(--label-3)', fontWeight: 500 }}>({count})</span>
        </p>
        <div className="flex gap-2">
          {['pending', 'approved', 'rejected', 'all'].map((s) => (
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
          {status === 'pending' ? 'Nothing submitted right now.' : 'No submissions here.'}
        </p>
      )}

      {rows.map((sub) => (
        <div key={sub.id} className="rounded-[14px] p-4 mb-2.5 flex items-start justify-between gap-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--separator)' }}>
          <div className="flex items-start gap-4 min-w-0">
            <div className="flex gap-2 flex-shrink-0">
              <Photo label="Product" dataUrl={sub.product_photo} />
              <Photo label="Ingredients" dataUrl={sub.ingredients_photo} />
              <Photo label="Nutrition" dataUrl={sub.nutrition_photo} />
            </div>
            <div className="min-w-0">
              <p className="text-[14.5px] font-semibold" style={{ color: 'var(--label-1)' }}>{sub.product_name || 'Unnamed product'}</p>
              <p className="text-[12.5px] mt-0.5 font-mono" style={{ color: 'var(--tint)' }}>{sub.barcode}</p>
              {sub.notes && <p className="text-[13px] mt-1.5" style={{ color: 'var(--label-2)' }}>“{sub.notes}”</p>}
              {sub.admin_notes && <p className="text-[12px] mt-1.5" style={{ color: 'var(--v-poor)' }}>Rejected: {sub.admin_notes}</p>}
              <p className="text-[11.5px] mt-1.5" style={{ color: 'var(--label-3)' }}>
                {new Date(sub.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {sub.status === 'pending' && (
              <>
                <button onClick={() => handleCreateProduct(sub)} className="tap-scale text-[13px] font-semibold" style={{ color: 'var(--v-good)' }}>
                  Create product →
                </button>
                <button onClick={() => handleReject(sub.id)} className="tap-scale text-[13px] font-semibold" style={{ color: 'var(--v-poor)' }}>
                  Reject
                </button>
              </>
            )}
            {sub.status === 'rejected' && (
              <button onClick={() => handleReopen(sub.id)} className="tap-scale text-[13px] font-semibold" style={{ color: 'var(--label-3)' }}>
                Re-open
              </button>
            )}
            {sub.status === 'approved' && (
              <span className="text-[13px] font-semibold" style={{ color: 'var(--v-good)' }}>✓ Approved</span>
            )}
          </div>
        </div>
      ))}
    </AdminLayout>
  );
}
