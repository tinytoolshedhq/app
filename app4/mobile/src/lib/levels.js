/** Rough everyday references. Estimates only — not a calibrated scale. */

export function explainLevel(displayDb) {
  if (!Number.isFinite(displayDb)) return null;
  if (displayDb < 40) return 'quiet';
  if (displayDb < 60) return 'conversation';
  if (displayDb < 80) return 'busy';
  if (displayDb < 95) return 'loud';
  return 'veryLoud';
}

export function levelCopyKey(displayDb) {
  const id = explainLevel(displayDb);
  return id ? `level.${id}` : null;
}
