(() => {
  'use strict';
  const PROGRESS_PREFIX = 'med_account_progress_v1_';
  const AVATAR_PREFIX = 'med_profile_avatar_v1_';
  const PALETTE_KEY = 'med_palette_subject_separation_v1';
  const WEEKLY_KEY = 'med_weekly_reset_enabled_v1';
  const AVATARS = ['🩺','🧑‍⚕️','👨‍🎓','👩‍🎓','🧬','🧠','🦉','🚀'];
  const RANKS = [
    ['Bronze V',0],['Bronze IV',100],['Bronze III',250],['Bronze II',450],['Bronze I',700],
    ['Silver V',1000],['Silver IV',1400],['Silver III',1850],['Silver II',2350],['Silver I',2900],
    ['Gold V',3500],['Gold IV',4200],['Gold III',4950],['Gold II',5750],['Gold I',6600],
    ['Platinum V',7500],['Platinum IV',8500],['Platinum III',9550],['Platinum II',10650],['Platinum I',11800],
    ['Master V',13000],['Master IV',14500],['Master III',16100],['Master II',17800],['Master I',19600],
    ['Pro V',21500],['Pro IV',24000],['Pro III',27000],['Pro II',30500],['Pro I',34500]
  ];
  const get = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (_) { return fallback; } };
  const progressKey = app => PROGRESS_PREFIX + (app.authUser && app.authUser.uid || 'guest');
  const avatarKey = app => AVATAR_PREFIX + (app.authUser && app.authUser.uid || 'guest');
  const progress = app => read(progressKey(app), {rankPoints:0,xp:0,completedExams:0,rewarded:[]});
  const rankIndex = points => { let n=0; RANKS.forEach((r,i)=>{ if(points>=r[1]) n=i; }); return n; };
  const avatar = app => { const v=localStorage.getItem(avatarKey(app)); return AVATARS.includes(v) ? v : '🩺'; };
  const first = (...values) => values.find(v => typeof v === 'string' && v.trim()) || '';

  function markup() {
    return [
      '<section id="reference-dashboard-shell" class="rd-dashboard" aria-label="Student dashboard">',
      '<div class="rd-main-column">',
      '<div class="rd-overview-card"><div id="rd-welcome-container"></div><div id="rd-stats-container"></div></div>',
      '<div class="rd-quick-activity">',
      '<section class="rd-panel"><div class="rd-panel-heading"><h3><i class="fa-solid fa-bolt"></i> Quick Start</h3><span class="rd-kicker">STUDY</span></div><div class="rd-quick-cards">',
      '<button type="button" class="rd-quick-card rd-blue" data-rd-action="practice"><span class="rd-quick-icon"><i class="fa-solid fa-bullseye"></i></span><strong>Practice</strong><small>Open practice tools</small><span class="rd-card-arrow">↗</span></button>',
      '<button type="button" class="rd-quick-card rd-purple" data-rd-action="model"><span class="rd-quick-icon"><i class="fa-solid fa-clipboard-list"></i></span><strong>Model Test</strong><small>50 / 100 questions</small><span class="rd-card-arrow">↗</span></button>',
      '<button type="button" class="rd-quick-card rd-green" data-rd-action="bank"><span class="rd-quick-icon"><i class="fa-solid fa-book-open"></i></span><strong>Question Bank</strong><small>Select &amp; practice</small><span class="rd-card-arrow">↗</span></button>',
      '<button type="button" class="rd-quick-card rd-gold" data-rd-action="leaderboard"><span class="rd-quick-icon"><i class="fa-solid fa-trophy"></i></span><strong>Leaderboard</strong><small>See rankings</small><span class="rd-card-arrow">↗</span></button>',
      '</div></section>',
      '<section class="rd-panel rd-activity-panel"><div class="rd-panel-heading"><h3><i class="fa-solid fa-clock-rotate-left"></i> Activity Snapshot</h3></div><div id="rd-activity-list" class="rd-activity-list" aria-live="polite"></div></section>',
      '</div>',
      '<div class="rd-tools-grid">',
      '<section class="rd-panel rd-exam-panel"><div class="rd-panel-heading"><h3><i class="fa-solid fa-clipboard-check"></i> Start Exam</h3><span class="rd-step-mark">01</span></div>',
      '<div class="rd-mode-tabs"><button type="button" class="is-active" aria-pressed="true">Model Test</button><button type="button" data-rd-action="practice">Practice</button><button type="button" data-rd-action="bank">Question Bank</button></div>',
      '<p class="rd-field-label">Select number of questions</p><div class="rd-count-options" id="rd-model-options" role="group" aria-label="Model Test question count"><button type="button" class="is-selected" data-model-count="50" aria-pressed="true">50</button><button type="button" data-model-count="100" aria-pressed="false">100</button></div>',
      '<div id="rd-model-time" class="rd-time-copy"><i class="fa-regular fa-clock"></i> 50 Questions = 30 Minutes</div><p class="rd-info-note"><i class="fa-solid fa-circle-info"></i> Time is set automatically by question count.</p>',
      '<button type="button" class="rd-primary-button" data-rd-action="start-model">Start Exam <i class="fa-solid fa-arrow-right"></i></button></section>',
      '<section class="rd-panel rd-practice-panel"><div class="rd-panel-heading"><h3><i class="fa-solid fa-book-open-reader"></i> Start Practice</h3><span class="rd-step-mark">02</span></div>',
      '<div class="rd-mode-tabs"><button type="button" data-rd-action="practice-browser">Select Questions</button><button type="button" class="is-active" aria-pressed="true">Exam Instructions</button></div>',
      '<p class="rd-field-label">Select number of questions</p><div class="rd-count-options rd-count-five" id="rd-practice-options" role="group" aria-label="Practice question count"><button type="button" data-practice-count="20">20</button><button type="button" data-practice-count="30">30</button><button type="button" class="is-selected" data-practice-count="50" aria-pressed="true">50</button><button type="button" data-practice-count="75">75</button><button type="button" data-practice-count="100">100</button></div>',
      '<div id="rd-practice-time" class="rd-time-copy"><i class="fa-regular fa-clock"></i> 50 Questions = 25 Minutes</div><p class="rd-no-time"><i class="fa-solid fa-circle-check"></i> Automatic timing enabled</p>',
      '<button type="button" class="rd-primary-button rd-purple-button" data-rd-action="start-practice">Start Practice <i class="fa-solid fa-arrow-right"></i></button></section>',
      '<section class="rd-panel rd-bank-panel"><div class="rd-panel-heading"><h3><i class="fa-solid fa-layer-group"></i> Question Bank</h3><span class="rd-step-mark">03</span></div>',
      '<label class="rd-search-box"><i class="fa-solid fa-magnifying-glass"></i><input id="rd-bank-search" type="search" placeholder="Search questions..." aria-label="Search questions"></label><div id="rd-bank-count" class="rd-bank-meta">Question bank is loading…</div><div id="rd-question-preview" class="rd-question-preview"></div>',
      '<div class="rd-bank-footer"><span id="rd-selected-count">Use Select Questions for an exam</span><button type="button" class="rd-primary-button rd-bank-button" data-rd-action="bank">Open Question Bank <i class="fa-solid fa-arrow-right"></i></button></div></section>',
      '</div>',
      '<section class="rd-panel rd-light-sample"><div class="rd-panel-heading"><h3><i class="fa-solid fa-sun"></i> Light Mode UI (Sample)</h3><button type="button" class="rd-text-button" data-rd-action="theme">Toggle theme <i class="fa-solid fa-arrow-up-right-from-square"></i></button></div><div class="rd-light-mini-grid"><div class="rd-light-mini-card"><small>Dashboard</small><strong>Progress &amp; practice</strong><span>Quick access</span></div><div class="rd-light-mini-card"><small>Leaderboard</small><strong id="rd-light-rank">Your rank</strong><span>Weekly / All Time</span></div><div class="rd-light-mini-card"><small>Profile</small><strong id="rd-light-xp">XP progress</strong><span>Account progression</span></div></div></section>',
      '</div>',
      '<aside class="rd-right-column" aria-label="Profile and settings">',
      '<section class="rd-panel rd-profile-panel"><div class="rd-panel-heading"><h3><i class="fa-solid fa-user-astronaut"></i> User Profile</h3><button type="button" class="rd-icon-button" data-rd-action="profile" aria-label="Open user profile"><i class="fa-solid fa-arrow-up-right-from-square"></i></button></div>',
      '<button type="button" class="rd-profile-avatar" id="rd-profile-avatar" data-rd-action="profile" aria-label="Open profile">🩺</button><div class="rd-profile-name" id="rd-profile-name">Guest Student</div><div class="rd-profile-subtitle" id="rd-profile-subtitle">Level 1 · 0 XP</div>',
      '<div class="rd-profile-progress"><span id="rd-xp-progress-fill"></span></div><div class="rd-profile-progress-meta"><span id="rd-xp-progress-text">0 / 500 XP</span><strong id="rd-rank-points">0 RP</strong></div>',
      '<div class="rd-profile-facts"><div><small>Daily Streak</small><strong id="rd-streak">0 Days</strong></div><div><small>Completed Exams</small><strong id="rd-completed">0</strong></div></div><button type="button" class="rd-primary-button" data-rd-action="profile">View Profile <i class="fa-solid fa-arrow-right"></i></button></section>',
      '<section class="rd-panel rd-leaderboard-panel"><div class="rd-panel-heading"><h3><i class="fa-solid fa-trophy"></i> Leaderboard</h3><button type="button" class="rd-icon-button" data-rd-action="leaderboard" aria-label="Open leaderboard"><i class="fa-solid fa-arrow-up-right-from-square"></i></button></div>',
      '<div class="rd-lb-tabs" role="tablist" aria-label="Leaderboard preview"><button type="button" class="is-active" data-rd-lb="weekly" role="tab" aria-selected="true">Weekly</button><button type="button" data-rd-lb="all-time" role="tab" aria-selected="false">All Time</button><button type="button" data-rd-lb="friends" role="tab" aria-selected="false">Friends</button></div>',
      '<div id="rd-leaderboard-list" class="rd-leaderboard-list"></div><p id="rd-leaderboard-note" class="rd-quiet-note">Preview ranking · open Leaderboard for full details.</p><button type="button" class="rd-secondary-button" data-rd-action="leaderboard">View Leaderboard</button></section>',
      '<section class="rd-panel rd-settings-panel" id="rd-settings-panel"><div class="rd-panel-heading"><h3><i class="fa-solid fa-gear"></i> Settings</h3><button type="button" class="rd-icon-button" data-rd-action="palette" aria-label="Question palette settings"><i class="fa-solid fa-sliders"></i></button></div>',
      '<label class="rd-switch-row"><span><strong>Question Palette</strong><small>Subject-wise separation</small></span><input id="rd-palette-toggle" type="checkbox" role="switch"></label><label class="rd-switch-row"><span><strong>Weekly Leaderboard Reset</strong><small>Optional preference</small></span><input id="rd-weekly-toggle" type="checkbox" role="switch"></label>',
      '<div class="rd-settings-links"><button type="button" data-rd-action="avatar"><i class="fa-solid fa-user-circle"></i> Avatar Selection <i class="fa-solid fa-chevron-right"></i></button><button type="button" data-rd-action="support"><i class="fa-regular fa-circle-question"></i> Help &amp; Support <i class="fa-solid fa-chevron-right"></i></button><button type="button" data-rd-action="about"><i class="fa-solid fa-circle-info"></i> About App <i class="fa-solid fa-chevron-right"></i></button></div>',
      '<div id="rd-support-links" class="rd-support-links" hidden><a href="https://t.me/rakibhasandc27" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-telegram"></i> Telegram Support</a><a href="https://rakibhasandc27.blogspot.com/" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-blog"></i> Website / Blog</a><a href="https://github.com/serakib" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-github"></i> GitHub</a></div><div id="rd-about-copy" class="rd-about-copy" hidden>Medical Admission Tracker — exam preparation, progress and study tools. Built by Rakib Hasan.</div><div id="rd-avatar-picker" class="rd-avatar-picker" hidden aria-label="Choose avatar"></div></section>',
      '<section class="rd-panel rd-trophies-panel"><div class="rd-panel-heading"><h3><i class="fa-solid fa-award"></i> Trophy Set (All Tiers)</h3><span class="rd-kicker">30 RANKS</span></div><div id="rd-trophy-grid" class="rd-trophy-grid"></div></section>',
      '<section class="rd-panel rd-footer-panel"><div class="rd-panel-heading"><h3><i class="fa-solid fa-heart"></i> About Me</h3></div><p>Built by Rakib Hasan</p><div class="rd-footer-links"><a href="https://rakibhasandc27.blogspot.com/" target="_blank" rel="noopener noreferrer">Student Blog</a><a href="https://github.com/serakib" target="_blank" rel="noopener noreferrer">GitHub</a></div></section>',
      '</aside></section>'
    ].join('');
  }

  function init() {
    const app = window.app;
    const home = get('view-home');
    if (!app || !home || home.querySelector('#reference-dashboard-shell')) return false;
    app.__referenceDashboardMounted = true;
    document.body.classList.add('reference-dashboard-active');

    if (!localStorage.getItem('med_theme') && typeof app.applyTheme === 'function') {
      app.currentTheme = 'dark';
      localStorage.setItem('med_theme', 'dark');
      app.applyTheme();
    }

    const hero = Array.from(home.children).find(el =>
      el.classList.contains('relative') && el.classList.contains('overflow-hidden') && el.querySelector('h2')
    );
    const stats = get('dash-total-exams') ? get('dash-total-exams').closest('.grid') : null;
    const wrap = document.createElement('div');
    wrap.innerHTML = markup();
    const dashboard = wrap.firstElementChild;
    home.insertBefore(dashboard, home.firstChild);

    if (hero) {
      hero.classList.add('rd-native-hero');
      const inner = hero.querySelector('.relative.z-10') || hero.querySelector('.relative');
      if (inner) {
        const greeting = document.createElement('div');
        greeting.className = 'rd-greeting-line';
        greeting.innerHTML = '<span class="rd-status-dot"></span><span>Good morning, <strong id="rd-greeting-name">Student</strong>! 👋</span>';
        inner.insertBefore(greeting, inner.firstChild);
      }
      get('rd-welcome-container').appendChild(hero);
    }
    if (stats) {
      stats.classList.add('rd-native-stats');
      get('rd-stats-container').appendChild(stats);
    }

    const oldModes = Array.from(home.children).find(el => {
      const h = el.querySelector('h3');
      return h && (h.textContent || '').includes('পরীক্ষার মোড বেছে নিন');
    });
    if (oldModes) {
      const details = document.createElement('details');
      details.className = 'rd-secondary-tools';
      details.innerHTML = '<summary><span><i class="fa-solid fa-grid-2"></i> More study tools and exam modes</span><i class="fa-solid fa-chevron-down"></i></summary>';
      oldModes.parentNode.insertBefore(details, oldModes);
      details.appendChild(oldModes);
    }

    orderSidebar();
    bindActions();
    renderAvatars();
    updateAll();
    window.setTimeout(updateAll, 700);
    window.setTimeout(updateAll, 1800);
    window.addEventListener('load', updateAll);
    window.addEventListener('storage', updateAll);
    window.addEventListener('student-progress-updated', updateAll);

    if (typeof app.setAuthState === 'function' && !app.__rdAuthHook) {
      app.__rdAuthHook = true;
      const oldAuth = app.setAuthState.bind(app);
      app.setAuthState = function(user, notice) {
        const result = oldAuth(user, notice);
        window.setTimeout(updateAll, 0);
        return result;
      };
    }
    return true;
  }

  function orderSidebar() {
    const nav = document.querySelector('#app-sidebar .sidebar-nav');
    if (!nav) return;
    const buttons = Array.from(nav.querySelectorAll('button'));
    const find = (view, text) => buttons.find(b => b.dataset.navView === view && (!text || (b.textContent || '').trim().startsWith(text)));
    const ordered = [
      find('home','Home'), find('practice'), find('setup'), find('question-bank'),
      find('leaderboard'), find('previous'), find('syllabus'), find('medical-hsc-info'),
      buttons.find(b => (b.textContent || '').trim().includes('Contact'))
    ].filter(Boolean);
    ordered.forEach(button => nav.appendChild(button));
    let settings = nav.querySelector('[data-rd-sidebar-settings]');
    if (!settings) {
      settings = document.createElement('button');
      settings.type = 'button';
      settings.dataset.rdSidebarSettings = 'true';
      settings.innerHTML = '<i class="fa-solid fa-gear"></i><span>Settings</span>';
      settings.addEventListener('click', () => {
        if (window.app && typeof window.app.showView === 'function') window.app.showView('home');
        window.setTimeout(() => get('rd-settings-panel')?.scrollIntoView({behavior:'smooth',block:'center'}), 100);
      });
      nav.insertBefore(settings, ordered[5] || null);
    }
    const login = document.querySelector('#app-sidebar .login-action');
    if (login && !login.dataset.rdBound) {
      login.dataset.rdBound = 'true';
      login.onclick = () => {
        const app = window.app;
        if (app && app.authUser) {
          if (typeof window.handleLogout === 'function') window.handleLogout();
          else if (typeof app.logout === 'function') app.logout();
        } else if (typeof window.redirectToLogin === 'function') window.redirectToLogin();
      };
    }
  }

  function bindActions() {
    const shell = get('reference-dashboard-shell');
    if (!shell || shell.dataset.bound) return;
    shell.dataset.bound = 'true';

    shell.addEventListener('click', event => {
      const model = event.target.closest('[data-model-count]');
      const practice = event.target.closest('[data-practice-count]');
      const lb = event.target.closest('[data-rd-lb]');
      const action = event.target.closest('[data-rd-action]');
      if (model) { chooseCount('#rd-model-options','[data-model-count]',model.dataset.modelCount); modelTime(); return; }
      if (practice) { chooseCount('#rd-practice-options','[data-practice-count]',practice.dataset.practiceCount); practiceTime(); return; }
      if (lb) {
        shell.querySelectorAll('[data-rd-lb]').forEach(b => {
          const active = b === lb;
          b.classList.toggle('is-active',active);
          b.setAttribute('aria-selected',active ? 'true' : 'false');
        });
        renderLeaderboard(lb.dataset.rdLb);
        return;
      }
      if (!action) return;
      const app = window.app;
      switch (action.dataset.rdAction) {
        case 'practice':
          if (app && typeof app.openQuestionBank === 'function') app.openQuestionBank('practice');
          break;
        case 'model':
        case 'start-model':
          startExam('model', Number(shell.querySelector('[data-model-count].is-selected')?.dataset.modelCount || 50), true);
          break;
        case 'start-practice':
          startExam('random', Number(shell.querySelector('[data-practice-count].is-selected')?.dataset.practiceCount || 50), true);
          break;
        case 'practice-browser':
          if (app && typeof app.openQuestionBank === 'function') app.openQuestionBank('practice');
          break;
        case 'bank':
          openBank(get('rd-bank-search')?.value || '');
          break;
        case 'leaderboard':
          if (app && typeof app.showView === 'function') app.showView('leaderboard');
          if (app && typeof app.loadLeaderboard === 'function') app.loadLeaderboard();
          break;
        case 'profile':
          if (app && typeof app.openProfile === 'function') app.openProfile();
          break;
        case 'theme':
          if (app && typeof app.toggleTheme === 'function') app.toggleTheme();
          break;
        case 'palette':
          if (typeof window.openQuestionPaletteSettings === 'function') window.openQuestionPaletteSettings();
          else get('rd-palette-toggle')?.focus();
          break;
        case 'avatar':
          get('rd-avatar-picker').hidden = !get('rd-avatar-picker').hidden;
          break;
        case 'support':
          get('rd-support-links').hidden = !get('rd-support-links').hidden;
          break;
        case 'about':
          get('rd-about-copy').hidden = !get('rd-about-copy').hidden;
          break;
      }
    });

    const palette = get('rd-palette-toggle');
    if (palette) {
      palette.checked = localStorage.getItem(PALETTE_KEY) !== 'false';
      palette.addEventListener('change', () => {
        localStorage.setItem(PALETTE_KEY, palette.checked ? 'true' : 'false');
        const existing = get('palette-subject-separation-toggle');
        if (existing) existing.checked = palette.checked;
        const app = window.app;
        if (app && app.examState && app.examState.questions?.length && typeof app.renderPalette === 'function') app.renderPalette();
      });
    }
    const weekly = get('rd-weekly-toggle');
    if (weekly) {
      weekly.checked = localStorage.getItem(WEEKLY_KEY) !== 'false';
      weekly.addEventListener('change', () => {
        localStorage.setItem(WEEKLY_KEY, weekly.checked ? 'true' : 'false');
        const existing = get('weekly-reset-setting');
        if (existing) existing.checked = weekly.checked;
      });
    }
    const search = get('rd-bank-search');
    if (search) {
      let timer = null;
      search.addEventListener('input', () => { window.clearTimeout(timer); timer = window.setTimeout(renderQuestionPreview, 120); });
      search.addEventListener('keydown', event => { if (event.key === 'Enter') openBank(search.value); });
    }
  }

  function chooseCount(containerSelector, itemSelector, value) {
    document.querySelectorAll(containerSelector + ' ' + itemSelector).forEach(button => {
      const selected = button.getAttribute(itemSelector === '[data-model-count]' ? 'data-model-count' : 'data-practice-count') === String(value);
      button.classList.toggle('is-selected',selected);
      button.setAttribute('aria-pressed',selected ? 'true' : 'false');
    });
  }
  function modelTime() {
    const count = Number(document.querySelector('#rd-model-options .is-selected')?.dataset.modelCount || 50);
    get('rd-model-time').innerHTML = '<i class="fa-regular fa-clock"></i> ' + count + ' Questions = ' + Math.round(count * 0.6) + ' Minutes';
  }
  function practiceTime() {
    const count = Number(document.querySelector('#rd-practice-options .is-selected')?.dataset.practiceCount || 50);
    get('rd-practice-time').innerHTML = '<i class="fa-regular fa-clock"></i> ' + count + ' Questions = ' + Math.round(count * 0.5) + ' Minutes';
  }
  function startExam(mode, count, submitSetup) {
    const app = window.app;
    if (!app) return;
    if (typeof app.setupExamQuick === 'function') app.setupExamQuick(mode);
    else if (typeof app.showView === 'function') app.showView('setup');
    if (typeof app.setSetupMode === 'function') app.setSetupMode(mode);
    if (typeof app.setSetupQuestions === 'function') app.setSetupQuestions(count);
    else if (app.setup) app.setup.questionsCount = count;
    const mins = mode === 'model' ? count * 0.6 : count * 0.5;
    if (typeof app.setSetupDuration === 'function') app.setSetupDuration(mins);
    else if (app.setup) app.setup.durationMins = mins;
    if (submitSetup && typeof app.startExamWithConfig === 'function') app.startExamWithConfig();
  }
  function openBank(query) {
    const app = window.app;
    if (!app || typeof app.openQuestionBank !== 'function') return;
    app.openQuestionBank('view');
    if (query) {
      const field = get('question-bank-search');
      if (field) field.value = query;
      app.bankSearch = query;
      if (typeof app.renderQuestionBank === 'function') app.renderQuestionBank();
    }
  }
  function renderAvatars() {
    const app = window.app;
    const picker = get('rd-avatar-picker');
    if (!app || !picker) return;
    const selected = avatar(app);
    picker.innerHTML = AVATARS.map((v,i) => '<button type="button" class="rd-avatar-choice ' + (v === selected ? 'is-selected' : '') + '" data-rd-avatar="' + esc(v) + '" aria-label="Choose avatar ' + (i+1) + '" aria-pressed="' + (v === selected ? 'true':'false') + '">' + esc(v) + '</button>').join('');
    picker.querySelectorAll('[data-rd-avatar]').forEach(button => {
      button.addEventListener('click', () => {
        localStorage.setItem(avatarKey(app),button.dataset.rdAvatar);
        const picture = document.querySelector('#view-profile .profile-avatar');
        if (picture) picture.textContent = button.dataset.rdAvatar;
        updateProfile();
        renderAvatars();
        window.dispatchEvent(new CustomEvent('student-progress-updated'));
      });
    });
  }
  function renderQuestionPreview() {
    const app = window.app;
    const list = get('rd-question-preview');
    if (!app || !list) return;
    const questions = Array.isArray(app.questionBank) ? app.questionBank : [];
    const query = (get('rd-bank-search')?.value || '').trim().toLowerCase();
    const filtered = questions.filter(q => [q.question_bn,q.question,q.question_en,q.subject,q.source].join(' ').toLowerCase().includes(query)).slice(0,4);
    get('rd-bank-count').textContent = questions.length ? questions.length + ' questions available' + (query ? ' · filtered preview' : '') : 'Question bank is loading…';
    list.innerHTML = '';
    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'rd-question-empty';
      empty.textContent = questions.length ? 'No matching questions in this preview.' : 'Questions will appear when the bank loads.';
      list.appendChild(empty);
      return;
    }
    filtered.forEach((q,i) => {
      const row = document.createElement('div');
      row.className = 'rd-question-row';
      const n = document.createElement('span'); n.className = 'rd-question-number'; n.textContent = String(i+1).padStart(2,'0');
      const text = document.createElement('span'); text.className = 'rd-question-text'; text.textContent = first(q.question_bn,q.question,q.question_en,'Question preview');
      const subject = document.createElement('span'); subject.className = 'rd-question-subject'; subject.textContent = first(q.subject,'Question');
      row.append(n,text,subject); list.appendChild(row);
    });
  }
  function renderLeaderboard(period) {
    const app = window.app;
    const list = get('rd-leaderboard-list');
    const note = get('rd-leaderboard-note');
    if (!app || !list) return;
    list.innerHTML = '';
    if (period === 'friends') {
      const message = document.createElement('p');
      message.className = 'rd-question-empty';
      message.textContent = 'Friends leaderboard needs real friend connections. No private account data is shown.';
      list.appendChild(message);
      if (note) note.textContent = 'Friend connections are not configured yet.';
      return;
    }
    let rows = [];
    try {
      if (typeof app.getLocalLeaderboardRows === 'function') rows = app.getLocalLeaderboardRows();
      else if (typeof app.getDemoLeaderboardRows === 'function') rows = app.getDemoLeaderboardRows();
    } catch (_) { rows = []; }
    rows = (Array.isArray(rows) ? rows : []).slice().sort((a,b) => {
      const ap = period === 'weekly' ? Number(a.weeklyPoints ?? a.points ?? 0) : Number(a.points || 0);
      const bp = period === 'weekly' ? Number(b.weeklyPoints ?? b.points ?? 0) : Number(b.points || 0);
      return bp-ap;
    }).slice(0,5);
    if (!rows.length) {
      const message = document.createElement('p'); message.className='rd-question-empty'; message.textContent='No leaderboard entries are available yet.';
      list.appendChild(message); if(note) note.textContent='Rankings update when leaderboard data is available.'; return;
    }
    rows.forEach((row,i) => {
      const line=document.createElement('div'); line.className='rd-leader-row'; line.tabIndex=0; line.setAttribute('role','button');
      const position=document.createElement('span'); position.className='rd-leader-position'; position.textContent=String(i+1);
      const picture=document.createElement('span'); picture.className='rd-leader-avatar'; picture.textContent=row.avatar || '👤';
      const info=document.createElement('span'); info.className='rd-leader-info';
      const name=document.createElement('strong'); name.textContent=first(row.name,row.displayName,'Student');
      const kind=document.createElement('small'); kind.textContent=row.isDemo ? 'Sample profile' : 'Student';
      info.append(name,kind);
      const points=document.createElement('strong'); points.className='rd-leader-points';
      points.textContent=(period==='weekly' ? Number(row.weeklyPoints ?? row.points ?? 0) : Number(row.points||0)).toLocaleString()+' pts';
      line.append(position,picture,info,points);
      line.addEventListener('click',()=>{if(window.app?.showView)window.app.showView('leaderboard');if(window.app?.loadLeaderboard)window.app.loadLeaderboard();});
      line.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();line.click();}});
      list.appendChild(line);
    });
    if(note) note.textContent=rows.every(row=>row.isDemo)?'Sample leaderboard preview · open Leaderboard for the full view.':'Preview ranking · open Leaderboard for full details.';
  }
  function renderTrophies(points) {
    const grid=get('rd-trophy-grid');
    if(!grid)return;
    const current=rankIndex(points);
    grid.innerHTML=RANKS.map((rank,i)=>{
      const state=i===current?'is-current':i<current?'is-reached':'is-locked';
      const tier=['bronze','silver','gold','platinum','master','pro'][Math.floor(i/5)];
      const icon=['fa-shield-halved','fa-medal','fa-award','fa-shield','fa-crown'][i%5];
      return '<div class="rd-trophy-tile '+state+' tier-'+tier+'" title="'+rank[0]+' · '+rank[1].toLocaleString()+' RP"><span class="rd-trophy-emblem"><i class="fa-solid '+icon+'"></i></span><strong>'+rank[0]+'</strong><small>'+rank[1].toLocaleString()+' RP</small></div>';
    }).join('');
  }
  function updateProfile() {
    const app=window.app;
    if(!app)return;
    const p=progress(app),rp=Math.max(0,Number(p.rankPoints)||0),xp=Math.max(0,Number(p.xp)||0),done=Math.max(0,Number(p.completedExams)||0);
    const level=Math.floor(xp/500)+1,within=xp%500,rank=RANKS[rankIndex(rp)][0],user=app.authUser||{},profile=app.profile||{};
    const name=first(user.displayName,profile.name,user.email?user.email.split('@')[0]:'','Guest Student');
    const streak=Math.max(0,Number(p.streak ?? p.dailyStreak ?? 0)||0);
    const set=(id,value)=>{const el=get(id);if(el)el.textContent=value;};
    set('rd-profile-name',name);set('rd-greeting-name',name);set('rd-profile-subtitle','Level '+level+' · '+xp.toLocaleString()+' XP · '+rank);
    set('rd-rank-points',rp.toLocaleString()+' RP');set('rd-xp-progress-text',within+' / 500 XP');set('rd-completed',String(done));
    set('rd-streak',streak+(streak===1?' Day':' Days'));set('rd-light-rank',rank+' · '+rp.toLocaleString()+' RP');set('rd-light-xp','Level '+level+' · '+xp.toLocaleString()+' XP');
    const fill=get('rd-xp-progress-fill');if(fill)fill.style.width=Math.max(0,Math.min(100,within/5))+'%';
    const picture=get('rd-profile-avatar');if(picture)picture.textContent=avatar(app);
    const activity=get('rd-activity-list');
    if(activity)activity.innerHTML=[
      '<div class="rd-activity-item"><span class="rd-activity-icon rd-blue"><i class="fa-solid fa-clipboard-check"></i></span><span><strong>Completed exams</strong><small>Saved exam progression</small></span><b>'+done+'</b></div>',
      '<div class="rd-activity-item"><span class="rd-activity-icon rd-purple"><i class="fa-solid fa-star"></i></span><span><strong>Rank Points</strong><small>Current account total</small></span><b>'+rp.toLocaleString()+'</b></div>',
      '<div class="rd-activity-item"><span class="rd-activity-icon rd-green"><i class="fa-solid fa-bolt"></i></span><span><strong>Experience</strong><small>Level progression</small></span><b>'+xp.toLocaleString()+' XP</b></div>'
    ].join('');
    renderTrophies(rp);
    const login=document.querySelector('#app-sidebar .login-action');
    if(login){const logged=Boolean(user.uid);login.classList.toggle('rd-logged-in',logged);login.innerHTML=logged?'<i class="fa-solid fa-right-from-bracket"></i><span>Logout</span>':'<i class="fa-solid fa-right-to-bracket"></i><span>Log In / Sign Up</span>';}
  }
  function updateAll() {
    if(!get('reference-dashboard-shell'))return;
    updateProfile();
    renderAvatars();
    renderQuestionPreview();
    const palette=get('rd-palette-toggle');if(palette)palette.checked=localStorage.getItem(PALETTE_KEY)!=='false';
    const weekly=get('rd-weekly-toggle');if(weekly)weekly.checked=localStorage.getItem(WEEKLY_KEY)!=='false';
    const period=document.querySelector('#reference-dashboard-shell [data-rd-lb].is-active')?.dataset.rdLb||'weekly';
    renderLeaderboard(period);
    modelTime();practiceTime();
  }

  if(!init()){
    document.addEventListener('DOMContentLoaded',()=>{if(!init())window.addEventListener('load',init,{once:true});},{once:true});
  }
})();