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
    general: ['general', 'gk', 'aptitude', 'human', 'iq', 'mental ability']
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
    originalSetSetupQuestions(count);
    if ([10,20,30].includes(Number(count))) {
      this.setup.questionsCount = Number(count);
      this.setup.durationMins = Number(count) / 2;
      const durationLabel = document.querySelector('#view-setup label');
      const durationBlock = document.querySelector('#view-setup .time-btn')?.parentElement?.parentElement;
      if (durationLabel && durationBlock) {
        durationLabel.textContent = 'সময়সীমা (মিনিট) — Medical Test';
        durationBlock.querySelectorAll('.time-btn').forEach(btn => {
          const value = Number(count)/2;
          btn.textContent = value + ' মি.';
          btn.onclick = () => { this.setup.durationMins = value; this.updateSetupUI(); };
        });
      }
      this.updateSetupUI();
    }
  };
  const originalSetSetupDuration = app.setSetupDuration.bind(app);
  app.setSetupDuration = function(mins) {
    this.setup.durationMins = Number(this.setup.questionsCount)/2;
    this.updateSetupUI();
  };

  const originalPrepareExam = app.prepareExamFromSetup.bind(app);
  app.prepareExamFromSetup = function() {
    if (!this.questionsLoaded || !this.questionBank.length) return originalPrepareExam();
    const count = (this.setup.mode === 'challenge' || this.setup.mode === 'previousQuiz') ? 20 : Number(this.setup.questionsCount || 20);
    let pool = this.questionBank.slice();
    if (this.setup.subject && this.setup.subject !== 'all') pool = pool.filter(q => q.subject === this.setup.subject);
    const year = document.getElementById('setup-year')?.value || 'all';
    if (year !== 'all' && (this.setup.mode === 'previous' || this.setup.mode === 'previousQuiz')) pool = pool.filter(q => q.year === year || q.isPreviousYear);
    if (!pool.length) { this.showDataError('এই নির্বাচন অনুযায়ী Question Bank-এ প্রশ্ন পাওয়া যায়নি।'); return; }
    const questions = this.setup.subject === 'all' ? chooseMedicalDistribution(pool, Math.min(count, pool.length)) : pool.slice().sort(() => Math.random()-.5).slice(0, Math.min(count,pool.length));
    if (!questions.length) return originalPrepareExam();
    this.setup.durationMins = count / 2;
    this.preparedExam = { questions: this.shuffleQuestionsAndOptions(questions, questions.length), mode: this.setup.mode, subject: this.setup.subject, year, durationMins: (this.setup.mode === 'challenge' || this.setup.mode === 'previousQuiz') ? 10 : count/2 };
    this.renderExamIntro();
    this.showView('exam-intro');
  };

  const originalRenderPalette = app.renderPalette.bind(app);
  app.renderPalette = function() { originalRenderPalette(); renderPaletteStats(); };

  const originalSelectOption = app.selectOption.bind(app);
  app.selectOption = function(index) { originalSelectOption(index); renderPaletteStats(); };

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

  const originalRenderQuestionBank = app.renderQuestionBank.bind(app);
  app.renderQuestionBank = function() {
    originalRenderQuestionBank();
    const qs = this.getFilteredBank();
    const cards = document.querySelectorAll('#question-bank-list > article');
    cards.forEach((card, i) => {
      const q = qs[i];
      if (!q || card.querySelector('.enhanced-mark-reviewed')) return;
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'enhanced-small-btn enhanced-mark-reviewed';
      btn.dataset.qkey = qKey(q); btn.textContent = getRecord(q).reviewed ? 'Reviewed ✓' : 'Mark Reviewed';
      btn.addEventListener('click', () => { markReviewed(q); btn.textContent = 'Reviewed ✓'; });
      card.appendChild(btn);
    });
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
    if (event.target.closest('#btn-prev-q,#btn-next-q,#btn-mark-review,#q-palette-grid button')) setTimeout(renderPaletteStats, 0);
  });

  window.addEventListener('load', () => {
    renderReviewPanel();
    renderAccountList();
  });
})();
