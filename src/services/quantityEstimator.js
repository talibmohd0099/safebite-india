// src/services/quantityEstimator.js
//
// Estimates how much of a product each ingredient actually is, when the
// label doesn't say.
//
// Why this exists: scoring weights an ingredient's penalty by how much of
// the product it is. Before this, anything without a stated percentage
// was treated as a FULL-strength component -- so in a 39-ingredient
// namkeen, bay leaf powder counted the same as the frying oil, and a
// label that happened to state five percentages got its other 34
// ingredients charged at full whack. The same product scored 44 when
// Open Food Facts supplied percentages and 13 when it didn't, purely
// from that default.
//
// The signal we were throwing away: ingredient lists are legally ordered
// by descending weight. That tells us, for free, that item 35 of 39 is
// negligible and item 1 is not.
//
// These estimates are used for SCORING WEIGHT ONLY and are deliberately
// kept in a separate field from `percentage` (which means "actually
// stated on the label, or supplied by Open Food Facts"). The UI only
// ever shows the real one -- an estimate must never be displayed as
// though the pack said it.

// How fast each successive slot shrinks. Real ingredient lists fall off
// roughly geometrically; 0.7 keeps the leading ingredient clearly
// dominant without driving the tail to exactly zero.
const DECAY = 0.7;

/**
 * Ingredients expanded out of one bracket share a single slot -- see the
 * groupId note in ingredientParser. Returns slots in label order, each
 * holding the indices of its members.
 */
function buildSlots(items) {
  const slots = [];
  const byGroup = new Map();

  items.forEach((item, index) => {
    if (!item.groupId) {
      slots.push({ indices: [index] });
      return;
    }
    const existing = byGroup.get(item.groupId);
    if (existing) {
      existing.indices.push(index);
      return;
    }
    const slot = { indices: [index] };
    byGroup.set(item.groupId, slot);
    slots.push(slot);
  });

  return slots;
}

/**
 * Fill in `estimatedPercentage` for every ingredient the label didn't
 * give a real percentage for. Returns a new array; input is untouched.
 */
export function estimateQuantities(items) {
  if (!items?.length) return items || [];

  const out = items.map((item) => ({ ...item }));
  const slots = buildSlots(out);

  const statedTotal = out.reduce(
    (sum, item) => sum + (typeof item.percentage === 'number' ? item.percentage : 0),
    0,
  );

  // A slot counts as known only if every member has a real percentage --
  // a partly-stated group still needs the rest estimated.
  const unknownSlots = slots.filter((slot) =>
    slot.indices.some((i) => typeof out[i].percentage !== 'number'),
  );
  if (unknownSlots.length === 0) return out;

  // Labels routinely overshoot 100% (overlapping sub-percentages, or
  // rounding), so never hand out a negative remainder. The floor keeps
  // trailing ingredients from all collapsing to exactly zero weight.
  const remaining = Math.max(100 - statedTotal, unknownSlots.length * 0.01);

  const weights = unknownSlots.map((_, i) => DECAY ** i);
  const weightTotal = weights.reduce((a, b) => a + b, 0);

  unknownSlots.forEach((slot, i) => {
    const slotShare = remaining * (weights[i] / weightTotal);
    // Members of one slot split that slot's share between them: three
    // oils disclosed inside one "Edible Vegetable Oil" are one oil
    // component, not three.
    const missing = slot.indices.filter((idx) => typeof out[idx].percentage !== 'number');
    const perMember = slotShare / missing.length;
    for (const idx of missing) {
      out[idx].estimatedPercentage = perMember;
    }
  });

  return out;
}
