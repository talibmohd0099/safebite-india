// src/pages/admin/AdminProductForm.jsx
//
// Add and edit share this one form. "Analyze" runs the exact same
// pipeline a real text scan uses (analyzeText.js -> the same ingredient
// database and scoring rules every other product goes through), so a
// manually-added product is scored the same way as one a real user
// scanned -- never a separately-invented "admin score". The generated
// score/verdict/summary/recommendation are then directly editable
// below, for the real correction cases this session kept running into
// (a wrong AI verdict, a name that needs fixing).
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { analyzeText } from '../../services/analyzeText';
import { buildReport } from '../../services/scoringEngine';
import { extractIngredientsFromImage } from '../../services/geminiService';
import { barcodeKey, textKey } from '../../services/productCache';
import {
  adminGetProduct,
  adminCreateProduct,
  adminUpdateProduct,
  adminFindByName,
  adminFindByBarcode,
} from '../../services/adminProductsRepo';
import { imageFileFromClipboard, compressImageToDataUrl } from '../../utils/adminImage';

const VERDICTS = ['Excellent', 'Good', 'Moderately Healthy', 'Poor', 'Very Poor'];

// The 4 keys analyzeText.js's nutrientsInfo actually scores against
// (dailyHabitCheck.js's NUTRIENT_LIMITS), plus the rest kept purely for
// a complete, displayable nutrition record -- same fields Blinkit
// stores (see NUTRITION_FIELDS in services/blinkit.js), so a manually
// added product's data looks like every scraped one's.
const NUTRIENT_FIELDS = [
  { key: 'energyKcal', label: 'Energy', unit: 'kcal' },
  { key: 'proteinG', label: 'Protein', unit: 'g' },
  { key: 'totalCarbG', label: 'Total Carbohydrates', unit: 'g' },
  { key: 'totalSugarG', label: 'Total Sugar', unit: 'g' },
  { key: 'addedSugarG', label: 'Added Sugar', unit: 'g', scored: true },
  { key: 'totalFatG', label: 'Total Fat', unit: 'g' },
  { key: 'saturatedFatG', label: 'Saturated Fat', unit: 'g', scored: true },
  { key: 'transFatG', label: 'Trans Fat', unit: 'g', scored: true },
  { key: 'fiberG', label: 'Fiber', unit: 'g' },
  { key: 'sodiumMg', label: 'Sodium', unit: 'mg', scored: true },
  { key: 'calciumMg', label: 'Calcium', unit: 'mg' },
];

function NutrientField({ label, value, onChange, unit, scored }) {
  return (
    <div>
      <label className="block text-[11.5px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>
        {label} {scored && <span title="Feeds the daily-habit score check">•</span>}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-[10px] text-[14px] outline-none"
          style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
        />
        <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--label-3)' }}>{unit}</span>
      </div>
    </div>
  );
}

function DuplicateWarning({ match, label, onOverride, overridden, blocking }) {
  if (!match) return null;
  return (
    <div
      className="rounded-[10px] px-3 py-2 mt-1.5 text-[12.5px] flex items-center justify-between gap-3"
      style={{ background: 'var(--v-poor-bg)', color: 'var(--v-poor)' }}
    >
      <span>{label} “{match.product_name}” already exists.{' '}
        <a href={`#/admin/products/${match.id}/edit`} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
          Open it
        </a>
      </span>
      {!blocking && (
        <label className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer">
          <input type="checkbox" checked={overridden} onChange={(e) => onOverride(e.target.checked)} />
          Different product, save anyway
        </label>
      )}
    </div>
  );
}

