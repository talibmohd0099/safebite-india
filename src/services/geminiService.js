// src/services/geminiService.js
// Handles all Gemini AI API calls for ingredient analysis

// Works both in the browser (Vite injects import.meta.env at build time)
// and in Node -- the Netlify scheduled function reuses this same service,
// where env vars come from process.env instead.
//
// Two keys (two separate free-tier quotas, 500 requests/day each) so this
// pipeline work and real user scans don't all compete for one shared pool.
// _2 is optional -- everything still works with just the first key.
export const GEMINI_API_KEYS = [
  import.meta.env?.VITE_GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY,
  import.meta.env?.VITE_GEMINI_API_KEY_2 || process.env.VITE_GEMINI_API_KEY_2,
].filter(Boolean);

function apiUrl(key) {
  return `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${key}`;
}

function isQuotaError(message) {
  return /quota|rate limit|429/i.test(message || '');
}

// Free-tier quota is per-key and resets daily -- once the active key runs
// out, every call would fail the same way, so remember which key last
// worked and start there next time instead of re-trying an exhausted key
// on every single call.
let activeKeyIndex = 0;

/**
 * POST one request to Gemini, rotating to the next configured key if the
 * active one is out of quota. Returns { text, finishReason } on success;
 * throws (with the real API error message) once every remaining key has
 * failed, so existing callers' try/catch and error handling still work
 * unchanged.
 */
export async function callGemini(requestBody) {
  let lastMessage = 'API request failed';
  for (let i = activeKeyIndex; i < GEMINI_API_KEYS.length; i++) {
    const response = await fetch(apiUrl(GEMINI_API_KEYS[i]), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (response.ok) {
      activeKeyIndex = i;
      const data = await response.json();
      return {
        text: data.candidates?.[0]?.content?.parts?.[0]?.text,
        finishReason: data.candidates?.[0]?.finishReason,
      };
    }

    const error = await response.json().catch(() => null);
    lastMessage = error?.error?.message || 'API request failed';

    if (isQuotaError(lastMessage) && i + 1 < GEMINI_API_KEYS.length) {
      console.warn(`Gemini key ${i + 1}/${GEMINI_API_KEYS.length} is out of quota -- switching to the next key.`);
      continue;
    }
    activeKeyIndex = i;
    throw new Error(lastMessage);
  }
  throw new Error(lastMessage);
}

const ANALYSIS_PROMPT = `You are a food safety expert specializing in Indian food regulations (FSSAI) and EU/EFSA standards. Your job is to help Indian consumers understand what's in their packaged food.

Analyze the provided food ingredients and return ONLY a valid JSON response. No markdown, no explanation, just pure JSON.

Return this exact JSON structure:
{
  "productName": "Unknown Product",
  "overallScore": 75,
  "verdict": "Moderately Healthy",
  "summary": "2-3 sentence plain English summary of the product's health profile",
  "ingredients": [
    {
      "name": "ingredient name as written on label",
      "status": "safe",
      "fssaiStatus": "permitted",
      "euStatus": "permitted",
      "reason": "Plain, simple explanation of what this is and any concerns",
      "category": "preservative",
      "whatIsIt": "One short plain-English sentence on what this substance actually is (natural, synthetic, derived from what, INS number meaning if applicable)",
      "commonlyFoundIn": ["other common foods/products this ingredient is usually found in, 2-4 examples"],
      "healthEffects": "One short sentence on known health effects — short-term and long-term if relevant. If genuinely no concerns, say so plainly instead of inventing risk."
    }
  ],
  "flags": ["High Sugar", "Contains Palm Oil"],
  "positives": ["No artificial colors", "Contains real spices"],
  "recommendation": "One clear sentence advice for the consumer"
}

Rules for status field:
- "safe" = no concerns, natural ingredient or fully safe additive
- "concerning" = legal but worth knowing about (palm oil, added sugar, MSG, artificial sweeteners, carrageenan, sodium >500mg/100g)
- "harmful" = FSSAI banned/restricted, or serious health risk

Rules for fssaiStatus / euStatus:
- "permitted" = allowed
- "restricted" = allowed with limits
- "banned" = not allowed
- "not_regulated" = no specific regulation found

Score rubric (be honest, don't be too generous):
- 85-100: Very healthy — whole/natural ingredients, no concerning additives
- 65-84: Good — minor concerns only, mostly natural
- 45-64: Moderate — some additives, high sugar or sodium, palm oil
- 25-44: Poor — multiple concerning additives, very processed
- 0-24: Very poor — harmful/banned substances, extremely unhealthy profile

FSSAI-specific flags to ALWAYS check:
- Potassium Bromate (INS 924): BANNED in India → status: harmful
- Brominated Vegetable Oil: BANNED → status: harmful  
- Metanil Yellow, Rhodamine B: BANNED artificial colors → status: harmful
- Palm oil / palmolein: Legal but concerning → status: concerning
- Added sugar >10% of ingredients: concerning
- Artificial sweeteners (aspartame, saccharin, sucralose): concerning
- MSG / Monosodium glutamate: concerning
- TBHQ / BHA / BHT preservatives: concerning
- Carrageenan: concerning
- High Fructose Corn Syrup: harmful/concerning

Always write reasons in simple English that a non-expert Indian consumer can understand.`;

/**
 * Analyze ingredients from text input
 */
export async function analyzeIngredients(ingredientsText) {
  if (GEMINI_API_KEYS.length === 0) {
    throw new Error('Gemini API key not found. Please add VITE_GEMINI_API_KEY to your .env file.');
  }

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: `${ANALYSIS_PROMPT}\n\nIngredients to analyze:\n${ingredientsText}`
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      topK: 1,
      topP: 0.8,
      maxOutputTokens: 8192,
      thinkingConfig: {
        thinkingLevel: 'low',
      },
    }
  };

  const { text, finishReason } = await callGemini(requestBody);

  if (!text) throw new Error('Empty response from Gemini');

  return extractJson(text, finishReason);
}

