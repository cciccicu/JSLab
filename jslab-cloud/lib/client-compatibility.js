'use strict';

// Gates describe capabilities of released JSLab clients, not the cloud version.
const releases = [
  { minimum: [2, 0, 8], aiPromptVersion: 3, backgroundMarketReview: true },
  { minimum: [2, 0, 7], aiPromptVersion: 3, backgroundMarketReview: false },
  { minimum: [2, 0, 6], aiPromptVersion: 2, backgroundMarketReview: false }
];
const legacy = { aiPromptVersion: 1, backgroundMarketReview: false };

function resolveClientCompatibility(jslabVersion) {
  if (typeof jslabVersion !== 'string' || !/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(jslabVersion)) return legacy;
  const current = jslabVersion.split('.').map(Number);
  for (const release of releases) {
    const difference = current.map((part, index) => part - release.minimum[index]).find(part => part !== 0) || 0;
    if (difference >= 0) return release;
  }
  return legacy;
}

module.exports = { resolveClientCompatibility };
