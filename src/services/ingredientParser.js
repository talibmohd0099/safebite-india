// src/services/ingredientParser.js
//
// Pure logic — no AI, no network. Turns a raw ingredients label string
// into a list of individual, normalized ingredients we can look up in
// the ingredient database.
//
// This is the piece that decides whether the "no AI billing" approach
// actually works: if we can't match label text to database rows, we end
// up paying for AI research over and over on things we already know.

const OPENERS = '([{';
const CLOSERS = ')]}';

// Words that show up as label boilerplate rather than as ingredients.
const NOISE_PREFIXES = [
  'ingredients', 'ingredient', 'contains', 'containing', 'made from',
  'made with', 'prepared from', 'also contains', 'permitted',
];

// Common English function/question words that essentially never appear
// in a real ingredient name ("Sodium Benzoate", "Refined Palm Oil"), but
// are exactly what a typed sentence or random text is made of. Used to
// reject junk input WITHOUT an AI call — cheap, deterministic, and it
// means we never pay to "research" gibberish someone typed by mistake.
const ENGLISH_FILLER_WORDS = new Set([
  'is', 'are', 'was', 'were', 'am', 'be', 'been', 'being',
  'the', 'a', 'an', 'this', 'that', 'these', 'those',
  'what', 'who', 'when', 'where', 'why', 'how', 'which',
  'going', 'goes', 'went', 'gone', 'do', 'does', 'did', 'doing',
  'here', 'there', 'please', 'thanks', 'thank', 'hello', 'hi', 'hey',
  'test', 'testing', 'random', 'sample', 'example', 'blah', 'lorem',
  'you', 'your', 'yours', 'i', 'me', 'my', 'we', 'us', 'our',
  'can', 'could', 'would', 'should', 'will', 'shall', 'may', 'might',
  'and', 'or', 'but', 'if', 'then', 'so', 'because', 'not', 'no', 'yes',
  'on', 'in', 'at', 'to', 'for', 'of', 'with', 'from', 'about', 'okay', 'ok',
  'want', 'need', 'know', 'think', 'like', 'just', 'really', 'very',
]);

/**
 * Cheap, deterministic check for "does this actually look like an
 * ingredient name" vs. a typed sentence/question/random text. Runs
 * before anything gets sent to AI for research.
 */
export function looksLikeIngredientName(name) {
  const words = name.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;

  // Real ingredient names (even compound ones like "Diacetyltartaric and
  // fatty acid esters of glycerol") rarely run past ~8 words.
  if (words.length > 8) return false;

  const fillerCount = words.filter((w) => ENGLISH_FILLER_WORDS.has(w)).length;
  // More than a third filler/question words reads like a sentence, not
  // a food substance name.
  return fillerCount / words.length <= 0.34;
}

// Footnote/reference markers labels use to link an ingredient to a
// clarifying note, e.g. "INVERT SUGAR SYRUP# ... #(D-GLUCOSE, LEVULOSE)".
const FOOTNOTE_MARKERS = /[#*†‡^]/g;

// Allergen declarations ("CONTAINS: WHEAT, MILK") repeat things already in
// the ingredients list — they're useful information, but they are not
// separate ingredients and must not be double-counted.
const ALLERGEN_WORDS = [
  'wheat', 'milk', 'soya', 'soy', 'peanut', 'peanuts', 'nuts', 'tree nuts',
  'egg', 'eggs', 'fish', 'shellfish', 'crustacean', 'gluten', 'sesame',
  'mustard', 'celery', 'sulphite', 'sulphites', 'sulfite', 'sulfites',
  'lupin', 'molluscs', 'cashew', 'almond', 'almonds',
];

/**
 * One INS/E additive code. Handles all the forms Indian labels use:
 *   INS 503(ii) | E322 | (150a) | 472e | 500ii | 452(1) | 330
 */
function codeRegex(flags = '') {
  return new RegExp(
    '(?:\\b(?:ins|e)\\b\\s*[-–]?\\s*)?' +   // optional "INS " / "E" prefix
    '(\\d{3,4})\\s*' +                      // the number
    '(?:\\(\\s*([ivx\\d]+)\\s*\\)|([ivx]{1,4})(?![a-z]))?' + // ( ii ) | (1) | bare "ii"
    '\\s*([a-z])?(?![a-z0-9])',             // letter suffix, e.g. 472e / 150a
    flags,
  );
}

/** Normalize a code into a consistent form: "503(ii)", "472e", "322". */
function normalizeCode(digits, sub, letter) {
  let code = digits;
  if (sub) code += `(${sub.toLowerCase()})`;
  if (letter) code += letter.toLowerCase();
  return code;
}

/**
 * Split a label into top-level entries, respecting brackets so that
 * "INVERT SUGAR SYRUP (SUGAR, CITRIC ACID)" stays as one entry while
 * "SUGAR, SALT" becomes two.
 *
 * Separators: commas, semicolons, newlines, bullets, sentence periods,
 * and a top-level " AND " / "&" (labels routinely end with "X, Y AND Z").
 */
export function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = '';

  const flush = () => {
    if (current.trim()) parts.push(current.trim());
    current = '';
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (OPENERS.includes(ch)) depth++;
    else if (CLOSERS.includes(ch)) depth = Math.max(0, depth - 1);

    if (depth === 0) {
      if (ch === ',' || ch === ';' || ch === '\n' || ch === '\r' || ch === '•' || ch === '|') {
        flush();
        continue;
      }
      // A period ends a sentence — but not inside a decimal like "0.03%".
      if (ch === '.') {
        const prev = text[i - 1];
        const next = text[i + 1];
        const insideNumber = /\d/.test(prev || '') && /\d/.test(next || '');
        if (!insideNumber) {
          flush();
          continue;
        }
      }
      if (text.slice(i).toLowerCase().startsWith(' and ')) {
        flush();
        i += 4;
        continue;
      }
      if (ch === '&') {
        flush();
        continue;
      }
    }

    current += ch;
  }
  flush();

  return parts;
}

