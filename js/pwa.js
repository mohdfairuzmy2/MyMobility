/** PWA install prompt & service worker */
let deferredInstall = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  const bar = document.getElementById('pwaInstall');
  if (bar) bar.hidden = false;
});

document.addEventListener('DOMContentLoaded', () => {
  const bar = document.getElementById('pwaInstall');
  const btn = document.getElementById('pwaInstallBtn');
  const close = document.getElementById('pwaInstallClose');

  if (window.matchMedia('(display-mode: standalone)').matches) {
    if (bar) bar.hidden = true;
    return;
  }

  btn?.addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    if (bar) bar.hidden = true;
  });

  close?.addEventListener('click', () => {
    if (bar) bar.hidden = true;
  });
});
