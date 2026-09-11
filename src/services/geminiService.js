// src/services/geminiService.js
// Handles all Gemini AI API calls for ingredient analysis

// Works both in the browser (Vite injects import.meta.env at build time)
// and in Node -- the Netlify scheduled function reuses this same service,
// where env vars come from process.env instead.
const GEMINI_API_KEY = import.meta.env?.VITE_GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

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
  if (!GEMINI_API_KEY) {
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

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error?.error?.message || 'API request failed');
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const finishReason = data.candidates?.[0]?.finishReason;

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
  if (!GEMINI_API_KEY) {
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

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error?.error?.message || 'API request failed');
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const finishReason = data.candidates?.[0]?.finishReason;

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
  if (!GEMINI_API_KEY) {
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

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error?.error?.message || 'API request failed');
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const finishReason = data.candidates?.[0]?.finishReason;

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

const SUMMARY_PROMPT = `You are writing the one-line "executive summary" on a food product's health report for Indian consumers.

Write ONE or TWO short, natural sentences (35 words max) that:
- React specifically to THIS product's real profile -- not a generic template. Positive, neutral, or concerned, whichever is actually true.
- If there are concerning or harmful ingredients, name the actual ones given below (not a vague category).
- Sound like a knowledgeable friend, not a warning label. Vary your opening every time -- never reuse the same stock phrase across different products.
- Do NOT give diet advice or tell the reader what to do -- a separate field already covers that. Just describe what's going on with this product.
- Do NOT invent ingredients or facts not given below.

Return ONLY the sentence(s) as plain text. No quotes, no markdown, no preamble.`;

/**
 * Write a fresh, specific 1-2 sentence summary for one product. Called
 * once per genuinely new product (the result gets cached in
 * product_reports forever after), never per repeat scan. Returns null on
 * any failure so the caller can fall back to the rule-based summary
 * instead of breaking the whole report over this.
 */
export async function generateSummary({ productName, brand, score, verdict, harmfulNames, concerningNames, ingredientCount }) {
  if (!GEMINI_API_KEY) return null;

  const details = `Product: ${productName}${brand ? ` (brand: ${brand})` : ''}
Score: ${score}/100 (${verdict})
Total ingredients: ${ingredientCount}
Harmful ingredients: ${harmfulNames.length ? harmfulNames.join(', ') : 'none'}
Concerning ingredients: ${concerningNames.length ? concerningNames.join(', ') : 'none'}`;

  const requestBody = {
    contents: [{ parts: [{ text: `${SUMMARY_PROMPT}\n\n${details}` }] }],
    generationConfig: {
      // Higher than the analysis calls on purpose -- this is creative
      // writing where varied phrasing is the point, not deterministic
      // scoring where we want the same answer every time.
      temperature: 0.9,
      topK: 40,
      topP: 0.95,
      // Gemini's "thinking" tokens count against this budget too, and
      // can eat 100+ tokens on their own before it writes the actual
      // sentence -- too tight a limit here silently truncates the reply.
      maxOutputTokens: 700,
      thinkingConfig: { thinkingLevel: 'low' },
    },
  };

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) return null;

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const finishReason = data.candidates?.[0]?.finishReason;
    // A cut-off sentence is worse than no AI summary at all -- fall back
    // to the rule-based one rather than show a broken half-sentence.
    if (!text || finishReason !== 'STOP') return null;

    return text.trim().replace(/^["'\s]+|["'\s]+$/g, '');
  } catch {
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
  if (!GEMINI_API_KEY) return null;

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
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) return null;

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const finishReason = data.candidates?.[0]?.finishReason;
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
