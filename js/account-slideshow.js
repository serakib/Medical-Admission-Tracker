/* Personalized website slideshow for Medical Admission Tracker.
 * Isolated feature module: does not replace existing views or alter exam logic.
 */
(function (window, document) {
  'use strict';
  if (window.MedicalWebsiteSlideshow) return;

  var root = null;
  var trigger = null;
  var activeIndex = 0;
  var timer = null;
  var touchStartX = null;
  var previousFocus = null;
  var previousViewId = null;
  var autoplay = false;
  var intervalMs = 6000;

  var slides = [
    { key: 'welcome', icon: 'fa-house-medical', title: 'Your Medical Dashboard', subtitle: 'এক নজরে আপনার medical preparation', render: renderWelcome },
    { key: 'exams', icon: 'fa-clipboard-check', title: 'Exam & Question Bank', subtitle: 'Practice, model tests and question bank', render: renderExams },
    { key: 'progress', icon: 'fa-chart-line', title: 'Your Study Progress', subtitle: 'আপনার সংরক্ষিত progress ও performance', render: renderProgress },
    { key: 'account', icon: 'fa-user-gear', title: 'Your Account', subtitle: 'আপনার account-এর সর্বশেষ তথ্য', render: renderAccount },
    { key: 'updates', icon: 'fa-arrows-rotate', title: 'Keep Moving Forward', subtitle: 'আপনার প্রস্তুতি চালিয়ে যাওয়ার পরবর্তী ধাপ', render: renderNextSteps }
  ];

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function app() { return window.app || null; }
  function profile() {
    var a = app();
    return (a && a.profile && typeof a.profile === 'object') ? a.profile : {};
  }
  function user() { var a = app(); return a && a.authUser ? a.authUser : null; }
  function progress() {
    var a = app();
    try {
      if (a && typeof a.getAccountProgress === 'function') return a.getAccountProgress() || {};
    } catch (_) {}
    return {};
  }
  function firstValue(values, fallback) {
    for (var i = 0; i < values.length; i++) {
      if (values[i] !== undefined && values[i] !== null && String(values[i]).trim() !== '') return values[i];
    }
    return fallback;
  }
  function profileName() {
    var u = user(), p = profile();
    return firstValue([p.name, p.displayName, u && u.displayName], u ? 'Student' : 'Guest');
  }
  function statFromDom(id, fallback) {
    var el = document.getElementById(id);
    return el ? firstValue([el.textContent], fallback) : fallback;
  }
  function card(icon, label, value, note) {
    return '<div class="mws-stat"><span class="mws-stat-icon"><i class="fa-solid ' + icon + '" aria-hidden="true"></i></span><span class="mws-stat-copy"><span class="mws-stat-label">' + esc(label) + '</span><strong>' + esc(value) + '</strong>' + (note ? '<small>' + esc(note) + '</small>' : '') + '</span></div>';
  }
  function action(label, view, icon) {
    return '<button type="button" class="mws-action" data-mws-view="' + esc(view) + '"><i class="fa-solid ' + esc(icon) + '" aria-hidden="true"></i><span>' + esc(label) + '</span><i class="fa-solid fa-arrow-up-right-from-square mws-action-end" aria-hidden="true"></i></button>';
  }
  function renderWelcome() {
    var u = user(), p = profile();
    var email = firstValue([p.email, u && u.email], u ? 'Signed in' : 'Guest mode');
    return '<div class="mws-hero"><div class="mws-hero-symbol"><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i></div><div><span class="mws-eyebrow">PERSONAL STUDY SPACE</span><h3>Welcome back, ' + esc(profileName()) + '!</h3><p>' + esc(u ? 'আপনার medical admission preparation-এর গুরুত্বপূর্ণ অংশগুলো এক জায়গায়।' : 'লগইন করলে আপনার account অনুযায়ী personalized information দেখতে পারবেন।') + '</p><span class="mws-email"><i class="fa-regular fa-user" aria-hidden="true"></i> ' + esc(email) + '</span></div></div><div class="mws-grid">' +
      card('fa-book-open', 'Question Bank', 'Ready to practice', 'বিষয়ভিত্তিক প্রশ্ন দেখুন') +
      card('fa-stopwatch', 'Exam Practice', 'Build consistency', 'Practice ও model test চালু করুন') +
      '</div><div class="mws-callout"><i class="fa-solid fa-lightbulb" aria-hidden="true"></i><span>প্রতিদিন অল্প হলেও নিয়মিত practice করুন। আপনার saved progress available থাকলে সেটি এখানেই দেখানো হবে।</span></div>';
  }
  function renderExams() {
    var total = '—';
    var a = app();
    try {
      var qs = a && (a.questionBank || a.questions || window.QUESTION_BANK);
      if (Array.isArray(qs) && qs.length) total = qs.length.toLocaleString();
    } catch (_) {}
    return '<div class="mws-grid">' +
      card('fa-list-check', 'Question Bank', total === '—' ? 'Browse questions' : total + ' questions', 'প্রশ্ন বাছাই করে practice করুন') +
      card('fa-file-circle-check', 'Model Exam', 'Practice exam', 'সময় ধরে নিজের প্রস্তুতি যাচাই করুন') +
      '</div><p class="mws-description">আপনার existing question bank, practice এবং exam features আগের মতোই থাকবে। এই overview থেকে সরাসরি প্রয়োজনীয় section-এ যেতে পারবেন।</p><div class="mws-action-list">' +
      action('Open Question Bank', 'question-bank', 'fa-book-open') +
      action('Start Practice', 'practice', 'fa-pen-to-square') +
      action('Exam Setup', 'setup', 'fa-sliders') +
      '</div>';
  }
  function renderProgress() {
    var p = progress();
    var answered = firstValue([p.answeredCount, p.questionsAnswered, p.seenCount], statFromDom('profile-seen-count', '—'));
    var attempts = firstValue([p.examAttempts, p.attemptCount, p.attempts], statFromDom('profile-attempt-count', '—'));
    var best = firstValue([p.bestScore, p.best], statFromDom('profile-best-score', '—'));
    var accuracy = firstValue([p.accuracy, p.averageAccuracy], statFromDom('profile-accuracy', '—'));
    return '<div class="mws-grid">' +
      card('fa-book-open-reader', 'Questions seen', answered, 'Available saved stats') +
      card('fa-clipboard-check', 'Exam attempts', attempts, 'Recorded attempts') +
      card('fa-trophy', 'Best score', best, 'Your recorded best') +
      card('fa-bullseye', 'Accuracy', accuracy, 'Recorded accuracy') +
      '</div><div class="mws-callout"><i class="fa-solid fa-shield-heart" aria-hidden="true"></i><span>এখানে কেবল website-এ পাওয়া saved statistics দেখানো হয়। তথ্য না থাকলে অনুমান করে কোনো সংখ্যা দেখানো হবে না।</span></div><div class="mws-action-list">' +
      action('Open My Profile', 'profile', 'fa-user') +
      action('View Leaderboard', 'leaderboard', 'fa-ranking-star') +
      '</div>';
  }
  function renderAccount() {
    var u = user(), p = profile();
    var fields = [
      ['Name', firstValue([p.name, p.displayName, u && u.displayName], 'Not set')],
      ['Email', firstValue([p.email, u && u.email], 'Not available')],
      ['College', firstValue([p.college], 'Not added')],
      ['Batch / Class', firstValue([p.batch, p.class], 'Not added')]
    ];
    return '<div class="mws-account-grid">' + fields.map(function (item) {
      return '<div class="mws-account-item"><span>' + esc(item[0]) + '</span><strong>' + esc(item[1]) + '</strong></div>';
    }).join('') + '</div><div class="mws-callout"><i class="fa-solid fa-lock" aria-hidden="true"></i><span>শুধু বর্তমান account-এর তথ্য দেখানো হচ্ছে। Profile update হলে slideshow পুনরায় খুললে বা profile update event এলে তথ্য refresh হবে।</span></div><div class="mws-action-list">' +
      action('Open Account Settings', 'account', 'fa-user-gear') +
      action('Open My Profile', 'profile', 'fa-id-card') +
      '</div>';
  }
  function renderNextSteps() {
    var u = user();
    return '<div class="mws-next-hero"><span class="mws-next-icon"><i class="fa-solid fa-route" aria-hidden="true"></i></span><h3>One step at a time.</h3><p>আপনার next study session বেছে নিন। Slideshow বন্ধ করলেও website-এর কোনো data বা exam state পরিবর্তন হবে না।</p></div><div class="mws-action-list">' +
      action('Continue to Question Bank', 'question-bank', 'fa-book-open') +
      action('Continue Practice', 'practice', 'fa-pen-to-square') +
      action(u ? 'Review My Profile' : 'Login / Register', u ? 'profile' : 'account', u ? 'fa-user' : 'fa-right-to-bracket') +
      '</div>';
  }

  function injectStyles() {
    if (document.getElementById('mws-styles')) return;
    var style = document.createElement('style');
    style.id = 'mws-styles';
    style.textContent = `
      #mws-launch{position:fixed;left:18px;bottom:20px;z-index:9990;display:inline-flex;align-items:center;gap:9px;padding:12px 16px;border:1px solid rgba(5,150,105,.25);border-radius:999px;background:linear-gradient(135deg,#059669,#0284c7);color:#fff;font:700 13px/1.2 inherit;box-shadow:0 10px 28px rgba(5,150,105,.25);cursor:pointer;transition:transform .2s,box-shadow .2s}
      #mws-launch:hover{transform:translateY(-2px);box-shadow:0 14px 32px rgba(5,150,105,.32)}
      #mws-launch:focus-visible,#mws-overlay button:focus-visible{outline:3px solid #38bdf8;outline-offset:3px}
      #mws-overlay{position:fixed;inset:0;z-index:20000;display:grid;place-items:center;padding:clamp(10px,3vw,28px);background:rgba(2,6,23,.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
      #mws-overlay[hidden]{display:none}
      .mws-dialog{display:flex;flex-direction:column;width:min(100%,850px);max-height:min(850px,94dvh);overflow:hidden;border:1px solid rgba(148,163,184,.25);border-radius:26px;background:#fff;color:#0f172a;box-shadow:0 30px 100px rgba(0,0,0,.34)}
      html.dark .mws-dialog,body.dark .mws-dialog{background:#0f172a;color:#f8fafc;border-color:#334155}
      .mws-topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:17px 20px;border-bottom:1px solid #e2e8f0;background:linear-gradient(120deg,rgba(16,185,129,.08),rgba(14,165,233,.08))}
      html.dark .mws-topbar,body.dark .mws-topbar{border-color:#334155;background:linear-gradient(120deg,rgba(16,185,129,.1),rgba(14,165,233,.1))}
      .mws-brand{display:flex;align-items:center;gap:11px;min-width:0}.mws-brand-icon{display:grid;place-items:center;flex:0 0 42px;width:42px;height:42px;border-radius:14px;background:#059669;color:white;font-size:18px}.mws-brand-copy{min-width:0}.mws-brand-copy strong{display:block;font-size:14px;font-weight:900}.mws-brand-copy small{display:block;margin-top:3px;color:#64748b;font-size:11px}
      .mws-close{display:grid;place-items:center;flex:0 0 40px;width:40px;height:40px;border:1px solid #dbe3eb;border-radius:13px;background:transparent;color:inherit;font-size:17px;cursor:pointer}
      .mws-content{overflow:auto;overscroll-behavior:contain;padding:clamp(18px,4vw,34px);min-height:270px}
      .mws-slide-heading{display:flex;align-items:flex-start;gap:14px;margin-bottom:24px}.mws-slide-icon{display:grid;place-items:center;flex:0 0 48px;width:48px;height:48px;border-radius:16px;background:#ecfdf5;color:#059669;font-size:19px}.mws-slide-heading h2{margin:0;font-size:clamp(22px,3vw,30px);font-weight:900;letter-spacing:-.03em;line-height:1.2}.mws-slide-heading p{margin:7px 0 0;color:#64748b;font-size:13px;line-height:1.5}
      html.dark .mws-slide-heading p,body.dark .mws-slide-heading p,html.dark .mws-brand-copy small,body.dark .mws-brand-copy small{color:#94a3b8}
      .mws-hero{display:flex;gap:20px;align-items:flex-start;padding:22px;border:1px solid #d1fae5;border-radius:22px;background:linear-gradient(135deg,#f0fdf4,#eff6ff);margin-bottom:18px}.mws-hero-symbol{display:grid;place-items:center;flex:0 0 58px;width:58px;height:58px;border-radius:18px;background:#059669;color:white;font-size:24px}.mws-eyebrow{font-size:10px;letter-spacing:.14em;font-weight:900;color:#047857}.mws-hero h3,.mws-next-hero h3{margin:7px 0;font-size:clamp(21px,3vw,28px);font-weight:900;line-height:1.2;color:#0f172a}.mws-hero p,.mws-next-hero p{margin:0;color:#475569;font-size:13px;line-height:1.7}.mws-email{display:inline-flex;align-items:center;gap:7px;margin-top:12px;color:#047857;font-size:12px;font-weight:700;overflow-wrap:anywhere}
      .mws-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.mws-stat{display:flex;align-items:flex-start;gap:12px;min-width:0;padding:16px;border:1px solid #e2e8f0;border-radius:17px;background:#fff}.mws-stat-icon{display:grid;place-items:center;flex:0 0 38px;width:38px;height:38px;border-radius:12px;background:#ecfdf5;color:#059669}.mws-stat-copy{display:flex;flex-direction:column;gap:4px;min-width:0}.mws-stat-label{font-size:11px;color:#64748b}.mws-stat-copy strong{font-size:16px;font-weight:900;overflow-wrap:anywhere}.mws-stat-copy small{font-size:10px;color:#94a3b8}
      .mws-callout{display:flex;gap:10px;align-items:flex-start;margin-top:16px;padding:14px 16px;border-radius:15px;background:#f8fafc;color:#475569;font-size:12px;line-height:1.7}.mws-callout i{margin-top:3px;color:#059669}
      .mws-description{margin:0 0 17px;color:#64748b;font-size:13px;line-height:1.8}.mws-action-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:18px}.mws-action{display:flex;align-items:center;gap:10px;min-width:0;padding:14px 15px;border:1px solid #dbe3eb;border-radius:14px;background:#fff;color:#0f172a;text-align:left;font-size:12px;font-weight:800;cursor:pointer;transition:border-color .18s,transform .18s}.mws-action:hover{border-color:#10b981;transform:translateY(-1px)}.mws-action-end{margin-left:auto;color:#94a3b8;font-size:10px}
      .mws-account-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.mws-account-item{display:flex;flex-direction:column;gap:8px;min-width:0;padding:16px;border:1px solid #e2e8f0;border-radius:16px}.mws-account-item span{font-size:11px;color:#64748b}.mws-account-item strong{font-size:14px;font-weight:800;overflow-wrap:anywhere}
      .mws-next-hero{text-align:center;padding:16px 12px 22px}.mws-next-icon{display:grid;place-items:center;width:66px;height:66px;margin:0 auto 16px;border-radius:22px;background:#ecfdf5;color:#059669;font-size:26px}
      .mws-footer{display:flex;flex-direction:column;gap:12px;padding:15px 20px;border-top:1px solid #e2e8f0;background:#f8fafc}.mws-progress-row{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#64748b;font-size:11px;font-weight:700}.mws-progress-track{height:5px;overflow:hidden;border-radius:999px;background:#e2e8f0}.mws-progress-fill{height:100%;width:20%;border-radius:inherit;background:linear-gradient(90deg,#059669,#0284c7);transition:width .25s ease}.mws-controls{display:flex;align-items:center;justify-content:space-between;gap:10px}.mws-control-group{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.mws-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:38px;padding:9px 12px;border:1px solid #dbe3eb;border-radius:12px;background:#fff;color:#334155;font-size:11px;font-weight:800;cursor:pointer}.mws-btn:disabled{opacity:.4;cursor:not-allowed}.mws-btn-primary{border-color:#059669;background:#059669;color:white}.mws-btn[aria-pressed="true"]{border-color:#0284c7;background:#eff6ff;color:#0369a1}
      html.dark .mws-stat,body.dark .mws-stat,html.dark .mws-action,body.dark .mws-action,html.dark .mws-account-item,body.dark .mws-account-item,html.dark .mws-btn,body.dark .mws-btn{background:#111c2e;color:#e2e8f0;border-color:#334155}
      html.dark .mws-stat-label,body.dark .mws-stat-label,html.dark .mws-account-item span,body.dark .mws-account-item span{color:#94a3b8}
      html.dark .mws-callout,body.dark .mws-callout,html.dark .mws-footer,body.dark .mws-footer{background:#111c2e;color:#cbd5e1;border-color:#334155}
      html.dark .mws-hero,body.dark .mws-hero{background:linear-gradient(135deg,#102b28,#172b40);border-color:#24534a}.mws-hero h3{color:#0f172a}html.dark .mws-hero h3,body.dark .mws-hero h3{color:#f8fafc}html.dark .mws-hero p,body.dark .mws-hero p{color:#cbd5e1}
      html.dark .mws-progress-track,body.dark .mws-progress-track{background:#334155}html.dark .mws-close,body.dark .mws-close{border-color:#334155}
      @media(max-width:560px){#mws-launch{left:10px;bottom:12px;padding:11px 13px;font-size:12px}#mws-launch span{display:inline}.mws-dialog{max-height:96dvh;border-radius:20px}.mws-topbar{padding:12px 14px}.mws-content{padding:18px 14px;min-height:240px}.mws-hero{padding:16px;gap:12px}.mws-hero-symbol{flex-basis:44px;width:44px;height:44px;font-size:19px}.mws-grid,.mws-account-grid{grid-template-columns:1fr}.mws-stat{padding:13px}.mws-action-list{grid-template-columns:1fr}.mws-footer{padding:12px 14px}.mws-controls{align-items:stretch;flex-direction:column}.mws-control-group{justify-content:space-between}.mws-btn{flex:1;min-width:0;padding:9px 8px}.mws-progress-row{font-size:10px}}
      @media(prefers-reduced-motion:reduce){#mws-launch,.mws-action,.mws-progress-fill{transition:none!important}}
    `;
    document.head.appendChild(style);
  }
  function build() {
    if (root) return;
    injectStyles();
    trigger = document.createElement('button');
    trigger.id = 'mws-launch';
    trigger.type = 'button';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-label', 'Open website overview slideshow');
    trigger.innerHTML = '<i class="fa-solid fa-images" aria-hidden="true"></i><span>Website Overview</span>';
    trigger.addEventListener('click', open);
    document.body.appendChild(trigger);

    root = document.createElement('div');
    root.id = 'mws-overlay';
    root.hidden = true;
    root.innerHTML = '<section class="mws-dialog" role="dialog" aria-modal="true" aria-labelledby="mws-slide-title"><header class="mws-topbar"><div class="mws-brand"><span class="mws-brand-icon"><i class="fa-solid fa-heart-pulse" aria-hidden="true"></i></span><span class="mws-brand-copy"><strong>Medical Admission Tracker</strong><small>Personalized website overview</small></span></div><button type="button" class="mws-close" data-mws-close aria-label="Close slideshow and go back"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button></header><main class="mws-content" id="mws-slide-content" tabindex="-1"></main><footer class="mws-footer"><div class="mws-progress-row"><span id="mws-slide-count">Slide 1 of 5</span><span id="mws-autoplay-status">Manual mode</span></div><div class="mws-progress-track" aria-hidden="true"><div class="mws-progress-fill" id="mws-progress-fill"></div></div><div class="mws-controls"><div class="mws-control-group"><button class="mws-btn" type="button" data-mws-prev><i class="fa-solid fa-chevron-left" aria-hidden="true"></i><span>Previous</span></button><button class="mws-btn" type="button" data-mws-next><span>Next</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button></div><div class="mws-control-group"><button class="mws-btn" type="button" data-mws-restart title="Restart slideshow from current slide"><i class="fa-solid fa-rotate" aria-hidden="true"></i><span>Restart</span></button><button class="mws-btn" type="button" data-mws-first title="Return to first slide"><i class="fa-solid fa-backward-step" aria-hidden="true"></i><span>First</span></button><button class="mws-btn mws-btn-primary" type="button" data-mws-play aria-pressed="false"><i class="fa-solid fa-play" aria-hidden="true"></i><span>Start</span></button></div></div></footer></section>';
    root.addEventListener('click', onRootClick);
    root.addEventListener('touchstart', function (event) {
      if (!root.hidden && event.changedTouches && event.changedTouches.length) touchStartX = event.changedTouches[0].clientX;
    }, { passive: true });
    root.addEventListener('touchend', function (event) {
      if (root.hidden || touchStartX === null || !event.changedTouches || !event.changedTouches.length) return;
      var dx = event.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(dx) > 55) go(activeIndex + (dx < 0 ? 1 : -1));
    }, { passive: true });
    document.body.appendChild(root);
    render();
  }
  function render() {
    if (!root) return;
    var slide = slides[activeIndex];
    var content = root.querySelector('#mws-slide-content');
    content.innerHTML = '<div class="mws-slide-heading"><span class="mws-slide-icon"><i class="fa-solid ' + slide.icon + '" aria-hidden="true"></i></span><div><h2 id="mws-slide-title">' + esc(slide.title) + '</h2><p>' + esc(slide.subtitle) + '</p></div></div><div class="mws-slide-body">' + slide.render() + '</div>';
    root.querySelector('#mws-slide-count').textContent = 'Slide ' + (activeIndex + 1) + ' of ' + slides.length;
    root.querySelector('#mws-progress-fill').style.width = (((activeIndex + 1) / slides.length) * 100) + '%';
    root.querySelector('[data-mws-prev]').disabled = activeIndex === 0;
    root.querySelector('[data-mws-next]').disabled = activeIndex === slides.length - 1;
    root.querySelector('#mws-autoplay-status').textContent = autoplay ? 'Auto slideshow on' : 'Manual mode';
    var play = root.querySelector('[data-mws-play]');
    play.setAttribute('aria-pressed', String(autoplay));
    play.innerHTML = autoplay ? '<i class="fa-solid fa-pause" aria-hidden="true"></i><span>Stop</span>' : '<i class="fa-solid fa-play" aria-hidden="true"></i><span>Start</span>';
  }
  function stopTimer() { if (timer) window.clearInterval(timer); timer = null; autoplay = false; }
  function startTimer() {
    if (!root || root.hidden) return;
    if (timer) window.clearInterval(timer);
    autoplay = true;
    timer = window.setInterval(function () {
      if (activeIndex >= slides.length - 1) { stopTimer(); render(); return; }
      activeIndex += 1; render();
    }, intervalMs);
    render();
  }
  function go(index) {
    if (index < 0 || index >= slides.length) return;
    activeIndex = index;
    if (autoplay) startTimer(); else render();
  }
  function close() {
    if (!root || root.hidden) return;
    stopTimer();
    root.hidden = true;
    document.body.style.overflow = '';
    if (previousViewId) {
      var previousView = document.getElementById(previousViewId);
      if (previousView && previousView.classList.contains('view-section') && app() && typeof app().showView === 'function') {
        var name = previousViewId.replace(/^view-/, '');
        try { app().showView(name, true); } catch (_) {}
      }
    }
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    else if (trigger) trigger.focus();
  }
  function open() {
    build();
    previousFocus = document.activeElement;
    var current = document.querySelector('main .view-section:not(.hidden)');
    previousViewId = current ? current.id : null;
    activeIndex = 0;
    stopTimer();
    root.hidden = false;
    document.body.style.overflow = 'hidden';
    render();
    root.querySelector('[data-mws-close]').focus();
  }
  function onRootClick(event) {
    var target = event.target.closest('button');
    if (!target) return;
    if (target.hasAttribute('data-mws-close')) { close(); return; }
    if (target.hasAttribute('data-mws-prev')) { go(activeIndex - 1); return; }
    if (target.hasAttribute('data-mws-next')) { go(activeIndex + 1); return; }
    if (target.hasAttribute('data-mws-play')) { if (autoplay) stopTimer(); else startTimer(); render(); return; }
    if (target.hasAttribute('data-mws-restart')) { startTimer(); return; }
    if (target.hasAttribute('data-mws-first')) { activeIndex = 0; startTimer(); return; }
    var view = target.getAttribute('data-mws-view');
    if (view) {
      close();
      var a = app();
      if (a && typeof a.showView === 'function') a.showView(view);
      else if (window.MedicalTrackerNavigation && typeof window.MedicalTrackerNavigation.show === 'function') window.MedicalTrackerNavigation.show(view);
    }
  }
  function onKeydown(event) {
    if (!root || root.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); go(activeIndex + 1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); go(activeIndex - 1); }
  }
  function refreshIfOpen() { if (root && !root.hidden) render(); }
  function init() {
    build();
    document.addEventListener('keydown', onKeydown);
    window.addEventListener('student-profile-loaded', refreshIfOpen);
    window.addEventListener('storage', refreshIfOpen);
    window.addEventListener('med-account-progress-updated', refreshIfOpen);
    window.addEventListener('focus', refreshIfOpen);
  }
  window.MedicalWebsiteSlideshow = Object.freeze({ open: open, close: close, refresh: refreshIfOpen, start: startTimer, stop: stopTimer, restart: function () { startTimer(); }, restartFromFirst: function () { activeIndex = 0; startTimer(); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window, document);