const EXTRACTION_PROMPT = `You are transcribing the ingredients list from a photo of an Indian packaged food label.

Read the image carefully and return ONLY valid JSON, no markdown, no explanation:
{
  "productName": "product name if visible on the pack, otherwise 'Unknown Product'",
  "ingredientsText": "the full ingredients list exactly as printed, comma separated, keep INS numbers and sub-brackets as written",
  "readable": true,
  "notes": "short note ONLY if the photo was blurry, the list looked cut off, small/faded text was hard to read, or you are not fully confident you captured everything — otherwise an empty string"
}

If the label truly cannot be read at all, set "readable": false, leave "ingredientsText" empty, and explain why in "notes".
Never invent or guess ingredients that aren't legible — it is better to leave something out and note it than to make it up.`;

/**
 * Extract (transcribe) the ingredients list from a food label photo.
 * This is a cheap, short-output OCR-style pass — it does NOT run the
 * full FSSAI/EU analysis. The extracted text is meant to be shown to
 * the user for review/editing before analyzeIngredients() is called
 * on the confirmed text, since small print often gets missed or
 * misread and the user should get a chance to fix it first.
 */
export async function extractIngredientsFromImage(imageFile) {
  if (GEMINI_API_KEYS.length === 0) {
    throw new Error('Gemini API key not found. Please add VITE_GEMINI_API_KEY to your .env file.');
  }

  const base64Image = await fileToBase64(imageFile);
  const mimeType = imageFile.type;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: EXTRACTION_PROMPT },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Image
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      topK: 1,
      topP: 0.8,
      maxOutputTokens: 1536,
      thinkingConfig: {
        thinkingLevel: 'low',
      },
    }
  };

  const { text, finishReason } = await callGemini(requestBody);

  if (!text) throw new Error('Empty response from Gemini');

  return extractJson(text, finishReason);
}

