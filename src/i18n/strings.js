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

    whyScoreLink: 'Why {score}?',
    scoreBreakdownTitle: 'Why did this score {score}?',
    scoreBreakdownIntro: "Each ingredient can affect the score based on how concerning it is and how much of the product it makes up — some pull it down, others don't affect it at all. Here's exactly where the points went.",
    scoreBreakdownLowerMeansMore: 'A lower score means more ingredients of concern or higher processing.',
    scoreBreakdownStartedAt: 'Started at',
    scoreBreakdownTotalDeduction: 'Total deduction',
    scoreBreakdownPositiveFactorsStat: 'Positive factors',
    scoreBreakdownCapAdjustment: 'Cap adjustment',
    scoreBreakdownFinal: 'Final score',
    scoreBreakdownWhatDoesThisMean: 'What does this mean?',
    scoreBreakdownMainDeductions: 'Main score deductions',
    scoreBreakdownShowingTop: 'Showing top {shown} of {total} ingredients',
    scoreBreakdownShowingAll: 'Showing all {total} ingredients',
    scoreBreakdownShowAll: 'Show all {count} ingredients',
    scoreBreakdownShowLess: 'Show less',
    scoreBreakdownPositiveFactorsHeader: 'Positive factors',
    scoreBreakdownNoPointsAdded: '0 points added',
    healthEffectsLabel: 'Health effects',
    scoreBreakdownFooterNote: "This score is a reasonable estimate — based on ingredient analysis and the same FSSAI/EU-EFSA standards used everywhere else in this app, not each pack's exact lab-tested composition.",
    scoreBreakdownCappedHarmful: "Because this product contains a harmful ingredient, the raw score of {rawScore} was capped down to {finalScore} — one harmful ingredient shouldn't be diluted by everything else being fine.",
    scoreBreakdownCappedConcerning: "Because this product contains a concerning ingredient, the raw score of {rawScore} was capped down to {finalScore}, so this can't rate higher than \"Moderate\" overall.",

    readMore: 'Read more',
    readLess: 'Show less',

    quickHealthCheck: 'Quick health check',
    habitBarCaption: '{percent}% of your daily {nutrient} limit, in {servingText}.',
    habitSeeMore: 'See what daily eating adds up to',

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
    scanAnother: 'Scan another food',

    // "If this became a daily habit" -- a rule-based projection against
    // WHO's published daily limits (dailyHabitCheck.js), never AI text.
    habitTitle: '🕐 If this became a daily habit...',
    habitIntro: "Not a one-off snack question — this is what adds up if it becomes part of your regular routine.",
    habitMathHeader: 'The math',
    habitServingPack: 'a {grams}g pack',
    habitServingPer100g: 'Every 100g',
    habitMathLine1: 'Based on {servingText}, this has {amount}{unit} of {nutrient}.',
    habitMathLine2: "WHO's recommended daily limit is {limit}{unit}.",
    habitMathLine3: "That's {percent}% of your entire day's limit, from this alone.",
    habitShortTermTitle: 'Short term (1–2 weeks)',
    habitMediumTermTitle: 'Medium term (1–3 months)',
    habitLongTermTitle: 'Long term (6+ months)',
    habitDisclaimer: 'General nutrition science, not a prediction about your body — individual results vary. Talk to a doctor for advice specific to you.',

    nutrientSodiumMg: 'sodium',
    nutrientAddedSugarG: 'added sugar',
    nutrientSaturatedFatG: 'saturated fat',
    nutrientTransFatG: 'trans fat',

    habitSodiumShort: 'Eating this much sodium regularly can bring on temporary water retention and bloating.',
    habitSodiumMedium: "Hitting this much of your daily limit from just one food, every day, makes it easy to blow past the WHO limit overall — sustained high-sodium eating is linked to rising blood pressure over roughly this timeframe.",
    habitSodiumLong: 'Sustained excess sodium is one of the most consistently documented contributors to hypertension and cardiovascular risk in nutrition research.',

    habitAddedSugarGShort: 'Regularly eating this much added sugar can cause energy spikes and crashes, with added strain on your insulin response.',
    habitAddedSugarGMedium: 'Consistently hitting a large share of your sugar limit from one food makes it easy to exceed the WHO limit overall — sustained high-sugar eating over this kind of timeframe is linked to weight gain and early insulin resistance.',
    habitAddedSugarGLong: 'Long-term excess added sugar intake is well-established in research as a major contributor to type 2 diabetes, fatty liver disease, and weight-related health risks.',

    habitSaturatedFatGShort: 'Regularly eating this much saturated fat in one sitting can raise LDL ("bad") cholesterol within weeks.',
    habitSaturatedFatGMedium: 'Consistently hitting a large share of your saturated fat limit from one food makes it easy to exceed the WHO limit overall — sustained high intake over this kind of timeframe is linked to rising LDL cholesterol.',
    habitSaturatedFatGLong: 'Long-term excess saturated fat intake is well-established in research as a major contributor to atherosclerosis and heart disease risk.',

    habitTransFatGShort: 'Even occasional intake of this much trans fat can measurably raise LDL cholesterol and lower protective HDL cholesterol.',
    habitTransFatGMedium: 'Regularly consuming this much trans fat pushes you well past the WHO limit, which research links to accelerating arterial plaque buildup over this kind of timeframe.',
    habitTransFatGLong: "Long-term trans fat intake is one of the most strongly established dietary contributors to heart disease risk in nutrition research — which is why WHO has called for eliminating it from the food supply entirely.",
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

    whyScoreLink: '{score} ही क्यों?',
    scoreBreakdownTitle: 'यह स्कोर {score} ही क्यों है?',
    scoreBreakdownIntro: 'हर सामग्री कितनी चिंताजनक है और प्रोडक्ट में कितनी मात्रा में है, इसके आधार पर स्कोर को असर कर सकती है — कुछ इसे घटाती हैं, कुछ का कोई असर नहीं पड़ता। नीचे देखें पॉइंट्स कहां-कहां कटे।',
    scoreBreakdownLowerMeansMore: 'कम स्कोर का मतलब है ज़्यादा चिंताजनक सामग्री या ज़्यादा प्रोसेसिंग।',
    scoreBreakdownStartedAt: 'शुरुआत',
    scoreBreakdownTotalDeduction: 'कुल कटौती',
    scoreBreakdownPositiveFactorsStat: 'पॉज़िटिव फैक्टर्स',
    scoreBreakdownCapAdjustment: 'कैप एडजस्टमेंट',
    scoreBreakdownFinal: 'फाइनल स्कोर',
    scoreBreakdownWhatDoesThisMean: 'इसका मतलब क्या है?',
    scoreBreakdownMainDeductions: 'मुख्य स्कोर कटौती',
    scoreBreakdownShowingTop: '{total} में से टॉप {shown} सामग्री दिखा रहे हैं',
    scoreBreakdownShowingAll: 'सभी {total} सामग्री दिखा रहे हैं',
    scoreBreakdownShowAll: 'सभी {count} सामग्री दिखाएं',
    scoreBreakdownShowLess: 'कम दिखाएं',
    scoreBreakdownPositiveFactorsHeader: 'पॉज़िटिव फैक्टर्स',
    scoreBreakdownNoPointsAdded: '0 पॉइंट्स जोड़े गए',
    healthEffectsLabel: 'सेहत पर असर',
    scoreBreakdownFooterNote: 'यह स्कोर एक सही अंदाज़ा है — सामग्री के विश्लेषण और इस ऐप में हर जगह इस्तेमाल होने वाले FSSAI/EU-EFSA स्टैंडर्ड पर आधारित है, हर पैक की सटीक लैब-टेस्टेड बनावट पर नहीं।',
    scoreBreakdownCappedHarmful: 'इस प्रोडक्ट में एक हानिकारक सामग्री होने के कारण, {rawScore} का असली स्कोर घटाकर {finalScore} कर दिया गया है — एक हानिकारक सामग्री को बाकी सब ठीक होने से छुपाना सही नहीं है।',
    scoreBreakdownCappedConcerning: 'इस प्रोडक्ट में एक चिंताजनक सामग्री होने के कारण, {rawScore} का असली स्कोर घटाकर {finalScore} कर दिया गया है, जिससे यह "चिंताजनक" से ऊपर रेट नहीं हो सकता।',

    readMore: 'और पढ़ें',
    readLess: 'कम दिखाएं',

    quickHealthCheck: 'जल्दी हेल्थ चेक',
    habitBarCaption: '{servingText} में आपकी दिन की {nutrient} लिमिट का {percent}%।',
    habitSeeMore: 'रोज़ खाने पर क्या होता है, यह देखें',

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
    scanAnother: 'एक और चीज़ स्कैन करें',

    habitTitle: '🕐 अगर यह रोज़ की आदत बन जाए...',
    habitIntro: 'यह सिर्फ एक बार खाने का सवाल नहीं — अगर यह आपकी रोज़ की आदत बन जाए तो असर ऐसा दिखेगा।',
    habitMathHeader: 'गणित समझें',
    habitServingPack: '{grams} ग्राम के एक पैक',
    habitServingPer100g: 'हर 100 ग्राम',
    habitMathLine1: '{servingText} में {amount}{unit} {nutrient} होता है।',
    habitMathLine2: 'WHO की रोज़ की सुझाई गई लिमिट {limit}{unit} है।',
    habitMathLine3: 'यानी सिर्फ इससे ही आपकी पूरे दिन की लिमिट का {percent}% पूरा हो जाता है।',
    habitShortTermTitle: 'कम समय में (1–2 हफ्ते)',
    habitMediumTermTitle: 'मध्यम समय में (1–3 महीने)',
    habitLongTermTitle: 'लंबे समय में (6+ महीने)',
    habitDisclaimer: 'यह सामान्य न्यूट्रिशन साइंस पर आधारित है, आपके शरीर के बारे में कोई भविष्यवाणी नहीं — हर किसी पर असर अलग हो सकता है। अपनी सेहत से जुड़ी सलाह के लिए डॉक्टर से बात करें।',

    nutrientSodiumMg: 'सोडियम',
    nutrientAddedSugarG: 'अतिरिक्त चीनी',
    nutrientSaturatedFatG: 'सैचुरेटेड फैट',
    nutrientTransFatG: 'ट्रांस फैट',

    habitSodiumShort: 'इतना ज़्यादा सोडियम बार-बार खाने से शरीर में पानी रुकने और सूजन जैसी अस्थायी समस्याएं हो सकती हैं।',
    habitSodiumMedium: 'रोज़ एक ही चीज़ से इतना सोडियम मिलने पर पूरे दिन की लिमिट पार करना आसान हो जाता है — इस तरह लंबे समय तक ज़्यादा सोडियम खाने को बढ़ते ब्लड प्रेशर से जोड़ा गया है।',
    habitSodiumLong: 'लंबे समय तक ज़्यादा सोडियम खाना हाई ब्लड प्रेशर और हृदय रोग के सबसे बड़े कारणों में से एक माना जाता है — यह रिसर्च में अच्छी तरह साबित हो चुका है।',

    habitAddedSugarGShort: 'इतनी ज़्यादा चीनी बार-बार खाने से एनर्जी में उछाल और फिर अचानक गिरावट महसूस हो सकती है, साथ ही इंसुलिन पर असर पड़ता है।',
    habitAddedSugarGMedium: 'रोज़ एक ही चीज़ से इतनी चीनी मिलने पर दिन की पूरी लिमिट पार करना आसान हो जाता है — इस तरह लंबे समय तक ज़्यादा चीनी खाने को वज़न बढ़ने और इंसुलिन रेज़िस्टेंस से जोड़ा गया है।',
    habitAddedSugarGLong: 'लंबे समय तक ज़्यादा चीनी खाना टाइप 2 डायबिटीज़, फैटी लिवर और वज़न से जुड़ी बीमारियों का एक बड़ा कारण माना जाता है — यह रिसर्च में अच्छी तरह साबित हो चुका है।',

    habitSaturatedFatGShort: 'एक ही बार में इतना सैचुरेटेड फैट खाने से कुछ ही हफ्तों में LDL (खराब) कोलेस्ट्रॉल बढ़ सकता है।',
    habitSaturatedFatGMedium: 'रोज़ एक ही चीज़ से इतना सैचुरेटेड फैट मिलने पर दिन की पूरी लिमिट पार करना आसान हो जाता है — इस तरह लंबे समय तक ज़्यादा सैचुरेटेड फैट खाने को बढ़ते LDL कोलेस्ट्रॉल से जोड़ा गया है।',
    habitSaturatedFatGLong: 'लंबे समय तक ज़्यादा सैचुरेटेड फैट खाना धमनियों में रुकावट (एथेरोस्क्लेरोसिस) और हृदय रोग के बड़े कारणों में से एक माना जाता है।',

    habitTransFatGShort: 'इतना ट्रांस फैट कभी-कभी भी खाने से LDL (खराब) कोलेस्ट्रॉल बढ़ सकता है और HDL (अच्छा) कोलेस्ट्रॉल घट सकता है।',
    habitTransFatGMedium: 'बार-बार इतना ट्रांस फैट खाने से WHO की लिमिट कहीं पीछे छूट जाती है — रिसर्च बताती है कि इससे धमनियों में प्लाक जमा होना तेज़ हो जाता है।',
    habitTransFatGLong: 'लंबे समय तक ट्रांस फैट खाना हृदय रोग के सबसे पुख्ता तौर पर साबित हुए कारणों में से एक है — इसी वजह से WHO ने इसे खाने की चीज़ों से पूरी तरह हटाने की अपील की है।',
  },
};

/**
 * Substitutes {placeholders} in a translated string, e.g.
 * interpolate('{total} में से {flagged} सामग्रियां...', { total: 5, flagged: 2 }).
 */
export function interpolate(template, vars = {}) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}
