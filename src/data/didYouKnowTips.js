// src/data/didYouKnowTips.js
//
// Short, factual tips for the home screen's "Did you know" card. Static
// and curated (not AI-generated) so every fact here is something we can
// actually stand behind -- these read as the app's own voice, and a
// wrong "fun fact" is worse than none at all.
//
// One shows per day (see dayOfYearSeed in productCache.js), same
// rotation logic as the daily spotlight.
export const DID_YOU_KNOW_TIPS = [
  "FSSAI requires ingredients to be listed by weight, heaviest first — so whatever's listed first is genuinely the biggest part of the product.",
  'INS numbers and E numbers are usually the same substance — INS is India\'s naming system, E numbers are Europe\'s, for the same additive.',
  'Palm oil (or "vegetable oil" without naming which one) doesn\'t have to be disclosed by type on every label — refined palmolein is one of the most common hidden ingredients in Indian snacks.',
  '"No added sugar" doesn\'t mean sugar-free — the product can still be naturally high in sugar from fruit concentrate, honey, or jaggery.',
  'A long ingredient list isn\'t automatically bad — many whole spices (turmeric, cumin, coriander) just take up a lot of lines without adding any real risk.',
  'FSSAI has banned several substances still legal in other countries, like potassium bromate (INS 924) in bread — a label being "internationally approved" doesn\'t always mean it meets Indian standards.',
  '"Natural flavour" and "nature-identical flavour" aren\'t the same thing — the second is made in a lab to taste like the natural version.',
  'Trans fats can legally be labelled "0g" if a serving has under 0.5g — checking for "partially hydrogenated" in the ingredients catches what the nutrition panel can hide.',
  'Maida (refined wheat flour) isn\'t a banned or illegal ingredient — it\'s just been stripped of the bran and germ, which is where most of the fibre and nutrients were.',
  'Some Indian snacks list "acidity regulators" as a group (like INS 296, INS 330) — these are usually just citric or malic acid, common and low-risk on their own.',
  'A product can be "100% natural" and still score poorly — sugar and palm oil are both completely natural, and both still matter to your health in quantity.',
  'Iodised salt became mandatory in India specifically to prevent iodine deficiency disorders — it\'s one of the few "added" ingredients that\'s a genuine public health win.',
];

export function getTodaysTip(seed) {
  return DID_YOU_KNOW_TIPS[seed % DID_YOU_KNOW_TIPS.length];
}
