// src/pages/admin/AdminDuplicates.jsx
//
// Finds "these are probably the same product" groups across the whole
// catalog (see utils/duplicateDetection.js) and lets the admin pick
// which one to keep -- the exact manual work this session did by hand
// (153 near-duplicate names merged, a Coca-Cola "Soft Drink" vs "Cola
// Soft Drink" pair found), now a repeatable tool instead of a one-off.
import { useEffect, useState } from 'react';
import AdminLayout from './AdminLayout';
import { adminListAllProductsLight, adminMergeProducts } from '../../services/adminProductsRepo';
import { groupPossibleDuplicates } from '../../utils/duplicateDetection';

function GroupCard({ group, onMerged }) {
  const sorted = [...group].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const suggestedKeepId = (
    [...group].sort((a, b) => (Number(b.hasImage) + Number(b.hasNutrition)) - (Number(a.hasImage) + Number(a.hasNutrition)))[0]
  ).id;
  const [keepId, setKeepId] = useState(suggestedKeepId);
  const [merging, setMerging] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const handleMerge = async () => {
    const removeIds = group.filter((p) => p.id !== keepId).map((p) => p.id);
    if (!window.confirm(`Delete ${removeIds.length} other row(s), keeping the one you picked? This can't be undone.`)) return;
    setMerging(true);
    try {
      const keep = group.find((p) => p.id === keepId);
      await adminMergeProducts(keepId, removeIds, keep.productName);
      onMerged();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setMerging(false);
    }
  };

  if (dismissed) return null;

  return (
    <div className="rounded-[14px] p-4 mb-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--separator)' }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[12px] font-semibold" style={{ color: 'var(--label-3)' }}>
          {group.length} possibly-the-same products — pick which one to keep
        </p>
        <button onClick={() => setDismissed(true)} className="tap-scale text-[12px] font-semibold" style={{ color: 'var(--label-3)' }}>
          Not a duplicate — dismiss
        </button>
      </div>

      {sorted.map((p) => (
        <label
          key={p.id}
          className="flex items-center gap-3 py-2 px-2 rounded-[10px] cursor-pointer"
          style={{ background: keepId === p.id ? 'var(--tint-bg)' : 'transparent' }}
        >
          <input type="radio" name={`keep-${group.map((g) => g.id).join('-')}`} checked={keepId === p.id} onChange={() => setKeepId(p.id)} />
          <a href={`#/admin/products/${p.id}/edit`} target="_blank" rel="noreferrer" className="text-[13.5px] font-semibold flex-1 min-w-0 truncate" style={{ color: 'var(--label-1)' }}>
            {p.productName}
          </a>
          <span className="text-[11.5px]" style={{ color: 'var(--label-3)' }}>{p.lookupKey?.split(':')[0]}</span>
          <span className="text-[11.5px]" style={{ color: 'var(--label-3)' }}>score {p.score ?? '—'}</span>
          <span className="text-[11.5px]" style={{ color: p.hasImage ? 'var(--v-good)' : 'var(--label-3)' }}>{p.hasImage ? '🖼️' : '—'}</span>
          <span className="text-[11.5px]" style={{ color: p.hasNutrition ? 'var(--v-good)' : 'var(--label-3)' }}>{p.hasNutrition ? '🧪' : '—'}</span>
        </label>
      ))}

      <button
        onClick={handleMerge}
        disabled={merging}
        className="tap-scale mt-2 px-4 py-2 rounded-[10px] text-[13px] font-semibold text-white"
        style={{ background: 'var(--v-poor)', opacity: merging ? 0.6 : 1 }}
      >
        {merging ? 'Merging…' : `Keep this one, delete the other ${group.length - 1}`}
      </button>
    </div>
  );
}

export default function AdminDuplicates() {
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    setGroups(null);
    try {
      const all = await adminListAllProductsLight();
      setGroups(groupPossibleDuplicates(all));
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <AdminLayout>
      <p className="text-[22px] font-bold tracking-tight mb-1" style={{ color: 'var(--label-1)' }}>Possible duplicates</p>
      <p className="text-[13px] mb-4" style={{ color: 'var(--label-3)' }}>
        Grouped by brand and name, ignoring pack size — checks the whole catalog, so this can take a few seconds.
      </p>

      {error && <p className="text-[13px] mb-3" style={{ color: 'var(--v-poor)' }}>{error}</p>}
      {groups === null && !error && <p className="text-[13px]" style={{ color: 'var(--label-3)' }}>Scanning the catalog…</p>}
      {groups !== null && groups.length === 0 && (
        <p className="text-[13px] text-center py-10" style={{ color: 'var(--label-3)' }}>No likely duplicates found. 🎉</p>
      )}
      {groups?.length > 0 && (
        <p className="text-[12px] mb-3" style={{ color: 'var(--label-3)' }}>{groups.length} group(s) found.</p>
      )}

      {groups?.map((group) => (
        <GroupCard key={group.map((p) => p.id).join('-')} group={group} onMerged={load} />
      ))}
    </AdminLayout>
  );
}
