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

/**
 * Cheap, deterministic check for "are this label's brackets actually
 * well-formed" -- catches both a missing closer (depth never returns to
 * zero) and a stray extra closer (depth would go negative). Used to
 * decide whether a label needs AI punctuation repair before parsing, so
 * that call only ever runs for the labels that actually need it.
 */
export function isBracketBalanced(text) {
  let depth = 0;
  for (const ch of text || '') {
    if (OPENERS.includes(ch)) depth++;
    else if (CLOSERS.includes(ch)) {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

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

// A company name or address fragment, with no attribution verb ("Mfd
// by") in front of it for stripBoilerplate to catch -- plenty of real
// labels just print the manufacturer's name and address as a trailing
// run of comma-separated entries with nothing announcing what they are.
// No real food ingredient contains a company-registration suffix, an
// industrial-estate marker, or ends in a 6-digit PIN code, so any one
// of these is a safe, specific enough signal on its own.
const ADDRESS_OR_COMPANY_RE =
  /\b(?:pvt\.?\s*ltd\.?|private\s+limited|public\s+limited|\bltd\.?\b|\blimited\b|industries|enterprises|corporation|\bcorp\.?\b|midc|industrial\s+(?:area|estate)|\bplot\s*no\.?\b|\bsector\s*\d+\b)\b|\b\d{6}\b\s*\.?\s*$/i;

/**
 * True once a top-level entry looks like the START of the manufacturer/
 * address block rather than an ingredient. Real labels always put this
 * as one contiguous run at the very end, so once found, everything from
 * that entry onward (not just this one entry) is dropped by the caller
 * -- an address's own words ("Plot 12", "MIDC", "Pune - 411019") split
 * into separate top-level entries the same way ingredients do, and only
 * the FIRST of them is guaranteed to carry a strong enough signal to
 * detect on its own.
 */
export function looksLikeAddressOrCompanyFragment(entry) {
  return ADDRESS_OR_COMPANY_RE.test(entry);
}

// Footnote/reference markers labels use to link an ingredient to a
// clarifying note, e.g. "INVERT SUGAR SYRUP# ... #(D-GLUCOSE, LEVULOSE)".
const FOOTNOTE_MARKERS = /[#*†‡^]/g;

// Allergen declarations ("CONTAINS: WHEAT, MILK") repeat things already in
// the ingredients list — they're useful information, but they are not
// separate ingredients and must not be double-counted.
const ALLERGEN_WORDS = [
  'wheat', 'milk', 'soya', 'soy', 'peanut', 'peanuts', 'nut', 'nuts', 'tree nuts',
  'egg', 'eggs', 'fish', 'shellfish', 'crustacean', 'gluten', 'sesame',
  'mustard', 'celery', 'sulphite', 'sulphites', 'sulfite', 'sulfites',
  'lupin', 'molluscs', 'cashew', 'almond', 'almonds',
  // Other gluten-bearing cereals, which "may contain" warnings list
  // alongside wheat just as often as wheat itself.
  'barley', 'oats', 'rye',
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

// A single missing closing bracket after an INS-code list doesn't just
// mangle that one entry -- since splitTopLevel's bracket depth never
// returns to zero for the rest of the string, every comma after it stops
// splitting too, so EVERY later ingredient (however many) gets swallowed
// into one giant blob that fails the "looks like an ingredient name"
// check and is silently dropped whole. Confirmed against a real scanned
// product (Maaza Refresh Mango Drink, barcode 8901764175022): "SUGAR
// ACIDITY REGULATORS (330, 331(iii), STABILIZER (466), ANTIOXIDANT (300)
// SWEETENER (960), COLOUR(110), MANGO FLAVOUR (...)." is missing the ")"
// that should close "(330, 331(iii))" -- the label scored a false
// "Very Healthy 99/100" because that one missing character also took
// out an artificial sweetener AND a restricted synthetic colour (INS
// 110, Sunset Yellow) with it, not just the acidity regulators. Repaired
// by recognising "this bracket contains nothing but a code list, and is
// directly followed by a comma + a fresh ALL-CAPS category word +
// bracket" as a reliable sign the closer was dropped, and inserting it.
const MISSING_CODE_LIST_CLOSER_RE =
  /\((\d{3,4}(?:\s*\(\s*[ivx]+\s*\))?(?:\s*,\s*\d{3,4}(?:\s*\(\s*[ivx]+\s*\))?)*)\s*,\s*(?=[A-Z][A-Z\s]{2,}[\s(])/gi;

// Regulatory/functional category words a label declares an additive
// under -- unlike a descriptive compound name ("Mango Flavour", "Natural
// Colour"), these are fixed FSSAI/Codex terms that are never themselves
// preceded by an unrelated modifier word, so it's safe to assume
// anything butting up against one with no delimiter is a separate,
// missing-comma-away ingredient. Deliberately excludes COLOUR/COLOR and
// FLAVOUR/FLAVOR/FLAVOURING -- those routinely follow a real descriptive
// name ("Mango Flavour", "Caramel Colour") that must NOT be split off.
const CATEGORY_LABEL_WORDS =
  'ACIDITY REGULATORS?|ANTIOXIDANTS?|EMULSIFIERS?|PRESERVATIVES?|RAISING AGENTS?|' +
  'STABILI[SZ]ERS?|SWEETENERS?|THICKENERS?|HUMECTANTS?|ANTI-CAKING AGENTS?|' +
  'GELLING AGENTS?|GLAZING AGENTS?|BULKING AGENTS?|FIRMING AGENTS?|FOAMING AGENTS?|' +
  'SEQUESTRANTS?|FLOUR TREATMENT AGENTS?';

// Only fires right after a closing bracket -- "(300) SWEETENER (960)" is
// a fresh declared category starting immediately after a previous one's
// code closed, with no comma in between. That's a narrow, reliable
// signal; a bare preceding WORD isn't (see CATEGORY_LABEL_WORDS above),
// so a plain "SUGAR ACIDITY REGULATORS" run-on is deliberately left
// alone rather than risk a wrong split.
const MISSING_COMMA_AFTER_BRACKET_RE =
  new RegExp(`(?<=[)\\]}]\\s{0,3})\\b(${CATEGORY_LABEL_WORDS})\\b\\s*(?=[(\\[])`, 'gi');

// HTML entities that leak into OCR'd/AI-extracted label text unescaped
// -- e.g. a real scanned product (Storia Coffee Shake) came through as
// '...Sodium(mg) &quot;COFFEE IS A RICH SOURCE...'. Left alone, "&quot;"
// is worse than harmless noise: splitTopLevel treats a bare "&" as a
// top-level "X, Y & Z" separator, so it tears "&quot;" into "&" (flush)
// then "quot" then ";" (flush) -- handing back a clean-looking, isolated
// "quot" token that passes every "does this look like an ingredient
// name" check and gets sent to AI research as if it were real. Decoding
// these back to their literal character first (") means there's no bare
// "&" left to mis-split on, and the resulting punctuation gets stripped
// like any other by the normal cleanup below.
const HTML_ENTITIES = { quot: '"', apos: "'", amp: '&', lt: '<', gt: '>', nbsp: ' ' };
function decodeHtmlEntities(text) {
  return text
    .replace(/&(quot|apos|amp|lt|gt|nbsp);/gi, (_, name) => HTML_ENTITIES[name.toLowerCase()])
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/**
 * Repairs the label-transcription defects above -- all no-ops (nothing
 * to match) on well-formed text, so this is safe to run unconditionally
 * before any real parsing happens.
 */
function repairRunOnCategories(text) {
  return decodeHtmlEntities(text)
    .replace(MISSING_CODE_LIST_CLOSER_RE, '($1), ')
    .replace(MISSING_COMMA_AFTER_BRACKET_RE, ', $1');
}

/**
 * Split a label into top-level entries, respecting brackets so that
 * "INVERT SUGAR SYRUP (SUGAR, CITRIC ACID)" stays as one entry while
 * "SUGAR, SALT" becomes two.
 *
 * Separators: commas, semicolons, newlines, bullets, sentence periods,
 * and a top-level " AND " / "&" (labels routinely end with "X, Y AND Z").
 */
export function splitTopLevel(rawText) {
  const text = repairRunOnCategories(rawText);
  const parts = [];
  let depth = 0;
  let current = '';

  // The mid-bracket period rescue below is only worth its cost when this
  // text's brackets are genuinely unbalanced overall (common in OCR'd
  // text) -- otherwise it does more harm than good. A real Maggi label
  // reads "Noodles {Wheat flour, Palm oil, ... Humectant (451(i)).}
  // Masala {...}." -- the sentence's full stop sits INSIDE the group,
  // right before its closing brace. Forcing a flush there (unconditionally,
  // as this used to) splits that whole group in half at the period: every
  // real ingredient ends up trapped in one over-long blob that later fails
  // the "does this look like one ingredient name" check and gets silently
  // dropped, leaving only whatever came after (here, the allergen
  // sentence) to be read as the entire ingredients list. Confirmed against
  // a real seeded product that scored 98/100 on exactly this bug -- its
  // six "ingredients" were literally "Contains _Wheat_", "_nut_", etc.
  const balanced = isBracketBalanced(text);

  const flush = () => {
    if (current.trim()) parts.push(current.trim());
    current = '';
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (OPENERS.includes(ch)) depth++;
    else if (CLOSERS.includes(ch)) depth = Math.max(0, depth - 1);

    // A period ends a sentence — but not inside a decimal like "0.03%".
    // Only forced through at depth > 0 when the text is unbalanced --
    // see the comment above.
    if (ch === '.' && (depth === 0 || !balanced)) {
      const prev = text[i - 1];
      const next = text[i + 1];
      const insideNumber = /\d/.test(prev || '') && /\d/.test(next || '');
      if (!insideNumber) {
        flush();
        depth = 0;
        continue;
      }
    }

    if (depth === 0) {
      if (ch === ',' || ch === ';' || ch === '\n' || ch === '\r' || ch === '•' || ch === '|') {
        flush();
        continue;
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
 * Like findLastBracketGroup, but returns every top-level bracket group in
 * a string, in order -- needed because the sub-ingredient list isn't
 * always the LAST bracket. "Supergrain blend (whole wheat (atta), jowar)
 * (63%)" has the real ingredient list in the middle bracket, followed by
 * a trailing percentage-only one; picking only the last bracket (as
 * findLastBracketGroup does) finds "(63%)", which has no comma, so the
 * compound-list check below would never recurse into the actual
 * ingredients and would silently drop the whole entry instead.
 */
function findAllTopLevelBrackets(raw) {
  const groups = [];
  let depth = 0;
  let start = -1;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (OPENERS.includes(ch)) {
      if (depth === 0) start = i;
      depth++;
    } else if (CLOSERS.includes(ch)) {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && start !== -1) {
        groups.push({ start, end: i, inner: raw.slice(start + 1, i) });
        start = -1;
      }
    }
  }
  return groups;
}

/** True for a bracket that states nothing but a share of the product, e.g. "63%". */
function isPurePercentageBracket(inner) {
  return /^\s*\d+(?:\.\d+)?\s*%\s*$/.test(inner);
}

/**
 * How far apart two non-overlapping top-level brackets are in the raw
 * string (0 if adjacent). Used to find the percentage bracket that
 * actually belongs to a given compound bracket -- "Noodles (88.5%): ...
 * blend (whole wheat (atta), jowar) (63%)" has TWO pure-percentage
 * brackets; picking the first one found in the string would grab the
 * unrelated outer "(88.5%)" instead of the "(63%)" sitting right next to
 * the ingredient list it actually describes.
 */
function bracketGap(a, b) {
  if (b.start >= a.end) return b.start - a.end;
  if (a.start >= b.end) return a.start - b.end;
  return 0;
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

// Legally-mandated boilerplate every Indian packaged label carries
// somewhere near the ingredients panel -- manufacturer/marketer
// attribution, FSSAI licence number, registered office / customer care
// address, and batch/date info. None of it is food, but a scanned or
// photographed label routinely captures it in the same block of text as
// the real ingredients, and a short piece of it (a city name, an INS-
// code-shaped licence number, a plain word like "Care") can slip past
// looksLikeIngredientName and get treated as a real ingredient. Matched
// as a whole clause (trigger phrase through the next full stop) rather
// than removed word-by-word, since an address's own internal commas
// ("Plot 45, Sector 10, Gurgaon") must not be mistaken for separate
// top-level ingredients if this ran after splitTopLevel instead of
// before it.
const BOILERPLATE_TRIGGER =
  '(?:mfd\\.?\\s*(?:by|for)?|manufactured\\s*(?:by|for)?|mkt\\.?d\\.?\\s*(?:by|for)?|marketed\\s*(?:by|for)?|' +
  'pkd\\.?\\s*(?:by|for|on)?|packed\\s*(?:by|for|on)?|packaged\\s*(?:by|for)?|bottled\\s*(?:by|for)?|' +
  'distributed\\s*(?:by|for)?|imported\\s*(?:by|for)?|fssai\\.?\\s*(?:lic\\.?|licen[cs]e|reg\\.?|registration)\\.?\\s*(?:no\\.?)?|' +
  'lic\\.?\\s*no\\.?|regd\\.?\\s*office|registered\\s*office|customer\\s*care|consumer\\s*care|' +
  'for\\s*(?:any\\s*)?(?:queries|complaints|feedback|suggestions)|toll[- ]?free|helpline|' +
  'best\\s*before|use\\s*by|batch\\s*no\\.?|mfg\\.?\\s*(?:date|dt)?\\.?|exp\\.?\\s*(?:date|dt)?\\.?)';

// Standalone patterns removed regardless of a nearby trigger word -- an
// email, a URL, or a 10-digit Indian mobile number is never legitimate
// ingredient content on its own.
const CONTACT_DETAIL_RES = [
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,          // email
  /\b(?:https?:\/\/|www\.)\S+/gi,           // URL
  /\b(?:\+?91[-\s]?)?[6-9]\d{9}\b/g,        // Indian mobile number
  /\b1800[-\s]?\d{2,3}[-\s]?\d{4}\b/g,      // toll-free number
];

/**
 * Strips manufacturer/address/legal boilerplate (see BOILERPLATE_TRIGGER
 * above) out of a label, the same way extractAllergens pulls out
 * "CONTAINS: ..." -- returns the remaining text with those clauses gone.
 */
function stripBoilerplate(text) {
  let remaining = text;
  for (const re of CONTACT_DETAIL_RES) remaining = remaining.replace(re, ' ');

  const re = new RegExp(`\\b${BOILERPLATE_TRIGGER}\\b\\s*:?\\s*(?:(?!\\b${BOILERPLATE_TRIGGER}\\b)[^.\\n\\r])*`, 'gi');
  return remaining.replace(re, ' ');
}

/**
 * Pull "CONTAINS: WHEAT, MILK" style allergen declarations out of the
 * label, returning them separately so they aren't parsed as ingredients.
 */
function extractAllergens(text) {
  const allergens = [];
  let remaining = text;

  // Stop the clause at the next trigger word so an earlier non-allergen
  // "CONTAINS ADDED FLAVOUR (...)" doesn't swallow the real allergen line.
  // "May contain" (trace/cross-contamination warnings) is just as common
  // on Indian labels as "contains" itself, so both are matched.
  const TRIGGER = '(?:may\\s+(?:also\\s+)?contain|contains?)';
  const re = new RegExp(`\\b${TRIGGER}\\b\\s*:?\\s*((?:(?!\\b${TRIGGER}\\b)[^.\\n\\r])*)`, 'gi');
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
 * Strips markdown emphasis underscores that occasionally leak into AI-
 * generated/repaired label text unstripped -- e.g. a real seeded label
 * came through as "Contains _Wheat_ and _nut_. May contains _Milk_,
 * _Mustard_, ...". Underscores otherwise have no legitimate use in a
 * food label, unlike "*", which is a real footnote marker elsewhere on
 * Indian labels (see FOOTNOTE_MARKERS) and is deliberately left alone
 * here. Run before allergen extraction specifically because
 * extractAllergens matches against a plain-word list (ALLERGEN_WORDS)
 * -- "_wheat_" doesn't match "wheat", so the whole "Contains ..." clause
 * was silently falling through to be parsed as ordinary ingredients
 * instead of being recognized and removed as an allergen declaration.
 */
function stripMarkdownEmphasis(text) {
  return text.replace(/_([^_\n]+)_/g, '$1');
}

/**
 * Parse a label into both its ingredients and its declared allergens.
 */
export function parseLabel(labelText) {
  if (!labelText || !labelText.trim()) return { ingredients: [], allergens: [] };
  const withoutBoilerplate = stripBoilerplate(stripMarkdownEmphasis(labelText));
  const { remaining, allergens } = extractAllergens(withoutBoilerplate);
  return { ingredients: parseIngredients(remaining), allergens };
}

/**
 * Parse a full ingredients label into individual ingredients.
 *
 * Returns [{ displayName, canonicalName, lookupKeys, insCode, percentage,
 * categoryHint }] with duplicates removed, in label order (which matters
 * — labels list ingredients by descending quantity).
 */
export function parseIngredients(labelText) {
  if (!labelText || !labelText.trim()) return [];

  const out = [];
  const seen = new Set();

  // Everything expanded out of a single bracket belongs to one group.
  // "Edible Vegetable Oil (Ricebran, Cottonseed, Palmolein)" is ONE oil
  // component that happens to disclose its blend -- scoring three
  // separate full-strength oils charges the product three times for one
  // thing. Same for "Spices and Condiments (15 spices...)". The children
  // still each get their own row, status and explanation; the group only
  // says "these share one slot's worth of the product".
  let groupCounter = 0;
  const newGroupId = () => `g${++groupCounter}`;

  const add = (item, groupId) => {
    if (seen.has(item.canonicalName)) return;
    seen.add(item.canonicalName);
    out.push({ ...item, groupId: groupId || null });
  };

  // Handles one top-level entry, recursing when it turns out to be a
  // named blend/group whose bracket lists several real ingredients
  // (e.g. "SEASONING (ONION POWDER, MALTODEXTRIN, SUGAR, ...)") rather
  // than one thing's chemical makeup. Those sub-items are genuine,
  // independently-scoreable ingredients -- often the ones that actually
  // matter (sugar, flavour enhancers, HVP) -- so they get parsed as
  // their own entries instead of being hidden inside a generic wrapper
  // name that never gets researched with any awareness of what's in it.
  const processEntry = (rawEntry, groupId = null, inheritedPercentage = null) => {
    // A standalone footnote like "#(D-GLUCOSE, LEVULOSE)" explains an
    // ingredient listed above — it isn't an ingredient in its own right.
    // Only true when the marker has NOTHING but a bracket after it,
    // though -- a real named entry can also carry one of these symbols
    // as a leading disclosure mark rather than a footnote reference,
    // e.g. "*Seasoning (Spices and condiments, Maltodextrin, ...)" (a
    // real scanned Lays label). The old check matched any leading
    // marker at all, so it silently dropped that entire group -- 8 real
    // ingredients, including two flavour enhancers -- and scored the
    // product as if it were just potato and oil.
    if (/^\s*[#*†‡^]\s*[([{]/.test(rawEntry)) return;

    // Tidy up spacing labels often have inside brackets: "(MAIDA )" -> "(MAIDA)"
    const entry = rawEntry
      .replace(FOOTNOTE_MARKERS, ' ')
      .replace(/([([{])\s+/g, '$1')
      .replace(/\s+([)\]}])/g, '$1');
    const cleaned = stripNoisePrefix(entry);
    if (!cleaned) return;

    // "RAISING AGENTS [INS 503(ii), 500(ii)]" -> one entry per code.
    const bracket = findLastBracketGroup(cleaned);
    if (bracket && !cleaned.slice(bracket.end + 1).trim()) {
      const codes = parseCodeList(bracket.inner);
      if (codes) {
        const label = cleaned.slice(0, bracket.start).trim();
        const categoryHint = label ? label.toLowerCase() : null;
        // "Acidity Regulators (E296, E330)" is two distinct additives
        // sharing one declared slot -- both stay listed, both keep their
        // own status, but together they're one slot's worth of product.
        const codeGroup = codes.length > 1 ? groupId || newGroupId() : groupId;
        for (const code of codes) {
          add({
            displayName: label ? `${titleCase(label)} (INS ${code})` : `INS ${code}`,
            canonicalName: `ins ${code}`,
            lookupKeys: [`ins ${code}`],
            insCode: code,
            percentage: null,
            categoryHint,
          }, codeGroup);
        }
        return;
      }
    }

    // "SEASONING (ONION POWDER, MALTODEXTRIN, SUGAR, ...)" — a bracket
    // listing multiple named items, with or without a group name in
    // front of it (some labels wrap the whole clause in one more outer
    // bracket, e.g. "(DEHYDRATED VEGETABLES (ONION, CARROT, ...))").
    // Parse each sub-item as its own real ingredient and drop the
    // generic wrapper, rather than merging them into one vague,
    // under-researched entry -- recursing handles either shape, since a
    // bare bracket's inner content just gets fed back through this same
    // check on its own next pass.
    //
    // This has to run on the untouched `cleaned` text, before any
    // percentage/code extraction below -- those work on the whole
    // string and would otherwise grab the *first* "%" they find and
    // strip it, even when it actually belongs to one specific sub-item
    // several levels down, leaving that sub-item with no percentage by
    // the time its own turn comes around.
    //
    // The sub-ingredient list isn't always the LAST top-level bracket --
    // "Supergrain blend (whole wheat (atta), jowar) (63%)" has it in the
    // middle, followed by a trailing percentage-only bracket. Scanning
    // every top-level bracket for the one that actually contains a comma
    // (rather than assuming it's the last one) is what lets this recurse
    // into "whole wheat (atta)" and "jowar" instead of falling through to
    // single-entry parsing, mangling the whole clause into one unnamed
    // blob, and silently dropping it as "not a real ingredient name".
    const topBrackets = findAllTopLevelBrackets(cleaned);
    // More than one of these can appear in a single entry -- e.g. two
    // section groups glued together with no delimiter splitTopLevel
    // would catch between them ("Noodles {...} Masala {...}."). Taking
    // only the first (as this used to) silently dropped every group
    // after it -- found via a real seeded product, though there the
    // real two groups happened to have a newline between them so they
    // were already separate entries; this loop is what protects a label
    // that DOESN'T have that separator too.
    const compounds = topBrackets.filter((b) => b.inner.includes(','));
    if (compounds.length > 0) {
      for (const compound of compounds) {
        // A sibling bracket that states nothing but a percentage -- e.g.
        // that trailing "(63%)" -- is this whole group's share of the
        // product, not any one child's. Split it evenly across the
        // children instead of discarding it, but let a child that states
        // its own percentage keep that instead. When more than one
        // percentage-only bracket exists in the entry (an outer wrapper's
        // plus this group's own), take the one closest to this compound
        // bracket rather than whichever appears first in the string.
        const pctCandidates = topBrackets.filter((b) => b !== compound && isPurePercentageBracket(b.inner));
        const pctBracket = pctCandidates.length > 0
          ? pctCandidates.reduce((closest, b) =>
              bracketGap(compound, b) < bracketGap(compound, closest) ? b : closest)
          : null;
        const subEntries = splitTopLevel(compound.inner);
        const perMemberPercentage =
          pctBracket && subEntries.length > 0
            ? parseFloat(pctBracket.inner) / subEntries.length
            : null;

        // The outermost bracket defines the slot -- a nested group inside
        // it ("(Dehydrated Vegetables (Onion, Carrot))") is still part of
        // that same one declared component, so children inherit rather
        // than starting a new group of their own. Computed fresh per
        // compound (not once outside the loop) so two independent
        // sibling groups ("Noodles"'s and "Masala"'s) each get their own
        // group instead of being merged into one shared quantity slot --
        // only actually matters when groupId itself is null here; when
        // it's already inherited from a real outer parent, every
        // sibling correctly reuses that same one.
        const childGroup = groupId || newGroupId();
        for (const subEntry of subEntries) {
          processEntry(subEntry, childGroup, perMemberPercentage);
        }
      }
      return;
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

    let name = nameText
      .replace(/[([]\s*[)\]]/g, ' ')
      // Leftover unmatched brackets -- from a missing/extra one earlier
      // in a malformed label -- are just noise by this point; anything
      // meaningful they wrapped has already been extracted above.
      .replace(/[(){}[\]]/g, ' ')
      .replace(/^[\s\-–:.,]+|[\s\-–:.,]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!name && insCode) name = `INS ${insCode}`;
    if (!name) return;
    if (name.replace(/[^a-z]/gi, '').length < 2) return;   // OCR noise
    // A numeric INS code is already validated by its own pattern; a bare
    // name is not, so reject anything that reads like a typed sentence.
    if (!insCode && !looksLikeIngredientName(name)) return;

    const canonicalName = normalizeName(name);
    add({
      displayName: titleCase(name),
      canonicalName,
      lookupKeys: buildLookupKeys(name, insCode),
      insCode,
      percentage: percentage != null ? percentage : inheritedPercentage,
      categoryHint: null,
    }, groupId);
  };

  for (const rawEntry of splitTopLevel(labelText)) {
    // The manufacturer/address block is always a contiguous run at the
    // very end -- the moment one entry looks like the start of it, every
    // entry after it is with near-certainty more of the same, not a new
    // ingredient that just happens to follow an address in the label.
    if (looksLikeAddressOrCompanyFragment(rawEntry)) break;
    processEntry(rawEntry);
  }

  return out;
}
