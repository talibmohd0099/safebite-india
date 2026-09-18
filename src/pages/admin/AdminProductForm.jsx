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
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { analyzeText } from '../../services/analyzeText';
import { buildReport } from '../../services/scoringEngine';
import { extractIngredientsFromImage } from '../../services/geminiService';
import { lookupBarcode } from '../../services/openFoodFacts';
import { parseLabel, isBracketBalanced, looksLikeNutritionPanel } from '../../services/ingredientParser';
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
const FIELD = 'admin-field w-full px-3.5 py-2.5 rounded-[12px] text-[15px]';

// The 4 keys analyzeText.js's nutrientsInfo actually scores against
// (dailyHabitCheck.js's NUTRIENT_LIMITS), plus the rest kept purely for
// a complete, displayable nutrition record -- same fields Blinkit
// stores (see NUTRITION_FIELDS in services/blinkit.js), so a manually
// added product's data looks like every scraped one's. Keys match what
// geminiService.js's extraction prompt returns, so an extracted value
// drops straight into this shape with no remapping.
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

// openFoodFacts.js's extractNutrientsForHabitCheck uses slightly
// different key names (caloriesKcal, carbohydrateG, fibreG) than this
// form's NUTRIENT_FIELDS (energyKcal, totalCarbG, fiberG) -- this maps
// OFF's keys onto this form's, for the barcode auto-fetch below.
const OFF_TO_ADMIN_NUTRIENT_KEY = {
  sodiumMg: 'sodiumMg',
  addedSugarG: 'addedSugarG',
  totalSugarG: 'totalSugarG',
  saturatedFatG: 'saturatedFatG',
  transFatG: 'transFatG',
  caloriesKcal: 'energyKcal',
  proteinG: 'proteinG',
  carbohydrateG: 'totalCarbG',
  totalFatG: 'totalFatG',
  fibreG: 'fiberG',
};

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
          className="admin-field w-full px-3 py-2 rounded-[10px] text-[14px]"
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

