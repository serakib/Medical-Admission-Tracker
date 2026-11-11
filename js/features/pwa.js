(() => {
  'use strict';
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    window.dispatchEvent(new Event('mat:pwa-install-available'));
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    window.dispatchEvent(new Event('mat:pwa-installed'));
  });

  window.MATInstallPWA = async () => {
    if (!installPrompt) return false;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    installPrompt = null;
    return result?.outcome === 'accepted';
  };
  window.MATCanInstallPWA = () => Boolean(installPrompt);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js', { scope: './' })
        .then(registration => {
          console.info('[PWA] Service worker ready:', registration.scope);
          registration.update().catch(() => {});
        })
        .catch(error => console.warn('[PWA] Service worker registration failed:', error));
    }, { once: true });
  }
})();
