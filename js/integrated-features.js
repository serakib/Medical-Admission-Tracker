/* Integrated exam, review-history, and account helpers.
   Keeps the existing application and Question Bank as the source of truth. */
(() => {
  'use strict';
  const app = window.app;
  if (!app || app.__integratedFeaturesInstalled) return;
  app.__integratedFeaturesInstalled = true;

  const REVIEW_KEY = () => 'med_review_history_v2_' + (app.authUser?.uid || 'guest');
  const ACCOUNT_KEY = 'med_recent_accounts_v1';
  const SUBJECT_WEIGHTS = [
    ['biology', 30], ['chemistry', 25], ['physics', 15], ['english', 15],
    ['general', 15]
  ];
  const subjectAliases = {
    biology: ['biology', 'botany', 'zoology'],
    chemistry: ['chemistry'],
    physics: ['physics'],
    english: ['english'],
    general: ['general', 'gk', 'aptitude', 'human', 'iq', 'mental ability', 'general knowledge']
  };
  const safeParse = (raw, fallback) => { try { const v = JSON.parse(raw); return v ?? fallback; } catch (_) { return fallback; } };
  const escape = value => app.escapeHtml ? app.escapeHtml(value) : String(value ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const qKey = q => String(q?.id || [q?.subject, q?.year, q?.question || q?.questionText].join('|')).toLowerCase().replace(/\s+/g, ' ').trim();
  const localKey = q => qKey(q);
  const getHistory = () => safeParse(localStorage.getItem(REVIEW_KEY()), {});
  const saveHistory = history => localStorage.setItem(REVIEW_KEY(), JSON.stringify(history));
  const getRecord = q => {
    const h = getHistory(), key = qKey(q);
    return h[key] || { key, question: q, reviewed: false, wrong: false, updatedAt: Date.now() };
  };
  const putRecord = (q, changes) => {
    const h = getHistory(), key = qKey(q), prior = h[key] || { key, question: q, reviewed: false, wrong: false };
    h[key] = { ...prior, question: q, ...changes, updatedAt: Date.now() };
    if (!h[key].reviewed && !h[key].wrong) delete h[key];
    saveHistory(h);
  };
  const subjectLabel = s => (app.localizedSubject ? app.localizedSubject(s) : s || 'General');
  const correctIndex = q => Number.isInteger(q?.answer) ? q.answer : (Number.isInteger(q?.correctAnswer) ? q.correctAnswer : 'ABCD'.indexOf(String(q?.correctAnswer || '').toUpperCase()));
  const answerLabel = (q, index) => index == null || index < 0 ? 'উত্তর দেওয়া হয়নি (Skip)' : `${'ABCD'[index]}. ${q.options?.[index] || ''}`;
  const questionHtml = (q, status, userAnswer = null) => {
    const correct = correctIndex(q);
    const answerText = userAnswer == null ? 'উত্তর দেওয়া হয়নি (Skip)' : answerLabel(q, userAnswer);
    const explanation = q?.explanationBn || q?.explanation_bn || q?.explanation || q?.solution || q?.answerExplanation;
    const explanationHtml = explanation
      ? `<p class="enhanced-explanation"><strong>বাংলা ব্যাখ্যা:</strong> ${escape(explanation)}</p>`
      : '<p class="enhanced-explanation"><strong>বাংলা ব্যাখ্যা:</strong> এই প্রশ্নটির বিস্তারিত ব্যাখ্যা প্রশ্নের ডেটায় যোগ করা হয়নি।</p>';
    return `<article class="enhanced-question-card"><div class="enhanced-question-meta"><span>${escape(subjectLabel(q.subject))}</span><span>${escape(q.year || q.source || '')}</span><span>${escape(status)}</span></div><h4>${escape(q.question || q.questionText || '')}</h4><p><strong>আপনার উত্তর:</strong> ${escape(answerText)}</p><p><strong>সঠিক উত্তর:</strong> ${escape(answerLabel(q, correct))}</p>${explanationHtml}<div class="enhanced-card-actions"><button type="button" class="enhanced-mark-reviewed" data-qkey="${escape(qKey(q))}">${getRecord(q).reviewed ? 'Reviewed ✓' : 'Mark Reviewed'}</button></div></article>`;
  };

  function ensureStyles() {
    if (document.getElementById('integrated-features-style')) return;
    const style = document.createElement('style');
    style.id = 'integrated-features-style';
    style.textContent = `
      .sidebar-profile-row{display:flex;align-items:stretch;gap:7px;width:100%}
      .sidebar-profile-row .profile-action{flex:1;min-width:0;margin-left:0}
      .sidebar-palette-settings{display:grid;place-items:center;flex:0 0 46px;width:46px;min-height:46px;border:1px solid rgba(52,211,153,.28);border-radius:12px;background:rgba(16,185,129,.12);color:#a7f3d0;cursor:pointer}
      .sidebar-palette-settings:hover{background:rgba(16,185,129,.22);color:#fff}
      .palette-settings-overlay{position:fixed;inset:0;z-index:11000;display:grid;place-items:center;padding:18px;background:rgba(2,6,23,.62)}
      .palette-settings-overlay[hidden]{display:none!important}
      .palette-settings-dialog{width:min(100%,420px);padding:22px;border:1px solid var(--line,#dbe4ee);border-radius:20px;background:var(--surface,#fff);color:var(--text,#1e293b);box-shadow:0 24px 80px rgba(0,0,0,.28)}
      .palette-settings-dialog h3{font-weight:900;font-size:1.1rem;margin:0 0 7px}
      .palette-settings-dialog p{font-size:.85rem;line-height:1.65;color:var(--muted,#64748b);margin:0 0 16px}
      .palette-settings-choice{display:flex;align-items:center;gap:10px;padding:13px;border:1px solid var(--line,#dbe4ee);border-radius:13px}
      .palette-settings-choice input{width:18px;height:18px;accent-color:#059669}
      .question-palette-subjects{display:block;max-height:18rem;overflow-y:auto;overflow-x:hidden;padding-right:.25rem}
      .palette-subject-section{padding:10px;margin-bottom:10px;border:1px solid var(--line,#dbe4ee);border-radius:13px;background:var(--surface-2,rgba(148,163,184,.06))}
      .palette-subject-heading{font-size:.76rem;font-weight:900;margin:0 0 8px;color:var(--text,#1e293b)}
      .palette-subject-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
      .palette-subject-grid button{min-width:0}
      .enhanced-bank-toolbar{display:grid;gap:12px;margin:14px 0 18px;padding:16px;border:1px solid var(--line,#dbe4ee);border-radius:18px;background:linear-gradient(135deg,var(--surface,#fff),var(--surface-2,rgba(148,163,184,.07)));box-shadow:0 8px 24px rgba(15,23,42,.05)}
      .enhanced-bank-selection-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
      .enhanced-bank-selection-head>div{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
      .enhanced-bank-selection-head strong{font-size:14px;font-weight:900}
      .enhanced-bank-selection-head [data-selected-count]{padding:4px 9px;border-radius:99px;background:rgba(13,148,136,.12);color:#0d9488;font-size:11px;font-weight:900}
      .enhanced-bank-selection-head p{margin:0;color:var(--muted,#64748b);font-size:12px}
      .enhanced-bank-selection-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .enhanced-bank-toolbar button{min-height:40px;padding:9px 12px;border:1px solid var(--line,#cbd5e1);border-radius:11px;font-size:12px;font-weight:850;background:var(--surface,#fff);color:var(--text,#1e293b);transition:transform .15s ease,box-shadow .15s ease}
      .enhanced-bank-toolbar button:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 5px 14px rgba(15,23,42,.08)}
      .enhanced-bank-toolbar button:disabled{opacity:.45;cursor:not-allowed}
      .enhanced-bank-toolbar .enhanced-bank-action-primary{background:linear-gradient(135deg,#059669,#0d9488);color:#fff;border-color:transparent;box-shadow:0 6px 16px rgba(5,150,105,.2)}
      @media(max-width:560px){.enhanced-bank-selection-actions{grid-template-columns:1fr}.enhanced-bank-selection-head{align-items:flex-start;flex-direction:column}}
      .enhanced-bank-select-row{display:flex;align-items:center;gap:7px;margin:12px 0 4px;font-size:12px;font-weight:800;color:var(--muted,#64748b)}
      .enhanced-bank-select-row input{width:16px;height:16px;accent-color:#059669}
      .enhanced-question-status{display:inline-flex;flex-wrap:wrap;gap:5px;margin-left:auto}
      .enhanced-status-pill{display:inline-flex;align-items:center;padding:3px 7px;border-radius:99px;font-size:10px;font-weight:900;letter-spacing:.01em}
      .enhanced-status-reviewed{color:#047857;background:rgba(16,185,129,.13);border:1px solid rgba(16,185,129,.22)}
      .enhanced-status-wrong{color:#b91c1c;background:rgba(239,68,68,.10);border:1px solid rgba(239,68,68,.2)}
      .enhanced-panel{margin:14px 0;padding:14px;border:1px solid var(--line,#dbe4ee);border-radius:16px;background:var(--surface,#fff);color:var(--text,#1e293b)}
      .enhanced-panel h3{font-size:1rem;font-weight:800;margin:0 0 10px}
      .enhanced-actions,.enhanced-filters,.enhanced-card-actions{display:flex;flex-wrap:wrap;gap:7px;align-items:center}
      .enhanced-actions button,.enhanced-filters button,.enhanced-card-actions button,.enhanced-small-btn{padding:6px 10px;border:1px solid var(--line,#cbd5e1);border-radius:9px;font-size:12px;font-weight:750;background:var(--surface,#fff);color:var(--text,#1e293b);min-height:32px}
      .enhanced-actions button.active,.enhanced-filters button.active{background:#059669;color:#fff;border-color:#059669}
      .enhanced-question-list{display:grid;gap:10px;margin-top:12px}
      .enhanced-question-card{padding:13px;border:1px solid var(--line,#dbe4ee);border-radius:13px;text-align:left;background:var(--surface,#fff);color:var(--text,#1e293b)}
      .enhanced-question-card h4{font-weight:800;margin:8px 0;line-height:1.7}
      .enhanced-question-card p{font-size:13px;margin:5px 0;line-height:1.6}
      .enhanced-question-meta{display:flex;flex-wrap:wrap;gap:6px;font-size:11px;color:var(--muted,#64748b)}
      .enhanced-explanation{opacity:.8}
      .enhanced-subject-stats{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 10px;font-size:11px}
      .enhanced-subject-stats span{padding:5px 7px;border-radius:8px;background:rgba(100,116,139,.1)}
      .enhanced-empty{font-size:13px;color:var(--muted,#64748b);padding:10px 0}
      .enhanced-account-row{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--line,#dbe4ee)}
      .enhanced-account-row:last-child{border-bottom:0}
      .enhanced-account-row small{display:block;opacity:.7}
      #view-result .enhanced-result-panel{margin-top:18px;text-align:left}
      .enhanced-result-filterbar{display:flex;gap:7px;flex-wrap:wrap;justify-content:center;margin:12px 0}
      button,.primary-btn,.ghost-btn,.practice-start-btn{transition:padding .15s,font-size .15s}
      @media(max-width:767px){.enhanced-panel{padding:11px;border-radius:13px}.enhanced-actions button,.enhanced-filters button,.enhanced-card-actions button,.enhanced-small-btn{padding:6px 8px;font-size:11px;min-height:32px}.enhanced-question-card{padding:10px}}
      @media(hover:none){button,.primary-btn,.ghost-btn,.practice-start-btn{touch-action:manipulation}}
    `;
    document.head.appendChild(style);
  }

  function getReviewEntries(type = 'all') {
    const h = getHistory();
    return Object.values(h).filter(r => type === 'all' ? (r.reviewed || r.wrong) : Boolean(r[type]));
  }
  function markReviewed(q) { putRecord(q, { reviewed: true }); renderReviewPanel(); }
  function markWrong(q) { putRecord(q, { wrong: true }); }
  // The dedicated js/practice-history.js panel is the single source of Practice history UI.
  // Keep the older reviewed/wrong metadata for Question Bank filters, but remove its duplicate panel.
  function renderReviewPanel() {
    const legacyPanel = document.getElementById('enhanced-review-history');
    if (legacyPanel) legacyPanel.remove();
  }

  // Answer review now lives exclusively inside the Bengali Answer Review view.
  // Remove the old duplicate question list that used to appear below Exam Rewards.
  function renderResultFilters() {
    const oldPanel = document.getElementById('enhanced-result-review');
    if (oldPanel) oldPanel.remove();
  }

  function renderPaletteStats() {
    const grid = document.getElementById('q-palette-grid');
    if (!grid || !app.examState?.questions?.length) return;
    let stats = document.getElementById('enhanced-palette-stats');
    if (!stats) {
      stats = document.createElement('div');
      stats.id = 'enhanced-palette-stats';
      stats.className = 'enhanced-subject-stats';
      grid.parentElement.insertBefore(stats, grid);
    }
    const groups = {};
    app.examState.questions.forEach((q, i) => {
      const name = subjectLabel(q.subject);
      groups[name] ||= { total: 0, answered: 0, skipped: 0 };
      groups[name].total++;
      if (app.examState.userAnswers[i] == null) groups[name].skipped++;
      else groups[name].answered++;
    });
    stats.innerHTML = Object.entries(groups).map(([name, c]) => `<span><strong>${escape(name)}</strong>: ${c.total} total · ${c.answered} answered · ${c.skipped} skipped</span>`).join('');
  }

  function chooseMedicalDistribution(pool, count) {
    const weights = SUBJECT_WEIGHTS;
    const available = weights.map(([name, weight]) => {
      const aliases = subjectAliases[name] || [name];
      return { name, weight, qs: pool.filter(q => aliases.some(a => String(q.subject || '').toLowerCase().includes(a))) };
    }).filter(x => x.qs.length);
    if (!available.length) return pool.slice().sort(() => Math.random() - .5).slice(0, count);
    const sum = available.reduce((n, x) => n + x.weight, 0);
    const quotas = available.map(x => ({ ...x, exact: count * x.weight / sum, n: Math.floor(count * x.weight / sum) }));
    let remaining = count - quotas.reduce((n, x) => n + x.n, 0);
    quotas.sort((a,b) => (b.exact-b.n) - (a.exact-a.n));
    for (let i=0; i<remaining; i++) quotas[i % quotas.length].n++;
    const picked = [];
    const used = new Set();
    quotas.forEach(group => {
      const shuffled = group.qs.slice().sort(() => Math.random() - .5);
      shuffled.slice(0, Math.min(group.n, shuffled.length)).forEach(q => { const k=qKey(q); if(!used.has(k)){used.add(k);picked.push(q);} });
    });
    if (picked.length < count) {
      pool.slice().sort(() => Math.random() - .5).forEach(q => { const k=qKey(q); if(picked.length<count&&!used.has(k)){used.add(k);picked.push(q);} });
    }
    return picked.slice(0, count).sort(() => Math.random() - .5);
  }

  function getRememberedAccounts() { return safeParse(localStorage.getItem(ACCOUNT_KEY), []); }
  function saveRememberedAccount(email, name) {
    if (!email) return;
    const list = getRememberedAccounts().filter(x => x.email.toLowerCase() !== email.toLowerCase());
    list.unshift({ email, name: name || email, lastUsed: Date.now() });
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(list.slice(0, 5)));
  }
  function renderAccountList() {
    const view = document.getElementById('view-account');
    if (!view) return;
    let panel = document.getElementById('enhanced-account-switcher');
    if (!panel) { panel = document.createElement('section'); panel.id='enhanced-account-switcher'; panel.className='enhanced-panel'; view.appendChild(panel); }
    const list = getRememberedAccounts();
    panel.innerHTML = `<h3>Remembered accounts on this device</h3><p class="enhanced-empty">শুধু ইমেইল মনে রাখা হয়—password বা login token এখানে সংরক্ষণ করা হয় না। Account বদলাতে Firebase-এর স্বাভাবিক sign-in প্রয়োজন।</p>${list.map((x,i)=>`<div class="enhanced-account-row"><div><strong>${escape(x.name || x.email)}</strong><small>${escape(x.email)}</small></div><div class="enhanced-actions"><button type="button" data-switch-account="${i}">Switch / Sign in</button><button type="button" data-remove-account="${i}">Remove from list</button></div></div>`).join('') || '<p class="enhanced-empty">এখনো কোনো sign-in email মনে রাখা হয়নি।</p>'}`;
    panel.querySelectorAll('[data-switch-account]').forEach(btn => btn.onclick = () => {
      const account = list[Number(btn.dataset.switchAccount)];
      if (!account) return;
      app.openAccountAuth('login');
      setTimeout(() => {
        const emailInput = document.querySelector('#authModal input[type="email"], #authModal input[name="email"], #authEmail');
        if (emailInput) { emailInput.value = account.email; emailInput.dispatchEvent(new Event('input', { bubbles:true })); }
      }, 0);
    });
    panel.querySelectorAll('[data-remove-account]').forEach(btn => btn.onclick = () => {
      const account = list[Number(btn.dataset.removeAccount)];
      if (!account || !confirm(`${account.email} শুধু এই ডিভাইসের remembered list থেকে সরাবেন? Firebase account মুছবে না।`)) return;
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(list.filter((_,i)=>i!==Number(btn.dataset.removeAccount))));
      renderAccountList();
    });
  }

  ensureStyles();

  // Preserve the existing UI, extending its render hooks.
  const originalSetAuthState = app.setAuthState.bind(app);
  app.setAuthState = function(user, notice) {
    originalSetAuthState(user, notice);
    if (user?.email) saveRememberedAccount(user.email, user.displayName || user.email);
    renderAccountList();
  };

  const originalSetSetupQuestions = app.setSetupQuestions.bind(app);
  app.setSetupQuestions = function(count) {
    const allowed = this.setup?.mode === 'model' ? [50, 100] : [20, 30, 50, 75, 100];
    const chosen = allowed.includes(Number(count)) ? Number(count) : (this.setup?.mode === 'model' ? 50 : 30);
    this.setup.questionsCount = chosen;
    originalSetSetupQuestions(chosen);
    this.setup.durationMins = this.setup.mode === 'model' ? chosen * 0.6 : chosen * 0.5;
    this.updateSetupUI();
  };
  app.setSetupDuration = function(mins) {
    const allowed = [20, 30, 50, 60, 90];
    const chosen = allowed.includes(Number(mins)) ? Number(mins) : 30;
    this.setup.durationMins = chosen;
    this.updateSetupUI();
  };
  const originalSetSetupMode = app.setSetupMode.bind(app);
  app.setSetupMode = function(mode) {
    originalSetSetupMode(mode);
    const fixedModel = mode === 'model';
    const note = document.getElementById('model-test-fixed-note');
    if (note) {
      note.classList.toggle('hidden', !fixedModel);
      note.textContent = fixedModel
        ? 'Model Test: ৫০ প্রশ্নে ৩০ মিনিট, ১০০ প্রশ্নে ৬০ মিনিট। সময় স্বয়ংক্রিয়ভাবে নির্ধারিত হবে।'
        : 'সময় প্রশ্নসংখ্যা অনুযায়ী স্বয়ংক্রিয়ভাবে নির্ধারিত হবে (প্রতি ২ প্রশ্নে ১ মিনিট)।';
    }
    const countOptions = document.getElementById('setup-question-count-options');
    if (countOptions) {
      countOptions.classList.remove('hidden');
      countOptions.querySelectorAll('[data-count],button').forEach(btn => {
        const raw = btn.dataset.count ?? btn.dataset.questions ?? btn.value ?? btn.textContent;
        const n = Number(String(raw).match(/\d+/)?.[0]);
        if (!n) return;
        const allowed = fixedModel ? [50, 100] : [20, 30, 50, 75, 100];
        btn.hidden = !allowed.includes(n);
        btn.disabled = !allowed.includes(n);
      });
    }
    if (fixedModel && ![50, 100].includes(Number(this.setup.questionsCount))) {
      this.setup.questionsCount = 50;
      originalSetSetupQuestions(50);
    }
    this.setup.durationMins = Number(this.setup.questionsCount || 30) * (fixedModel ? 0.6 : 0.5);
    const timeContainer = document.querySelector('.time-btn')?.parentElement?.parentElement;
    if (timeContainer) {
      timeContainer.hidden = true;
      timeContainer.setAttribute('aria-hidden', 'true');
    }
    document.querySelectorAll('.time-btn').forEach(btn => {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.title = 'সময় প্রশ্নসংখ্যা অনুযায়ী স্বয়ংক্রিয়ভাবে নির্ধারিত হয়';
    });
  };

  const originalPrepareExam = app.prepareExamFromSetup.bind(app);
  app.prepareExamFromSetup = function() {
    if (!this.questionsLoaded || !this.questionBank.length) return originalPrepareExam();
    const isModelTest = this.setup.mode === 'model';
    const count = (this.setup.mode === 'challenge' || this.setup.mode === 'previousQuiz') ? 20 : Number(this.setup.questionsCount || 30);
    let pool = this.questionBank.slice();
    const year = document.getElementById('setup-year')?.value || 'all';
    if (!isModelTest && this.setup.subject && this.setup.subject !== 'all') pool = pool.filter(q => q.subject === this.setup.subject);
    if (!isModelTest && year !== 'all' && (this.setup.mode === 'previous' || this.setup.mode === 'previousQuiz')) pool = pool.filter(q => q.year === year || q.isPreviousYear);
    if (!pool.length) { this.showDataError('এই নির্বাচন অনুযায়ী Question Bank-এ প্রশ্ন পাওয়া যায়নি।'); return; }
    const questions = isModelTest || this.setup.subject === 'all'
      ? chooseMedicalDistribution(pool, Math.min(count, pool.length))
      : pool.slice().sort(() => Math.random()-.5).slice(0, Math.min(count,pool.length));
    if (!questions.length) return originalPrepareExam();
    if (isModelTest) {
      this.setup.subject = 'all';
      const subjectSelect = document.getElementById('setup-subject');
      if (subjectSelect) subjectSelect.value = 'all';
      const yearSelect = document.getElementById('setup-year');
      if (yearSelect) yearSelect.value = 'all';
    }
    const durationMins = isModelTest
      ? count * 0.6
      : ((this.setup.mode === 'challenge' || this.setup.mode === 'previousQuiz') ? Math.max(1, count * 0.5) : Math.max(1, count * 0.5));
    this.setup.durationMins = durationMins;
    this.preparedExam = {
      questions: this.shuffleQuestionsAndOptions(questions, questions.length),
      mode: this.setup.mode,
      subject: isModelTest ? 'all' : this.setup.subject,
      year: isModelTest ? 'all' : year,
      durationMins
    };
    this.renderExamIntro();
    this.showView('exam-intro');
  };

  const PALETTE_SETTING_KEY = 'med_palette_subject_separation_v1';
  const selectedBankKeys = new Set();
  const subjectSeparationEnabled = () => localStorage.getItem(PALETTE_SETTING_KEY) !== 'false';
  function renderSubjectPalette() {
    const grid = document.getElementById('q-palette-grid');
    const questions = app.examState?.questions || [];
    if (!grid || !questions.length) return;
    const buttons = Array.from(grid.querySelectorAll(':scope > button'));
    if (!buttons.length) return;
    if (!subjectSeparationEnabled()) {
      grid.className = 'grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1';
      grid.replaceChildren(...buttons);
      return;
    }
    grid.className = 'question-palette-subjects';
    const groups = new Map();
    buttons.forEach((button, index) => {
      const q = questions[index];
      if (!q) return;
      const label = subjectLabel(q.subject);
      if (!groups.has(label)) {
        const section = document.createElement('section');
        section.className = 'palette-subject-section';
        const heading = document.createElement('h4');
        heading.className = 'palette-subject-heading';
        heading.textContent = label;
        const inner = document.createElement('div');
        inner.className = 'palette-subject-grid';
        section.append(heading, inner);
        groups.set(label, section);
      }
      groups.get(label).querySelector('.palette-subject-grid').appendChild(button);
    });
    grid.replaceChildren(...groups.values());
  }
  function ensurePaletteSettingsUI() {
    const trigger = document.getElementById('question-palette-settings');
    if (trigger) trigger.onclick = () => { const modal = document.getElementById('palette-settings-overlay'); if (modal) { const checkbox = modal.querySelector('#palette-subject-separation-toggle'); if (checkbox) checkbox.checked = subjectSeparationEnabled(); modal.hidden = false; } };
    if (document.getElementById('palette-settings-overlay')) return;
    const modal = document.createElement('div');
    modal.id = 'palette-settings-overlay';
    modal.className = 'palette-settings-overlay';
    modal.hidden = true;
    modal.innerHTML = `<section class="palette-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="palette-settings-title"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><h3 id="palette-settings-title">Question Palette Settings</h3><button type="button" id="palette-settings-close" class="enhanced-small-btn" aria-label="Close settings">✕</button></div><p>Choose how questions are grouped during an exam. This only changes the palette layout, not question order, answers, or marks.</p><label class="palette-settings-choice"><input id="palette-subject-separation-toggle" type="checkbox"><span><strong>Subject-wise separation</strong><small style="display:block;color:var(--muted,#64748b);margin-top:3px">ON: separate Biology, Chemistry, Physics, English and GK boxes. OFF: use the original single palette.</small></span></label></section>`;
    modal.addEventListener('click', event => { if (event.target === modal) modal.hidden = true; });
    modal.querySelector('#palette-settings-close').onclick = () => { modal.hidden = true; };
    modal.querySelector('#palette-subject-separation-toggle').checked = subjectSeparationEnabled();
    modal.querySelector('#palette-subject-separation-toggle').onchange = event => {
      localStorage.setItem(PALETTE_SETTING_KEY, event.target.checked ? 'true' : 'false');
      if (app.examState?.questions?.length) app.renderPalette();
    };
    document.body.appendChild(modal);
  }
  ensurePaletteSettingsUI();
  const originalRenderPalette = app.renderPalette.bind(app);
  app.renderPalette = function() { originalRenderPalette(); renderPaletteStats(); renderSubjectPalette(); };

  const originalSelectOption = app.selectOption.bind(app);
  app.selectOption = function(index) { originalSelectOption(index); renderPaletteStats(); renderSubjectPalette(); };

  const originalSubmitExam = app.submitExam.bind(app);
  app.submitExam = function(autoSubmitted) {
    const state = this.examState;
    if (!state.submitted) {
      state.questions.forEach((q, i) => {
        if (state.userAnswers[i] != null && state.userAnswers[i] !== correctIndex(q)) markWrong(q);
      });
    }
    const result = originalSubmitExam(autoSubmitted);
    renderResultFilters();
    renderReviewPanel();
    return result;
  };

  function startSelectedPractice(questions) {
    const qs = (questions || []).filter(Boolean);
    if (!qs.length) { alert('পরীক্ষা দেওয়ার জন্য আগে ভালো প্রশ্নগুলো নির্বাচন করুন।'); return; }
    if (app.practiceTimerInterval) { clearInterval(app.practiceTimerInterval); app.practiceTimerInterval = null; }
    app.preparedExam = {
      questions: app.shuffleQuestionsAndOptions(qs, qs.length),
      mode: 'selected',
      subject: 'all',
      year: 'all',
      durationMins: Math.max(1, Math.round(qs.length * 0.5))
    };
    app.renderExamIntro();
    app.showView('exam-intro');
  }
  function updateBankSelectionToolbar() {
    const toolbar = document.getElementById('enhanced-bank-selection-toolbar');
    if (!toolbar) return;
    const selected = selectedBankKeys.size;
    const isBn = app.language !== 'en';
    const count = toolbar.querySelector('[data-selected-count]');
    if (count) count.textContent = `${selected} selected`;
    const list = document.getElementById('question-bank-list');
    const visibleCards = list ? Array.from(list.querySelectorAll(':scope > article')).filter(card => !card.hidden) : [];
    const allVisibleSelected = visibleCards.length > 0 && visibleCards.every(card => {
      const input = card.querySelector('.enhanced-bank-select');
      return input && selectedBankKeys.has(input.dataset.qkey);
    });
    const selectButton = toolbar.querySelector('#enhanced-bank-select-visible');
    if (selectButton) selectButton.textContent = allVisibleSelected ? 'Unselect All' : 'Select All';
    const clearButton = toolbar.querySelector('#enhanced-bank-clear-selection');
    if (clearButton) clearButton.textContent = `Clear Selection (${selected} selected)`;
    const examButton = toolbar.querySelector('#enhanced-bank-practice-selected');
    if (examButton) { examButton.textContent = `Start Exam with ${selected} Questions`; examButton.disabled = selected === 0; }
  }
  const originalRenderQuestionBank = app.renderQuestionBank.bind(app);
  app.renderQuestionBank = function() {
    originalRenderQuestionBank();
    const qs = this.getFilteredBank();
    const list = document.getElementById('question-bank-list');
    if (!list) return;
    let toolbar = document.getElementById('enhanced-bank-selection-toolbar');
    if (!toolbar) {
      toolbar = document.createElement('section');
      toolbar.id = 'enhanced-bank-selection-toolbar';
      toolbar.className = 'enhanced-bank-toolbar';
      list.parentElement.insertBefore(toolbar, list);
    }
    toolbar.dataset.statusFilter = 'all';
    const isBn = this.language !== 'en';
    toolbar.innerHTML = `<div class="enhanced-bank-selection-head"><div><strong>Question Selection</strong><span data-selected-count>${selectedBankKeys.size} selected</span></div><p>Build an exam from your selected questions</p></div><div class="enhanced-bank-selection-actions"><button type="button" id="enhanced-bank-select-visible" class="enhanced-bank-action">Select All</button><button type="button" id="enhanced-bank-clear-selection" class="enhanced-bank-action">Clear Selection (${selectedBankKeys.size} selected)</button><button type="button" class="enhanced-practice-selected enhanced-bank-action-primary" id="enhanced-bank-practice-selected" ${selectedBankKeys.size?'':'disabled'}>Start Exam with ${selectedBankKeys.size} Questions</button></div>`;
    const selectVisibleButton = toolbar.querySelector('#enhanced-bank-select-visible');
    const visibleCards = Array.from(list.querySelectorAll(':scope > article')).filter(card => !card.hidden);
    const allVisibleSelected = visibleCards.length > 0 && visibleCards.every(card => {
      const input = card.querySelector('.enhanced-bank-select');
      return input && selectedBankKeys.has(input.dataset.qkey);
    });
    selectVisibleButton.textContent = allVisibleSelected ? 'Unselect All' : 'Select All';
    selectVisibleButton.onclick = () => {
      const cards = Array.from(list.querySelectorAll(':scope > article')).filter(card => !card.hidden);
      const allSelected = cards.length > 0 && cards.every(card => {
        const input = card.querySelector('.enhanced-bank-select');
        return input && selectedBankKeys.has(input.dataset.qkey);
      });
      cards.forEach(card => {
        const input = card.querySelector('.enhanced-bank-select');
        if (!input) return;
        if (allSelected) selectedBankKeys.delete(input.dataset.qkey);
        else selectedBankKeys.add(input.dataset.qkey);
      });
      this.renderQuestionBank();
    };
    const clearSelectionButton = toolbar.querySelector('#enhanced-bank-clear-selection');
    clearSelectionButton.textContent = `Clear Selection (${selectedBankKeys.size} selected)`;
    clearSelectionButton.title = 'Clear the current selection only. This does not delete any questions.';
    clearSelectionButton.onclick = () => { selectedBankKeys.clear(); this.renderQuestionBank(); };
    toolbar.querySelector('#enhanced-bank-practice-selected').onclick = () => startSelectedPractice(this.questionBank.filter(q => selectedBankKeys.has(qKey(q))));
    const cards = Array.from(list.querySelectorAll(':scope > article'));
    cards.forEach((card, i) => {
      const q = qs[i];
      if (!q) return;
      const record = getRecord(q);
      const status = document.createElement('div');
      status.className = 'enhanced-question-status';
      if (record.reviewed) status.insertAdjacentHTML('beforeend', '<span class="enhanced-status-pill enhanced-status-reviewed">Reviewed</span>');
      if (record.wrong) status.insertAdjacentHTML('beforeend', '<span class="enhanced-status-pill enhanced-status-wrong">Wrong Answer</span>');
      const meta = card.querySelector('.bank-meta');
      if (meta) meta.appendChild(status);
      const selectRow = document.createElement('label');
      selectRow.className = 'enhanced-bank-select-row';
      selectRow.innerHTML = `<input type="checkbox" class="enhanced-bank-select" data-qkey="${escape(qKey(q))}" ${selectedBankKeys.has(qKey(q)) ? 'checked' : ''}><span>Select question</span>`;
      card.insertBefore(selectRow, card.firstChild);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'enhanced-small-btn enhanced-mark-reviewed';
      btn.dataset.qkey = qKey(q);
      btn.textContent = record.reviewed ? 'Reviewed ✓' : 'Mark Reviewed';
      btn.addEventListener('click', () => { markReviewed(q); this.renderQuestionBank(); });
      card.appendChild(btn);
      card.hidden = false;
    });
    list.onchange = event => {
      const input = event.target.closest('.enhanced-bank-select');
      if (!input) return;
      input.checked ? selectedBankKeys.add(input.dataset.qkey) : selectedBankKeys.delete(input.dataset.qkey);
      updateBankSelectionToolbar();
    };
    const countEl=document.getElementById('question-bank-count');
    if(countEl){const visible=cards.filter(card=>!card.hidden).length;countEl.textContent=this.language==='bn'?`দেখানো হচ্ছে ${visible} / ${qs.length}টি প্রশ্ন`:`Showing ${visible} of ${qs.length} questions`;}
    updateBankSelectionToolbar();
  };

  const originalRenderPracticeBrowser = app.renderPracticeBrowser?.bind(app);
  if (originalRenderPracticeBrowser) app.renderPracticeBrowser = function() { originalRenderPracticeBrowser(); renderReviewPanel(); };
  const originalShowView = app.showView.bind(app);
  app.showView = function(viewName, force) {
    const result = originalShowView(viewName, force);
    if (viewName === 'practice') renderReviewPanel();
    if (viewName === 'account') renderAccountList();
    if (viewName === 'result') renderResultFilters();
    return result;
  };

  // Mark any question as reviewed from the existing practice quiz.
  const originalAnswerPractice = app.answerPractice.bind(app);
  app.answerPractice = function(index) {
    const session = this.practiceSession;
    const q = session?.questions?.[session.index];
    originalAnswerPractice(index);
    if (q && Number(index) !== correctIndex(q)) markWrong(q);
    renderReviewPanel();
  };

  const originalRenderPractice = app.renderPractice.bind(app);
  app.renderPractice = function() {
    originalRenderPractice();
    const s = this.practiceSession, q = s?.questions?.[s.index];
    const root = document.getElementById('practice-question');
    if (!root || !q || root.querySelector('.enhanced-mark-reviewed')) return;
    const btn = document.createElement('button');
    btn.type='button'; btn.className='enhanced-small-btn enhanced-mark-reviewed';
    btn.textContent=getRecord(q).reviewed ? 'Reviewed ✓' : 'Mark Reviewed';
    btn.onclick=()=>{markReviewed(q);btn.textContent='Reviewed ✓';};
    root.appendChild(btn);
  };

  // Keep live palette subject totals synchronized after navigation/answer changes.
  document.addEventListener('click', event => {
    if (event.target.closest('#btn-prev-q,#btn-next-q,#btn-mark-review,#q-palette-grid button')) setTimeout(() => { renderPaletteStats(); renderSubjectPalette(); }, 0);
  });
  window.openQuestionPaletteSettings = function() {
    ensurePaletteSettingsUI();
    const modal = document.getElementById('palette-settings-overlay');
    if (modal) {
      const checkbox = modal.querySelector('#palette-subject-separation-toggle');
      if (checkbox) checkbox.checked = subjectSeparationEnabled();
      modal.hidden = false;
    }
  };

  window.addEventListener('load', () => {
    renderReviewPanel();
    renderAccountList();
  });

  // Keep account-scoped review history and remembered accounts in sync across views/tabs.
  window.addEventListener('student-auth-state-changed', () => {
    renderReviewPanel();
    renderAccountList();
    renderResultFilters();
  });
  window.addEventListener('storage', event => {
    if (event.key === ACCOUNT_KEY || (event.key && event.key.startsWith('med_review_history_v2_'))) {
      renderReviewPanel();
      renderAccountList();
    }
  });

  /* Leaderboard tabs and Friends filtering are managed by js/global-league-system.js. */
  /* Human portrait avatar picker: people only, no animal avatars. */
  const humanAvatarStyle=document.createElement('style');humanAvatarStyle.textContent='.sidebar-action.logout-action{color:#f87171!important;border-color:#ef444455!important;background:#ef444410!important}.sidebar-action.logout-action:hover{background:#ef444420!important}.leader-avatar,.podium-avatar{overflow:hidden;flex-shrink:0}.profile-avatar-options{display:none;width:100%;grid-template-columns:repeat(auto-fill,minmax(42px,1fr));gap:6px;margin-top:12px;align-items:start}.profile-avatar-picker.is-expanded .profile-avatar-options{display:grid;grid-template-columns:repeat(auto-fill,minmax(42px,1fr))}.profile-avatar-toggle-button,.profile-avatar-confirm-button,.profile-avatar-cancel-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 13px;border:1px solid #10b98166;border-radius:11px;background:#10b98114;color:var(--text,#0f172a);font-weight:850;font-size:13px;cursor:pointer}.profile-avatar-toggle-button:hover,.profile-avatar-confirm-button:hover{background:#10b98125}.profile-avatar-confirm-button:disabled{opacity:.45;cursor:not-allowed}.profile-avatar-cancel-button{border-color:var(--line,#cbd5e1);background:transparent}.profile-avatar-comparison{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}.profile-avatar-comparison-card{min-width:0;padding:12px;border:1px solid var(--line,#cbd5e1);border-radius:14px;display:flex;align-items:center;flex-direction:column;gap:8px;text-align:center}.profile-avatar-comparison-card img{width:88px;height:88px;object-fit:cover;border-radius:50%;border:3px solid var(--line,#cbd5e1)}.profile-avatar-comparison-card.is-current img{border-color:#10b981}.profile-avatar-comparison-card.is-preview img{border-color:#0ea5e9}.profile-avatar-comparison-card small{font-size:12px;font-weight:850}.profile-avatar-comparison-placeholder{width:88px;height:88px;display:grid;place-items:center;border-radius:50%;border:2px dashed var(--line,#cbd5e1);font-size:11px;color:var(--muted,#64748b);padding:8px}.profile-avatar-confirm-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:12px}.profile-avatar-choice.is-current{border-color:#10b981;box-shadow:0 0 0 2px #10b98138}.profile-avatar-choice.is-pending{border-color:#0ea5e9;box-shadow:0 0 0 3px #0ea5e938;transform:scale(1.04)}.profile-avatar-choice{display:block;width:100%;aspect-ratio:1;border-radius:50%;padding:3px;border:2px solid transparent;background:transparent;overflow:hidden;cursor:pointer;transition:transform .16s,border-color .16s}.profile-avatar-choice img{display:block;width:100%;height:100%;object-fit:cover;border-radius:50%}.profile-avatar-choice:hover{transform:translateY(-2px)}.profile-avatar-choice.is-selected{border-color:#10b981;box-shadow:0 0 0 3px #10b98125}.profile-avatar-picker-label{font-weight:800;display:block;margin-bottom:5px}@media(max-width:640px){.profile-avatar-picker.is-expanded .profile-avatar-options{grid-template-columns:repeat(auto-fill,minmax(38px,1fr));gap:6px}.profile-avatar-choice{min-width:0}}';
  humanAvatarStyle.textContent += '.profile-avatar-upload-controls{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:14px}.profile-avatar-upload-button{display:inline-flex;align-items:center;gap:8px;padding:10px 13px;border:1px solid #10b98166;border-radius:11px;background:#10b98114;color:var(--text,#0f172a);font-weight:850;font-size:13px;cursor:pointer}.profile-avatar-upload-button:hover{background:#10b98125}.profile-avatar-upload-hint{display:block;margin-top:7px;color:var(--muted,#64748b);font-size:11px}.profile-avatar-upload-status{display:block;margin-top:8px;font-size:12px;font-weight:700}.profile-avatar-uploaded-wrap{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0}.profile-avatar-choice:focus-visible,.profile-avatar-upload-button:focus-visible,.profile-avatar-confirm-button:focus-visible,.profile-avatar-cancel-button:focus-visible{outline:3px solid #0ea5e9;outline-offset:2px}';
  document.head.appendChild(humanAvatarStyle);
  /* Per-account avatar selector with multi-upload support for raster and SVG images. */
  const avatarChoices = Array.from({length:24},(_,i)=>'https://i.pravatar.cc/120?img='+(i+1));
  const avatarAccountId = () => {
    const known = app.authUser?.uid || app.profile?.userId || app.profile?.uid;
    if (known) return String(known);
    try { return String(localStorage.getItem('med_sheet_guest_id_v1') || 'guest'); } catch (_) { return 'guest'; }
  };
  const avatarKey = () => 'med_profile_avatar_v1_' + avatarAccountId();
  const legacyAvatarKey = () => 'med_profile_avatar_v1_' + (app.authUser?.uid || 'guest');
  const manualAvatarKey = () => 'med_profile_avatar_manual_v1_' + avatarAccountId();
  const avatarDefaultMarker = '#mat-default-avatar';
  const avatarCustomMarker = '#mat-custom-avatar';
  const stripAvatarDefaultMarker = value => String(value || '').replace(/#mat-(?:default|custom)-avatar$/i, '');
  const isStoredDefaultAvatar = value => /#mat-default-avatar$/i.test(String(value || ''));
  const isStoredCustomAvatar = value => /#mat-custom-avatar$/i.test(String(value || ''));
  const defaultAvatarForUser = userId => {
    const key = String(userId || 'guest'); let hash = 2166136261;
    for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
    return avatarChoices[(hash >>> 0) % avatarChoices.length];
  };
  const storedDefaultAvatarForUser = userId => defaultAvatarForUser(userId) + avatarDefaultMarker;
  const maxUploadedAvatars = 8;
  let avatarPickerExpanded = false;
  let pendingAvatarSource = null;
  const isUploadedAvatarSource = value => {
    if (typeof value !== 'string') return false;
    if (/^data:image\/(?:webp|png);base64,[A-Za-z0-9+/=]+$/.test(value)) return true;
    return /^data:image\/svg\+xml;charset=utf-8,%3Csvg/i.test(value);
  };
  const readUploadedAvatars = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(uploadedAvatarKey()) || '[]');
      return Array.isArray(saved) ? saved.filter(isUploadedAvatarSource).slice(0, maxUploadedAvatars) : [];
    } catch (_) { return []; }
  };
  const isAvatarSource = value => avatarChoices.includes(value) || readUploadedAvatars().includes(value);
  const isRenderableAvatarSource = value => {
    const avatar = String(value || '').trim();
    return !!avatar && (
      /^https:\/\//i.test(avatar) ||
      /^data:image\/(?:webp|png);base64,[A-Za-z0-9+/=]+$/i.test(avatar) ||
      /^data:image\/svg\+xml;charset=utf-8,%3Csvg/i.test(avatar)
    );
  };
  const readAvatar = () => {
    const id = avatarAccountId();
    let manual = false;
    try { manual = localStorage.getItem(manualAvatarKey()) === '1'; } catch (_) {}
    const sharedRaw = String(app.profile?.avatar || '').trim();
    if (isRenderableAvatarSource(sharedRaw)) {
      const shared = stripAvatarDefaultMarker(sharedRaw);
      if (isStoredDefaultAvatar(sharedRaw) || isStoredCustomAvatar(sharedRaw)) return shared;
      if (shared === avatarChoices[0] && !manual) return defaultAvatarForUser(id);
      return shared;
    }
    try {
      const value = localStorage.getItem(avatarKey()) || localStorage.getItem(legacyAvatarKey()) || '';
      if (isAvatarSource(value)) {
        if (value === avatarChoices[0] && !manual) return defaultAvatarForUser(id);
        return stripAvatarDefaultMarker(value);
      }
    } catch (_) {}
    return defaultAvatarForUser(id);
  };
  let defaultAvatarSyncInFlight = null;
  let defaultAvatarSyncAttemptedFor = '';
  async function ensureSharedAvatarExists() {
    let accountId = avatarAccountId();
    if (defaultAvatarSyncInFlight || defaultAvatarSyncAttemptedFor === accountId ||
        typeof window.MedGlobalLeague?.updateProfile !== 'function') return;
    defaultAvatarSyncAttemptedFor = accountId;
    defaultAvatarSyncInFlight = (async () => {
      if (typeof window.MedGlobalLeague.syncIdentity === 'function') await window.MedGlobalLeague.syncIdentity();
      accountId = avatarAccountId();
      defaultAvatarSyncAttemptedFor = accountId;
      const shared = String(app.profile?.avatar || '').trim();
      let manual = false;
      try { manual = localStorage.getItem(manualAvatarKey()) === '1'; } catch (_) {}
      const isOldAutoDefault = shared === avatarChoices[0] && !isStoredDefaultAvatar(shared) && !isStoredCustomAvatar(shared) && !manual;
      if (isRenderableAvatarSource(shared) && !isOldAutoDefault) return;
      let saved = '';
      try { saved = localStorage.getItem(avatarKey()) || localStorage.getItem(legacyAvatarKey()) || ''; } catch (_) {}
      const savedIsExplicit = isAvatarSource(saved) && (saved !== avatarChoices[0] || manual);
      const candidate = savedIsExplicit ? stripAvatarDefaultMarker(saved) : storedDefaultAvatarForUser(accountId);
      const updated = await window.MedGlobalLeague.updateProfile({ avatar: candidate });
      const sharedAvatar = String(updated?.avatar || '').trim();
      if (sharedAvatar !== candidate) {
        throw new Error('Avatar was not confirmed by the server. Deploy the latest Medical_Admission_Tracker_Backend.gs Web App and ensure the Students sheet has an Avatar column.');
      }
      app.profile = Object.assign({}, app.profile || {}, updated || {}, { avatar: sharedAvatar });
      try { localStorage.setItem(avatarKey(), stripAvatarDefaultMarker(sharedAvatar)); } catch (_) {}
      renderAvatarPicker();
      if (typeof window.MedGlobalLeague.reload === 'function') await window.MedGlobalLeague.reload();
      else if (typeof app.loadLeaderboard === 'function') await app.loadLeaderboard(true);
    })().catch(error => {
      console.warn('[Profile avatar] Default avatar could not be synced globally:', error);
      defaultAvatarSyncAttemptedFor = '';
    }).finally(() => { defaultAvatarSyncInFlight = null; });
    return defaultAvatarSyncInFlight;
  }
  function sanitizeUploadedSvg(source) {
    if (source.length > 50 * 1024) throw new Error('SVG file must be smaller than 50 KB.');
    if (/<!doctype|<!entity/i.test(source)) throw new Error('This SVG file contains unsupported XML declarations.');
    const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
    const rootSvg = parsed.documentElement;
    if (!rootSvg || rootSvg.localName?.toLowerCase() !== 'svg' || parsed.querySelector('parsererror')) {
      throw new Error('The selected SVG file is not valid.');
    }
    parsed.querySelectorAll('script,foreignObject,iframe,object,embed,audio,video,image,style,animate,animateMotion,animateTransform,set').forEach(node => node.remove());
    parsed.querySelectorAll('*').forEach(node => {
      Array.from(node.attributes).forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();
        if (name.startsWith('on') || name === 'src' || name === 'srcset') {
          node.removeAttribute(attribute.name);
          return;
        }
        if ((name === 'href' || name.endsWith(':href')) && !value.startsWith('#')) {
          node.removeAttribute(attribute.name);
          return;
        }
        if (/javascript:|@import/i.test(value) || /url\s*\(\s*['"]?(?!#)/i.test(value)) {
          node.removeAttribute(attribute.name);
        }
      });
    });
    const serialized = new XMLSerializer().serializeToString(rootSvg);
    if (serialized.length > 50 * 1024) throw new Error('The cleaned SVG must be smaller than 50 KB. Try a simpler SVG avatar.');
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serialized).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29');
  }
  function processUploadedAvatar(file) {
    return new Promise((resolve, reject) => {
      const name = String(file?.name || '');
      const type = String(file?.type || '').toLowerCase();
      const isSvg = type === 'image/svg+xml' || /\.svg$/i.test(name);
      if (!file) { reject(new Error('Choose an image file first.')); return; }
      if (file.size > 5 * 1024 * 1024) { reject(new Error('Each avatar file must be 5 MB or smaller.')); return; }
      if (isSvg) {
        file.text().then(source => resolve(sanitizeUploadedSvg(source))).catch(() => reject(new Error('The SVG file could not be read.')));
        return;
      }
      if (!['image/png','image/jpeg','image/webp'].includes(type)) {
        reject(new Error('Supported formats: SVG, PNG, JPG/JPEG, and WEBP.'));
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        try {
          if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 8000 || image.naturalHeight > 8000) {
            throw new Error('Image dimensions must be no larger than 8000 × 8000 pixels.');
          }
          const side = 256;
          const canvas = document.createElement('canvas');
          canvas.width = side;
          canvas.height = side;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Image processing is unavailable in this browser.');
          const cropSide = Math.min(image.naturalWidth, image.naturalHeight);
          const sx = (image.naturalWidth - cropSide) / 2;
          const sy = (image.naturalHeight - cropSide) / 2;
          context.drawImage(image, sx, sy, cropSide, cropSide, 0, 0, side, side);
          let result = canvas.toDataURL('image/webp', 0.86);
          if (!result.startsWith('data:image/webp;base64,')) result = canvas.toDataURL('image/png');
          resolve(result);
        } catch (error) { reject(error); }
        finally { URL.revokeObjectURL(objectUrl); }
      };
      image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('The selected image could not be opened.')); };
      image.src = objectUrl;
    });
  }
  function renderAvatarPicker() {
    const root = document.getElementById('view-profile');
    if (!root) return;
    let picker = root.querySelector('#profile-avatar-picker');
    if (!picker) {
      picker = document.createElement('div');
      picker.id = 'profile-avatar-picker';
      picker.className = 'profile-avatar-picker';
      picker.setAttribute('aria-label', 'Choose or upload profile avatars');
      const hero = root.querySelector('.profile-hero');
      if (hero) hero.insertAdjacentElement('afterend', picker);
      else root.prepend(picker);
    }
    picker.classList.toggle('is-expanded', avatarPickerExpanded);
    const uploaded = readUploadedAvatars();
    const current = readAvatar();
    const pending = isAvatarSource(pendingAvatarSource) ? pendingAvatarSource : null;
    if (!pending) pendingAvatarSource = null;
    const avatar = root.querySelector('.profile-hero .profile-avatar');
    if (avatar) {
      avatar.innerHTML = '<img src="' + current + '" alt="Current profile avatar" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
      avatar.setAttribute('aria-label', 'Current profile avatar');
    }
    // Keep the current avatar in the choices grid so users can compare it with a candidate.
    const optionButton = (value, index, source, label) => {
      const isCurrent = value === current;
      const isPending = value === pending;
      const classes = 'profile-avatar-choice' + (isCurrent ? ' is-current' : '') + (isPending ? ' is-pending' : '');
      const stateLabel = isCurrent && isPending ? 'Current selection' : isPending ? 'Preview candidate' : isCurrent ? 'Current avatar' : 'Choose avatar';
      return '<button type="button" class="' + classes + '" data-avatar-source="' + source + '" data-avatar-index="' + index + '" aria-pressed="' + String(isPending) + '" aria-label="' + stateLabel + ': ' + label + '"><img src="' + value + '" alt="' + label + '" loading="lazy"></button>';
    };
    const presetOptions = avatarChoices.map((value, i) => optionButton(value, i, 'preset', 'Preset avatar ' + (i+1))).join('');
    const uploadedOptions = uploaded.map((value, i) => optionButton(value, i, 'uploaded', 'Uploaded avatar ' + (i+1))).join('');
    let compareMarkup = '';
    if (avatarPickerExpanded) {
      compareMarkup = '<div class="profile-avatar-comparison" aria-label="Compare current and candidate avatars">' +
        '<div class="profile-avatar-comparison-card is-current"><small>Current avatar</small><img src="' + current + '" alt="Current avatar comparison"></div>' +
        '<div class="profile-avatar-comparison-card is-preview"><small>Selected preview</small>' +
        (pending ? '<img src="' + pending + '" alt="Candidate avatar preview">' : '<div class="profile-avatar-comparison-placeholder">Choose a thumbnail</div>') +
        '</div></div>' +
        '<div class="profile-avatar-confirm-actions"><button type="button" id="profile-avatar-cancel" class="profile-avatar-cancel-button">Cancel</button>' +
        '<button type="button" id="profile-avatar-confirm" class="profile-avatar-confirm-button"' + (!pending || pending === current ? ' disabled' : '') + '>Confirm avatar</button></div>';
    }
    picker.innerHTML = '<span class="profile-avatar-picker-label">Profile avatar</span>' +
      '<div class="profile-avatar-upload-controls"><button type="button" id="profile-avatar-toggle-picker" class="profile-avatar-toggle-button" aria-expanded="' + String(avatarPickerExpanded) + '"><i class="fa-solid fa-user-pen" aria-hidden="true"></i> ' + (avatarPickerExpanded ? 'Hide avatar choices' : 'Select another avatar') + '</button>' +
      '<label class="profile-avatar-upload-button" for="profile-avatar-upload-input"><i class="fa-solid fa-upload" aria-hidden="true"></i> Upload avatar images</label>' +
      '<input id="profile-avatar-upload-input" type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp,.svg,.png,.jpg,.jpeg,.webp" multiple hidden>' +
      '<span style="font-size:12px;color:var(--muted,#64748b)">' + uploaded.length + ' / ' + maxUploadedAvatars + ' custom avatars</span></div>' +
      '<div class="profile-avatar-options" aria-label="Available avatars">' + presetOptions + uploadedOptions + '</div>' +
      compareMarkup +
      '<small class="profile-avatar-upload-hint">SVG, PNG, JPG/JPEG, WEBP · Up to 8 uploaded avatars per account on this device. Select a thumbnail to preview it, then confirm to apply it.</small>' +
      '<span id="profile-avatar-upload-status" class="profile-avatar-upload-status" aria-live="polite"></span>';
    picker.classList.toggle('is-expanded', avatarPickerExpanded);
  }
  function refreshAvatarViews() {
    renderAvatarPicker();
    if (typeof app.loadLeaderboard === 'function') app.loadLeaderboard(true);
  }
  document.addEventListener('click', event => {
    const togglePicker = event.target.closest('#profile-avatar-toggle-picker');
    if (togglePicker) {
      avatarPickerExpanded = !avatarPickerExpanded;
      pendingAvatarSource = null;
      renderAvatarPicker();
      return;
    }
    const cancelButton = event.target.closest('#profile-avatar-cancel');
    if (cancelButton) {
      pendingAvatarSource = null;
      avatarPickerExpanded = false;
      renderAvatarPicker();
      return;
    }
    const confirmButton = event.target.closest('#profile-avatar-confirm');
    if (confirmButton) {
      const current = readAvatar();
      const candidate = isAvatarSource(pendingAvatarSource) ? pendingAvatarSource : null;
      if (!candidate || candidate === current || confirmButton.disabled) return;
      try {
        localStorage.setItem(avatarKey(), candidate);
        localStorage.setItem(manualAvatarKey(), '1');
      } catch (_) {
        const status = document.getElementById('profile-avatar-upload-status');
        if (status) status.textContent = 'Avatar could not be saved in this browser. Check available site storage.';
        return;
      }
      pendingAvatarSource = null;
      avatarPickerExpanded = false;
      // Keep the existing avatar picker as the single source of truth, and sync the
      // chosen image to the Medical Sheets profile so leaderboard/public profiles use it.
      app.profile = Object.assign({}, app.profile || {}, { avatar: candidate });
      refreshAvatarViews();
      const setAvatarStatus = message => {
        const status = document.getElementById('profile-avatar-upload-status');
        if (status) status.textContent = String(message || '');
      };
      setAvatarStatus('Avatar saved on this device. Syncing it to your student profile…');
      if (window.MedGlobalLeague && typeof window.MedGlobalLeague.updateProfile === 'function') {
        const avatarToSync = candidate === avatarChoices[0] ? candidate + avatarCustomMarker : candidate;
        window.MedGlobalLeague.updateProfile({ avatar: avatarToSync }).then(async updated => {
          const serverAvatar = String(updated?.avatar || '').trim();
          if (serverAvatar !== avatarToSync) {
            throw new Error('Google Sheets API saved no matching avatar. Check that the latest Apps Script backend is deployed and its Students sheet has an Avatar column.');
          }
          app.profile = Object.assign({}, app.profile || {}, updated || {}, { avatar: serverAvatar });
          try { localStorage.setItem(avatarKey(), candidate); } catch (_) {}
          if (app.authUser && typeof app.syncFirebaseStudentProfile === 'function') {
            try {
              await app.syncFirebaseStudentProfile({ name: app.profile.name, college: app.profile.college, batch: app.profile.batch, avatar: candidate });
            } catch (firebaseError) {
              // Firebase mirroring is secondary: the global leaderboard already has the shared Sheets avatar.
              console.warn('[Profile avatar] Medical Sheets avatar is synced; Firebase mirror did not update:', firebaseError);
            }
          }
          setAvatarStatus('Profile avatar saved. Checking the public leaderboard copy…');
          refreshAvatarViews();
          if (typeof window.MedGlobalLeague?.reload === 'function') {
            await window.MedGlobalLeague.reload();
          } else if (typeof app.loadLeaderboard === 'function') {
            await app.loadLeaderboard(true);
          }

          // Verify the separate public leaderboard endpoint, not just the private
          // updateProfile response. A stale Apps Script deployment can save the
          // profile yet still return blank/old avatars to every other viewer.
          const stripMarker = value => String(value || '').replace(/#mat-(?:default|custom)-avatar$/i, '');
          const expectedAvatar = stripMarker(serverAvatar);
          const ownId = String(app.authUser?.uid || app.profile?.userId || app.profile?.uid || '');
          let publicRow = null;
          if (ownId && typeof window.MedGlobalLeague?.verifyPublicAvatar === 'function') {
            // Fetch an authoritative, fresh All Time response that explicitly includes this user.
            publicRow = await window.MedGlobalLeague.verifyPublicAvatar(ownId);
          } else if (ownId && typeof window.MedGlobalLeague?.getCachedRows === 'function') {
            ['all-time', 'weekly', 'friends'].some(period => {
              const rows = window.MedGlobalLeague.getCachedRows(period);
              publicRow = (Array.isArray(rows) ? rows : []).find(row =>
                String(row?.userId || row?.uid || row?.playerId || row?.raw?.userId || '') === ownId
              ) || null;
              return !!publicRow;
            });
          }
          if (publicRow) {
            const raw = publicRow.raw || publicRow;
            const publicAvatar = stripMarker(raw.avatar || raw.Avatar || '');
            if (publicAvatar !== expectedAvatar) {
              setAvatarStatus('Profile API-তে avatar save হয়েছে, কিন্তু public leaderboard এখনো updated avatar দিচ্ছে না। Apps Script Web App-এর latest Medical_Admission_Tracker_Backend.gs version deploy করুন।');
              console.warn('[Profile avatar] Private profile updated, but public leaderboard avatar is stale/missing.', { expectedAvatar, publicAvatar });
              return;
            }
            setAvatarStatus('Global avatar synced and verified in the public leaderboard.');
          } else {
            setAvatarStatus('Avatar saved to your account. Public leaderboard response-এ আপনার row পাওয়া যায়নি, তাই অন্য viewer-এর display এখনো verify করা যায়নি।');
          }
        }).catch(error => {
          setAvatarStatus('Global avatar sync failed: ' + String(error?.message || error || 'Unknown API error').slice(0, 220));
          console.warn('[Profile avatar] Global server sync failed:', error);
        });
      } else if (avatarStatus) {
        avatarStatus.textContent = 'Avatar saved on this device, but global profile sync is not ready.';
      }
      return;
    }
    const avatarChoice = event.target.closest('[data-avatar-source]');
    if (!avatarChoice) return;
    const source = avatarChoice.dataset.avatarSource;
    const index = Number(avatarChoice.dataset.avatarIndex);
    let value = null;
    if (source === 'preset' && Number.isInteger(index) && index >= 0 && index < avatarChoices.length) {
      value = avatarChoices[index];
    } else if (source === 'uploaded') {
      const uploaded = readUploadedAvatars();
      if (Number.isInteger(index) && index >= 0 && index < uploaded.length) value = uploaded[index];
    }
    if (!value) return;
    pendingAvatarSource = value;
    renderAvatarPicker();
  });
  document.addEventListener('change', async event => {
    const input = event.target.closest('#profile-avatar-upload-input');
    if (!input) return;
    const files = Array.from(input.files || []);
    if (!files.length) return;
    const status = document.getElementById('profile-avatar-upload-status');
    const existing = readUploadedAvatars();
    if (files.length > maxUploadedAvatars - existing.length) {
      if (status) status.textContent = 'You can keep up to ' + maxUploadedAvatars + ' uploaded avatars. Remove an old upload or choose fewer files.';
      input.value = '';
      return;
    }
    if (status) status.textContent = 'Processing avatar images…';
    try {
      const added = [];
      for (const file of files) {
        const source = await processUploadedAvatar(file);
        if (!existing.includes(source) && !added.includes(source)) added.push(source);
      }
      if (!added.length) throw new Error('Those avatars are already in your uploaded collection.');
      const combined = existing.concat(added);
      localStorage.setItem(uploadedAvatarKey(), JSON.stringify(combined));
      pendingAvatarSource = added[0];
      avatarPickerExpanded = true;
      renderAvatarPicker();
      const newStatus = document.getElementById('profile-avatar-upload-status');
      if (newStatus) newStatus.textContent = added.length + ' avatar image(s) added. Compare the preview, then confirm to apply it.';
    } catch (error) {
      const errorStatus = document.getElementById('profile-avatar-upload-status');
      if (errorStatus) errorStatus.textContent = error?.message || 'The avatar upload failed. Try a smaller supported image.';
    }
    input.value = '';
  });
  document.addEventListener('student-progress-updated', () => {
    renderAvatarPicker();
    ensureSharedAvatarExists().catch(() => {});
  });
  document.addEventListener('student-auth-state-changed', () => {
    renderAvatarPicker();
    ensureSharedAvatarExists().catch(() => {});
  });
  document.addEventListener('student-auth-state-resolved', () => {
    renderAvatarPicker();
    ensureSharedAvatarExists().catch(() => {});
  });
  document.addEventListener('student-profile-loaded', () => {
    renderAvatarPicker();
    ensureSharedAvatarExists().catch(() => {});
  });
  window.addEventListener('load', () => {
    renderAvatarPicker();
    ensureSharedAvatarExists().catch(() => {});
  });
  const originalSetAuthStateForAvatar = app.setAuthState.bind(app);
  app.setAuthState = function(user, ...args) {
    const result = originalSetAuthStateForAvatar(user, ...args);
    avatarPickerExpanded = false;
    pendingAvatarSource = null;
    renderAvatarPicker();
    return result;
  };
  const originalShowViewForAvatar = app.showView.bind(app);
  app.showView = function(viewName, force = false) {
    if (viewName !== 'profile') {
      avatarPickerExpanded = false;
      pendingAvatarSource = null;
    }
    const result = originalShowViewForAvatar(viewName, force);
    if (viewName === 'profile') renderAvatarPicker();
    return result;
  };
})();


