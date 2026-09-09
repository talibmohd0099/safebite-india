// src/utils/storage.js
// Handles saving and loading scan history from localStorage

const STORAGE_KEY = 'safebite_history';
const MAX_HISTORY = 20; // Keep last 20 scans

/**
 * Save a scan result to history
 */
export function saveToHistory(result, inputType = 'text') {
  const history = getHistory();
  
  const entry = {
    id: Date.now().toString(),
    savedAt: new Date().toISOString(),
    inputType, // 'text' or 'image'
    ...result
  };

  // Add to front of array, keep max items
  const updated = [entry, ...history].slice(0, MAX_HISTORY);
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return entry.id;
  } catch {
    console.error('Failed to save to history');
    return null;
  }
}

/**
 * Get all history entries
 */
export function getHistory() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Get a single history entry by ID
 */
export function getHistoryById(id) {
  const history = getHistory();
  return history.find(entry => entry.id === id) || null;
}

/**
 * Rename a saved scan's product name (e.g. after "Unknown Product").
 */
export function updateHistoryProductName(id, productName) {
  const history = getHistory();
  const updated = history.map(entry =>
    entry.id === id ? { ...entry, productName } : entry
  );
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a single history entry
 */
export function deleteFromHistory(id) {
  const history = getHistory();
  const updated = history.filter(entry => entry.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

/**
 * Clear all history
 */
export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * The single rating scale for the whole app. These thresholds and labels
 * must stay identical to VERDICT_TIERS in services/scoringEngine.js —
 * the colour IS the verdict now, so a product can't be told it's
 * "Moderate" while being painted the colour of "Poor".
 */
const SCORE_TIERS = [
  { min: 85, label: 'Very Healthy', token: 'very-healthy' },
  { min: 65, label: 'Good', token: 'good' },
  { min: 45, label: 'Moderate', token: 'moderate' },
  { min: 25, label: 'Poor', token: 'poor' },
  { min: 0, label: 'Very Poor', token: 'very-poor' },
];

export function getScoreColor(score) {
  const tier = SCORE_TIERS.find((t) => score >= t.min) || SCORE_TIERS[SCORE_TIERS.length - 1];
  return {
    label: tier.label,
    color: `var(--v-${tier.token})`,
    bg: `var(--v-${tier.token}-bg)`,
  };
}

// An ingredient can be perfectly legal and non-toxic and still be one of
// the biggest things dragging a score down — refined flour, hydrolyzed
// vegetable protein, glucose syrup. Painting those the same green as a
// whole spice tells the user the opposite of what the score is doing, so
// they get their own middle tier. The cutoff matches the "refined /
// processed staples and notable concerns" band in the research prompt.
const NOTABLE_PENALTY = 9;

/**
 * Four-tier severity for an ingredient row: harmful, concerning,
 * nutritionally costly, or genuinely fine.
 */
export function getIngredientSeverity(ingredient) {
  if (ingredient?.status === 'harmful') {
    return { label: 'Harmful', color: 'var(--v-very-poor)', bg: 'var(--v-very-poor-bg)' };
  }
  if (ingredient?.status === 'concerning') {
    return { label: 'Concerning', color: 'var(--v-poor)', bg: 'var(--v-poor-bg)' };
  }
  if ((ingredient?.penalty || 0) >= NOTABLE_PENALTY) {
    return { label: 'Highly processed', color: 'var(--v-moderate)', bg: 'var(--v-moderate-bg)' };
  }
  return { label: 'Fine', color: 'var(--v-good)', bg: 'var(--v-good-bg)' };
}
