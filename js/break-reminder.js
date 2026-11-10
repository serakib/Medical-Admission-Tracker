(function () {
  'use strict';
  if (window.__matBreakReminderInstalled) return;
  window.__matBreakReminderInstalled = true;

  var LIMIT_SECONDS = 30 * 60;
  var IDLE_LIMIT_MS = 5 * 60 * 1000;
  var STORAGE_KEY = 'mat_active_study_seconds_v1';
  var activeSeconds = 0;
  var lastActivity = Date.now();
  var reminderOpen = false;
  var breakMode = false;
  var root = null;

  try {
    activeSeconds = Math.max(0, Math.min(LIMIT_SECONDS, Number(sessionStorage.getItem(STORAGE_KEY)) || 0));
  } catch (_) {}

  function saveProgress() {
    try { sessionStorage.setItem(STORAGE_KEY, String(activeSeconds)); } catch (_) {}
  }

  function isExamActive() {
    return !!(document.body && document.body.classList.contains('exam-active'));
  }

  function hasAnotherDialog() {
    return !!document.querySelector(
      '.mat-overlay:not(.hidden), [role="dialog"]:not([aria-hidden="true"]):not([hidden]):not(.hidden), dialog[open]'
    );
  }

  function isSafeToShow() {
    var focused = document.activeElement;
    var editing = focused && /^(INPUT|TEXTAREA|SELECT)$/.test(focused.tagName);
    return !isExamActive() && !hasAnotherDialog() && !editing && document.visibilityState === 'visible';
  }

  function ensureReminder() {
    if (root) return root;
    var style = document.createElement('style');
    style.textContent =
      '#mat-study-break-reminder{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(3,12,24,.52);backdrop-filter:blur(5px)}' +
      '#mat-study-break-reminder[hidden]{display:none!important}' +
      '#mat-study-break-reminder .mat-break-card{position:relative;width:min(100%,440px);padding:28px 24px 22px;border:1px solid rgba(16,185,129,.22);border-radius:24px;background:#fff;color:#102033;box-shadow:0 24px 70px rgba(0,0,0,.28);text-align:center}' +
      '#mat-study-break-reminder .mat-break-icon{display:grid;place-items:center;width:58px;height:58px;margin:0 auto 16px;border-radius:19px;background:linear-gradient(135deg,#d1fae5,#e0f2fe);color:#047857;font-size:25px}' +
      '#mat-study-break-reminder h2{margin:0 0 9px;font-size:21px;font-weight:850;line-height:1.35}' +
      '#mat-study-break-reminder p{margin:0 auto 20px;max-width:340px;color:#64748b;font-size:14px;line-height:1.75}' +
      '#mat-study-break-reminder .mat-break-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}' +
      '#mat-study-break-reminder button{min-height:44px;padding:11px 17px;border-radius:12px;font:inherit;font-size:13px;font-weight:800;cursor:pointer}' +
      '#mat-study-break-reminder .mat-break-primary{border:1px solid #059669;background:linear-gradient(135deg,#059669,#0284c7);color:#fff}' +
      '#mat-study-break-reminder .mat-break-secondary{border:1px solid #cbd5e1;background:#fff;color:#334155}' +
      'html.dark #mat-study-break-reminder .mat-break-card,body.dark #mat-study-break-reminder .mat-break-card{background:#111c2c;color:#f8fafc;border-color:rgba(52,211,153,.25)}' +
      'html.dark #mat-study-break-reminder p,body.dark #mat-study-break-reminder p{color:#a8b6c8}' +
      'html.dark #mat-study-break-reminder .mat-break-secondary,body.dark #mat-study-break-reminder .mat-break-secondary{background:#1e293b;border-color:#475569;color:#e2e8f0}' +
      '@media(max-width:480px){#mat-study-break-reminder .mat-break-card{padding:24px 18px 19px}#mat-study-break-reminder .mat-break-actions{flex-direction:column}#mat-study-break-reminder button{width:100%}}';
    document.head.appendChild(style);

    root = document.createElement('section');
    root.id = 'mat-study-break-reminder';
    root.hidden = true;
    root.setAttribute('role', 'alertdialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'mat-break-title');
    root.setAttribute('aria-describedby', 'mat-break-description');
    root.innerHTML =
      '<div class="mat-break-card">' +
        '<span class="mat-break-icon" aria-hidden="true"><i class="fa-solid fa-mug-hot"></i></span>' +
        '<h2 id="mat-break-title">একটু বিরতি নেবেন?</h2>' +
        '<p id="mat-break-description">আপনি বেশ কিছুক্ষণ ধরে পড়াশোনা করছেন। চোখ ও মনকে একটু বিশ্রাম দিন—তারপর নতুন উদ্যমে আবার শুরু করুন।</p>' +
        '<div class="mat-break-actions">' +
          '<button type="button" class="mat-break-primary" data-break-action="pause">বিরতি নিন</button>' +
          '<button type="button" class="mat-break-secondary" data-break-action="continue">এখন চালিয়ে যান</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);

    root.addEventListener('click', function (event) {
      var action = event.target.closest('[data-break-action]');
      if (!action) return;
      reminderOpen = false;
      root.hidden = true;
      activeSeconds = 0;
      if (action.getAttribute('data-break-action') === 'pause') {
        breakMode = true;
      } else {
        breakMode = false;
        lastActivity = Date.now();
      }
      saveProgress();
    });
    return root;
  }

  function showReminder() {
    if (reminderOpen || activeSeconds < LIMIT_SECONDS || !isSafeToShow()) return;
    ensureReminder();
    reminderOpen = true;
    root.hidden = false;
    var firstButton = root.querySelector('[data-break-action="pause"]');
    if (firstButton) firstButton.focus();
  }

  function registerActivity() {
    if (breakMode) breakMode = false;
    lastActivity = Date.now();
    if (activeSeconds >= LIMIT_SECONDS && !reminderOpen) showReminder();
  }

  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(function (name) {
    window.addEventListener(name, registerActivity, { passive: true });
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      lastActivity = Date.now();
      if (activeSeconds >= LIMIT_SECONDS) showReminder();
    }
  });

  if (document.body) {
    new MutationObserver(function () {
      if (activeSeconds >= LIMIT_SECONDS && !reminderOpen) showReminder();
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  window.setInterval(function () {
    if (document.visibilityState !== 'visible' || reminderOpen || breakMode) return;
    if (Date.now() - lastActivity > IDLE_LIMIT_MS) return;
    activeSeconds = Math.min(LIMIT_SECONDS, activeSeconds + 1);
    saveProgress();
    if (activeSeconds >= LIMIT_SECONDS) showReminder();
  }, 1000);
})();