/* Final checklist additions: settings, rank tiers, profile actions, and footer support links. */
(() => {
  'use strict';
  const app = window.app;
  if (!app || app.__studentChecklistExtras) return;
  app.__studentChecklistExtras = true;
  const safeRead = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (_) { return fallback; } };
  const progressKey = () => 'med_account_progress_v1_' + (app.authUser?.uid || 'guest');
  const readProgress = () => safeRead(progressKey(), { rankPoints: 0, xp: 0, completedExams: 0, rewarded: [] });
  // Rank-up PB costs are half the previous amounts: 200*n PB, with 20% extra after the first step.
  const roundRankCost = value => Math.max(5, Math.round(Number(value || 0) / 5) * 5);
  const rankUpgradeCost = step => {
    const n = Math.max(1, Math.floor(Number(step) || 1));
    const base = n * 200;
    return roundRankCost(n === 1 ? base : base * 1.2);
  };
  const completedRankUps = points => {
    const value = Math.max(0, Number(points) || 0);
    let total = 0, count = 0;
    while (count < 50) {
      const nextCost = rankUpgradeCost(count + 1);
      if (value < total + nextCost) break;
      total += nextCost;
      count++;
    }
    return count;
  };
  const rankFor = points => {
    const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Master', 'Grandmaster', 'Legend', 'Mythic'];
    const roman = ['V', 'IV', 'III', 'II', 'I'];
    const rankIndex = completedRankUps(points);
    return rankIndex >= 50 ? 'Immortal' : tiers[Math.floor(rankIndex / 5)] + ' ' + roman[rankIndex % 5];
  };
  function ensureStudentSettings() {
    // App-wide preferences now live exclusively under the sidebar's App Settings.
    const root = document.getElementById('view-profile');
    const oldPanel = root && root.querySelector('#student-preferences-panel');
    if (oldPanel) oldPanel.remove();
  }
  function ensureProfileRank() {
    const root = document.getElementById('view-profile');
    if (!root) return;
    let card = root.querySelector('#profile-rank-card');
    if (!card) {
      card = document.createElement('section');
      card.id = 'profile-rank-card';
      card.className = 'enhanced-panel';
      const hero = root.querySelector('.profile-hero');
      if (hero) hero.insertAdjacentElement('afterend', card);
      else root.prepend(card);
    }
    const progress = readProgress();
    const xp = Math.max(0, Number(progress.xp ?? progress.performanceBonus) || 0);
    const levelState = typeof app.getPerformanceLevelProgress === 'function'
      ? app.getPerformanceLevelProgress(xp)
      : { level: 1, toNext: Math.max(0, 500 - xp), percent: Math.min(100, Math.round(xp / 500 * 100)) };
    card.innerHTML = '<h3>Rank & Achievements</h3><div class="enhanced-actions"><span class="enhanced-status-pill enhanced-status-reviewed">' + rankFor(Math.max(0, Number(progress.rankPoints) || 0)) + '</span><span class="enhanced-status-pill">' + Math.max(0, Number(progress.rankPoints) || 0).toLocaleString() + ' RP</span><span class="enhanced-status-pill">Account Level ' + levelState.level + '</span><span class="enhanced-status-pill">🏆 ' + Math.floor((Number(progress.completedExams) || 0) / 10) + ' trophies</span></div><p class="enhanced-empty">' + Math.max(0, Number(progress.pendingPB) || 0).toLocaleString() + ' pending PB · ' + xp.toLocaleString() + ' XP · ' + levelState.toNext.toLocaleString() + ' XP to next level · ' + levelState.percent + '% level progress · ' + (Number(progress.completedExams) || 0) + ' completed exams</p>';
  }
  function ensureLogoutState() {
    const root = document.getElementById('view-profile');
    if (!root) return;
    const target = root.querySelector('.auth-btn-target');
    if (!target) return;
    const loggedIn = Boolean(app.authUser?.uid);
    target.innerHTML = loggedIn
      ? '<button type="button" id="profile-logout-action" class="ghost-btn">Log Out</button>'
      : '<button type="button" id="profile-login-action" class="ghost-btn">Log In / Sign up</button>';
    const logout = target.querySelector('#profile-logout-action');
    if (logout) logout.onclick = () => { if (typeof window.handleLogout === 'function') window.handleLogout(); };
    const login = target.querySelector('#profile-login-action');
    if (login) login.onclick = () => { if (typeof window.redirectToLogin === 'function') window.redirectToLogin(); };
  }
  function renderChecklistExtras() {
    ensureStudentSettings();
    ensureProfileRank();
    ensureLogoutState();
  }
  const oldShowView = app.showView.bind(app);
  app.showView = function(name, force) {
    const result = oldShowView(name, force);
    if (name === 'profile') renderChecklistExtras();
    return result;
  };
  document.addEventListener('student-progress-updated', renderChecklistExtras);
  window.addEventListener('load', renderChecklistExtras);
})();


