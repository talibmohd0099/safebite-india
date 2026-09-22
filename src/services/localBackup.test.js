import test from 'node:test';
import assert from 'node:assert/strict';

// buildBackup/restoreBackup/describeBackup only touch localStorage -- the
// File/navigator.share/document parts of exportBackup and parseBackupFile
// are browser-only and covered by a live check instead, same convention
// as intakeLog.test.js.
function makeMemoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}
globalThis.localStorage = makeMemoryStorage();

const { buildBackup, restoreBackup, describeBackup } = await import('./localBackup.js');

const reset = () => globalThis.localStorage.clear();

test('buildBackup only includes keys that actually have a value on this device', () => {
  reset();
  localStorage.setItem('foodguard-family-profiles', '[{"nickname":"Me"}]');
  const backup = buildBackup();
  assert.deepEqual(Object.keys(backup.data), ['foodguard-family-profiles']);
  assert.equal(backup.data['foodguard-family-profiles'], '[{"nickname":"Me"}]');
  assert.equal(backup.version, 1);
  assert.ok(backup.exportedAt);
});

test('buildBackup is empty (no keys) on a device with nothing to back up', () => {
  reset();
  assert.deepEqual(buildBackup().data, {});
});

test('restoreBackup writes each recognised key back and reports what it restored', () => {
  reset();
  const backup = { data: { 'foodguard-family-profiles': '[{"nickname":"Dad"}]', 'foodguard-intake-log': '[]' } };
  const restored = restoreBackup(backup);
  assert.deepEqual(restored.sort(), ['foodguard-family-profiles', 'foodguard-intake-log']);
  assert.equal(localStorage.getItem('foodguard-family-profiles'), '[{"nickname":"Dad"}]');
});

test('restoreBackup ignores keys it does not recognise, without throwing', () => {
  reset();
  const restored = restoreBackup({ data: { 'some-other-apps-key': 'x' } });
  assert.deepEqual(restored, []);
  assert.equal(localStorage.getItem('some-other-apps-key'), null);
});

test('restoreBackup overwrites whatever is currently on this device', () => {
  reset();
  localStorage.setItem('foodguard-intake-log', '[{"old":true}]');
  restoreBackup({ data: { 'foodguard-intake-log': '[{"new":true}]' } });
  assert.equal(localStorage.getItem('foodguard-intake-log'), '[{"new":true}]');
});

test('describeBackup names what a backup actually contains, for a confirmation prompt', () => {
  const { parts } = describeBackup({ data: { 'foodguard-family-profiles': '[]' } });
  assert.deepEqual(parts, ['Family profiles']);
  const both = describeBackup({ data: { 'foodguard-family-profiles': '[]', 'foodguard-intake-log': '[]' } });
  assert.deepEqual(both.parts, ['Family profiles', 'My Intake log']);
  assert.deepEqual(describeBackup({ data: {} }).parts, []);
});