/** Strip label boilerplate like a leading "INGREDIENTS:" or "CONTAINS". */
function stripNoisePrefix(raw) {
  let out = raw.trim().replace(/^ingredients?\s*:/i, '').trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of NOISE_PREFIXES) {
      const re = new RegExp(`^${prefix}\\b[:\\s-]*`, 'i');
      if (re.test(out)) {
        out = out.replace(re, '').trim();
        changed = true;
      }
    }
  }
  return out;
}

/** Pull "68%" out of an entry and return it separately. */
function extractPercentage(raw) {
  const match = raw.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) return { text: raw, percentage: null };
  return {
    text: raw.replace(match[0], ' ').trim(),
    percentage: parseFloat(match[1]),
  };
}

/**
 * Find the last top-level bracket group in a string, tracking nesting so
 * that "[INS 503(ii), 500(ii)]" is returned whole rather than stopping at
 * the inner "(ii)".
 */
function findLastBracketGroup(raw) {
  let depth = 0;
  let start = -1;
  let best = null;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (OPENERS.includes(ch)) {
      if (depth === 0) start = i;
      depth++;
    } else if (CLOSERS.includes(ch)) {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && start !== -1) {
        best = { start, end: i, inner: raw.slice(start + 1, i) };
      }
    }
  }
  return best;
}

/**
 * If the bracket contents are nothing but additive codes and separators,
 * return the list of codes. Otherwise null (it's descriptive text like
 * "(SUGAR, CITRIC ACID)", which must not be treated as codes).
 */
function parseCodeList(inner) {
  const codes = [];
  const re = codeRegex('gi');
  let m;
  while ((m = re.exec(inner)) !== null) {
    codes.push(normalizeCode(m[1], m[2] || m[3], m[4]));
  }
  if (codes.length === 0) return null;

  const leftover = inner
    .replace(codeRegex('gi'), ' ')
    .replace(/\b(?:ins|e)\b/gi, ' ')
    .replace(/[\s,&+.\-–]/g, '');

  return leftover.length === 0 ? codes : null;
}