/* Exam focus mode + last-10%-of-time warning.
   Installed after the main app is initialized; does not replace the exam engine. */
(() => {
  'use strict';
  const app = window.app;
  if (!app || app.__examFocusHardeningInstalled) return;
  app.__examFocusHardeningInstalled = true;

  const style = document.createElement('style');
  style.id = 'exam-focus-hardening-styles';
  style.textContent = `
    body.exam-focus-mode #app-sidebar,
    body.exam-focus-mode #sidebar-overlay,
    body.exam-focus-mode #sidebar-toggle,
    body.exam-focus-mode #theme-toggle,
    body.exam-focus-mode .ai-float-btn,
    body.exam-focus-mode .student-profile-top-shortcut { display: none !important; }
    body.exam-focus-mode main {
      width: 100% !important;
      max-width: none !important;
      padding: 12px !important;
      margin: 0 auto !important;
    }
    body.exam-focus-mode main > .view-section:not(#view-exam) { display: none !important; }
    body.exam-focus-mode #view-exam { display: block !important; }
    body.exam-focus-mode #view-exam > .sticky { top: 8px !important; }
    #timer-box.exam-time-warning {
      color: #fff7f7 !important;
      background: #991b1b !important;
      border-color: #ef4444 !important;
      box-shadow: 0 0 0 2px rgba(239,68,68,.18), 0 0 20px rgba(239,68,68,.28);
      animation: examTimerUrgentPulse 1.05s ease-in-out infinite;
    }
    #timer-box.exam-time-warning #exam-timer,
    #timer-box.exam-time-warning > i { color: #fff !important; }
    #timer-warning-label {
      display: inline-flex;
      align-items: center;
      gap: .35rem;
      margin-inline-start: .65rem;
      padding: .25rem .5rem;
      border-radius: .5rem;
      background: rgba(255,255,255,.16);
      color: #fff;
      font: 700 .72rem/1.2 system-ui, sans-serif;
      white-space: nowrap;
    }
    @keyframes examTimerUrgentPulse {
      0%, 100% { box-shadow: 0 0 0 2px rgba(239,68,68,.16), 0 0 12px rgba(239,68,68,.22); }
      50% { box-shadow: 0 0 0 4px rgba(239,68,68,.28), 0 0 24px rgba(239,68,68,.42); }
    }
    @media (prefers-reduced-motion: reduce) {
      #timer-box.exam-time-warning { animation: none !important; }
    }
    @media (max-width: 640px) {
      body.exam-focus-mode main { padding: 8px !important; }
      #timer-warning-label { font-size: .65rem; padding: .2rem .35rem; }
    }
  `;
  document.head.appendChild(style);

  let warningInterval = null;
  const timerBox = () => document.getElementById('timer-box');
  function ensureWarningLabel() {
    const box = timerBox();
    if (!box || document.getElementById('timer-warning-label')) return;
    const label = document.createElement('span');
    label.id = 'timer-warning-label';
    label.setAttribute('role', 'status');
    label.setAttribute('aria-live', 'polite');
    label.hidden = true;
    label.textContent = '⚠ শেষ ১০% সময়!';
    box.appendChild(label);
  }

  function syncFocusState() {
    const examView = document.getElementById('view-exam');
    const active = Boolean(app.examActive && !app.examState?.submitted && examView && !examView.classList.contains('hidden'));
    document.body.classList.toggle('exam-focus-mode', active);
    if (!active) clearWarningInterval();
    return active;
  }

  function clearWarningInterval() {
    if (warningInterval !== null) {
      clearInterval(warningInterval);
      warningInterval = null;
    }
    const box = timerBox();
    const label = document.getElementById('timer-warning-label');
    if (box) box.classList.remove('exam-time-warning');
    if (label) label.hidden = true;
  }

  function updateTimeWarning() {
    const state = app.examState;
    const box = timerBox();
    if (!box || !state || !state.startedAt || !state.deadlineAt || state.submitted) {
      clearWarningInterval();
      return;
    }
    ensureWarningLabel();
    const totalSeconds = Math.max(1, Math.ceil((state.deadlineAt - state.startedAt) / 1000));
    const remaining = Math.max(0, Number(state.timerSeconds) || 0);
    const threshold = Math.max(1, Math.ceil(totalSeconds * 0.10));
    const urgent = remaining > 0 && remaining <= threshold;
    box.classList.toggle('exam-time-warning', urgent);
    const label = document.getElementById('timer-warning-label');
    if (label) label.hidden = !urgent;
  }

  const originalShowView = app.showView.bind(app);
  app.showView = function(viewName, ...args) {
    const result = originalShowView(viewName, ...args);
    // The view DOM is updated synchronously. Checking the actual visible view
    // also handles a navigation attempt cancelled by the existing confirmation.
    syncFocusState();
    return result;
  };

  const originalStartTimer = app.startTimer.bind(app);
  app.startTimer = function(...args) {
    const result = originalStartTimer(...args);
    clearWarningInterval();
    ensureWarningLabel();
    updateTimeWarning();
    warningInterval = setInterval(updateTimeWarning, 250);
    return result;
  };

  const originalSubmitExam = app.submitExam.bind(app);
  app.submitExam = function(...args) {
    const result = originalSubmitExam(...args);
    clearWarningInterval();
    syncFocusState();
    return result;
  };

  // Rebind account-scoped UI whenever Firebase changes the active user.
  if (typeof app.setAuthState === 'function') {
    const originalSetAuthState = app.setAuthState.bind(app);
    app.setAuthState = function(user, ...args) {
      const result = originalSetAuthState(user, ...args);
      window.dispatchEvent(new CustomEvent('student-auth-state-changed', {
        detail: { uid: user?.uid || null }
      }));
      return result;
    };
  }

  // Covers initialization when a page is restored from browser history.
  syncFocusState();
})();


