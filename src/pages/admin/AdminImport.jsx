// src/pages/admin/AdminImport.jsx
//
// Bulk-add products from a pasted/uploaded CSV. Each row goes through
// the exact same analyzeText() pipeline the single-product form uses
// (see AdminProductForm.jsx) -- no separate, cheaper "import score".
// Processed one row at a time with a real pause between rows: each row
// costs at least one Gemini call, and the free tier's 15-requests/min
// limit is the same one every other AI feature in this app shares.
import { useRef, useState } from 'react';
import AdminLayout from './AdminLayout';
import { parseCsvObjects } from '../../utils/csv';
import { analyzeText } from '../../services/analyzeText';
import { barcodeKey, textKey } from '../../services/productCache';
import { adminCreateProduct, adminFindByName, adminFindByBarcode } from '../../services/adminProductsRepo';

const REQUIRED_COLUMNS = ['productname', 'ingredientstext'];
const ROW_GAP_MS = 4500; // free-tier Gemini limit is 15 requests/min

const SAMPLE = `productName,brand,barcode,ingredientsText
Rock Salt,Tata,,"Rock Salt"
Chana Dal,Fortune,,"Chana Dal (Split Bengal Gram)"`;

export default function AdminImport() {
  const fileInputRef = useRef(null);
  const [csvText, setCsvText] = useState('');
  const [rows, setRows] = useState(null);
  const [parseError, setParseError] = useState('');
  const [results, setResults] = useState([]); // { row, status: 'pending'|'ok'|'skipped'|'error', message }
  const [importing, setImporting] = useState(false);
  const [stopped, setStopped] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setCsvText(await file.text());
  };

  const handleParse = () => {
    setParseError('');
    setResults([]);
    const parsed = parseCsvObjects(csvText);
    if (parsed.length === 0) { setParseError('No rows found.'); setRows(null); return; }
    const headers = Object.keys(parsed[0]);
    const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
    if (missing.length > 0) { setParseError(`Missing required column(s): ${missing.join(', ')}`); setRows(null); return; }
    setRows(parsed);
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const handleImport = async () => {
    setImporting(true);
    setStopped(false);
    const liveResults = rows.map((row) => ({ row, status: 'pending', message: '' }));
    setResults([...liveResults]);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const productName = row.productname?.trim();
      const ingredientsText = row.ingredientstext?.trim();
      const brand = row.brand?.trim();
      const barcode = row.barcode?.trim();

      if (!productName || !ingredientsText) {
        liveResults[i] = { row, status: 'error', message: 'Missing product name or ingredients text.' };
        setResults([...liveResults]);
        continue;
      }

      try {
        if (barcode) {
          const dup = await adminFindByBarcode(barcode);
          if (dup) { liveResults[i] = { row, status: 'skipped', message: `Barcode already used by "${dup.product_name}".` }; setResults([...liveResults]); continue; }
        }
        const nameDup = await adminFindByName(productName);
        if (nameDup) { liveResults[i] = { row, status: 'skipped', message: `Name already exists ("${nameDup.product_name}").` }; setResults([...liveResults]); continue; }

        const result = await analyzeText(ingredientsText, productName, brand || undefined);
        const lookupKey = barcode ? barcodeKey(barcode) : textKey(ingredientsText);
        const source = barcode ? 'barcode' : 'text';
        await adminCreateProduct({ lookupKey, source, productName, ingredientsText, report: result.report });
        liveResults[i] = { row, status: 'ok', message: `Score ${result.report.overallScore}` };
      } catch (err) {
        liveResults[i] = { row, status: 'error', message: err.message };
        // A quota error will fail every remaining row identically -- stop
        // instead of burning through the whole list to find that out.
        if (/quota|rate limit|429/i.test(err.message)) {
          setResults([...liveResults]);
          setStopped(true);
          break;
        }
      }
      setResults([...liveResults]);
      if (i < rows.length - 1) await sleep(ROW_GAP_MS);
    }
    setImporting(false);
  };

  const STATUS_COLOR = { pending: 'var(--label-3)', ok: 'var(--v-good)', skipped: 'var(--v-moderate)', error: 'var(--v-poor)' };
  const STATUS_LABEL = { pending: 'Waiting…', ok: 'Added', skipped: 'Skipped', error: 'Failed' };

  return (
    <AdminLayout>
      <p className="text-[22px] font-bold tracking-tight mb-1" style={{ color: 'var(--label-1)' }}>Bulk import</p>
      <p className="text-[13px] mb-4" style={{ color: 'var(--label-3)' }}>
        CSV with columns: <code>productName</code>, <code>brand</code>, <code>barcode</code>, <code>ingredientsText</code>
        {' '}(brand/barcode optional). Each row runs the full analysis, so this is slow by design — about 5 seconds a row.
      </p>

      <div className="rounded-[16px] p-4 mb-4" style={{ background: 'var(--bg-card)' }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[13px] font-semibold" style={{ color: 'var(--label-2)' }}>Paste CSV, or choose a file</p>
          <button onClick={() => fileInputRef.current?.click()} className="tap-scale text-[13px] font-semibold" style={{ color: 'var(--tint)' }}>Choose file</button>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
        </div>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={6}
          placeholder={SAMPLE}
          className="w-full px-3.5 py-2.5 rounded-[12px] text-[13px] font-mono outline-none resize-none"
          style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
        />
        {parseError && <p className="text-[13px] mt-2" style={{ color: 'var(--v-poor)' }}>{parseError}</p>}
        <button
          onClick={handleParse}
          disabled={!csvText.trim() || importing}
          className="tap-scale mt-3 px-4 py-2.5 rounded-[10px] text-[14px] font-semibold text-white"
          style={{ background: 'var(--tint)', opacity: !csvText.trim() || importing ? 0.5 : 1 }}
        >
          Parse
        </button>
      </div>

      {rows && results.length === 0 && (
        <div className="rounded-[16px] p-4 mb-4" style={{ background: 'var(--bg-card)' }}>
          <p className="text-[13px] mb-3" style={{ color: 'var(--label-2)' }}>{rows.length} row(s) parsed — ready to import.</p>
          <button
            onClick={handleImport}
            disabled={importing}
            className="tap-scale px-4 py-2.5 rounded-[10px] text-[14px] font-semibold text-white"
            style={{ background: 'var(--v-very-healthy)', opacity: importing ? 0.6 : 1 }}
          >
            Import all {rows.length}
          </button>
        </div>
      )}

      {results.length > 0 && (
        <div className="rounded-[14px] overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--separator)' }}>
          {stopped && (
            <p className="text-[13px] p-3" style={{ background: 'var(--v-poor-bg)', color: 'var(--v-poor)' }}>
              Stopped early — Gemini quota ran out. The remaining rows below were never attempted; re-run this same CSV once quota resets.
            </p>
          )}
          {results.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-4 py-2 text-[13px]" style={{ borderBottom: '1px solid var(--separator)' }}>
              <span className="truncate flex-1" style={{ color: 'var(--label-1)' }}>{r.row.productname}</span>
              <span style={{ color: 'var(--label-3)' }} className="truncate flex-1 text-[12px]">{r.message}</span>
              <span className="font-semibold flex-shrink-0" style={{ color: STATUS_COLOR[r.status] }}>{STATUS_LABEL[r.status]}</span>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
