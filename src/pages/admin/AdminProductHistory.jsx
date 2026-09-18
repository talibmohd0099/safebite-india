// src/pages/admin/AdminProductHistory.jsx
//
// Per-product slice of the activity log (adminActivityRepo.js) -- what
// actually changed on THIS product, and when, reusing the same
// admin_activity_log table the global Activity page reads, just
// filtered to one target_id.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { adminGetProduct } from '../../services/adminProductsRepo';
import { adminListActivityForProduct } from '../../services/adminActivityRepo';

const ACTION_LABEL = {
  create: 'Created',
  update: 'Edited',
  delete: 'Deleted',
  merge: 'Merged (duplicates removed)',
};

const CHANGE_LABEL = {
  productName: 'Name',
  barcode: 'Barcode',
  score: 'Score',
  verdict: 'Verdict',
  brand: 'Brand',
};

function ChangeList({ entry }) {
  const d = entry.details;
  if (!d) return null;

  if (entry.action === 'update' && d.changes) {
    return (
      <ul className="mt-1.5 space-y-0.5">
        {Object.entries(d.changes).map(([key, value]) => (
          <li key={key} className="text-[12.5px]" style={{ color: 'var(--label-2)' }}>
            <span className="font-semibold">{CHANGE_LABEL[key] || key}:</span>{' '}
            {value === 'changed' ? (
              'updated'
            ) : (
              <>
                <span style={{ color: 'var(--v-poor)' }}>{String(value[0] ?? '—')}</span>
                {' → '}
                <span style={{ color: 'var(--v-good)' }}>{String(value[1] ?? '—')}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    );
  }

  if (entry.action === 'create') {
    return <p className="text-[12.5px] mt-1" style={{ color: 'var(--label-3)' }}>Created at score {d.score ?? '—'} ({d.verdict || '—'})</p>;
  }

  if (entry.action === 'delete') {
    return <p className="text-[12.5px] mt-1" style={{ color: 'var(--label-3)' }}>Was at score {d.score ?? '—'} when deleted</p>;
  }

  if (entry.action === 'merge' && d.removedIds) {
    return <p className="text-[12.5px] mt-1" style={{ color: 'var(--label-3)' }}>{d.removedIds.length} duplicate row(s) removed into this one</p>;
  }

  return null;
}

export default function AdminProductHistory() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    adminGetProduct(id).then(setProduct).catch(() => {});
    adminListActivityForProduct(id)
      .then(setEntries)
      .catch((err) => {
        if (/does not exist|schema cache/i.test(err.message)) setNeedsSetup(true);
        else setError(err.message);
      });
  }, [id]);

  return (
    <AdminLayout>
      <Link to="/admin/products" className="tap-scale text-[13px] font-semibold" style={{ color: 'var(--tint)' }}>← Back to products</Link>
      <p className="text-[22px] font-bold tracking-tight mt-2 mb-1" style={{ color: 'var(--label-1)' }}>
        History{product ? `: ${product.product_name || 'Unnamed product'}` : ''}
      </p>
      <p className="text-[12.5px] mb-4" style={{ color: 'var(--label-3)' }}>Every recorded change to this product, oldest first.</p>

      {needsSetup && (
        <div className="rounded-[14px] p-4" style={{ background: 'var(--bg-card)' }}>
          <p className="text-[13.5px]" style={{ color: 'var(--label-2)' }}>
            This needs one-time setup: run <code>supabase/admin_activity_log_schema.sql</code> in the Supabase SQL Editor, then reload this page.
          </p>
        </div>
      )}
      {error && <p className="text-[13px] mb-3" style={{ color: 'var(--v-poor)' }}>{error}</p>}
      {entries === null && !error && !needsSetup && <p className="text-[13px]" style={{ color: 'var(--label-3)' }}>Loading…</p>}
      {entries?.length === 0 && (
        <p className="text-[13px] text-center py-10" style={{ color: 'var(--label-3)' }}>
          Nothing recorded yet — changes made before the activity log was set up won't appear here.
        </p>
      )}

      {entries?.length > 0 && (
        <div className="relative pl-5">
          <div className="absolute left-[7px] top-2 bottom-2 w-px" style={{ background: 'var(--separator)' }} />
          {entries.map((entry) => (
            <div key={entry.id} className="relative mb-4">
              <div className="absolute -left-5 top-1 w-3 h-3 rounded-full" style={{ background: 'var(--tint)' }} />
              <div className="rounded-[12px] p-3.5" style={{ background: 'var(--bg-card)', border: '1px solid var(--separator)' }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13.5px] font-semibold" style={{ color: 'var(--label-1)' }}>{ACTION_LABEL[entry.action] || entry.action}</span>
                  <span className="text-[11.5px] flex-shrink-0" style={{ color: 'var(--label-3)' }}>
                    {new Date(entry.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <ChangeList entry={entry} />
                {entry.actor_email && <p className="text-[11px] mt-1.5" style={{ color: 'var(--label-3)' }}>by {entry.actor_email}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