/* Final rank, Practice setup and account-state fixes. Existing exam and quiz handlers stay in place. */
(() => {
'use strict';
const app=window.app;if(!app||app.__comprehensiveRequirementsInstalled)return;app.__comprehensiveRequirementsInstalled=true;
const tiers=['Bronze','Silver','Gold','Platinum','Emerald','Diamond','Master','Grandmaster','Legend','Mythic'],roman=['V','IV','III','II','I'];
const pkey=()=>'med_account_progress_v1_'+(app.authUser?.uid||'guest');
const progress=()=>{try{return typeof app.getAccountProgress==='function'?app.getAccountProgress():(JSON.parse(localStorage.getItem(pkey())||'{}')||{})}catch(_){return{}}};
const rankUpgradeCost=step=>{const n=Math.max(1,Math.floor(Number(step)||1)),base=n*200;return Math.max(5,Math.round((n===1?base:base*1.2)/5)*5)};
const rank=points=>{const value=Math.max(0,Number(points)||0);let n=0,spent=0,required=rankUpgradeCost(1);while(n<50&&value>=spent+required){spent+=required;n++;required=rankUpgradeCost(n+1)}if(n>=50)return{name:'Immortal',tier:'immortal',index:51,step:1,points:value,remaining:0,progress:100};const within=value-spent;return{name:tiers[Math.floor(n/5)]+' '+roman[n%5],tier:tiers[Math.floor(n/5)].toLowerCase(),index:n+1,step:n%5+1,points:value,remaining:Math.max(0,required-within),progress:Math.min(100,within/required*100)}};
const qkey=q=>String(q?.id||[q?.subject,q?.year,q?.question||q?.questionText].join('|')).toLowerCase().replace(/\s+/g,' ').trim();
const hkey=()=>'med_review_history_v2_'+(app.authUser?.uid||'guest');
const readHistory=()=>{try{return JSON.parse(localStorage.getItem(hkey())||'{}')||{}}catch(_){return{}}};
const record=q=>readHistory()[qkey(q)]||{};
const badge=(points,large=false)=>{const r=rank(points),symbols={bronze:'✦',silver:'✥',gold:'✶',platinum:'❖',emerald:'❋',diamond:'◈',master:'✹',grandmaster:'♛',legend:'☼',mythic:'✧',immortal:'🔥'},romanLevel=roman[r.step-1]||'V';return '<span class="tracker-rank-badge rank-tier-'+r.tier+(large?' rank-badge-large':'')+'" aria-label="'+r.name+' rank badge"><span class="tracker-rank-emblem" aria-hidden="true">'+symbols[r.tier]+'</span><span class="tracker-rank-name"><span class="tracker-rank-tier">'+r.tier.toUpperCase()+'</span><span class="tracker-rank-level">'+romanLevel+'</span></span></span>'};
const style=document.createElement('style');style.id='tracker-rank-badge-styles';style.textContent=".tracker-rank-badge{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border:1px solid #ffffff55;border-radius:8px;color:white;font-size:11px;font-weight:900;white-space:nowrap;box-shadow:0 3px 8px #0002}.rank-tier-bronze{background:linear-gradient(135deg,#b8793f,#70421f);border-radius:4px 10px}.rank-tier-silver{background:linear-gradient(135deg,#f1f5f9,#64748b);color:#172033;clip-path:polygon(0 0,100% 0,100% 70%,50% 100%,0 70%);padding:7px 12px}.rank-tier-gold{background:linear-gradient(135deg,#fff0a6,#b77908,#facc15);color:#4a2b05;clip-path:polygon(0 0,100% 0,100% 70%,50% 100%,0 70%);padding:7px 12px}.rank-tier-platinum{background:linear-gradient(135deg,#93c5fd,#1d4ed8,#172554);clip-path:polygon(0 0,100% 0,100% 70%,50% 100%,0 70%);padding:7px 12px}.rank-tier-master{background:linear-gradient(135deg,#d8b4fe,#7e22ce,#3b0764);clip-path:polygon(0 0,100% 0,100% 70%,50% 100%,0 70%);padding:7px 12px}.rank-tier-pro{background:linear-gradient(135deg,#fca5a5,#dc2626,#581c87);border-radius:18px 5px}.rank-tier-pro:before,.rank-tier-pro:after{content:'✦';color:#fef08a}.tracker-rank-marks{font-size:9px;letter-spacing:1px;line-height:1}.rank-badge-large{font-size:14px;padding:10px 15px}#profile-rank-card .rank-track{height:9px;background:var(--line,#dbe4ee);border-radius:99px;overflow:hidden;margin:10px 0}#profile-rank-card .rank-track span{display:block;height:100%;background:linear-gradient(90deg,#10b981,#0ea5e9)}#profile-rank-card .rank-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}#profile-rank-card .rank-stat{padding:10px;border:1px solid var(--line,#dbe4ee);border-radius:12px}#profile-rank-card .rank-stat small{display:block;color:var(--muted,#64748b);font-size:11px}#profile-rank-card .rank-stat strong{font-size:19px;font-weight:900}.practice-exam-setup{padding:17px;border:1px solid var(--line,#dbe4ee);border-radius:20px;background:var(--surface,#fff);box-shadow:0 8px 22px #0f172a08}.practice-type-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.practice-type-btn,.practice-count-btn{padding:10px 7px;border:1px solid var(--line,#cbd5e1);border-radius:11px;font-size:12px;font-weight:850;background:var(--surface,#fff);color:var(--text,#1e293b)}.practice-type-btn.active,.practice-count-btn.active{border-color:#059669;background:#10b98120;color:#047857;box-shadow:inset 0 0 0 1px #059669}.practice-count-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:8px}.practice-setup-footer{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:12px;font-size:12px;font-weight:800;color:var(--muted,#64748b)}@media(max-width:640px){.practice-type-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#profile-rank-card .rank-stats{gap:5px}#profile-rank-card .rank-stat{padding:7px}#profile-rank-card .rank-stat strong{font-size:16px}}";style.textContent += `
.tracker-rank-badge{position:relative;display:inline-flex;align-items:center;gap:7px;min-height:32px;padding:5px 10px 5px 6px;border:1px solid #ffffffaa;border-radius:11px 5px 11px 5px;overflow:hidden;isolation:isolate;box-shadow:inset 0 1px 0 #ffffffa3,inset 0 -2px 0 #0003,0 5px 13px #0002;letter-spacing:.035em}
.tracker-rank-badge:after{content:"";position:absolute;inset:1px 1px auto;height:42%;background:linear-gradient(180deg,#ffffff44,transparent);pointer-events:none;z-index:-1}
.tracker-rank-emblem{display:grid;place-items:center;flex:0 0 25px;width:25px;height:25px;font-size:16px;line-height:1;color:#fff8e7;border:1px solid #ffffff88;box-shadow:inset 0 1px 2px #fff8,0 1px 3px #0003}
.tracker-rank-name{display:flex;align-items:center;gap:6px}.tracker-rank-tier{font-size:10px;font-weight:950;letter-spacing:.09em}
.tracker-rank-level{display:grid;place-items:center;min-width:18px;height:19px;padding:0 4px;font-size:10px;font-weight:950;border:1px solid #ffffffa3;border-radius:5px;background:#0002;box-shadow:inset 0 1px 0 #fff5}
.rank-tier-bronze{color:#fff2dd;border:1px solid #f1c38a;background:linear-gradient(135deg,#f0c48c 0%,#b8783b 22%,#764323 57%,#4b281b 100%);border-radius:9px 4px 9px 4px;box-shadow:inset 0 1px 0 #fff8d6,inset 0 -3px 0 #35180f,0 5px 13px #5b2b1640}
.rank-tier-bronze .tracker-rank-emblem{background:linear-gradient(145deg,#f8d7a0,#a85f2c 55%,#67391f);clip-path:polygon(50% 0,62% 14%,82% 12%,87% 32%,100% 50%,86% 66%,82% 87%,62% 86%,50% 100%,38% 86%,18% 87%,14% 66%,0 50%,14% 32%,18% 12%,38% 14%);filter:drop-shadow(0 1px 1px #32190f)}
.rank-tier-silver{color:#f8fbff;border:1px solid #f4f8ff;background:linear-gradient(135deg,#f8fbff 0%,#b8c8db 18%,#70849d 50%,#34475f 100%);border-radius:5px 12px 5px 12px;box-shadow:inset 0 1px 0 #fff,inset 0 -3px 0 #26364b,0 5px 13px #25384c40}
.rank-tier-silver .tracker-rank-emblem{color:#fff;background:linear-gradient(145deg,#fff,#b4c7df 45%,#526b88);clip-path:polygon(50% 0,62% 15%,83% 10%,85% 31%,100% 50%,85% 69%,83% 90%,62% 85%,50% 100%,38% 85%,17% 90%,15% 69%,0 50%,15% 31%,17% 10%,38% 15%);filter:drop-shadow(0 1px 1px #26364b)}
.rank-tier-gold .tracker-rank-emblem{background:linear-gradient(145deg,#fff2b7,#daa520,#80520b);clip-path:polygon(50% 0,63% 25%,91% 12%,83% 43%,100% 59%,69% 66%,65% 100%,47% 77%,22% 93%,27% 63%,0 48%,31% 39%)}
.rank-tier-platinum .tracker-rank-emblem{background:linear-gradient(145deg,#e0f2fe,#60a5fa,#1e3a8a);clip-path:polygon(50% 0,83% 16%,100% 50%,83% 84%,50% 100%,17% 84%,0 50%,17% 16%)}
.rank-tier-emerald{color:#dcfce7;background:linear-gradient(135deg,#a7f3d0,#047857 48%,#064e3b);border:1px solid #6ee7b7;border-radius:15px 4px 15px 4px}
.rank-tier-emerald .tracker-rank-emblem{background:linear-gradient(145deg,#d1fae5,#34d399,#065f46);clip-path:polygon(50% 0,61% 24%,89% 10%,78% 42%,100% 57%,71% 68%,70% 100%,50% 81%,30% 100%,29% 68%,0 57%,22% 42%,11% 10%,39% 24%)}
.rank-tier-diamond{color:#f5f3ff;background:linear-gradient(135deg,#ede9fe,#7c3aed 48%,#312e81);border:1px solid #c4b5fd;border-radius:5px 13px 5px 13px}
.rank-tier-diamond .tracker-rank-emblem{background:linear-gradient(145deg,#fff,#c4b5fd,#5b21b6);clip-path:polygon(50% 0,91% 24%,78% 78%,50% 100%,22% 78%,9% 24%)}
.rank-tier-grandmaster{color:#ffedd5;background:linear-gradient(135deg,#fed7aa,#ea580c 48%,#7c2d12);border:1px solid #fdba74;border-radius:14px}
.rank-tier-grandmaster .tracker-rank-emblem{background:linear-gradient(145deg,#ffedd5,#f97316,#7c2d12);clip-path:polygon(0 18%,35% 30%,50% 0,65% 30%,100% 18%,82% 62%,65% 57%,50% 100%,35% 57%,18% 62%)}
.rank-tier-legend{color:#fef9c3;background:linear-gradient(135deg,#fef08a,#ca8a04 48%,#713f12);border:1px solid #fde68a;border-radius:18px 4px 18px 4px}
.rank-tier-legend .tracker-rank-emblem{background:linear-gradient(145deg,#fef9c3,#facc15,#854d0e);clip-path:polygon(50% 0,60% 22%,84% 8%,78% 35%,100% 50%,78% 65%,84% 92%,60% 78%,50% 100%,40% 78%,16% 92%,22% 65%,0 50%,22% 35%,16% 8%,40% 22%)}
.rank-tier-mythic{color:#fae8ff;background:linear-gradient(135deg,#f5d0fe,#a21caf 48%,#581c87);border:1px solid #f0abfc;border-radius:6px 18px 6px 18px}
.rank-tier-mythic .tracker-rank-emblem{background:linear-gradient(145deg,#fae8ff,#e879f9,#701a75);clip-path:polygon(50% 0,64% 24%,91% 16%,80% 42%,100% 58%,71% 69%,65% 100%,50% 80%,35% 100%,29% 69%,0 58%,20% 42%,9% 16%,36% 24%)}
.rank-tier-immortal{color:#fff1f2;background:linear-gradient(135deg,#fecdd3,#e11d48 44%,#4c0519);border:1px solid #fb7185;border-radius:12px 12px 4px 4px;box-shadow:inset 0 1px 0 #fff,inset 0 -4px 0 #4c0519,0 7px 18px #9f123940}
.rank-tier-immortal .tracker-rank-emblem{background:linear-gradient(145deg,#fff1f2,#fb7185,#4c0519);clip-path:polygon(50% 0,61% 22%,86% 5%,80% 34%,100% 50%,80% 66%,86% 95%,61% 78%,50% 100%,39% 78%,14% 95%,20% 66%,0 50%,20% 34%,14% 5%,39% 22%)}
.rank-tier-master .tracker-rank-emblem{background:linear-gradient(145deg,#f3e8ff,#c084fc,#581c87);clip-path:polygon(50% 0,62% 27%,90% 15%,78% 45%,100% 57%,73% 69%,75% 98%,50% 80%,25% 98%,27% 69%,0 57%,22% 45%,10% 15%,38% 27%)}
.rank-tier-pro .tracker-rank-emblem{background:linear-gradient(145deg,#fee2e2,#f87171,#701a75);clip-path:polygon(50% 0,61% 18%,82% 8%,87% 32%,100% 50%,87% 68%,82% 92%,61% 82%,50% 100%,39% 82%,18% 92%,13% 68%,0 50%,13% 32%,18% 8%,39% 18%)}
.rank-badge-large .tracker-rank-emblem{flex-basis:32px;width:32px;height:32px;font-size:20px}.rank-badge-large .tracker-rank-tier{font-size:12px}.rank-badge-large .tracker-rank-level{min-width:22px;height:23px;font-size:12px}
`;document.head.appendChild(style);
function renderRankCard(){
  const root=document.getElementById('view-profile'); if(!root)return;
  let card=document.getElementById('profile-rank-card');
  if(!card){card=document.createElement('section');card.id='profile-rank-card';card.className='enhanced-panel';const hero=root.querySelector('.profile-hero');if(hero)hero.insertAdjacentElement('afterend',card);else root.prepend(card);}
  const profile=app.profile||{};
  let local={};
  try{local=JSON.parse(localStorage.getItem('med_account_progress_v1_'+(app.authUser?.uid||'guest'))||'{}')||{}}catch(_){}
  const xp=Math.max(0,Number(profile.xp??local.xp??local.performanceBonus)||0);
  const rp=Math.max(0,Number(profile.rankPoints??local.rankPoints)||0);
  const totalRP=Math.max(rp,Number(profile.totalRP??rp)||0);
  const levelState=typeof app.getPerformanceLevelProgress==='function'?app.getPerformanceLevelProgress(xp):{level:Number(profile.level)||1,toNext:Math.max(0,500-xp),percent:Math.min(100,Math.round(xp/500*100))};
  const ranks=window.MedGlobalLeague&&typeof window.MedGlobalLeague.getRanks==='function'?window.MedGlobalLeague.getRanks():[];
  const rankName=String(profile.rank||(ranks[0]||'Bronze V'));
  const rankIndex=ranks.indexOf(rankName);
  const rankPercent=Math.max(0,Math.min(100,Math.round(rp/300*100)));
  const completedExams=Math.max(0,Number(local.completedExams)||0);
  const esc=value=>app.escapeHtml?app.escapeHtml(value):String(value??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  card.innerHTML='<h3>Medical Rank &amp; Achievements</h3><div class="enhanced-actions" style="margin-top:12px"><span class="enhanced-status-pill enhanced-status-reviewed">'+esc(rankName)+'</span><span class="enhanced-status-pill">'+rp.toLocaleString()+' current RP</span><span class="enhanced-status-pill">'+totalRP.toLocaleString()+' total RP</span><span class="enhanced-status-pill">Account Level '+Math.max(1,Number(profile.level)||levelState.level)+'</span><span class="enhanced-status-pill">🏆 '+Math.floor(completedExams/10)+' trophies</span></div><div class="rank-track" role="progressbar" aria-valuemin="0" aria-valuemax="300" aria-valuenow="'+Math.min(rp,300)+'"><span style="width:'+rankPercent+'%"></span></div><p class="enhanced-empty">'+(rankIndex>=0&&rankIndex===ranks.length-1?'Highest rank reached · Immortal':(300-rp).toLocaleString()+' RP to next sub-rank'+(rankIndex>=0&&ranks[rankIndex+1]?' · Next: '+esc(ranks[rankIndex+1]):''))+'</p><div class="rank-stats"><div class="rank-stat"><small>Medical XP</small><strong>'+xp.toLocaleString()+'</strong><small>'+levelState.toNext.toLocaleString()+' XP to next level</small></div><div class="rank-stat"><small>Completed Exams</small><strong>'+completedExams.toLocaleString()+'</strong><small>Learning activity history</small></div><div class="rank-stat"><small>Level Progress</small><strong>'+levelState.percent+'%</strong><small>XP-based progression</small></div></div><div class="rank-track"><span style="width:'+levelState.percent+'%"></span></div><small>Medical XP and RP are synced from this website&#39;s own API.</small>';
  const live=document.getElementById('profile-live-rank'),best=document.getElementById('profile-best-rank');
  if(live)live.textContent=rankName;if(best)best.textContent=rankName;
}
function renderSidebarAuth(){const b=document.getElementById('sidebar-auth-action');if(!b)return;const logged=Boolean(app.authUser?.uid);b.classList.toggle('logout-action',logged);b.classList.toggle('login-action',!logged);b.setAttribute('aria-label',logged?'Log Out':'Log In / Sign Up');b.title=logged?(app.authUser.email||'Log Out'):'Log In / Sign Up';b.innerHTML=logged?'<i class="fa-solid fa-right-from-bracket"></i><span>Log Out</span>':'<i class="fa-solid fa-right-to-bracket"></i><span>Log In / Sign Up</span>';b.onclick=logged?()=>{if(typeof app.logout==='function')app.logout();else if(window.handleLogout)window.handleLogout()}:()=>{if(window.redirectToLogin)window.redirectToLogin()}}
function setupPracticeUI(){
  const view=document.getElementById('view-practice');
  if(!view)return;
  let browser=document.getElementById('practice-browser');
  if(!browser){
    browser=document.createElement('div');
    browser.id='practice-browser';
    browser.className='practice-browser';
    view.appendChild(browser);
  }
  let quiz=document.getElementById('practice-quiz-view');
  if(!quiz){
    quiz=document.createElement('section');
    quiz.id='practice-quiz-view';
    quiz.className='enhanced-panel practice-quiz-view';
    quiz.hidden=true;
    quiz.innerHTML='<div class="practice-quiz-top"><strong>Practice Session</strong><span class="practice-quiz-timer" id="practice-timer">10:00</span></div><div class="practice-quiz-status"><span id="practice-progress">Question 1</span><span>Score: <strong id="practice-score">0</strong></span></div><div id="practice-question" class="practice-question"></div><div class="practice-quiz-actions"><button type="button" id="practice-prev-button" class="enhanced-small-btn">← Previous</button><button type="button" id="practice-next-button" class="practice-start-btn">Next →</button><button type="button" id="practice-finish-button" class="enhanced-small-btn">Finish Practice</button></div>';
    view.appendChild(quiz);
    quiz.querySelector('#practice-prev-button').onclick=()=>app.prevPractice();
    quiz.querySelector('#practice-next-button').onclick=()=>app.nextPractice();
    quiz.querySelector('#practice-finish-button').onclick=()=>app.finishPractice(false);
  }
  if(!document.getElementById('practice-exam-setup')){
    const panel=document.createElement('section');
    panel.id='practice-exam-setup';
    panel.className='practice-exam-setup';
    panel.innerHTML='<h3 style="font-weight:900;font-size:1.1rem">Practice Exam Setup</h3><p style="font-size:.82rem;color:var(--muted,#64748b);margin:4px 0 14px">Choose the question pool and count before starting.</p><label style="font-size:.85rem;font-weight:900">Exam Type</label><div class="practice-type-grid" role="group"><button type="button" class="practice-type-btn active" data-practice-type="all" aria-pressed="true">All Questions</button><button type="button" class="practice-type-btn" data-practice-type="reviewed" aria-pressed="false">Reviewed</button><button type="button" class="practice-type-btn" data-practice-type="wrong" aria-pressed="false">Wrong Answer</button><button type="button" class="practice-type-btn" data-practice-type="previous" aria-pressed="false">Previous Year</button></div><label style="display:block;font-size:.85rem;font-weight:900;margin-top:14px">Question Count</label><div class="practice-count-grid">'+[20,30,50,75,100].map(n=>'<button type="button" class="practice-count-btn '+(n===20?'active':'')+'" data-practice-count="'+n+'" aria-pressed="'+(n===20?'true':'false')+'">'+n+'</button>').join('')+'</div><div class="practice-setup-footer"><span id="practice-auto-time">20 questions · 10 minutes automatically</span><span id="practice-available-count">Loading questions…</span></div><div class="practice-start-row"><button type="button" id="practice-start-button" class="practice-start-btn"><i class="fa-solid fa-play" aria-hidden="true"></i> Start Practice</button></div>';
    browser.appendChild(panel);
    panel.addEventListener('click',e=>{
      const typeButton=e.target.closest('[data-practice-type]');
      const countButton=e.target.closest('[data-practice-count]');
      if(typeButton)panel.querySelectorAll('[data-practice-type]').forEach(b=>{b.classList.toggle('active',b===typeButton);b.setAttribute('aria-pressed',String(b===typeButton))});
      if(countButton)panel.querySelectorAll('[data-practice-count]').forEach(b=>{b.classList.toggle('active',b===countButton);b.setAttribute('aria-pressed',String(b===countButton))});
      if(typeButton||countButton)updatePracticeUI();
    });
    panel.querySelector('#practice-start-button').onclick=()=>app.startPracticeFromBrowser();
  }
  const style=document.getElementById('practice-restored-controls-style');
  if(!style){
    const st=document.createElement('style');st.id='practice-restored-controls-style';
    st.textContent='.practice-start-row{display:flex;justify-content:flex-end;margin-top:16px}.practice-start-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:11px 20px;border:0;border-radius:12px;background:linear-gradient(135deg,#059669,#0284c7);color:#fff;font-weight:900;box-shadow:0 7px 18px #05966930;cursor:pointer}.practice-start-btn:hover{filter:brightness(1.06)}.practice-start-btn:disabled{opacity:.5;cursor:not-allowed}.practice-quiz-top,.practice-quiz-status{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.practice-quiz-timer{font-weight:950;font-variant-numeric:tabular-nums;padding:6px 10px;border-radius:9px;background:rgba(16,185,129,.13);color:#059669}.practice-quiz-status{margin-top:10px;padding-bottom:10px;border-bottom:1px solid var(--line,#dbe4ee);font-size:12px;color:var(--muted,#64748b)}.practice-question{min-height:110px;padding:12px 0}.practice-quiz-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;border-top:1px solid var(--line,#dbe4ee);padding-top:12px}.practice-quiz-view[hidden],#practice-browser[hidden]{display:none!important}';
    document.head.appendChild(st);
  }
  updatePracticeUI();
}
const practiceType=()=>document.querySelector('#practice-exam-setup [data-practice-type].active')?.dataset.practiceType||'all',practiceCount=()=>Number(document.querySelector('#practice-exam-setup [data-practice-count].active')?.dataset.practiceCount||20);
function practicePool(){const qs=Array.isArray(app.questionBank)?app.questionBank:[],type=practiceType();if(type==='reviewed')return qs.filter(q=>Boolean(record(q).reviewed));if(type==='wrong')return qs.filter(q=>Boolean(record(q).wrong));if(type==='previous')return qs.filter(q=>Boolean(q.isPreviousYear)||(q.year&&!/^practice$/i.test(String(q.year))));return qs.slice()}
function updatePracticeUI(){const pool=practicePool(),count=Math.min(practiceCount(),pool.length),mins=Math.max(1,Math.round(count/2)),time=document.getElementById('practice-auto-time'),available=document.getElementById('practice-available-count');if(time)time.textContent=count+' questions · '+mins+' minutes automatically';if(available)available.textContent=pool.length+' matching questions'}
app.startPracticeFromBrowser=function(){
  if(!this.questionsLoaded||!this.questionBank.length){this.showDataError('প্রশ্ন ব্যাংক এখনো লোড হয়নি।');return}
  const pool=practicePool();
  if(!pool.length){alert(practiceType()==='reviewed'?'No Reviewed questions yet. Mark questions Reviewed in Question Bank.':practiceType()==='wrong'?'No Wrong Answer questions yet.':'No questions found for this Practice type.');return}
  const selected=pool.slice().sort(()=>Math.random()-.5).slice(0,Math.min(practiceCount(),pool.length));
  if(this.practiceTimerInterval){clearInterval(this.practiceTimerInterval);this.practiceTimerInterval=null}
  if(this.examState?.timerInterval){clearInterval(this.examState.timerInterval);this.examState.timerInterval=null}
  if(typeof this.shuffleQuestionsAndOptions!=='function'||typeof this.beginPreparedExam!=='function'){this.showDataError('Strict Practice exam চালু করা যাচ্ছে না। পেজটি refresh করে আবার চেষ্টা করুন।');return}
  this.preparedExam={
    questions:this.shuffleQuestionsAndOptions(selected,selected.length),
    mode:'practice',
    subject:'all',
    year:'all',
    durationMins:Math.max(1,Math.round(selected.length*0.5))
  };
  const badge=document.getElementById('exam-mode-badge');
  if(badge)badge.textContent='Practice Exam';
  const browser=document.getElementById('practice-browser');
  const quiz=document.getElementById('practice-quiz-view');
  if(browser)browser.hidden=true;
  if(quiz)quiz.hidden=true;
  // Reuse the real exam engine so the existing question palette, timer and strict full-screen layout stay in sync.
  this.beginPreparedExam();
  updatePracticeUI();
};
const oldAnswer=app.answerPractice.bind(app);app.answerPractice=function(index){const q=this.practiceSession?.questions?.[this.practiceSession?.index],result=oldAnswer(index);if(q&&index!==q.answer){const h=readHistory(),key=qkey(q);h[key]={...(h[key]||{key,question:q,reviewed:false}),question:q,wrong:true,updatedAt:Date.now()};localStorage.setItem(hkey(),JSON.stringify(h));updatePracticeUI()}return result};
const oldBrowser=app.renderPracticeBrowser?.bind(app);if(oldBrowser)app.renderPracticeBrowser=function(){const r=oldBrowser();setupPracticeUI();updatePracticeUI();return r};
const oldAuth=app.setAuthState.bind(app);app.setAuthState=function(user,...args){const r=oldAuth(user,...args);renderSidebarAuth();renderRankCard();setupPracticeUI();updatePracticeUI();return r};
const oldShow=app.showView.bind(app);app.showView=function(name,...args){const r=oldShow(name,...args);if(name==='profile')renderRankCard();if(name==='practice'){setupPracticeUI();updatePracticeUI()}renderSidebarAuth();return r};
const oldLeaderboard=app.renderLeaderboardRows?.bind(app);
const portraitChoices=Array.from({length:24},(_,i)=>'https://i.pravatar.cc/120?img='+(i+1));
function portraitDefaultForId(userId){
  const key=String(userId||'guest');let hash=2166136261;
  for(let i=0;i<key.length;i++)hash=Math.imul(hash^key.charCodeAt(i),16777619);
  return portraitChoices[(hash>>>0)%portraitChoices.length];
}
function portraitForRow(row){
  const rawAvatar=String(row?.avatar||row?.Avatar||'').trim();
  const rowId=String(row?.uid||row?.userId||row?.playerId||row?.id||row?.name||'guest');
  const usableAvatar=value=>{
    const avatar=String(value||'').trim().replace(/#mat-(?:default|custom)-avatar$/i,'');
    if(/^https:\/\//i.test(avatar)||/^data:image\/(?:webp|png);base64,[A-Za-z0-9+/=]+$/.test(avatar)||/^data:image\/svg\+xml;charset=utf-8,%3Csvg/i.test(avatar))return avatar;
    return '';
  };
  const mine=rowId===avatarAccountId();
  let manuallyChosen=false;
  if(mine){try{manuallyChosen=localStorage.getItem(manualAvatarKey())==='1';}catch(_){}}
  const rowAvatar=usableAvatar(rawAvatar);
  if(rowAvatar){
    if(rowAvatar===portraitChoices[0]&&!/#mat-(?:default|custom)-avatar$/i.test(rawAvatar)&&!manuallyChosen)return portraitDefaultForId(rowId);
    return rowAvatar;
  }
  if(mine){
    const profileAvatar=usableAvatar(app.profile?.avatar);
    if(profileAvatar && (profileAvatar!==portraitChoices[0]||manuallyChosen))return profileAvatar;
    try{
      const saved=localStorage.getItem(avatarKey())||localStorage.getItem(legacyAvatarKey());
      const uploaded=JSON.parse(localStorage.getItem(uploadedAvatarKey())||'[]');
      if((portraitChoices.includes(saved)&&(saved!==portraitChoices[0]||manuallyChosen))||(Array.isArray(uploaded)&&uploaded.includes(saved)&&usableAvatar(saved)))return usableAvatar(saved);
    }catch(_){}
  }
  return portraitDefaultForId(rowId);
}
function paintLeaderboardPeople(rows){
  const safe=(Array.isArray(rows)?rows:[]).slice();
  const rowById=new Map(safe.map(row=>[String(row?.userId||row?.uid||row?.playerId||''),row]).filter(entry=>entry[0]));
  const rowForElement=(element,index)=>{
    const id=String(element?.dataset?.uid||element?.dataset?.medPlayer||'');
    return (id&&rowById.get(id))||safe[index]||null;
  };
  document.querySelectorAll('#leaderboard-body .tracker-rank-badge,#leaderboard-podium .tracker-rank-badge,#leaderboard-me .tracker-rank-badge').forEach(el=>el.remove());
  Array.from(document.querySelectorAll('#leaderboard-body tr.leader-row')).forEach((tr,i)=>{
    const row=rowForElement(tr,i),avatar=tr.querySelector('.leader-avatar');if(!row||!avatar)return;
    const source=portraitForRow(row);
    let img=avatar.querySelector('img');
    if(!img){avatar.innerHTML='<img alt="Student avatar" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';img=avatar.querySelector('img')}
    if(img.src!==source)img.src=source;
    img.alt='Student avatar';
    avatar.setAttribute('aria-label','Student portrait');
  });
  Array.from(document.querySelectorAll('#leaderboard-podium .podium-card')).forEach((card,i)=>{
    const row=rowForElement(card,i),avatar=card.querySelector('.podium-avatar');if(!row||!avatar)return;
    const source=portraitForRow(row);
    let img=avatar.querySelector('img');
    if(!img){avatar.innerHTML='<img alt="Student avatar" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';img=avatar.querySelector('img')}
    if(img.src!==source)img.src=source;
    img.alt='Student avatar';
  });
  const me=document.getElementById('leaderboard-me'),mine=safe.find(row=>String(row?.userId||row?.uid||'')===String(app.authUser?.uid||''));
  if(me&&mine){let img=me.querySelector('.leaderboard-me-avatar');if(!img){img=document.createElement('img');img.className='leaderboard-me-avatar';img.alt='Your profile avatar';img.style.cssText='width:44px;height:44px;object-fit:cover;border-radius:50%;margin-inline-end:12px';me.prepend(img)}img.src=portraitForRow(mine)}
}
if(oldLeaderboard)app.renderLeaderboardRows=function(rows){
  const result=oldLeaderboard(rows);paintLeaderboardPeople(rows);
  const p=progress(),r=rank(p.rankPoints),live=document.getElementById('profile-live-rank'),best=document.getElementById('profile-best-rank');
  if(live)live.textContent=r.name;if(best)best.textContent=r.name;return result
};
document.addEventListener('student-progress-updated',()=>{renderRankCard();renderSidebarAuth();updatePracticeUI()});document.addEventListener('student-auth-state-changed',()=>{renderRankCard();renderSidebarAuth();updatePracticeUI()});window.addEventListener('load',()=>{renderRankCard();renderSidebarAuth();setupPracticeUI();updatePracticeUI()});renderRankCard();renderSidebarAuth();setupPracticeUI();
})();
