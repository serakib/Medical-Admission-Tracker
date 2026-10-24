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
    return `<article class="enhanced-question-card"><div class="enhanced-question-meta"><span>${escape(subjectLabel(q.subject))}</span><span>${escape(q.year || q.source || '')}</span><span>${escape(status)}</span></div><h4>${escape(q.question || q.questionText || '')}</h4><p><strong>আপনার উত্তর:</strong> ${escape(answerText)}</p><p><strong>সঠিক উত্তর:</strong> ${escape(answerLabel(q, correct))}</p>${q.explanation ? `<p class="enhanced-explanation">${escape(q.explanation)}</p>` : ''}<div class="enhanced-card-actions"><button type="button" class="enhanced-mark-reviewed" data-qkey="${escape(qKey(q))}">${getRecord(q).reviewed ? 'Reviewed ✓' : 'Mark Reviewed'}</button></div></article>`;
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
      .enhanced-bank-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:14px 0;padding:12px;border:1px solid var(--line,#dbe4ee);border-radius:15px;background:var(--surface,#fff)}
      .enhanced-bank-toolbar .enhanced-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
      .enhanced-bank-toolbar button{padding:7px 10px;border:1px solid var(--line,#cbd5e1);border-radius:9px;font-size:12px;font-weight:800;background:var(--surface,#fff);color:var(--text,#1e293b)}
      .enhanced-bank-toolbar .enhanced-practice-selected{background:#059669;color:#fff;border-color:#059669}
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
  function renderReviewPanel() {
    const practice = document.getElementById('view-practice');
    if (!practice) return;
    let panel = document.getElementById('enhanced-review-history');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'enhanced-review-history';
      panel.className = 'enhanced-panel';
      const browser = document.getElementById('practice-browser');
      (browser || practice).insertAdjacentElement(browser ? 'afterend' : 'beforeend', panel);
    }
    const entries = getReviewEntries('all');
    const reviewedCount = entries.filter(x => x.reviewed).length;
    const wrongCount = entries.filter(x => x.wrong).length;
    panel.innerHTML = `<h3>Practice Review History</h3><div class="enhanced-actions" role="group" aria-label="History actions"><button type="button" data-history-filter="all" class="active">All (${entries.length})</button><button type="button" data-history-filter="reviewed">Reviewed (${reviewedCount})</button><button type="button" data-history-filter="wrong">Wrong Answer (${wrongCount})</button><button type="button" id="enhanced-select-all">Select All</button><button type="button" id="enhanced-delete-selected">Delete Selection</button><button type="button" id="enhanced-requiz">Re-quiz Selected</button></div><div class="enhanced-actions" style="margin-top:8px"><label><input id="enhanced-select-all-check" type="checkbox"> All</label><label><input type="checkbox" id="enhanced-select-reviewed"> Reviewed</label><label><input type="checkbox" id="enhanced-select-wrong"> Wrong Answer</label></div><div id="enhanced-history-list" class="enhanced-question-list"></div>`;
    let activeFilter = 'all';
    const selected = new Set();
    const list = panel.querySelector('#enhanced-history-list');
    const renderList = () => {
      const filtered = getReviewEntries(activeFilter);
      list.innerHTML = filtered.length ? filtered.map(r => `<article class="enhanced-question-card"><label><input type="checkbox" class="enhanced-history-check" data-key="${escape(r.key)}" ${selected.has(r.key) ? 'checked' : ''}> Select</label><div class="enhanced-question-meta"><span>${escape(subjectLabel(r.question.subject))}</span><span>${r.reviewed ? 'Reviewed' : ''}${r.reviewed && r.wrong ? ' · ' : ''}${r.wrong ? 'Wrong Answer' : ''}</span></div><h4>${escape(r.question.question || '')}</h4><p><strong>সঠিক উত্তর:</strong> ${escape(answerLabel(r.question, correctIndex(r.question)))}</p></article>`).join('') : '<p class="enhanced-empty">এই বিভাগে কোনো history নেই।</p>';
    };
    panel.querySelectorAll('[data-history-filter]').forEach(btn => btn.addEventListener('click', () => {
      activeFilter = btn.dataset.historyFilter;
      panel.querySelectorAll('[data-history-filter]').forEach(b => b.classList.toggle('active', b === btn));
      renderList();
    }));
    panel.querySelector('#enhanced-select-all').onclick = () => { getReviewEntries(activeFilter).forEach(r => selected.add(r.key)); renderList(); };
    panel.querySelector('#enhanced-select-all-check').onchange = e => { if (e.target.checked) getReviewEntries('all').forEach(r => selected.add(r.key)); else selected.clear(); renderList(); };
    panel.querySelector('#enhanced-select-reviewed').onchange = e => { getReviewEntries('reviewed').forEach(r => e.target.checked ? selected.add(r.key) : selected.delete(r.key)); renderList(); };
    panel.querySelector('#enhanced-select-wrong').onchange = e => { getReviewEntries('wrong').forEach(r => e.target.checked ? selected.add(r.key) : selected.delete(r.key)); renderList(); };
    panel.querySelector('#enhanced-delete-selected').onclick = () => {
      if (!selected.size) { alert('আগে history নির্বাচন করুন।'); return; }
      if (!confirm(`নির্বাচিত ${selected.size}টি history entry মুছবেন? Question Bank-এর মূল প্রশ্ন মুছবে না।`)) return;
      const h = getHistory();
      selected.forEach(key => { delete h[key]; });
      saveHistory(h); selected.clear(); renderReviewPanel();
    };
    panel.querySelector('#enhanced-requiz').onclick = () => {
      const qs = getReviewEntries('all').filter(r => selected.has(r.key)).map(r => r.question);
      if (!qs.length) { alert('Re-quiz করার জন্য প্রশ্ন নির্বাচন করুন।'); return; }
      app.practiceSession = { questions: qs, index: 0, answers: [], marks: 0, showAnswer: false, timeLeft: Math.max(60, qs.length * 60) };
      const browser = document.getElementById('practice-browser'), quiz = document.getElementById('practice-quiz-view');
      if (browser) browser.hidden = true; if (quiz) quiz.hidden = false;
      app.showView('practice'); app.renderPractice(); app.startPracticeTimer();
    };
    list.onchange = e => { const input = e.target.closest('.enhanced-history-check'); if (!input) return; input.checked ? selected.add(input.dataset.key) : selected.delete(input.dataset.key); };
    list.onclick = e => { const btn = e.target.closest('.enhanced-mark-reviewed'); if (!btn) return; const q = app.questionBank.find(x => qKey(x) === btn.dataset.qkey); if (q) markReviewed(q); };
    renderList();
  }

  function renderResultFilters() {
    const view = document.getElementById('view-result');
    if (!view || !app.examState?.questions?.length) return;
    let panel = document.getElementById('enhanced-result-review');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'enhanced-result-review';
      panel.className = 'enhanced-panel enhanced-result-panel';
      view.appendChild(panel);
    }
    const rows = app.examState.questions.map((q, i) => {
      const answer = app.examState.userAnswers[i];
      const correct = correctIndex(q);
      const status = answer == null ? 'skip' : answer === correct ? 'right' : 'wrong';
      return { q, i, answer, correct, status };
    });
    let filter = 'all';
    const render = () => {
      const filtered = rows.filter(r => filter === 'all' || r.status === filter);
      panel.innerHTML = `<h3>Result Box — প্রশ্নভিত্তিক বিশ্লেষণ</h3><div class="enhanced-result-filterbar" role="group" aria-label="Filter exam results"><button type="button" data-result-filter="all" class="${filter==='all'?'active':''}">All Questions (${rows.length})</button><button type="button" data-result-filter="right" class="${filter==='right'?'active':''}">Right Ans (${rows.filter(r=>r.status==='right').length})</button><button type="button" data-result-filter="wrong" class="${filter==='wrong'?'active':''}">Wrong Ans (${rows.filter(r=>r.status==='wrong').length})</button><button type="button" data-result-filter="skip" class="${filter==='skip'?'active':''}">Skip (${rows.filter(r=>r.status==='skip').length})</button></div><div class="enhanced-question-list">${filtered.map(r => questionHtml(r.q, r.status==='right'?'Right Ans':r.status==='wrong'?'Wrong Ans':'Skip', r.answer)).join('') || '<p class="enhanced-empty">এই বিভাগে প্রশ্ন নেই।</p>'}</div>`;
      panel.querySelectorAll('[data-result-filter]').forEach(btn => btn.addEventListener('click', () => { filter = btn.dataset.resultFilter; render(); }));
      panel.querySelectorAll('.enhanced-mark-reviewed').forEach(btn => btn.addEventListener('click', () => {
        const row = rows.find(r => qKey(r.q) === btn.dataset.qkey);
        if (row) { markReviewed(row.q); btn.textContent = 'Reviewed ✓'; }
      }));
    };
    render();
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
    const count = toolbar.querySelector('[data-selected-count]');
    if (count) count.textContent = `${selected} selected`;
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
    let bankStatusFilter = toolbar.dataset.statusFilter || 'all';
    toolbar.innerHTML = `<div class="enhanced-actions" role="group" aria-label="Question status filter"><button type="button" data-bank-filter="all" class="${bankStatusFilter==='all'?'active':''}">All Questions</button><button type="button" data-bank-filter="reviewed" class="${bankStatusFilter==='reviewed'?'active':''}">Reviewed</button><button type="button" data-bank-filter="wrong" class="${bankStatusFilter==='wrong'?'active':''}">Wrong Answer</button></div><strong data-selected-count>${selectedBankKeys.size} selected</strong><div class="enhanced-actions"><button type="button" id="enhanced-bank-select-visible">Select All (Visible)</button><button type="button" id="enhanced-bank-clear-selection">Clear Selection</button><button type="button" class="enhanced-practice-selected" id="enhanced-bank-practice-selected">Start Exam with Selected</button></div>`;
    toolbar.querySelectorAll('[data-bank-filter]').forEach(btn => btn.onclick = () => { toolbar.dataset.statusFilter = btn.dataset.bankFilter; this.renderQuestionBank(); });
    toolbar.querySelector('#enhanced-bank-select-visible').textContent =
      Array.from(list.querySelectorAll(':scope > article')).filter(card => !card.hidden).every(card => {
        const input = card.querySelector('.enhanced-bank-select');
        return input && selectedBankKeys.has(input.dataset.qkey);
      }) ? 'Unselect All (Visible)' : 'Select All (Visible)';
    toolbar.querySelector('#enhanced-bank-select-visible').onclick = () => {
      const visibleCards = Array.from(list.querySelectorAll(':scope > article')).filter(card => !card.hidden);
      const allSelected = visibleCards.length > 0 && visibleCards.every(card => {
        const input = card.querySelector('.enhanced-bank-select');
        return input && selectedBankKeys.has(input.dataset.qkey);
      });
      visibleCards.forEach(card => {
        const input = card.querySelector('.enhanced-bank-select');
        if (!input) return;
        if (allSelected) selectedBankKeys.delete(input.dataset.qkey);
        else selectedBankKeys.add(input.dataset.qkey);
      });
      this.renderQuestionBank();
    };
    toolbar.querySelector('#enhanced-bank-clear-selection').onclick = () => { selectedBankKeys.clear(); this.renderQuestionBank(); };
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
      card.hidden = bankStatusFilter === 'reviewed' ? !record.reviewed : bankStatusFilter === 'wrong' ? !record.wrong : false;
    });
    list.onchange = event => {
      const input = event.target.closest('.enhanced-bank-select');
      if (!input) return;
      input.checked ? selectedBankKeys.add(input.dataset.qkey) : selectedBankKeys.delete(input.dataset.qkey);
      updateBankSelectionToolbar();
    };
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

  /* Lifetime-only leaderboard; Friends filters to the signed-in user's college. */
  const leaderboardPeriodKey = 'med_leaderboard_period_v1';
  let leaderboardPeriod = ['all-time','friends'].includes(localStorage.getItem(leaderboardPeriodKey)) ? localStorage.getItem(leaderboardPeriodKey) : 'all-time';
  try { localStorage.setItem(leaderboardPeriodKey,leaderboardPeriod); } catch (_) {}
  let latestLeaderboardRows = [];
  const periodTabs = document.getElementById('leaderboard-period-tabs');
  const periodNote = document.getElementById('leaderboard-period-note');
  const originalRenderLeaderboardRows = typeof app.renderLeaderboardRows === 'function' ? app.renderLeaderboardRows.bind(app) : null;
  const collegeKey = value => String(value || '').trim().toLocaleLowerCase().replace(/\s+/g,' ');
  function paintLeaderboardPeriodTabs() {
    document.querySelectorAll('[data-leaderboard-period]').forEach(button => {
      const active=button.dataset.leaderboardPeriod===leaderboardPeriod;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-selected',active?'true':'false');
    });
    if(periodNote){const friends=leaderboardPeriod==='friends';periodNote.classList.toggle('hidden',!friends);periodNote.textContent=friends?'Friends তালিকায় আপনার কলেজের শিক্ষার্থীরাই দেখানো হবে। আপনার প্রোফাইলে কলেজের নাম যোগ করুন.':'';}
  }
  if(originalRenderLeaderboardRows){
    app.renderLeaderboardRows=function(rows){
      latestLeaderboardRows=Array.isArray(rows)?rows.slice():[];
      paintLeaderboardPeriodTabs();
      let viewRows=latestLeaderboardRows.map(row=>({...row,points:Number(row.rankPoints??row.lifetimeRankPoints??row.points??0)}));
      if(leaderboardPeriod==='friends'){
        const own=viewRows.find(row=>row.uid&&row.uid===app.authUser?.uid);
        const college=collegeKey(app.profile?.college||own?.college);
        if(!college){
          const body=document.getElementById('leaderboard-body'),podium=document.getElementById('leaderboard-podium'),me=document.getElementById('leaderboard-me');
          if(body)body.innerHTML='<tr><td colspan="5" class="py-10 text-center text-sm text-gray-500">Friends ranking দেখতে Account Profile-এ আপনার কলেজের নাম যোগ করুন।</td></tr>';
          if(podium)podium.replaceChildren();if(me){me.replaceChildren();me.classList.add('hidden');}return;
        }
        viewRows=viewRows.filter(row=>collegeKey(row.college)===college);
      }
      return originalRenderLeaderboardRows(viewRows);
    };
  }
  if(periodTabs){
    periodTabs.addEventListener('click',event=>{
      const button=event.target.closest('[data-leaderboard-period]');if(!button)return;
      const next=button.dataset.leaderboardPeriod;if(!['all-time','friends'].includes(next))return;
      leaderboardPeriod=next;try{localStorage.setItem(leaderboardPeriodKey,next);}catch(_){}
      paintLeaderboardPeriodTabs();if(originalRenderLeaderboardRows)app.renderLeaderboardRows(latestLeaderboardRows);
    });
    paintLeaderboardPeriodTabs();
  }
  /* Per-account avatar selection for the profile view. */
  const avatarChoices = ['🩺', '🧑‍⚕️', '👨‍⚕️', '👩‍⚕️', '👨‍🎓', '👩‍🎓', '🎓', '🧬', '🧠', '🦉', '🚀', '⚕️', '🧪', '🔬', '🏆', '🌟', '🦅', '🐺', '🦊', '🐼', '🐯', '🐉', '🦋', '🌙'];
  const avatarKey = () => 'med_profile_avatar_v1_' + (app.authUser?.uid || 'guest');
  const readAvatar = () => {
    try {
      const value = localStorage.getItem(avatarKey());
      return avatarChoices.includes(value) ? value : '🩺';
    } catch (_) { return '🩺'; }
  };
  function renderAvatarPicker() {
    const root = document.getElementById('view-profile');
    if (!root) return;
    let picker = root.querySelector('#profile-avatar-picker');
    if (!picker) {
      picker = document.createElement('div');
      picker.id = 'profile-avatar-picker';
      picker.className = 'profile-avatar-picker';
      picker.setAttribute('aria-label', 'Choose profile avatar');
      const hero = root.querySelector('.profile-hero');
      if (hero) hero.insertAdjacentElement('afterend', picker);
      else root.prepend(picker);
    }
    const current = readAvatar();
    const avatar = root.querySelector('.profile-hero .profile-avatar');
    if (avatar) {
      avatar.textContent = current;
      avatar.setAttribute('aria-label', 'Selected profile avatar ' + current);
    }
    picker.innerHTML = '<span class="profile-avatar-picker-label">Choose avatar</span>' + avatarChoices.map(value =>
      '<button type="button" class="profile-avatar-choice' + (value === current ? ' is-selected' : '') + '" data-profile-avatar="' + value + '" aria-pressed="' + (value === current ? 'true' : 'false') + '" aria-label="Choose avatar ' + value + '">' + value + '</button>'
    ).join('');
  }
  document.addEventListener('click', event => {
    const choice = event.target.closest('[data-profile-avatar]');
    if (!choice) return;
    const value = choice.dataset.profileAvatar;
    if (!avatarChoices.includes(value)) return;
    try { localStorage.setItem(avatarKey(), value); } catch (_) {}
    renderAvatarPicker();
    if (typeof app.loadLeaderboard === 'function') app.loadLeaderboard(true);
  });
  document.addEventListener('student-progress-updated', renderAvatarPicker);
  window.addEventListener('load', renderAvatarPicker);
  const originalShowViewForAvatar = app.showView.bind(app);
  app.showView = function(viewName, force = false) {
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
  // Every 150 Rank Points advances one rank; every 120 XP advances one account level.
  const rankFor = points => 'Rank ' + (Math.floor(Math.max(0, Number(points) || 0) / 150) + 1);
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
    const xp = Math.max(0, Number(progress.xp) || 0);
    const level = Math.floor(xp / 120) + 1;
    const next = level * 120;
    const levelProgress = Math.round((xp - ((level - 1) * 120)) / 120 * 100);
    card.innerHTML = '<h3>Rank & Achievements</h3><div class="enhanced-actions"><span class="enhanced-status-pill enhanced-status-reviewed">' + rankFor(Math.max(0, Number(progress.rankPoints) || 0)) + '</span><span class="enhanced-status-pill">Level ' + level + '</span><span class="enhanced-status-pill">🏆 ' + Math.floor((Number(progress.completedExams) || 0) / 10) + ' trophies</span></div><p class="enhanced-empty">' + Math.max(0, next - xp) + ' XP to next level · ' + levelProgress + '% level progress · ' + (Number(progress.completedExams) || 0) + ' completed exams</p>';
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


/* Public leaderboard profile preview: exposes only fields already displayed in leaderboard. */
(() => {
  const app = window.app;
  if (!app || app.__leaderProfilePreview) return;
  app.__leaderProfilePreview = true;
  const oldRender = typeof app.renderLeaderboardRows === 'function' ? app.renderLeaderboardRows.bind(app) : null;
  if (!oldRender) return;
  const esc = value => app.escapeHtml ? app.escapeHtml(value) : String(value ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  app.renderLeaderboardRows = function(rows) {
    const result = oldRender(rows);
    const body = document.getElementById('leaderboard-body');
    const sorted = (Array.isArray(rows) ? rows.slice() : []).sort((a,b) => Number(b.points||0)-Number(a.points||0));
    if (body) Array.from(body.querySelectorAll('tr.leader-row')).forEach((tr, i) => {
      const row = sorted[i];
      if (!row) return;
      tr.dataset.publicName = String(row.name || 'Student');
      tr.dataset.publicCollege = String(row.college || '—');
      tr.dataset.publicQuizzes = String(Number(row.quizzes || 0));
      tr.dataset.publicAccuracy = String(Number(row.accuracy || 0).toFixed(1));
      tr.dataset.publicPoints = String(Number(row.points || 0));
      tr.tabIndex = 0;
      tr.setAttribute('role','button');
      tr.setAttribute('aria-label','View public leaderboard profile for ' + String(row.name || 'Student'));
      tr.style.cursor = 'pointer';
    });
    return result;
  };
  function openPreview(row) {
    let modal = document.getElementById('leaderboard-public-profile');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'leaderboard-public-profile';
      modal.className = 'palette-settings-overlay';
      modal.innerHTML = '<section class="palette-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="leader-public-title"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h3 id="leader-public-title">Leaderboard Profile</h3><button type="button" class="enhanced-small-btn" data-close-public-profile>Close</button></div><div data-public-profile-content></div><p class="enhanced-empty">Only public leaderboard statistics are shown here.</p></section>';
      modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-close-public-profile]')) modal.hidden = true; });
      document.body.appendChild(modal);
    }
    modal.querySelector('[data-public-profile-content]').innerHTML = '<div class="enhanced-panel"><h3>' + esc(row.dataset.publicName) + '</h3><p>College: ' + esc(row.dataset.publicCollege) + '</p><p>Quizzes: ' + esc(row.dataset.publicQuizzes) + '</p><p>Accuracy: ' + esc(row.dataset.publicAccuracy) + '%</p><p>Points in this view: ' + esc(row.dataset.publicPoints) + '</p></div>';
    modal.hidden = false;
  }
  document.addEventListener('click', e => {
    const row = e.target.closest('#leaderboard-body tr.leader-row');
    if (row) openPreview(row);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest?.('#leaderboard-body tr.leader-row');
    if (row) { e.preventDefault(); openPreview(row); }
  });
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
const tiers=['Bronze','Silver','Gold','Platinum','Master','Pro'],roman=['V','IV','III','II','I'];
const pkey=()=>'med_account_progress_v1_'+(app.authUser?.uid||'guest');
const progress=()=>{try{return JSON.parse(localStorage.getItem(pkey())||'{}')||{}}catch(_){return{}}};
const rank=points=>{const n=Math.min(29,Math.floor(Math.max(0,Number(points)||0)/150));return{name:tiers[Math.floor(n/5)]+' '+roman[n%5],tier:tiers[Math.floor(n/5)].toLowerCase(),index:n+1,step:n%5+1,points:Math.max(0,Number(points)||0),remaining:n>=29?0:(n+1)*150-Math.max(0,Number(points)||0)}};
const qkey=q=>String(q?.id||[q?.subject,q?.year,q?.question||q?.questionText].join('|')).toLowerCase().replace(/\s+/g,' ').trim();
const hkey=()=>'med_review_history_v2_'+(app.authUser?.uid||'guest');
const readHistory=()=>{try{return JSON.parse(localStorage.getItem(hkey())||'{}')||{}}catch(_){return{}}};
const record=q=>readHistory()[qkey(q)]||{};
const badge=(points,large=false)=>{const r=rank(points),sym={bronze:'▰',silver:'⌃',gold:'◆',platinum:'❖',master:'★',pro:'✦'}[r.tier],mark={bronze:'╱',silver:'⌄',gold:'◆',platinum:'⌃',master:'★',pro:'★'}[r.tier],marks=mark.repeat(r.step);return '<span class="tracker-rank-badge rank-tier-'+r.tier+(large?' rank-badge-large':'')+'" aria-label="'+r.name+' rank badge"><span>'+sym+'</span><span class="tracker-rank-marks">'+marks+'</span> '+r.name+'</span>'};
const style=document.createElement('style');style.id='tracker-rank-badge-styles';style.textContent=".tracker-rank-badge{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border:1px solid #ffffff55;border-radius:8px;color:white;font-size:11px;font-weight:900;white-space:nowrap;box-shadow:0 3px 8px #0002}.rank-tier-bronze{background:linear-gradient(135deg,#b8793f,#70421f);border-radius:4px 10px}.rank-tier-silver{background:linear-gradient(135deg,#f1f5f9,#64748b);color:#172033;clip-path:polygon(0 0,100% 0,100% 70%,50% 100%,0 70%);padding:7px 12px}.rank-tier-gold{background:linear-gradient(135deg,#fff0a6,#b77908,#facc15);color:#4a2b05;clip-path:polygon(0 0,100% 0,100% 70%,50% 100%,0 70%);padding:7px 12px}.rank-tier-platinum{background:linear-gradient(135deg,#93c5fd,#1d4ed8,#172554);clip-path:polygon(0 0,100% 0,100% 70%,50% 100%,0 70%);padding:7px 12px}.rank-tier-master{background:linear-gradient(135deg,#d8b4fe,#7e22ce,#3b0764);clip-path:polygon(0 0,100% 0,100% 70%,50% 100%,0 70%);padding:7px 12px}.rank-tier-pro{background:linear-gradient(135deg,#fca5a5,#dc2626,#581c87);border-radius:18px 5px}.rank-tier-pro:before,.rank-tier-pro:after{content:'✦';color:#fef08a}.tracker-rank-marks{font-size:9px;letter-spacing:1px;line-height:1}.rank-badge-large{font-size:14px;padding:10px 15px}#profile-rank-card .rank-track{height:9px;background:var(--line,#dbe4ee);border-radius:99px;overflow:hidden;margin:10px 0}#profile-rank-card .rank-track span{display:block;height:100%;background:linear-gradient(90deg,#10b981,#0ea5e9)}#profile-rank-card .rank-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}#profile-rank-card .rank-stat{padding:10px;border:1px solid var(--line,#dbe4ee);border-radius:12px}#profile-rank-card .rank-stat small{display:block;color:var(--muted,#64748b);font-size:11px}#profile-rank-card .rank-stat strong{font-size:19px;font-weight:900}.practice-exam-setup{padding:17px;border:1px solid var(--line,#dbe4ee);border-radius:20px;background:var(--surface,#fff);box-shadow:0 8px 22px #0f172a08}.practice-type-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.practice-type-btn,.practice-count-btn{padding:10px 7px;border:1px solid var(--line,#cbd5e1);border-radius:11px;font-size:12px;font-weight:850;background:var(--surface,#fff);color:var(--text,#1e293b)}.practice-type-btn.active,.practice-count-btn.active{border-color:#059669;background:#10b98120;color:#047857;box-shadow:inset 0 0 0 1px #059669}.practice-count-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:8px}.practice-setup-footer{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:12px;font-size:12px;font-weight:800;color:var(--muted,#64748b)}@media(max-width:640px){.practice-type-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#profile-rank-card .rank-stats{gap:5px}#profile-rank-card .rank-stat{padding:7px}#profile-rank-card .rank-stat strong{font-size:16px}}";document.head.appendChild(style);
function renderRankCard(){const root=document.getElementById('view-profile');if(!root)return;let card=document.getElementById('profile-rank-card');if(!card){card=document.createElement('section');card.id='profile-rank-card';card.className='enhanced-panel';const hero=root.querySelector('.profile-hero');if(hero)hero.insertAdjacentElement('afterend',card);else root.prepend(card)}const p=progress(),r=rank(p.rankPoints),xp=Math.max(0,Number(p.xp)||0),level=Math.floor(xp/120)+1,into=xp%120,week=Math.max(0,Number(p.weeklyRankPoints)||0),rpProgress=r.index>=30?100:(r.points%150)/150*100;card.innerHTML='<h3>Rank System & Progress</h3><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:12px">'+badge(r.points,true)+'<div><strong style="display:block">'+r.name+'</strong><small>'+r.points+' lifetime Rank Points</small></div></div><div class="rank-track"><span style="width:'+rpProgress+'%"></span></div><p class="enhanced-empty">'+(r.index>=30?'Highest rank reached.':r.remaining+' Rank Points to next rank')+'</p><div class="rank-stats"><div class="rank-stat"><small>Account Level</small><strong>'+level+'</strong><small>'+(120-into)+' XP to next level</small></div><div class="rank-stat"><small>Weekly Rank Points</small><strong>'+week+'</strong><small>Weekly reset setting</small></div><div class="rank-stat"><small>Completed Exams</small><strong>'+(Number(p.completedExams)||0)+'</strong><small>+20 XP per exam</small></div></div><div class="rank-track"><span style="width:'+(into/120*100)+'%"></span></div><small>Level progress: '+Math.round(into/120*100)+'% · XP and Rank Points are separate.</small>';const live=document.getElementById('profile-live-rank'),best=document.getElementById('profile-best-rank');if(live)live.textContent=r.name;if(best)best.textContent=r.name}
function renderSidebarAuth(){const b=document.getElementById('sidebar-auth-action');if(!b)return;const logged=Boolean(app.authUser?.uid);b.setAttribute('aria-label',logged?'Log Out':'Log In / Sign Up');b.title=logged?(app.authUser.email||'Log Out'):'Log In / Sign Up';b.innerHTML=logged?'<i class="fa-solid fa-right-from-bracket"></i><span>Log Out</span>':'<i class="fa-solid fa-right-to-bracket"></i><span>Log In / Sign Up</span>';b.onclick=logged?()=>{if(window.handleLogout)window.handleLogout()}:()=>{if(window.redirectToLogin)window.redirectToLogin()}}
function setupPracticeUI(){const view=document.getElementById('view-practice');if(!view||document.getElementById('practice-exam-setup'))return;const panel=document.createElement('section');panel.id='practice-exam-setup';panel.className='practice-exam-setup';panel.innerHTML='<h3 style="font-weight:900;font-size:1.1rem">Practice Exam Setup</h3><p style="font-size:.82rem;color:var(--muted,#64748b);margin:4px 0 14px">Choose the question pool. Existing quiz answer and feedback handlers are preserved.</p><label style="font-size:.85rem;font-weight:900">Exam Type</label><div class="practice-type-grid" role="group"><button type="button" class="practice-type-btn active" data-practice-type="all" aria-pressed="true">All Questions</button><button type="button" class="practice-type-btn" data-practice-type="reviewed" aria-pressed="false">Reviewed</button><button type="button" class="practice-type-btn" data-practice-type="wrong" aria-pressed="false">Wrong Answer</button><button type="button" class="practice-type-btn" data-practice-type="previous" aria-pressed="false">Previous Year</button></div><label style="display:block;font-size:.85rem;font-weight:900;margin-top:14px">Question Count</label><div class="practice-count-grid">'+[20,30,50,75,100].map(n=>'<button type="button" class="practice-count-btn '+(n===20?'active':'')+'" data-practice-count="'+n+'" aria-pressed="'+(n===20?'true':'false')+'">'+n+'</button>').join('')+'</div><div class="practice-setup-footer"><span id="practice-auto-time">20 questions · 10 minutes automatically</span><span id="practice-available-count">Loading questions…</span></div>';const actions=view.querySelector('.practice-mode-actions');view.insertBefore(panel,actions||view.firstChild);panel.addEventListener('click',e=>{const t=e.target.closest('[data-practice-type]'),c=e.target.closest('[data-practice-count]');if(t)panel.querySelectorAll('[data-practice-type]').forEach(b=>{b.classList.toggle('active',b===t);b.setAttribute('aria-pressed',String(b===t))});if(c)panel.querySelectorAll('[data-practice-count]').forEach(b=>{b.classList.toggle('active',b===c);b.setAttribute('aria-pressed',String(b===c))});updatePracticeUI()});updatePracticeUI()}
const practiceType=()=>document.querySelector('#practice-exam-setup [data-practice-type].active')?.dataset.practiceType||'all',practiceCount=()=>Number(document.querySelector('#practice-exam-setup [data-practice-count].active')?.dataset.practiceCount||20);
function practicePool(){const qs=Array.isArray(app.questionBank)?app.questionBank:[],type=practiceType();if(type==='reviewed')return qs.filter(q=>Boolean(record(q).reviewed));if(type==='wrong')return qs.filter(q=>Boolean(record(q).wrong));if(type==='previous')return qs.filter(q=>Boolean(q.isPreviousYear)||(q.year&&!/^practice$/i.test(String(q.year))));return qs.slice()}
function updatePracticeUI(){const pool=practicePool(),count=Math.min(practiceCount(),pool.length),mins=Math.max(1,Math.round(count/2)),time=document.getElementById('practice-auto-time'),available=document.getElementById('practice-available-count');if(time)time.textContent=count+' questions · '+mins+' minutes automatically';if(available)available.textContent=pool.length+' matching questions'}
app.startPracticeFromBrowser=function(){if(!this.questionsLoaded||!this.questionBank.length){this.showDataError('প্রশ্ন ব্যাংক এখনো লোড হয়নি।');return}const pool=practicePool();if(!pool.length){alert(practiceType()==='reviewed'?'No Reviewed questions yet. Mark questions Reviewed in Question Bank.':practiceType()==='wrong'?'No Wrong Answer questions yet.':'No questions found for this Practice type.');return}const selected=pool.slice().sort(()=>Math.random()-.5).slice(0,Math.min(practiceCount(),pool.length));if(this.practiceTimerInterval){clearInterval(this.practiceTimerInterval);this.practiceTimerInterval=null}this.practiceSession={questions:selected,index:0,answers:[],marks:0,showAnswer:false,timeLeft:Math.max(60,Math.round(selected.length/2)*60),practiceType:practiceType()};this.markQuestionsSeen(selected);const browser=document.getElementById('practice-browser'),quiz=document.getElementById('practice-quiz-view');if(browser)browser.hidden=true;if(quiz)quiz.hidden=false;this.showView('practice');this.renderPractice();this.startPracticeTimer();updatePracticeUI()};
const oldAnswer=app.answerPractice.bind(app);app.answerPractice=function(index){const q=this.practiceSession?.questions?.[this.practiceSession?.index],result=oldAnswer(index);if(q&&index!==q.answer){const h=readHistory(),key=qkey(q);h[key]={...(h[key]||{key,question:q,reviewed:false}),question:q,wrong:true,updatedAt:Date.now()};localStorage.setItem(hkey(),JSON.stringify(h));updatePracticeUI()}return result};
const oldBrowser=app.renderPracticeBrowser?.bind(app);if(oldBrowser)app.renderPracticeBrowser=function(){const r=oldBrowser();setupPracticeUI();updatePracticeUI();return r};
const oldAuth=app.setAuthState.bind(app);app.setAuthState=function(user,...args){const r=oldAuth(user,...args);renderSidebarAuth();renderRankCard();setupPracticeUI();updatePracticeUI();return r};
const oldShow=app.showView.bind(app);app.showView=function(name,...args){const r=oldShow(name,...args);if(name==='profile')renderRankCard();if(name==='practice'){setupPracticeUI();updatePracticeUI()}renderSidebarAuth();return r};
const oldLeaderboard=app.renderLeaderboardRows?.bind(app);if(oldLeaderboard)app.renderLeaderboardRows=function(rows){const result=oldLeaderboard(rows),sorted=(Array.isArray(rows)?rows.slice():[]).sort((a,b)=>Number(b.points||0)-Number(a.points||0)),body=document.getElementById('leaderboard-body');if(body)Array.from(body.querySelectorAll('tr.leader-row')).forEach((tr,i)=>{const row=sorted[i];if(!row)return;const p=row.uid&&row.uid===app.authUser?.uid?progress():null,points=p?Number(p.rankPoints)||0:Number(row.rankPoints??row.points)||0,name=tr.querySelector('.leader-person span:last-child');if(name&&!name.querySelector('.tracker-rank-badge'))name.insertAdjacentHTML('beforeend',badge(points))});const p=progress(),r=rank(p.rankPoints),live=document.getElementById('profile-live-rank'),best=document.getElementById('profile-best-rank');if(live)live.textContent=r.name;if(best)best.textContent=r.name;return result};
document.addEventListener('student-progress-updated',()=>{renderRankCard();renderSidebarAuth();updatePracticeUI()});document.addEventListener('student-auth-state-changed',()=>{renderRankCard();renderSidebarAuth();updatePracticeUI()});window.addEventListener('load',()=>{renderRankCard();renderSidebarAuth();setupPracticeUI();updatePracticeUI()});renderRankCard();renderSidebarAuth();setupPracticeUI();
})();