/** One of up to two source photos used only to extract ingredients/nutrition -- never saved as the product's display image. */
function SourcePhotoSlot({ label, photo, onFile, onPaste, onRemove }) {
  const inputRef = useRef(null);
  return (
    <div
      tabIndex={0}
      onPaste={onPaste}
      className="rounded-[12px] p-3 flex items-center gap-2.5 outline-none"
      style={{ background: 'var(--bg-card)', border: '1px dashed var(--separator)' }}
    >
      {photo ? (
        <img src={photo.dataUrl} alt={label} className="w-14 h-14 rounded-[8px] object-cover flex-shrink-0" />
      ) : (
        <div className="w-14 h-14 rounded-[8px] flex items-center justify-center text-[20px] flex-shrink-0" style={{ background: 'var(--fill)' }}>
          📷
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[11.5px] font-semibold mb-0.5" style={{ color: 'var(--label-2)' }}>{label}</p>
        <p className="text-[11px]" style={{ color: 'var(--label-3)' }}>Click, then paste (Ctrl+V), or choose a file.</p>
        <div className="flex gap-3 mt-1">
          <button type="button" onClick={() => inputRef.current?.click()} className="tap-scale text-[11.5px] font-semibold" style={{ color: 'var(--tint)' }}>
            Choose file
          </button>
          {photo && (
            <button type="button" onClick={onRemove} className="tap-scale text-[11.5px] font-semibold" style={{ color: 'var(--v-poor)' }}>
              Remove
            </button>
          )}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
    </div>
  );
}

export default function AdminProductForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const heroFileInputRef = useRef(null);

  const [loadingExisting, setLoadingExisting] = useState(isEdit);
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState('');
  const [ingredientsText, setIngredientsText] = useState('');

  // The hero/display photo -- what actually gets saved as report.imageUrl.
  const [photoDataUrl, setPhotoDataUrl] = useState('');

  // Up to 2 separate photos used ONLY to extract ingredients/nutrition
  // from (a pack's ingredients and nutrition table are often on
  // different faces, or one photo comes out too blurry to read) --
  // never saved anywhere, purely an input to the Extract action below.
  const [sourcePhotos, setSourcePhotos] = useState([null, null]);

  const [nutrients, setNutrients] = useState({});
  const [servingGrams, setServingGrams] = useState('');
  const setNutrient = (key, value) => setNutrients((prev) => ({ ...prev, [key]: value }));

  const [report, setReport] = useState(null);

  const [nameDuplicate, setNameDuplicate] = useState(null);
  const [nameDuplicateOverride, setNameDuplicateOverride] = useState(false);
  const [barcodeDuplicate, setBarcodeDuplicate] = useState(null);
  const [fetchingBarcode, setFetchingBarcode] = useState(false);
  const [autoAnalyzeTrigger, setAutoAnalyzeTrigger] = useState(0);
  const [existingSource, setExistingSource] = useState(null);

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
        setExistingSource(row.source || null);
        if (r.imageUrl) setPhotoDataUrl(r.imageUrl);
        if (r.nutritionPanel) setNutrients(r.nutritionPanel);
        else if (r.realNutrients) setNutrients(r.realNutrients);
        if (r.realNutrientsServingGrams) setServingGrams(r.realNutrientsServingGrams);
        setReport(r);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingExisting(false));
  }, [id, isEdit]);

  // Live sanity-check on the ingredients text, reusing the exact same
  // checks analyzeText.js relies on (parseLabel/isBracketBalanced/
  // looksLikeNutritionPanel) -- so a problem that would otherwise only
  // surface as a thrown error after clicking Analyze is visible right
  // under the field instead, while it's still easy to fix by hand.
  const ingredientsQuality = useMemo(() => {
    const text = ingredientsText.trim();
    if (!text) return null;
    if (!isBracketBalanced(text)) {
      return { ok: false, message: 'Bracket mismatch — check for a missing ( or ).' };
    }
    let parsed;
    try {
      parsed = parseLabel(text).ingredients;
    } catch {
      return null; // never let the sanity check itself break the page
    }
    if (parsed.length === 0) {
      return { ok: false, message: 'No recognizable ingredients found in this text — check it, or re-extract.' };
    }
    if (looksLikeNutritionPanel(parsed)) {
      return { ok: false, message: 'This looks like a nutrition panel, not an ingredients list.' };
    }
    return { ok: true, message: `Looks parseable — ${parsed.length} ingredient${parsed.length === 1 ? '' : 's'} found.` };
  }, [ingredientsText]);

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

  // Typing a barcode that's already on Open Food Facts fills in
  // everything it has -- name, brand, ingredients, photo, nutrition --
  // so most of the manual typing this form used to need only happens
  // for products OFF genuinely doesn't have. Only ever fills EMPTY
  // fields, so it never overwrites something already typed or (in edit
  // mode) already loaded from this product's existing report.
  const handleBarcodeBlur = async () => {
    checkBarcodeDuplicate();
    const cleaned = barcode.trim();
    if (!cleaned) return;

    setFetchingBarcode(true);
    try {
      const found = await lookupBarcode(cleaned);
      if (!found.found) return;

      if (!productName.trim() && found.productName && found.productName !== 'Unknown Product') setProductName(found.productName);
      if (!brand.trim() && found.brand) setBrand(found.brand);
      if (!photoDataUrl && found.imageUrl) setPhotoDataUrl(found.imageUrl);

      let filledIngredients = false;
      if (!ingredientsText.trim()) {
        if (found.readable === false) {
          setError(found.notes || "Found on Open Food Facts, but its ingredients look wrong there — type or extract them from a photo instead.");
        } else if (found.ingredientsText) {
          setIngredientsText(found.ingredientsText);
          filledIngredients = true;
        }
      }

      if (found.nutrientsInfo?.nutrients) {
        setNutrients((prev) => {
          const next = { ...prev };
          for (const [offKey, adminKey] of Object.entries(OFF_TO_ADMIN_NUTRIENT_KEY)) {
            const value = found.nutrientsInfo.nutrients[offKey];
            if (value != null && (next[adminKey] === undefined || next[adminKey] === '')) next[adminKey] = value;
          }
          return next;
        });
        if (!servingGrams && found.nutrientsInfo.servingGrams) setServingGrams(found.nutrientsInfo.servingGrams);
      }

      // Enough to Analyze now -- do it automatically instead of making
      // scan-a-barcode-and-review three separate clicks. (Deferred to
      // the next render via the trigger below, since handleAnalyze
      // called right here would still see this render's pre-update
      // productName/ingredientsText.)
      if (filledIngredients && (productName.trim() || found.productName)) {
        setAutoAnalyzeTrigger((n) => n + 1);
      }
    } catch {
      // Open Food Facts being slow/unreachable shouldn't block manual entry.
    } finally {
      setFetchingBarcode(false);
    }
  };

  const applyHeroPhoto = async (file) => {
    if (!file) return;
    try {
      setPhotoDataUrl(await compressImageToDataUrl(file));
    } catch (err) {
      setError(err.message);
    }
  };

  const applySourcePhoto = async (index, file) => {
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setSourcePhotos((prev) => prev.map((p, i) => (i === index ? { file, dataUrl } : p)));
    } catch (err) {
      setError(err.message);
    }
  };

  const removeSourcePhoto = (index) => setSourcePhotos((prev) => prev.map((p, i) => (i === index ? null : p)));

  const handleExtractInfo = async () => {
    const photos = sourcePhotos.filter(Boolean);
    if (photos.length === 0) { setError('Add at least one ingredients/nutrition photo first.'); return; }
    setError('');
    setExtracting(true);
    try {
      let foundIngredientsText = '';
      let foundProductName = '';
      const mergedNutrition = {};
      let foundServingGrams = '';
      const notes = [];
      let anyReadable = false;

      for (const photo of photos) {
        const extracted = await extractIngredientsFromImage(photo.file);
        if (extracted.readable) anyReadable = true;
        if (!foundIngredientsText && extracted.ingredientsText) foundIngredientsText = extracted.ingredientsText;
        if (!foundProductName && extracted.productName && extracted.productName !== 'Unknown Product') foundProductName = extracted.productName;
        if (extracted.nutrition) {
          for (const [k, v] of Object.entries(extracted.nutrition)) {
            if (mergedNutrition[k] === undefined && typeof v === 'number') mergedNutrition[k] = v;
          }
        }
        if (!foundServingGrams && extracted.servingGrams) foundServingGrams = extracted.servingGrams;
        if (extracted.notes) notes.push(extracted.notes);
      }

      if (foundIngredientsText) setIngredientsText(foundIngredientsText);
      if (foundProductName && !productName.trim()) setProductName(foundProductName);
      if (Object.keys(mergedNutrition).length > 0) {
        setNutrients((prev) => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(mergedNutrition)) {
            if (next[k] === undefined || next[k] === '') next[k] = v;
          }
          return next;
        });
      }
      if (foundServingGrams && !servingGrams) setServingGrams(foundServingGrams);

      const messages = [];
      if (!foundIngredientsText) {
        messages.push(anyReadable ? 'No ingredients list found in these photos — type it in manually.' : "Couldn't read these photos clearly.");
      }
      if (Object.keys(mergedNutrition).length === 0) messages.push('No nutrition table found in these photos.');
      if (notes.length) messages.push(notes.join(' '));
      if (messages.length) setError(messages.join(' '));
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

  // Fires once per successful barcode auto-fetch (see handleBarcodeBlur)
  // -- deferred to an effect so it runs against the render where
  // productName/ingredientsText/nutrients have actually updated,
  // instead of the stale, pre-update values a direct call would close
  // over.
  useEffect(() => {
    if (autoAnalyzeTrigger > 0) handleAnalyze();
  }, [autoAnalyzeTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // 'blinkit' is a real provenance marker (this row came from the
      // scraper) -- adding or editing a barcode on that product isn't a
      // change of WHERE it came from, so it must survive the save.
      // Everything else ('barcode'/'text'/'search'/'image', or brand
      // new) has no such provenance worth keeping and just re-derives
      // from whether a barcode is present, as before.
      const PROVENANCE_SOURCES = ['blinkit'];
      const source = isEdit && PROVENANCE_SOURCES.includes(existingSource)
        ? existingSource
        : barcode.trim() ? 'barcode' : 'text';
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
            <input value={productName} onChange={(e) => setProductName(e.target.value)} onBlur={checkNameDuplicate} className={FIELD} />
            <DuplicateWarning match={nameDuplicate} label="A product named" onOverride={setNameDuplicateOverride} overridden={nameDuplicateOverride} />

            <div className="grid grid-cols-2 gap-3 mt-3 mb-1">
              <div>
                <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Brand</label>
                <input value={brand} onChange={(e) => setBrand(e.target.value)} className={FIELD} />
              </div>
              <div>
                <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>
                  Barcode (optional) {fetchingBarcode && <span style={{ color: 'var(--tint)' }}>— checking Open Food Facts…</span>}
                </label>
                <input value={barcode} onChange={(e) => setBarcode(e.target.value)} onBlur={handleBarcodeBlur} placeholder="Type or scan — auto-fills from Open Food Facts if known" className={FIELD} />
              </div>
            </div>
            <DuplicateWarning match={barcodeDuplicate} label="This barcode is already used by" blocking />

            <label className="block text-[12px] font-semibold mb-1 mt-3" style={{ color: 'var(--label-3)' }}>Ingredients text *</label>
            <textarea
              value={ingredientsText}
              onChange={(e) => setIngredientsText(e.target.value)}
              rows={5}
              placeholder="Sugar, Refined Wheat Flour (Maida), Palm Oil, ..."
              className={`${FIELD} text-[14px] resize-none`}
            />
            {ingredientsQuality && (
              <p className="text-[12px] mt-1.5" style={{ color: ingredientsQuality.ok ? 'var(--v-good)' : 'var(--v-poor)' }}>
                {ingredientsQuality.ok ? '✓' : '⚠'} {ingredientsQuality.message}
              </p>
            )}
          </div>

          <div className="rounded-[16px] p-4 mb-4" style={{ background: 'var(--bg-card)' }}>
            <p className="text-[13px] font-semibold mb-1" style={{ color: 'var(--label-2)' }}>Ingredients &amp; nutrition photos</p>
            <p className="text-[11.5px] mb-3" style={{ color: 'var(--label-3)' }}>
              Up to 2 photos — the back-of-pack ingredients list and/or the nutrition table. Only used to fill the fields below, never saved.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <SourcePhotoSlot
                label="Photo 1"
                photo={sourcePhotos[0]}
                onFile={(f) => applySourcePhoto(0, f)}
                onPaste={(e) => { const f = imageFileFromClipboard(e); if (f) { e.preventDefault(); applySourcePhoto(0, f); } }}
                onRemove={() => removeSourcePhoto(0)}
              />
              <SourcePhotoSlot
                label="Photo 2 (optional)"
                photo={sourcePhotos[1]}
                onFile={(f) => applySourcePhoto(1, f)}
                onPaste={(e) => { const f = imageFileFromClipboard(e); if (f) { e.preventDefault(); applySourcePhoto(1, f); } }}
                onRemove={() => removeSourcePhoto(1)}
              />
            </div>
            <button
              type="button"
              onClick={handleExtractInfo}
              disabled={sourcePhotos.every((p) => !p) || extracting}
              className="tap-scale w-full mt-3 py-2.5 rounded-[12px] text-[13.5px] font-semibold"
              style={{ background: 'var(--tint-bg)', color: 'var(--tint)', opacity: sourcePhotos.every((p) => !p) || extracting ? 0.5 : 1 }}
            >
              {extracting ? 'Reading photos…' : '📷 Extract ingredients & nutrition'}
            </button>
          </div>

          {error && (
            <p className="text-[13px] mb-4 p-3 rounded-[12px]" style={{ background: 'var(--v-poor-bg)', color: 'var(--v-poor)' }}>
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
                    className={FIELD}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Verdict</label>
                  <select value={report.verdict} onChange={(e) => setReport({ ...report, verdict: e.target.value })} className={FIELD}>
                    {VERDICTS.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>

              <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Summary</label>
              <textarea
                value={report.summary || ''}
                onChange={(e) => setReport({ ...report, summary: e.target.value })}
                rows={2}
                className={`${FIELD} text-[13.5px] mb-3 resize-none`}
              />

              <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--label-3)' }}>Recommendation</label>
              <textarea
                value={report.recommendation || ''}
                onChange={(e) => setReport({ ...report, recommendation: e.target.value })}
                rows={2}
                className={`${FIELD} text-[13.5px] resize-none`}
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
              {/* Capped height + internal scroll rather than letting the
                  page itself grow -- a product with 20+ ingredients
                  (real examples run past 30) would otherwise push the
                  photo/nutrition/save button far down the page. */}
              <div className="rounded-[10px] overflow-y-auto" style={{ border: '1px solid var(--separator)', maxHeight: 420 }}>
                {report.ingredients.map((ing, i) => (
                  <div key={i} className="grid gap-2 px-3 py-2" style={{ gridTemplateColumns: '1.4fr 1fr 70px 1.6fr', borderBottom: i < report.ingredients.length - 1 ? '1px solid var(--separator)' : 'none' }}>
                    <span className="text-[12.5px] font-semibold truncate self-center" style={{ color: 'var(--label-1)' }}>{ing.name}</span>
                    <select value={ing.status} onChange={(e) => updateIngredient(i, { status: e.target.value })} className="admin-field px-2 py-1.5 rounded-[8px] text-[12px]">
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
                      className="admin-field px-2 py-1.5 rounded-[8px] text-[12px] w-full"
                    />
                    <input
                      value={ing.reason || ''}
                      onChange={(e) => updateIngredient(i, { reason: e.target.value })}
                      placeholder="Reason shown to users"
                      className="admin-field px-2 py-1.5 rounded-[8px] text-[12px] w-full"
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
            <p className="text-[13px] font-semibold mb-1" style={{ color: 'var(--label-2)' }}>Product photo</p>
            <p className="text-[11.5px] mb-3" style={{ color: 'var(--label-3)' }}>The hero image shown on the product's card and report — a clean front-of-pack shot.</p>

            <div
              tabIndex={0}
              onPaste={(e) => { const f = imageFileFromClipboard(e); if (f) { e.preventDefault(); applyHeroPhoto(f); } }}
              className="rounded-[12px] p-4 flex items-center gap-3 outline-none"
              style={{ background: 'var(--bg-card)', border: '1px dashed var(--separator)' }}
            >
              {photoDataUrl ? (
                <img src={photoDataUrl} alt="Product" className="w-16 h-16 rounded-[10px] object-cover flex-shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-[10px] flex items-center justify-center text-[24px] flex-shrink-0" style={{ background: 'var(--fill)' }}>
                  📷
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px]" style={{ color: 'var(--label-2)' }}>
                  Click here and paste (Ctrl+V) a copied photo, or choose a file.
                </p>
                <div className="flex gap-3 mt-1.5">
                  <button type="button" onClick={() => heroFileInputRef.current?.click()} className="tap-scale text-[12.5px] font-semibold" style={{ color: 'var(--tint)' }}>
                    Choose file
                  </button>
                  {photoDataUrl && (
                    <button type="button" onClick={() => setPhotoDataUrl('')} className="tap-scale text-[12.5px] font-semibold" style={{ color: 'var(--v-poor)' }}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
            <input ref={heroFileInputRef} type="file" accept="image/*" onChange={(e) => applyHeroPhoto(e.target.files?.[0])} className="hidden" />
          </div>

          <div className="rounded-[16px] p-4" style={{ background: 'var(--bg-card)' }}>
            <p className="text-[13px] font-semibold mb-1" style={{ color: 'var(--label-2)' }}>Nutrition (optional)</p>
            <p className="text-[11.5px] mb-3" style={{ color: 'var(--label-3)' }}>
              Per 100g/100ml. Fields marked • feed the daily-habit score check; the rest are kept for reference. "Extract ingredients &amp; nutrition" above fills these in automatically when a photo shows a nutrition table.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {NUTRIENT_FIELDS.map((f) => (
                <NutrientField key={f.key} label={f.label} unit={f.unit} scored={f.scored} value={nutrients[f.key] ?? ''} onChange={(v) => setNutrient(f.key, v)} />
              ))}
            </div>
            <NutrientField label="Real serving size" unit="g" value={servingGrams} onChange={setServingGrams} />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
