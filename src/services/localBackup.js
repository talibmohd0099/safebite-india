// src/services/localBackup.js
//
// Export/import for the data that only ever lives on this one device
// (Family profiles, My Intake log) -- there is no account/server sync in
// this app, so reinstalling the APK or switching phones otherwise loses
// it. This is the RELIABLE way to carry it over: export a file before
// uninstalling/switching, restore it after.
//
// Android's own "allowBackup" (AndroidManifest.xml) is already on, which
// lets the OS include app data in a Google-account backup -- but whether
// that actually captures/restores a WebView's localStorage reliably
// varies by Android version, OEM and the person's own backup settings,
// and isn't something this app can guarantee. This export/import is the
// one path that's fully within the app's own control and testable.
//
// Deliberately reads/writes the RAW localStorage string for each key,
// never re-parsing or re-shaping it -- the backup is a faithful copy, not
// a reinterpretation, so a future change to any of these features' own
// internal shape doesn't require this file to change too.
const BACKUP_KEYS = [
  'foodguard-family-profiles',
  'foodguard-active-profile-id',
  'foodguard-intake-log',
  'foodguard-intake-last-portion',
];

const BACKUP_VERSION = 1;

/** Builds the backup object. Only includes keys that actually have a value on this device. */
export function buildBackup() {
  const data = {};
  for (const key of BACKUP_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) data[key] = value;
  }
  return { app: 'FoodGuard India', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
}

function backupFileName() {
  const d = new Date().toISOString().slice(0, 10);
  return `foodguard-backup-${d}.json`;
}

/**
 * Hands the backup off to the OS share sheet (save to Drive/Files, send to
 * yourself, etc.) -- same navigator.share mechanism the app already uses
 * for sharing a report. Falls back to a plain browser download when
 * sharing isn't available (e.g. testing in a desktop browser).
 * @returns {Promise<boolean>} whether it was handed off successfully.
 */
export async function exportBackup() {
  const backup = buildBackup();
  if (Object.keys(backup.data).length === 0) return false;

  const json = JSON.stringify(backup, null, 2);
  const file = new File([json], backupFileName(), { type: 'application/json' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'FoodGuard backup' });
      return true;
    } catch {
      // Cancelled or failed -- fall through to a plain download instead
      // of leaving the person with nothing.
    }
  }

  try {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}

/** Reads and validates a backup file (from a file input). Throws a plain, user-facing message on anything wrong. */
export async function parseBackupFile(file) {
  let text;
  try {
    text = await file.text();
  } catch {
    throw new Error("Couldn't read that file.");
  }
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error("That doesn't look like a FoodGuard backup file.");
  }
  if (!backup || typeof backup !== 'object' || !backup.data || typeof backup.data !== 'object') {
    throw new Error("That doesn't look like a FoodGuard backup file.");
  }
  return backup;
}

/**
 * Writes a backup's data back into localStorage, overwriting whatever is
 * currently there for each key the backup actually contains -- keys the
 * backup doesn't mention (or doesn't recognise) are left untouched.
 * @returns the list of keys actually restored.
 */
export function restoreBackup(backup) {
  const restored = [];
  for (const key of BACKUP_KEYS) {
    const value = backup?.data?.[key];
    if (typeof value === 'string') {
      try {
        localStorage.setItem(key, value);
        restored.push(key);
      } catch { /* private mode etc. */ }
    }
  }
  return restored;
}

/** A short, human summary of what a parsed backup contains, for a confirmation prompt before overwriting anything. */
export function describeBackup(backup) {
  const hasFamily = 'foodguard-family-profiles' in (backup?.data || {});
  const hasIntake = 'foodguard-intake-log' in (backup?.data || {});
  const parts = [];
  if (hasFamily) parts.push('Family profiles');
  if (hasIntake) parts.push('My Intake log');
  return { parts, exportedAt: backup?.exportedAt || null };
}