const RESEARCH_PROMPT = `You are a food safety researcher specializing in Indian FSSAI regulations and EU/EFSA standards.

You will be given a list of food ingredients found on Indian packaged food labels. Research EACH one and return ONLY a valid JSON array — no markdown, no explanation.

Each array element must be exactly this shape:
{
  "canonicalName": "the exact lowercase key you were given for this ingredient",
  "displayName": "Properly Cased Name",
  "recognized": true,
  "insCode": "322" or null,
  "scientificName": "chemical/scientific name, or null if it's a whole food",
  "category": "preservative | sweetener | color | emulsifier | flavour | acidity regulator | antioxidant | stabilizer | raising agent | oil | fat | protein | spice | vitamin | natural | other",
  "status": "safe | concerning | harmful",
  "fssaiStatus": "permitted | restricted | banned | not_regulated",
  "euStatus": "permitted | restricted | banned | not_regulated",
  "reason": "One plain-English sentence a non-expert Indian consumer understands",
  "whatIsIt": "One short sentence on what this substance actually is",
  "healthEffects": "One short sentence on known health effects. If genuinely harmless, say so plainly rather than inventing risk.",
  "commonlyFoundIn": ["2-4 other common foods containing this"],
  "synonyms": ["other names/spellings this appears under on labels, lowercase"],
  "penalty": 0
}

Set "recognized" to false ONLY when the given name is not a real food ingredient, additive, or edible substance at all -- a person's name, a random word, a typo, or gibberish (e.g. "Talib", "asdfgh", "xyz123"). Stay true for any real ingredient you're simply not fully certain about, obscure regional ingredients, or unusual INS codes -- research those normally. When recognized is false, still fill in every other field with your best-effort placeholder guess (the app will not score or display these, but every field must still be valid JSON).

"penalty" is how much this ingredient should pull a product's health score down, 0-40. Judge NUTRITIONAL QUALITY, not just legal/safety status — an ingredient can be 100% legal and non-toxic and still deserve a real penalty because it's nutritionally poor (refined, stripped of fiber/nutrients, high glycemic impact). Being "not banned" does not mean "penalty near 0".
- 0-2: genuinely whole/unrefined foods and harmless nutrients (water, whole wheat flour, vitamins, whole spices, fresh fruit/vegetable pieces)
- 3-8: mildly processed or moderate-impact items (iodised salt, small amounts of added sugar, natural flavours, most starches/thickeners)
- 9-18: refined/processed staples and notable concerns — this includes REFINED FLOUR / MAIDA (low fiber, high glycemic index, nutritionally stripped compared to whole grain — this is a real, common penalty case, not a harmless one), palm oil, MSG, artificial sweeteners, artificial colors, carrageenan
- 19-30: serious concerns (TBHQ/BHA/BHT, high fructose corn syrup, trans fats)
- 31-40: FSSAI-banned or seriously harmful (potassium bromate INS 924, brominated vegetable oil, metanil yellow, rhodamine B)

Be accurate and honest — this data is stored permanently and reused for every future scan, so a wrong answer here becomes a wrong answer forever. Your own "reason" and "healthEffects" text must be consistent with the penalty you assign — if you write that something is nutritionally poor, its penalty must reflect that, not sit near 0.
Return exactly one array element per ingredient given, in the same order.`;

/**
 * Research a batch of previously-unknown ingredients in ONE call.
 *
 * This is the only AI call the ingredient-library approach needs, and it
 * only runs for ingredients we've never seen before — once saved, they're
 * served from the database for free forever.
 */
