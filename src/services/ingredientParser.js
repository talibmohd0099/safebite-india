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

    // A period ends a sentence — but not inside a decimal like "0.03%".
    // This check runs even at depth > 0: a missing or extra bracket
    // somewhere earlier in the label (common in OCR'd text) can leave
    // depth permanently stuck above 0, and without this, that one typo
    // would swallow everything for the rest of the label into one
    // unsplittable blob instead of just the one malformed group.
    if (ch === '.') {
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
    if (/^\s*[#*†‡^]/.test(rawEntry)) return;

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
    const compound = topBrackets.find((b) => b.inner.includes(','));
    if (compound) {
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
      // than starting a new group of their own.
      const childGroup = groupId || newGroupId();
      for (const subEntry of subEntries) {
        processEntry(subEntry, childGroup, perMemberPercentage);
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
    processEntry(rawEntry);
  }

  return out;
}
