/* Load non-critical integration layers after the initial page becomes responsive. */
(() => {
  'use strict';
  let started = false;

  const waitForApp = () => window.app
    ? Promise.resolve()
    : new Promise(resolve => window.addEventListener('medical-app-ready', resolve, { once: true }));

  const waitForPageLoad = () => document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise(resolve => window.addEventListener('load', resolve, { once: true }));

  const yieldToBrowser = () => new Promise(resolve => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: 1200 });
    } else {
      window.setTimeout(resolve, 120);
    }
  });

  async function loadIntegrations() {
    if (started) return;
    started = true;
    await waitForApp();
    await waitForPageLoad();

    const modules = [
      ['integrated features', () => import('../vendor/integrated-features.min.js')],
      ['leaderboard backend', () => import('../vendor/global-league-system.min.js')],
      ['leaderboard experience', () => import('../vendor/leaderboard-experience.min.js')]
    ];

    for (const [name, load] of modules) {
      await yieldToBrowser();
      try {
        await load();
      } catch (error) {
        console.error('[Medical Admission Tracker] Could not load ' + name + ':', error);
      }
    }

    window.dispatchEvent(new Event('mat:integrations-ready'));
  }

  if (window.app) {
    loadIntegrations();
  } else {
    window.addEventListener('medical-app-ready', loadIntegrations, { once: true });
  }
})();