export async function researchIngredients(items) {
  if (GEMINI_API_KEYS.length === 0) {
    throw new Error('Gemini API key not found. Please add VITE_GEMINI_API_KEY to your .env file.');
  }
  if (!items || items.length === 0) return [];

  const list = items
    .map((it, i) => `${i + 1}. key="${it.canonicalName}" name="${it.name}"${it.insCode ? ` INS code=${it.insCode}` : ''}`)
    .join('\n');

  const requestBody = {
    contents: [
      {
        parts: [{ text: `${RESEARCH_PROMPT}\n\nIngredients to research:\n${list}` }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      topK: 1,
      topP: 0.8,
      maxOutputTokens: 8192,
      thinkingConfig: {
        thinkingLevel: 'low',
      },
    },
  };

  const { text, finishReason } = await callGemini(requestBody);

  if (!text) throw new Error('Empty response from Gemini');

  const parsed = extractJson(text, finishReason, 'array');
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Pull the JSON object out of a Gemini text response, even if it's
 * wrapped in markdown fences, has stray text before/after it, or has
 * a stray trailing comma before a closing } or ].
 */
function extractJson(text, finishReason, shape = 'object') {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  const [open, close] = shape === 'array' ? ['[', ']'] : ['{', '}'];
  const start = cleaned.indexOf(open);
  const end = cleaned.lastIndexOf(close);
  const candidate = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned;

  try {
    return JSON.parse(candidate);
  } catch {
    // Common LLM slip-up: a trailing comma right before a closing bracket.
    const repaired = candidate.replace(/,(\s*[}\]])/g, '$1');
    try {
      return JSON.parse(repaired);
    } catch {
      console.error('Could not parse Gemini response:', { finishReason, text });
      if (finishReason === 'MAX_TOKENS') {
        throw new Error('The AI response was cut off because it ran too long. Please try again — this should be less likely on retry.');
      }
      throw new Error('Could not parse AI response. Please try again.');
    }
  }
}

const INSIGHTS_PROMPT = `You are writing the short human-facing text on a food product's health report for Indian consumers.

Return ONLY valid JSON, no markdown, no preamble:
{
  "summary": "...",
  "recommendation": "...",
  "isCondimentOrSeasoning": false,
  "usefulContext": null,
  "story": null
}

"summary" -- ONE or TWO short, natural sentences (35 words max) that:
- React specifically to THIS product's real profile -- not a generic template. Positive, neutral, or concerned, whichever is actually true.
- If there are concerning or harmful ingredients, name the actual ones given below (not a vague category).
- Sound like a knowledgeable friend, not a warning label. Vary your opening every time -- never reuse the same stock phrase across different products.
- Describe what is going on with this product. Do NOT give advice here -- "recommendation" covers that.
- Do NOT invent ingredients or facts not given below.

"recommendation" -- ONE short sentence (25 words max) of practical advice for THIS specific product:
- Say what someone should actually do: how often, in what quantity, what to watch for, or what to look for instead.
- Tie it to what is actually in THIS product. "Fine occasionally" could describe thousands of products -- be specific about why.
- Never alarmist, never preachy, never medical advice.

"isCondimentOrSeasoning" -- true ONLY if this product is normally used in small amounts as part of another dish rather than eaten on its own: spice blends and masalas, seasonings, stock cubes, food colours and essences, baking powder, pickles and chutneys eaten as a side relish, ketchup and sauces used as condiments.
false for anything eaten as a food in its own right -- biscuits, noodles, chips, namkeen, drinks, dairy, bread, chocolates. Also false for cooking oils, flours, rice and sugar: those are bulk ingredients eaten in real quantity, not small-quantity seasonings.

"usefulContext" -- null for ordinary everyday foods. A product's ingredient score alone can't say WHY it exists, and some products genuinely have a real, specific purpose that a low or middling score would otherwise hide -- oral rehydration salts and electrolyte drinks, glucose/dextrose energy powders, protein or meal-replacement supplements. For exactly these, ONE short sentence (25 words max) naming the actual real-world situation this product is genuinely useful for (e.g. "During dehydration, heat exhaustion, or after intense exercise, for fast glucose and electrolyte replacement."). Never invent or guess at a use case that isn't well-established for this exact kind of product -- when in doubt, return null.

"story" -- the content for a separate "Story" tab on the report: this product or its ingredients' history, why it's used, any real controversy, and myth vs fact. Return null ONLY when the brand is unfamiliar/generic AND its ingredients are too ordinary to say anything specific (plain atta, plain milk, an unbranded namkeen) -- for everything else, fill it in. Object shape:
{
  "headline": "one punchy line, under 12 words, that hooks a reader into tapping the tab",
  "history": "2-4 sentences on real, well-documented history/origin -- of this exact brand/product if you genuinely know it (e.g. why it was created, a well-known milestone), otherwise of its category or defining ingredient (e.g. how instant noodles or refined flour became an Indian household staple). Never state a specific date, lawsuit, recall or event as fact unless you are confident it is real and well-known.",
  "whyItsUsed": "2-3 sentences on why manufacturers actually use these ingredients -- what functional job they do (shelf life, texture, cost, taste) -- so the reader understands the reasoning, not just the ingredient list.",
  "controversy": "2-4 sentences on a real, documented controversy, ban, recall, or ongoing health debate tied to this product/brand or its ingredients (e.g. palm oil and deforestation, MSG safety debates, a specific brand's real recall). If you genuinely know of none, say so plainly -- e.g. 'No major controversy is tied to this product or its ingredients.' -- rather than inventing one.",
  "mythVsFact": [{ "myth": "a common misconception people actually hold", "fact": "the real, accurate correction" }]
}
"mythVsFact" must have 2-4 pairs, specific to this product's category or actual ingredients (e.g. "MSG causes headaches" for a product containing it) -- never generic, unrelated nutrition trivia. Every field in "story" must be something you are genuinely confident is accurate; when you lack specific, confident knowledge about this exact brand, write about its ingredient/category instead of guessing at brand-specific facts.`;

