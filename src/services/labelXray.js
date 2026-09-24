// src/services/labelXray.js
//
// "Label X-Ray": finds each analysed ingredient inside the label's own
// raw text, so the Ingredients tab can show the label exactly as printed
// with every ingredient lit up in its severity colour. Pure, no AI.
//
// Stored ingredient names are cleaned-up versions of the label's words
// ("Edible Vegetable Oil (Rice Bran Oil)" -> "Edible Vegetable Oil Rice
// Bran Oil"), so matching is done on a normalised copy of both -- case,
// brackets and punctuation ignored -- and mapped back to the original
// characters. An ingredient that can't be found is simply not lit up;
// nothing is ever guessed onto the wrong words.

// Lowercase letters/digits kept, every run of anything else -> one space.
// `map[i]` = index in the original text of normalised char i.
function normalise(text) {
  let out = '';
  const map = [];
  let lastWasSpace = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i].toLowerCase();
    if (/[\p{L}\p{N}]/u.test(ch)) {
      out += ch;
      map.push(i);
      lastWasSpace = false;
    } else if (!lastWasSpace) {
      out += ' ';
      map.push(i);
      lastWasSpace = true;
    }
  }
  return { text: out, map };
}

const normName = (s) => normalise(s || '').text.trim();

// Ways the stored name can differ from the label: an INS code or note in
// brackets ("Emulsifier (INS 322)" vs "emulsifier (322)"), or an "INS"
// prefix the label writes as just the number.
function candidatesFor(name) {
  const full = normName(name);
  const out = [full];
  const noBrackets = normName(String(name || '').replace(/\([^)]*\)/g, ' '));
  if (noBrackets && noBrackets !== full) out.push(noBrackets);
  const noIns = full.replace(/\bins\s+/g, '');
  if (noIns !== full) out.push(noIns);
  // Nothing shorter than 3 letters -- "e" or "oil" alone would light up
  // unrelated words.
  return out.filter((c) => c.replace(/\s/g, '').length >= 3);
}

/**
 * @param {string} text - the label's raw ingredients text.
 * @param {Array<{name: string}>} ingredients - the analysed ingredients.
 * @returns {Array<{ text: string, ingredientIndex: number|null }>} the
 *   whole text, in order, split into plain and matched pieces.
 */
export function segmentLabel(text, ingredients) {
  if (!text) return [];
  const list = Array.isArray(ingredients) ? ingredients : [];
  const norm = normalise(text);
  const claimed = new Array(norm.text.length).fill(false);
  const matches = [];

  // Longest names first, so "Tomato Ketchup" claims its words before a
  // plain "Tomato" could.
  const order = list
    .map((ing, index) => ({ index, candidates: candidatesFor(ing?.name) }))
    .filter((o) => o.candidates.length)
    .sort((a, b) => b.candidates[0].length - a.candidates[0].length);

  for (const { index, candidates } of order) {
    let found = null;
    for (const cand of candidates) {
      let from = 0;
      while (from <= norm.text.length) {
        const at = norm.text.indexOf(cand, from);
        if (at === -1) break;
        const end = at + cand.length;
        const boundaryOk = (at === 0 || norm.text[at - 1] === ' ') && (end === norm.text.length || norm.text[end] === ' ');
        let free = boundaryOk;
        for (let k = at; free && k < end; k++) if (claimed[k]) free = false;
        if (free) { found = { at, end }; break; }
        from = at + 1;
      }
      if (found) break;
    }
    if (!found) continue;
    for (let k = found.at; k < found.end; k++) claimed[k] = true;
    let end = norm.map[found.end - 1] + 1;
    // Close a bracket the match opened: "Oil (Rice Bran Oil" -> "...Oil)".
    const piece = text.slice(norm.map[found.at], end);
    if ((piece.split('(').length > piece.split(')').length) && text[end] === ')') end++;
    matches.push({ start: norm.map[found.at], end, ingredientIndex: index });
  }

  matches.sort((a, b) => a.start - b.start);
  const segments = [];
  let pos = 0;
  for (const m of matches) {
    if (m.start > pos) segments.push({ text: text.slice(pos, m.start), ingredientIndex: null });
    segments.push({ text: text.slice(m.start, m.end), ingredientIndex: m.ingredientIndex });
    pos = m.end;
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), ingredientIndex: null });
  return segments;
}