export default function AdminProductForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const pasteAreaRef = useRef(null);

  const [loadingExisting, setLoadingExisting] = useState(isEdit);
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState('');
  const [ingredientsText, setIngredientsText] = useState('');
  const [photoFile, setPhotoFile] = useState(null); // raw File, for the extract-from-photo call
  const [photoDataUrl, setPhotoDataUrl] = useState(''); // compressed, what actually gets saved

  const [nutrients, setNutrients] = useState({});
  const [servingGrams, setServingGrams] = useState('');
  const setNutrient = (key, value) => setNutrients((prev) => ({ ...prev, [key]: value }));

  const [report, setReport] = useState(null);

  const [nameDuplicate, setNameDuplicate] = useState(null);
  const [nameDuplicateOverride, setNameDuplicateOverride] = useState(false);
  const [barcodeDuplicate, setBarcodeDuplicate] = useState(null);

  useEffect(() => {
    if (!isEdit) return;
    adminGetProduct(id)
      .then((row) => {
        if (!row) { setError('Product not found.'); return; }
        const r = row.report || {};
        setProductName(row.product_name || r.productName || '');
        setBrand(r.brand || '');
        setBarcode(row.lookup_key?.startsWith('barcode:') ? row.lookup_key.slice('barcode:'.length) : '');
        setIngredientsText(row.ingredients_text || '');
        if (r.imageUrl) setPhotoDataUrl(r.imageUrl);
        if (r.nutritionPanel) setNutrients(r.nutritionPanel);
        else if (r.realNutrients) setNutrients(r.realNutrients);
        if (r.realNutrientsServingGrams) setServingGrams(r.realNutrientsServingGrams);
        setReport(r);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingExisting(false));
  }, [id, isEdit]);

  const checkNameDuplicate = async () => {
    if (!productName.trim()) { setNameDuplicate(null); return; }
    const match = await adminFindByName(productName.trim(), isEdit ? id : null);
    setNameDuplicate(match);
    if (!match) setNameDuplicateOverride(false);
  };

  const checkBarcodeDuplicate = async () => {
    if (!barcode.trim()) { setBarcodeDuplicate(null); return; }
    const match = await adminFindByBarcode(barcode.trim(), isEdit ? id : null);
    setBarcodeDuplicate(match);
  };

  const applyPhoto = async (file) => {
    if (!file) return;
    setPhotoFile(file);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setPhotoDataUrl(dataUrl);
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePaste = (e) => {
    const file = imageFileFromClipboard(e);
    if (file) {
      e.preventDefault();
      applyPhoto(file);
    }
  };

  const handleExtractFromPhoto = async () => {
    if (!photoFile) { setError('Paste or choose a photo first.'); return; }
    setError('');
    setExtracting(true);
    try {
      const extracted = await extractIngredientsFromImage(photoFile);
      if (!extracted.readable && !extracted.ingredientsText) {
        setError(extracted.notes || "Couldn't read that photo clearly. Try a clearer one, or type the ingredients in.");
        return;
      }
      setIngredientsText(extracted.ingredientsText);
      if (extracted.productName && extracted.productName !== 'Unknown Product' && !productName.trim()) {
        setProductName(extracted.productName);
      }
      if (extracted.notes) setError(`Extracted, but: ${extracted.notes}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setExtracting(false);
    }
  };

  const buildNutrientsInfo = () => {
    const scored = {};
    for (const field of NUTRIENT_FIELDS) {
      if (field.scored && nutrients[field.key] !== undefined && nutrients[field.key] !== '') {
        scored[field.key] = Number(nutrients[field.key]);
      }
    }
    if (Object.keys(scored).length === 0) return undefined;
    return { nutrients: scored, servingGrams: servingGrams !== '' ? Number(servingGrams) : undefined };
  };

  const buildNutritionPanel = () => {
    const panel = {};
    for (const field of NUTRIENT_FIELDS) {
      if (nutrients[field.key] !== undefined && nutrients[field.key] !== '') {
        panel[field.key] = Number(nutrients[field.key]);
      }
    }
    return Object.keys(panel).length > 0 ? panel : null;
  };

  const handleAnalyze = async () => {
    setError('');
    if (!productName.trim()) { setError('Product name is required.'); return; }
    if (!ingredientsText.trim()) { setError('Ingredients text is required.'); return; }
    if (barcodeDuplicate) { setError('That barcode already belongs to another product — fix or clear it first.'); return; }
    if (nameDuplicate && !nameDuplicateOverride) { setError('That name already exists — confirm it’s a different product first.'); return; }

    setAnalyzing(true);
    try {
      const result = await analyzeText(
        ingredientsText.trim(),
        productName.trim(),
        brand.trim() || undefined,
        null,
        photoDataUrl || undefined,
        buildNutrientsInfo()
      );
      setReport(result.report);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const updateIngredient = (index, patch) => {
    setReport((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((ing, i) => (i === index ? { ...ing, ...patch } : ing)),
    }));
  };

  // Re-runs the same deterministic scoring math (scoringEngine.js) on
  // the CURRENT (possibly hand-edited) ingredients array -- no AI call.
  // A per-ingredient status/penalty edit only changes the underlying
  // data; this is what actually recomputes score/verdict/flags/
  // positives/summary/recommendation from it.
  const handleRecalculate = () => {
    if (!report?.ingredients) return;
    const recalculated = buildReport(report.ingredients, {
      productName: productName.trim(),
      brand: brand.trim() || null,
      imageUrl: photoDataUrl || null,
    });
    setReport({ ...report, ...recalculated });
  };

  const handleSave = async () => {
    if (!report) { setError('Run "Analyze" first — there’s nothing generated to save yet.'); return; }
    if (!productName.trim()) { setError('Product name is required.'); return; }
    if (barcodeDuplicate) { setError('That barcode already belongs to another product — fix or clear it first.'); return; }
    if (nameDuplicate && !nameDuplicateOverride) { setError('That name already exists — confirm it’s a different product first.'); return; }

    setError('');
    setSaving(true);
    try {
      const finalReport = {
        ...report,
        productName: productName.trim(),
        brand: brand.trim() || null,
        imageUrl: photoDataUrl || null,
        nutritionPanel: buildNutritionPanel(),
      };
      const lookupKey = barcode.trim() ? barcodeKey(barcode.trim()) : textKey(ingredientsText.trim());
      const source = barcode.trim() ? 'barcode' : 'text';
      const payload = { lookupKey, source, productName: finalReport.productName, ingredientsText: ingredientsText.trim(), report: finalReport };

      if (isEdit) {
        await adminUpdateProduct(id, payload);
      } else {
        await adminCreateProduct(payload);
      }
      navigate('/admin/products');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loadingExisting) {
    return <AdminLayout><p style={{ color: 'var(--label-3)' }}>Loading…</p></AdminLayout>;
  }

  return (
    <AdminLayout>
      <p className="text-[22px] font-bold tracking-tight mb-4" style={{ color: 'var(--label-1)' }}>
        {isEdit ? 'Edit product' : 'Add new product'}
      </p>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)' }}>
        <div>
          <div className="rounded-[16px] p-4 mb-4" style={{ background: 'var(--bg-card)' }}>
            <p className="text-[13px] font-semibold mb-3" style={{ color: 'var(--label-2)' }}>Product details</p>

            <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Product name *</label>
            <input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              onBlur={checkNameDuplicate}
              className="w-full px-3.5 py-2.5 rounded-[12px] text-[15px] outline-none"
              style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
            />
            <DuplicateWarning
              match={nameDuplicate}
              label="A product named"
              onOverride={setNameDuplicateOverride}
              overridden={nameDuplicateOverride}
            />

            <div className="grid grid-cols-2 gap-3 mt-3 mb-1">
              <div>
                <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Brand</label>
                <input
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-[12px] text-[15px] outline-none"
                  style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Barcode (optional)</label>
                <input
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onBlur={checkBarcodeDuplicate}
                  placeholder="Leave blank if unknown"
                  className="w-full px-3.5 py-2.5 rounded-[12px] text-[15px] outline-none"
                  style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
                />
              </div>
            </div>
            <DuplicateWarning match={barcodeDuplicate} label="This barcode is already used by" blocking />

            <label className="block text-[12px] font-semibold mb-1 mt-3" style={{ color: 'var(--label-3)' }}>Ingredients text *</label>
            <textarea
              value={ingredientsText}
              onChange={(e) => setIngredientsText(e.target.value)}
              rows={5}
              placeholder="Sugar, Refined Wheat Flour (Maida), Palm Oil, ..."
              className="w-full px-3.5 py-2.5 rounded-[12px] text-[14px] outline-none resize-none"
              style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
            />
          </div>

          {error && (
            <p className="text-[13px] mb-4 p-3 rounded-[12px]" style={{ background: 'var(--fill)', color: 'var(--v-poor)' }}>
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing}
            className="tap-scale w-full py-3 rounded-[12px] text-[15px] font-semibold text-white mb-4"
            style={{ background: 'var(--tint)', opacity: analyzing ? 0.6 : 1 }}
          >
            {analyzing ? 'Analyzing…' : report ? 'Re-analyze' : 'Analyze'}
          </button>

          {report && (
            <div className="rounded-[16px] p-4 mb-4" style={{ background: 'var(--bg-card)' }}>
              <p className="text-[13px] font-semibold mb-3" style={{ color: 'var(--label-2)' }}>
                Generated result — edit anything below before saving
              </p>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Score (0-100)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={report.overallScore}
                    onChange={(e) => setReport({ ...report, overallScore: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-[12px] text-[15px] outline-none"
                    style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Verdict</label>
                  <select
                    value={report.verdict}
                    onChange={(e) => setReport({ ...report, verdict: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-[12px] text-[15px] outline-none"
                    style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
                  >
                    {VERDICTS.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>

              <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Summary</label>
              <textarea
                value={report.summary || ''}
                onChange={(e) => setReport({ ...report, summary: e.target.value })}
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-[12px] text-[13.5px] mb-3 outline-none resize-none"
                style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
              />

              <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Recommendation</label>
              <textarea
                value={report.recommendation || ''}
                onChange={(e) => setReport({ ...report, recommendation: e.target.value })}
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-[12px] text-[13.5px] mb-1 outline-none resize-none"
                style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
              />
            </div>
          )}

          {report?.ingredients?.length > 0 && (
            <div className="rounded-[16px] p-4 mb-4" style={{ background: 'var(--bg-card)' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[13px] font-semibold" style={{ color: 'var(--label-2)' }}>
                  Ingredients ({report.ingredients.length}) — edit status/penalty/reason, then recalculate
                </p>
                <button
                  type="button"
                  onClick={handleRecalculate}
                  className="tap-scale px-3 py-1.5 rounded-[8px] text-[12.5px] font-semibold flex-shrink-0"
                  style={{ background: 'var(--tint-bg)', color: 'var(--tint)' }}
                >
                  Recalculate score
                </button>
              </div>
              <div className="rounded-[10px] overflow-hidden" style={{ border: '1px solid var(--separator)' }}>
                {report.ingredients.map((ing, i) => (
                  <div key={i} className="grid gap-2 px-3 py-2" style={{ gridTemplateColumns: '1.4fr 1fr 70px 1.6fr', borderBottom: i < report.ingredients.length - 1 ? '1px solid var(--separator)' : 'none' }}>
                    <span className="text-[12.5px] font-semibold truncate self-center" style={{ color: 'var(--label-1)' }}>{ing.name}</span>
                    <select
                      value={ing.status}
                      onChange={(e) => updateIngredient(i, { status: e.target.value })}
                      className="px-2 py-1.5 rounded-[8px] text-[12px] outline-none"
                      style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
                    >
                      <option value="safe">safe</option>
                      <option value="concerning">concerning</option>
                      <option value="harmful">harmful</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      max="40"
                      value={ing.penalty ?? 0}
                      onChange={(e) => updateIngredient(i, { penalty: Number(e.target.value) })}
                      className="px-2 py-1.5 rounded-[8px] text-[12px] outline-none w-full"
                      style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
                    />
                    <input
                      value={ing.reason || ''}
                      onChange={(e) => updateIngredient(i, { reason: e.target.value })}
                      placeholder="Reason shown to users"
                      className="px-2 py-1.5 rounded-[8px] text-[12px] outline-none w-full"
                      style={{ background: 'var(--fill)', color: 'var(--label-1)' }}
                    />
                  </div>
                ))}
              </div>
              <p className="text-[11px] mt-2" style={{ color: 'var(--label-3)' }}>
                "Recalculate score" re-runs the same scoring rules on these ingredients — no AI call — and overwrites score/verdict/flags/summary/recommendation above with the result.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={!report || saving}
            className="tap-scale w-full py-3 rounded-[12px] text-[15px] font-semibold text-white"
            style={{ background: 'var(--v-very-healthy)', opacity: !report || saving ? 0.5 : 1 }}
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save product'}
          </button>
        </div>

        <div>
          <div className="rounded-[16px] p-4 mb-4" style={{ background: 'var(--bg-card)' }}>
            <p className="text-[13px] font-semibold mb-3" style={{ color: 'var(--label-2)' }}>Product photo</p>

            <div
              ref={pasteAreaRef}
              tabIndex={0}
              onPaste={handlePaste}
              className="rounded-[12px] p-4 flex items-center gap-3 outline-none"
              style={{ background: 'var(--fill)', border: '1px dashed var(--separator)' }}
            >
              {photoDataUrl ? (
                <img src={photoDataUrl} alt="Product" className="w-16 h-16 rounded-[10px] object-cover flex-shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-[10px] flex items-center justify-center text-[24px] flex-shrink-0" style={{ background: 'var(--bg-card)' }}>
                  📷
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px]" style={{ color: 'var(--label-2)' }}>
                  Click here and paste (Ctrl+V) a copied photo, or choose a file.
                </p>
                <div className="flex gap-3 mt-1.5">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="tap-scale text-[12.5px] font-semibold" style={{ color: 'var(--tint)' }}>
                    Choose file
                  </button>
                  {photoDataUrl && (
                    <button type="button" onClick={() => { setPhotoDataUrl(''); setPhotoFile(null); }} className="tap-scale text-[12.5px] font-semibold" style={{ color: 'var(--v-poor)' }}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => applyPhoto(e.target.files?.[0])} className="hidden" />

            <button
              type="button"
              onClick={handleExtractFromPhoto}
              disabled={!photoFile || extracting}
              className="tap-scale w-full mt-3 py-2.5 rounded-[12px] text-[13.5px] font-semibold"
              style={{ background: 'var(--tint-bg)', color: 'var(--tint)', opacity: !photoFile || extracting ? 0.5 : 1 }}
            >
              {extracting ? 'Reading label…' : '📷 Extract ingredients from this photo'}
            </button>
          </div>

          <div className="rounded-[16px] p-4" style={{ background: 'var(--bg-card)' }}>
            <p className="text-[13px] font-semibold mb-1" style={{ color: 'var(--label-2)' }}>Nutrition (optional)</p>
            <p className="text-[11.5px] mb-3" style={{ color: 'var(--label-3)' }}>
              Per 100g/100ml, if you have it. Fields marked • feed the daily-habit score check; the rest are kept for reference.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {NUTRIENT_FIELDS.map((f) => (
                <NutrientField
                  key={f.key}
                  label={f.label}
                  unit={f.unit}
                  scored={f.scored}
                  value={nutrients[f.key] ?? ''}
                  onChange={(v) => setNutrient(f.key, v)}
                />
              ))}
            </div>
            <NutrientField label="Real serving size" unit="g" value={servingGrams} onChange={setServingGrams} />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