/**
 * Write the report's human-facing text for one product in a single call:
 * the summary, a product-specific recommendation, whether this is a
 * seasoning used in small amounts (which changes how its score should be
 * read -- a masala scoring 95 is not an invitation to eat it by the
 * spoonful), whether it's a functional/medicinal-use product whose real
 * value a plain ingredient score can't express (glucose powders, ORS,
 * protein supplements -- a middling score for "eaten as an everyday food"
 * doesn't mean it isn't exactly what it should be for its actual
 * purpose), and the long-form "Story" tab content (history/legacy, why
 * it's used, controversy, myth vs fact).
 *
 * Called once per genuinely new product (the result gets cached in
 * product_reports forever after), never per repeat scan. Returns null on
 * any failure so the caller can fall back to the rule-based text instead
 * of breaking the whole report over this.
 */
export async function generateProductInsights({ productName, brand, score, verdict, harmfulNames, concerningNames, ingredientCount, ingredientNames = [] }) {
  if (GEMINI_API_KEYS.length === 0) return null;

  const details = `Product: ${productName}${brand ? ` (brand: ${brand})` : ''}
Score: ${score}/100 (${verdict})
Total ingredients: ${ingredientCount}
Ingredients: ${ingredientNames.length ? ingredientNames.join(', ') : 'not listed'}
Harmful ingredients: ${harmfulNames.length ? harmfulNames.join(', ') : 'none'}
Concerning ingredients: ${concerningNames.length ? concerningNames.join(', ') : 'none'}`;

  const requestBody = {
    contents: [{ parts: [{ text: `${INSIGHTS_PROMPT}\n\n${details}` }] }],
    generationConfig: {
      // Higher than the analysis calls on purpose -- the summary and
      // recommendation are creative writing where varied phrasing is the
      // point, not deterministic scoring where we want the same answer
      // every time. Not so high that the boolean gets unreliable.
      temperature: 0.8,
      topK: 40,
      topP: 0.95,
      // Gemini's "thinking" tokens count against this budget too, and
      // can eat 100+ tokens on their own before it writes anything --
      // too tight a limit here silently truncates the reply. Raised from
      // 1000 to fit the "story" section (history/controversy/myths) on
      // top of the original summary/recommendation.
      maxOutputTokens: 2200,
      thinkingConfig: { thinkingLevel: 'low' },
    },
  };

  try {
    const { text, finishReason } = await callGemini(requestBody);
    // Cut-off text is worse than no AI text at all -- fall back to the
    // rule-based version rather than show a broken half-sentence.
    if (!text || finishReason !== 'STOP') return null;

    const parsed = extractJson(text, finishReason);
    const clean = (s) => (typeof s === 'string' ? s.trim().replace(/^["'\s]+|["'\s]+$/g, '') : null);

    const story = (() => {
      const s = parsed?.story;
      if (!s || typeof s !== 'object') return null;
      const history = clean(s.history);
      const whyItsUsed = clean(s.whyItsUsed);
      const controversy = clean(s.controversy);
      const mythVsFact = Array.isArray(s.mythVsFact)
        ? s.mythVsFact
            .map((pair) => ({ myth: clean(pair?.myth), fact: clean(pair?.fact) }))
            .filter((pair) => pair.myth && pair.fact)
        : [];
      // A "story" with only a headline, or only myths, isn't a real
      // Story tab -- require at least one real narrative section.
      if (!history && !whyItsUsed && !controversy) return null;
      return { headline: clean(s.headline), history, whyItsUsed, controversy, mythVsFact };
    })();

    return {
      summary: clean(parsed?.summary),
      recommendation: clean(parsed?.recommendation),
      isCondimentOrSeasoning: parsed?.isCondimentOrSeasoning === true,
      usefulContext: clean(parsed?.usefulContext),
      story,
    };
  } catch {
    // extractJson throws on unparseable output -- same fallback as any
    // other failure here, never surface it as a broken report.
    return null;
  }
}

const LABEL_REPAIR_PROMPT = `You are repairing a bracket-matching error in a food ingredients label (a missing or extra bracket, almost always from OCR or printing) that breaks automated parsing.

Rewrite the text with correctly balanced brackets. Follow these rules strictly:
- Do NOT add, remove, reorder, or reword any ingredient, word, or number. Every ingredient name and value must appear exactly as given.
- Do NOT invent anything that isn't in the original text.
- Only adjust punctuation -- brackets ( ) [ ] { }, commas, and periods -- so the structure is well-formed and each ingredient/group is clearly delimited.
- Return ONLY the corrected text as plain text. No markdown, no explanation, no preamble.`;

/**
 * Ask Gemini to fix a label's bracket punctuation when our own
 * deterministic bracket-counting can't (there's more than one plausible
 * place a missing/extra bracket belongs, which needs understanding what
 * the label means, not just counting characters). Only ever called when
 * isBracketBalanced() has already found a real problem -- most labels
 * never reach this, and it's a one-time cost per new product either way.
 * Returns null on any failure so the caller parses the original text.
 */
export async function repairLabelPunctuation(rawText) {
  if (GEMINI_API_KEYS.length === 0) return null;

  const requestBody = {
    contents: [{ parts: [{ text: `${LABEL_REPAIR_PROMPT}\n\nText to repair:\n${rawText}` }] }],
    generationConfig: {
      temperature: 0,
      topK: 1,
      topP: 0.8,
      maxOutputTokens: 2000,
      thinkingConfig: { thinkingLevel: 'low' },
    },
  };

  try {
    const { text, finishReason } = await callGemini(requestBody);
    if (!text || finishReason !== 'STOP') return null;

    return text.trim().replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
  } catch {
    return null;
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      // Remove the "data:image/jpeg;base64," prefix
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
  });
}
