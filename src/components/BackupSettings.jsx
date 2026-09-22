// src/components/BackupSettings.jsx
//
// Family profiles and the My Intake log only ever live on this one device
// (see localBackup.js) -- reinstalling the app or switching phones would
// otherwise lose them silently. This card is the reliable way to carry
// them over: export a file before uninstalling/switching, restore it
// after. Shown on both web and the Android app.
import { useRef, useState } from 'react';
import { exportBackup, parseBackupFile, restoreBackup, describeBackup, buildBackup } from '../services/localBackup';

export default function BackupSettings() {
  const fileInputRef = useRef(null);
  const [status, setStatus] = useState(null); // { kind: 'ok'|'error', text }
  const [busy, setBusy] = useState(false);
  const hasAnything = Object.keys(buildBackup().data).length > 0;

  const handleExport = async () => {
    setStatus(null);
    setBusy(true);
    try {
      const ok = await exportBackup();
      setStatus(ok ? { kind: 'ok', text: 'Backup ready — choose where to save or send it.' } : { kind: 'error', text: "Couldn't create a backup file." });
    } finally {
      setBusy(false);
    }
  };

  const handlePickFile = () => fileInputRef.current?.click();

  const handleFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be picked again later
    if (!file) return;
    setStatus(null);
    try {
      const backup = await parseBackupFile(file);
      const { parts, exportedAt } = describeBackup(backup);
      if (parts.length === 0) {
        setStatus({ kind: 'error', text: "This backup file doesn't contain anything FoodGuard recognises." });
        return;
      }
      const when = exportedAt ? new Date(exportedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'an earlier backup';
      const ok = window.confirm(
        `Restore ${parts.join(' and ')} from ${when}?\n\nThis replaces what's currently on this device for ${parts.join(' and ')} — it can't be undone.`
      );
      if (!ok) return;
      restoreBackup(backup);
      setStatus({ kind: 'ok', text: 'Restored. Reloading…' });
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      setStatus({ kind: 'error', text: err.message || "Couldn't read that file." });
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 mb-4">
      <h2 className="font-bold text-slate-800 dark:text-slate-100 mb-1">💾 Backup & Restore</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
        Family profiles and your My Intake log live only on this device — reinstalling the app loses them unless you back them up first.
      </p>

      <div className="flex gap-2">
        <button
          onClick={handleExport}
          disabled={busy || !hasAnything}
          className="tap-scale flex-1 py-2.5 rounded-xl text-[13.5px] font-semibold bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white transition-colors"
        >
          📤 Export backup
        </button>
        <button
          onClick={handlePickFile}
          className="tap-scale flex-1 py-2.5 rounded-xl text-[13.5px] font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
        >
          📥 Restore
        </button>
        <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleFileChosen} />
      </div>

      {!hasAnything && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2.5">Nothing to back up yet — add a Family profile or log something first.</p>
      )}
      {status && (
        <p className={`text-xs mt-2.5 rounded-lg px-3 py-2 ${status.kind === 'ok' ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950' : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950'}`}>
          {status.text}
        </p>
      )}
    </div>
  );
}
