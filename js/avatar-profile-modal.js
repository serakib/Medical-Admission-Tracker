(function () {
  'use strict';
  if (window.MedAvatarProfileModal) return;

  const css = `
    .mat-profile-edit-wrap{position:relative!important}
    .mat-profile-edit-badge{position:absolute;right:0;bottom:0;display:grid;place-items:center;width:32px;height:32px;border:3px solid #1a1a24;border-radius:50%;background:#10b981;color:#121218;cursor:pointer;z-index:5}
    .mat-profile-edit-badge svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .mat-profile-modal[hidden]{display:none!important}
    .mat-profile-modal{position:fixed;inset:0;z-index:100040;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.7);backdrop-filter:blur(4px)}
    .mat-profile-modal-card{position:relative;width:min(320px,100%);padding:24px;border-radius:16px;background:#1a1a24;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,.3)}
     .mat-profile-modal-close{position:absolute;top:16px;right:16px;display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:7px;background:transparent;color:#fff;cursor:pointer}.mat-profile-modal-close svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
    .mat-profile-modal h2{margin:0;padding:0 24px;text-align:center;font-size:19px;font-weight:850;line-height:1.5}
    .mat-profile-modal-actions{display:flex;flex-direction:column;gap:12px;margin-top:20px}
    .mat-profile-modal-status[hidden]{display:none!important}.mat-profile-modal-status{margin:12px 0 0;color:#ff8a80;font-size:12px;line-height:1.55;overflow-wrap:anywhere}
    .mat-profile-modal-action{display:flex;align-items:center;justify-content:center;width:100%;min-height:46px;padding:12px;border:0;border-radius:8px;color:#fff;font-size:14px;font-weight:800;cursor:pointer}
    .mat-profile-modal-edit{background:#2563eb}
    .mat-profile-modal-upload{background:#10b981}
    .mat-profile-modal button:focus-visible{outline:3px solid #93c5fd;outline-offset:3px}
  `;
  const style = document.createElement('style');
  style.id = 'mat-profile-modal-strict-style';
  style.textContent = css;
  document.head.appendChild(style);

  let overlay = null;
  let previousFocus = null;
  function close({restoreFocus = true} = {}) {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    document.body.style.overflow = '';
    const target = previousFocus;
    previousFocus = null;
    if (restoreFocus && target && typeof target.focus === 'function') {
      target.focus({ preventScroll: true });
    }
  }
  function open() {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'mat-profile-modal';
      overlay.hidden = true;
      overlay.innerHTML = '<section class="mat-profile-modal-card" role="dialog" aria-modal="true" aria-labelledby="mat-profile-modal-title">' +
        '<button class="mat-profile-modal-close" type="button" aria-label="বন্ধ করুন"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
        '<h2 id="mat-profile-modal-title">আভাটার আপডেট</h2>' +
        '<div class="mat-profile-modal-actions">' +
          '<button type="button" class="mat-profile-modal-action mat-profile-modal-edit">আভাটার এডিট করো</button>' +
          '<button type="button" class="mat-profile-modal-action mat-profile-modal-upload">ছবি আপলোড করো</button>' +
        '</div><p class="mat-profile-modal-status" role="status" aria-live="polite" hidden></p></section>';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', event => {
        if (event.target === overlay || event.target.closest('.mat-profile-modal-close')) close();
      });
      overlay.querySelector('.mat-profile-modal-edit').addEventListener('click', () => {
        clearStatus();
        close({restoreFocus:false});
        document.dispatchEvent(new CustomEvent('mat-open-avatar-builder'));
      });
      overlay.querySelector('.mat-profile-modal-upload').addEventListener('click', () => {
        clearStatus();
        close({restoreFocus:false});
        document.getElementById('profile-avatar-upload-input')?.click();
      });
    }
    clearStatus();
    previousFocus = document.activeElement;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    overlay.querySelector('.mat-profile-modal-close')?.focus({ preventScroll: true });
  }
  function clearStatus() { const status = overlay?.querySelector('.mat-profile-modal-status'); if (status) { status.textContent = ''; status.hidden = true; } }
  function showStatus(message) { open(); const status = overlay?.querySelector('.mat-profile-modal-status'); if (status) { status.textContent = String(message || ''); status.hidden = !status.textContent; } }
  function attach() {
    document.querySelectorAll('#view-profile .profile-hero .profile-avatar,#view-account .profile-hero .profile-avatar').forEach(element => {
      if (element.querySelector('.mat-profile-edit-badge')) return;
      element.classList.add('mat-profile-edit-wrap');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mat-profile-edit-badge';
      button.setAttribute('aria-label', 'আভাটার আপডেট');
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        open();
      });
      element.appendChild(button);
    });
  }
  function init() {
    attach();
    new MutationObserver(attach).observe(document.body, {childList:true,subtree:true});
    window.addEventListener('student-profile-loaded', attach);
    window.addEventListener('student-auth-state-changed', attach);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && overlay && !overlay.hidden) close(); });
  window.MedAvatarProfileModal = {open,close,showStatus,clearStatus};
})();