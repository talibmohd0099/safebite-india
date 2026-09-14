// src/i18n/strings.js
//
// Hand-translated UI chrome -- the fixed text that's the same on every
// visit (buttons, section titles, disclaimers), NOT the AI-generated
// per-product content (summary, story, ingredient explanations), which
// is different every time and needs an actual translation call instead
// of a fixed dictionary. See translateService.js for that half.
//
// Written in everyday Hindustani (Devanagari script), not textbook
// Sanskrit-heavy "shuddh Hindi" -- e.g. "एडिट करें" over "संपादित करें",
// "प्रोसेस्ड" left as the loanword Indians already say out loud.

export const STRINGS = {
  en: {
    navScan: 'Scan',
    navHistory: 'History',
    navNews: 'News',
    navAbout: 'About',

    backToScan: 'Scan',
    packagedFood: '📦 Packaged Food',
    unknownProductHint: "We couldn't identify this product — tap Edit to name it yourself.",
    edit: 'Edit',
    done: 'Done',
    enterProductName: 'Enter product name',
    howCalculated: 'How is this calculated?',
    refreshAnalysis: 'Refresh analysis',
    refreshing: 'Refreshing…',

    noIngredientsAnalyzed: 'No ingredients analyzed',
    nothingFlagged: 'Nothing flagged across {count} ingredients',
    someFlagged: '{flagged} of {total} ingredients raise a flag',

    usefulContextTitle: 'When this is actually useful',
    seasoningNote: 'Used in small amounts — this score reflects the seasoning itself, not the dish you add it to.',
    estimatedQtyNote: "This label doesn't state an exact percentage for every ingredient, so part of this score is a reasonable estimate rather than the product's exact measured composition.",

    saferAlternatives: 'Safer alternatives in this category',

    tabOverview: 'Overview',
    tabIngredients: 'Ingredients ({count})',
    tabStory: 'Story',

    sectionSummary: 'Summary',
    sectionBreakdown: 'Breakdown',
    sectionRecommendation: 'Our recommendation',
    sectionAtAGlance: 'At a glance',
    sectionRelatedReading: 'Related reading',

    tierHarmful: 'Harmful',
    tierConcerning: 'Concerning',
    tierProcessed: 'Processed',
    tierFine: 'Fine',

    watchOutFor: 'Watch out for',
    goodThings: 'Good things',

    allIngredientsCount: 'All {count} ingredients',
    filteredCount: '{count} {label}',
    showAll: 'Show all',
    noneInCategory: 'None in this category.',

    asReadFromLabel: 'As read from the label',
    compareLabelNote: "Compare this against the list above — if something on your pack isn't here, it was missed while reading the label.",

    storyHistory: 'History & legacy',
    storyWhyUsed: "Why it's used",
    storyControversy: 'Controversy',
    storyMythVsFact: 'Myth vs fact',
    mythLabel: 'Myth: ',
    factLabel: 'Fact: ',

    crossChecked: 'Cross-checked against FSSAI and EU/EFSA standards · AI-analyzed',
    disclaimer: 'SafeBite is an informational tool, not medical advice. Always consult a healthcare professional for dietary guidance.',
    scanAnother: 'Scan another product',
  },

  hi: {
    navScan: 'स्कैन',
    navHistory: 'इतिहास',
    navNews: 'खबरें',
    navAbout: 'बारे में',

    backToScan: 'स्कैन',
    packagedFood: '📦 पैकेज्ड फूड',
    unknownProductHint: 'हम इस प्रोडक्ट को पहचान नहीं पाए — नाम खुद डालने के लिए एडिट पर टैप करें।',
    edit: 'एडिट करें',
    done: 'हो गया',
    enterProductName: 'प्रोडक्ट का नाम डालें',
    howCalculated: 'यह स्कोर कैसे तय होता है?',
    refreshAnalysis: 'फिर से जांचें',
    refreshing: 'जांच रहे हैं…',

    noIngredientsAnalyzed: 'कोई सामग्री जांची नहीं गई',
    nothingFlagged: '{count} सामग्रियों में कुछ भी चिंताजनक नहीं मिला',
    someFlagged: '{total} में से {flagged} सामग्रियां चिंता की बात हैं',

    usefulContextTitle: 'यह असल में कब काम आता है',
    seasoningNote: 'थोड़ी मात्रा में इस्तेमाल होता है — यह स्कोर सिर्फ इस मसाले का है, जिस डिश में मिलाया जाए उसका नहीं।',
    estimatedQtyNote: 'इस लेबल पर हर सामग्री की सटीक मात्रा नहीं दी गई है, इसलिए स्कोर का कुछ हिस्सा सही अंदाज़े पर आधारित है, पक्के आंकड़ों पर नहीं।',

    saferAlternatives: 'इस कैटेगरी में बेहतर विकल्प',

    tabOverview: 'ओवरव्यू',
    tabIngredients: 'सामग्री ({count})',
    tabStory: 'कहानी',

    sectionSummary: 'सारांश',
    sectionBreakdown: 'विवरण',
    sectionRecommendation: 'हमारी सलाह',
    sectionAtAGlance: 'एक नज़र में',
    sectionRelatedReading: 'इससे जुड़ी खबरें',

    tierHarmful: 'हानिकारक',
    tierConcerning: 'चिंताजनक',
    tierProcessed: 'प्रोसेस्ड',
    tierFine: 'ठीक',

    watchOutFor: 'इनसे सावधान रहें',
    goodThings: 'अच्छी बातें',

    allIngredientsCount: 'सभी {count} सामग्री',
    filteredCount: '{count} {label}',
    showAll: 'सभी दिखाएं',
    noneInCategory: 'इस कैटेगरी में कुछ नहीं है।',

    asReadFromLabel: 'लेबल पर जैसा लिखा है',
    compareLabelNote: 'इसे ऊपर की लिस्ट से मिलाकर देखें — अगर आपके पैक पर कुछ ऐसा है जो यहां नहीं है, तो वह लेबल पढ़ते समय छूट गया होगा।',

    storyHistory: 'इतिहास और पहचान',
    storyWhyUsed: 'इसका इस्तेमाल क्यों होता है',
    storyControversy: 'विवाद',
    storyMythVsFact: 'भ्रम बनाम सच्चाई',
    mythLabel: 'भ्रम: ',
    factLabel: 'सच्चाई: ',

    crossChecked: 'FSSAI और EU/EFSA स्टैंडर्ड से जांचा गया · AI से विश्लेषित',
    disclaimer: 'SafeBite एक जानकारी देने वाला टूल है, मेडिकल सलाह नहीं। खानपान से जुड़ी सलाह के लिए हमेशा किसी हेल्थकेयर प्रोफेशनल से सलाह लें।',
    scanAnother: 'एक और प्रोडक्ट स्कैन करें',
  },
};

/**
 * Substitutes {placeholders} in a translated string, e.g.
 * interpolate('{total} में से {flagged} सामग्रियां...', { total: 5, flagged: 2 }).
 */
export function interpolate(template, vars = {}) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}
