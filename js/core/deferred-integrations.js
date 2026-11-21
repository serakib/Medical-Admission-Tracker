/* Keep the dashboard interactive first, then load the existing integrations in order. */
(() => {
  'use strict';
  let started = false;
  window.__matIntegrationsReady = false;

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
      window.setTimeout(resolve, 80);
    }
  });

  async function loadIntegrations() {
    if (started) return;
    started = true;
    await waitForApp();
    await waitForPageLoad();

    const modules = [
      ['integrated features', () => import('../integrations/integrated-features.js')],
      ['leaderboard backend', () => import('../integrations/global-league-system.js')],
      ['leaderboard experience', () => import('../integrations/leaderboard-experience.js')]
    ];
    const failures = [];

    for (const [name, load] of modules) {
      await yieldToBrowser();
      try {
        await load();
      } catch (error) {
        failures.push(name);
        console.error('[Medical Admission Tracker] Could not load ' + name + ':', error);
      }
    }

    window.__matIntegrationFailures = failures;
    window.__matIntegrationsReady = failures.length === 0;
    window.dispatchEvent(new Event('mat:integrations-ready'));
  }

  loadIntegrations();
})();