function titleCase(str) {
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Reduce a name to the key we match against the database. */
export function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9()\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build the keys we'll try when looking this ingredient up, most specific
 * first. "Refined Wheat Flour (Maida)" also matches plain "refined wheat
 * flour" and the local name "maida".
 */
function buildLookupKeys(name, insCode) {
  const keys = [];
  const push = (k) => {
    const v = normalizeName(k);
    if (v && v.length > 1 && !keys.includes(v)) keys.push(v);
  };

  push(name);

  const parenMatch = name.match(/^([^()]+)\(([^()]+)\)\s*$/);
  if (parenMatch) {
    push(parenMatch[1]);   // "refined wheat flour"
    push(parenMatch[2]);   // "maida"
  } else {
    push(name.replace(/\([^()]*\)/g, ' '));
  }

  if (insCode) push(`ins ${insCode}`);

  return keys;
}

/**
 * Pull "CONTAINS: WHEAT, MILK" style allergen declarations out of the
 * label, returning them separately so they aren't parsed as ingredients.
 */
function extractAllergens(text) {
  const allergens = [];
  let remaining = text;

  // Stop the clause at the next "contains" so an earlier non-allergen
  // "CONTAINS ADDED FLAVOUR (...)" doesn't swallow the real allergen line.
  const re = /\bcontains\b\s*:?\s*((?:(?!\bcontains\b)[^.\n\r])*)/gi;
  let match;
  const toRemove = [];

  while ((match = re.exec(text)) !== null) {
    const clause = match[1];
    const words = clause
      .split(/[,&]|\band\b/i)
      .map((w) => w.trim().toLowerCase().replace(FOOTNOTE_MARKERS, '').trim())
      .filter(Boolean);

    if (words.length === 0) continue;

    // Only an allergen line if every listed item is a known allergen —
    // otherwise it's something like "CONTAINS ADDED FLAVOUR (...)".
    const allAllergens = words.every((w) => ALLERGEN_WORDS.includes(w));
    if (allAllergens) {
      allergens.push(...words);
      toRemove.push(match[0]);
    }
  }

  for (const clause of toRemove) {
    remaining = remaining.replace(clause, ' ');
  }

  return { remaining, allergens: [...new Set(allergens)] };
}

/**
 * Parse a label into both its ingredients and its declared allergens.
 */
export function parseLabel(labelText) {
  if (!labelText || !labelText.trim()) return { ingredients: [], allergens: [] };
  const { remaining, allergens } = extractAllergens(labelText);
  return { ingredients: parseIngredients(remaining), allergens };
}

/**
 * Parse a full ingredients label into individual ingredients.
 *
 * Returns [{ displayName, canonicalName, lookupKeys, insCode, percentage,
 * subIngredients, categoryHint }] with duplicates removed, in label order
 * (which matters — labels list ingredients by descending quantity).
 */
export function parseIngredients(labelText) {
  if (!labelText || !labelText.trim()) return [];

  const entries = splitTopLevel(labelText);
  const out = [];
  const seen = new Set();

  const add = (item) => {
    if (seen.has(item.canonicalName)) return;
    seen.add(item.canonicalName);
    out.push(item);
  };

  for (const rawEntry of entries) {
    // A standalone footnote like "#(D-GLUCOSE, LEVULOSE)" explains an
    // ingredient listed above — it isn't an ingredient in its own right.
    if (/^\s*[#*†‡^]/.test(rawEntry)) continue;

    // Tidy up spacing labels often have inside brackets: "(MAIDA )" -> "(MAIDA)"
    const entry = rawEntry
      .replace(FOOTNOTE_MARKERS, ' ')
      .replace(/([([{])\s+/g, '$1')
      .replace(/\s+([)\]}])/g, '$1');
    const cleaned = stripNoisePrefix(entry);
    if (!cleaned) continue;

    // "RAISING AGENTS [INS 503(ii), 500(ii)]" -> one entry per code.
    const bracket = findLastBracketGroup(cleaned);
    if (bracket && !cleaned.slice(bracket.end + 1).trim()) {
      const codes = parseCodeList(bracket.inner);
      if (codes) {
        const label = cleaned.slice(0, bracket.start).trim();
        const categoryHint = label ? label.toLowerCase() : null;
        for (const code of codes) {
          add({
            displayName: label ? `${titleCase(label)} (INS ${code})` : `INS ${code}`,
            canonicalName: `ins ${code}`,
            lookupKeys: [`ins ${code}`],
            insCode: code,
            percentage: null,
            categoryHint,
          });
        }
        continue;
      }
    }

    const { text: noPct, percentage } = extractPercentage(cleaned);

    // A standalone code on its own, e.g. "INS 330" or "(129)".
    let insCode = null;
    let nameText = noPct;
    const standalone = noPct.match(codeRegex('i'));
    if (standalone && /\b(?:ins|e)\b/i.test(noPct.slice(0, standalone.index + 2))) {
      insCode = normalizeCode(standalone[1], standalone[2] || standalone[3], standalone[4]);
      nameText = noPct.replace(standalone[0], ' ').replace(/\b(?:ins|e)\b/gi, ' ');
    } else {
      const bracketed = findLastBracketGroup(noPct);
      if (bracketed) {
        const codes = parseCodeList(bracketed.inner);
        if (codes && codes.length === 1) {
          insCode = codes[0];
          nameText = noPct.slice(0, bracketed.start) + noPct.slice(bracketed.end + 1);
        }
      }
    }

    // "INVERT SUGAR SYRUP [SUGAR, CITRIC ACID]" — the bracket lists what
    // the ingredient is made of. Keep the ingredient name for matching and
    // record its components separately, rather than mangling them together.
    let subIngredients = [];
    const compound = findLastBracketGroup(nameText);
    if (compound && compound.inner.includes(',') && nameText.slice(0, compound.start).trim()) {
      subIngredients = compound.inner
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      nameText = nameText.slice(0, compound.start) + nameText.slice(compound.end + 1);
    }

    let name = nameText
      .replace(/[([]\s*[)\]]/g, ' ')
      .replace(/^[\s\-–:.]+|[\s\-–:.]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!name && insCode) name = `INS ${insCode}`;
    if (!name) continue;
    if (name.replace(/[^a-z]/gi, '').length < 2) continue;   // OCR noise
    // A numeric INS code is already validated by its own pattern; a bare
    // name is not, so reject anything that reads like a typed sentence.
    if (!insCode && !looksLikeIngredientName(name)) continue;

    const canonicalName = normalizeName(name);
    add({
      displayName: titleCase(name),
      canonicalName,
      lookupKeys: buildLookupKeys(name, insCode),
      insCode,
      percentage,
      subIngredients,
      categoryHint: null,
    });
  }

  return out;
}
