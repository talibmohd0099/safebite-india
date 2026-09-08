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
 * Get score color class based on score value
 */
export function getScoreColor(score) {
  if (score >= 75) return { text: 'text-green-600', bg: 'bg-green-100', border: 'border-green-300', stroke: '#16a34a', label: 'Healthy' };
  if (score >= 50) return { text: 'text-yellow-600', bg: 'bg-yellow-100', border: 'border-yellow-300', stroke: '#ca8a04', label: 'Moderate' };
  if (score >= 25) return { text: 'text-orange-600', bg: 'bg-orange-100', border: 'border-orange-300', stroke: '#ea580c', label: 'Poor' };
  return { text: 'text-red-600', bg: 'bg-red-100', border: 'border-red-300', stroke: '#dc2626', label: 'Avoid' };
}

/**
 * Get status color/icon for an ingredient
 */
export function getIngredientStatus(status) {
  switch (status) {
    case 'safe':
      return { icon: '✅', text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', label: 'Safe' };
    case 'concerning':
      return { icon: '⚠️', text: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200', label: 'Concerning' };
    case 'harmful':
      return { icon: '🚫', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', label: 'Harmful' };
    default:
      return { icon: '❓', text: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200', label: 'Unknown' };
  }
}
