/* Integrated exam, review-history, and account helpers.
   Keeps the existing application and Question Bank as the source of truth. */
(() => {
  'use strict';
  const app = window.app;
  if (!app || app.__integratedFeaturesInstalled) return;
  app.__integratedFeaturesInstalled = true;

  const REVIEW_KEY = () => app.getScopedLocalStorageKey('med_review_history_v2');
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
      .enhanced-bank-toolbar{position:relative;isolation:isolate;display:grid;gap:14px;margin:16px 0 20px;padding:17px;border:1px solid rgba(45,212,191,.22);border-radius:20px;background:radial-gradient(ellipse at top left,rgba(16,185,129,.12),transparent 58%),linear-gradient(145deg,var(--surface,#fff),var(--surface-2,rgba(148,163,184,.07)));box-shadow:0 12px 30px rgba(2,6,23,.09),inset 0 1px 0 rgba(255,255,255,.08)}
      .enhanced-bank-selection-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
      .enhanced-bank-selection-head>div{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .enhanced-bank-selection-head strong{font-size:14px;font-weight:900;letter-spacing:.01em}
      .enhanced-bank-selection-head [data-selected-count]{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border:1px solid rgba(45,212,191,.25);border-radius:999px;background:rgba(13,148,136,.13);color:#0d9488;font-size:11px;font-weight:900;box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
      .enhanced-bank-selection-head [data-selected-count]::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 8px currentColor}
      .enhanced-bank-selection-head p{margin:0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}
      .enhanced-bank-selection-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
      .enhanced-bank-toolbar button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-width:0;min-height:44px;padding:10px 13px;border:1px solid var(--line,#cbd5e1);border-radius:12px;font-size:12px;font-weight:850;line-height:1.35;background:var(--surface,#fff);color:var(--text,#1e293b);box-shadow:0 2px 5px rgba(15,23,42,.04);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease}
      .enhanced-bank-toolbar button:hover:not(:disabled){transform:translateY(-2px);border-color:rgba(13,148,136,.48);box-shadow:0 8px 18px rgba(15,23,42,.10)}
      .enhanced-bank-toolbar button:focus-visible,.enhanced-bank-select-row input:focus-visible{outline:3px solid rgba(20,184,166,.35);outline-offset:3px}
      .enhanced-bank-toolbar button:active:not(:disabled){transform:translateY(0) scale(.985)}
      .enhanced-bank-toolbar button:disabled{opacity:.42;cursor:not-allowed;box-shadow:none}
      .enhanced-bank-toolbar #enhanced-bank-select-visible{background:linear-gradient(135deg,rgba(13,148,136,.10),rgba(16,185,129,.06));border-color:rgba(13,148,136,.24)}
      .enhanced-bank-toolbar #enhanced-bank-clear-selection{background:var(--surface-2,rgba(148,163,184,.06))}
      .enhanced-bank-toolbar .enhanced-bank-action-primary{background:linear-gradient(135deg,#059669,#0d9488);color:#fff;border-color:transparent;box-shadow:0 7px 18px rgba(5,150,105,.24)}
      .enhanced-bank-toolbar .enhanced-bank-action-primary:hover:not(:disabled){border-color:transparent;box-shadow:0 10px 24px rgba(5,150,105,.32)}
      .enhanced-bank-select-row{display:flex;align-items:center;gap:9px;margin:12px 0 5px;padding:9px 11px;border:1px solid var(--line,#dbe4ee);border-radius:11px;background:var(--surface-2,rgba(148,163,184,.06));font-size:12px;font-weight:800;color:var(--muted,#64748b);cursor:pointer;transition:border-color .18s ease,background .18s ease,color .18s ease}
      .enhanced-bank-select-row:hover{border-color:rgba(13,148,136,.42);color:var(--text,#1e293b)}
      .enhanced-bank-select-row input{width:17px;height:17px;flex:0 0 17px;accent-color:#059669;cursor:pointer}
      #question-bank-list>article:has(.enhanced-bank-select:checked){border-color:rgba(16,185,129,.62)!important;background:linear-gradient(145deg,rgba(16,185,129,.075),var(--surface,#fff))!important;box-shadow:0 0 0 1px rgba(16,185,129,.12),0 8px 20px rgba(5,150,105,.08)}
      #question-bank-list>article:has(.enhanced-bank-select:checked) .enhanced-bank-select-row{border-color:rgba(16,185,129,.34);background:rgba(16,185,129,.10);color:#059669}
      @media(max-width:560px){.enhanced-bank-selection-actions{grid-template-columns:1fr}.enhanced-bank-selection-head{align-items:flex-start;flex-direction:column}.enhanced-bank-toolbar{padding:14px;border-radius:17px}.enhanced-bank-selection-actions{gap:8px}.enhanced-bank-toolbar button{min-height:46px}}
      @media(prefers-reduced-motion:reduce){.enhanced-bank-toolbar button,.enhanced-bank-select-row{transition:none}}
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
  function ensureAccountPreferenceLoadingStyle() {
    if (document.getElementById('account-preferences-loading-style')) return;
    const style = document.createElement('style');
    style.id = 'account-preferences-loading-style';
    style.textContent = `
      @keyframes accountPreferenceDotPulse {
        0%, 60%, 100% { opacity: .25; transform: translateY(0); }
        30% { opacity: 1; transform: translateY(-3px); }
      }
      .account-preferences-dots { display:inline-flex; align-items:center; justify-content:center; gap:4px; margin-left:6px; vertical-align:middle; min-width:22px; }
      .account-preferences-dots span { display:block; width:5px; height:5px; border-radius:50%; background:currentColor; animation:accountPreferenceDotPulse 1.05s infinite ease-in-out; will-change:transform,opacity; }
      .account-preferences-dots span:nth-child(2) { animation-delay:.16s; }
      .account-preferences-dots span:nth-child(3) { animation-delay:.32s; }
      @media (prefers-reduced-motion: reduce) { .account-preferences-dots span { animation:none; opacity:1; } }
    `;
    document.head.appendChild(style);
  }

  function renderAccountPreferences(view) {
    if (!view) return;
    let panel = document.getElementById('enhanced-account-preferences');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'enhanced-account-preferences';
      panel.className = 'enhanced-panel';
      panel.style.cssText = 'margin:0 0 18px;padding:18px;border:1px solid var(--line,#cbd5e1);border-radius:18px;background:var(--surface,#fff);color:var(--text,#1e293b)';
      const remembered = document.getElementById('enhanced-account-switcher');
      if (remembered?.parentNode) remembered.parentNode.insertBefore(panel, remembered);
      else view.appendChild(panel);
    }
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><span style="display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:rgba(16,185,129,.12);color:#059669"><i class="fa-solid fa-sliders"></i></span><div><h3 style="margin:0;font-size:1.05rem;font-weight:900">Personal Preferences</h3><p style="margin:2px 0 0;font-size:12px;color:var(--muted,#64748b)">আপনার account-এর জন্য সংরক্ষিত হবে</p></div></div>
      <div style="padding:14px;border:1px solid var(--line,#cbd5e1);border-radius:14px;margin-bottom:12px">
        <div style="font-weight:850;margin-bottom:5px"><i class="fa-solid fa-user-group" style="color:#0d9488;margin-right:6px"></i>Friends leaderboard</div>
        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:13px;line-height:1.55"><input id="account-friends-accepted-only" type="checkbox" style="width:18px;height:18px;margin-top:2px;accent-color:#059669"><span><strong>Accepted friends only</strong><small style="display:block;color:var(--muted,#64748b)">চালু থাকলে শুধু accepted friends দেখাবে। বন্ধ করলে incoming ও outgoing pending request-ও দেখাবে।</small></span></label>
      </div>
      <div style="padding:14px;border:1px solid var(--line,#cbd5e1);border-radius:14px;margin-bottom:12px">
        <div style="font-weight:850;margin-bottom:5px"><i class="fa-solid fa-hourglass-half" style="color:#0d9488;margin-right:6px"></i>PB expiry</div>
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;margin-bottom:10px"><input id="account-pb-expiry-enabled" type="checkbox" style="width:18px;height:18px;accent-color:#059669"><strong>Automatically convert expired PB to RP</strong></label>
        <div id="account-pb-expiry-options" style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">
          <label for="account-pb-expiry-value" style="font-size:12px;font-weight:750">Expire after</label>
          <input id="account-pb-expiry-value" type="number" min="1" max="999" value="2" inputmode="numeric" style="width:82px;min-height:40px;padding:8px 10px;border:1px solid var(--line,#cbd5e1);border-radius:10px;background:var(--surface,#fff);color:var(--text,#1e293b)">
          <select id="account-pb-expiry-unit" style="min-height:40px;padding:8px 30px 8px 10px;border:1px solid var(--line,#cbd5e1);border-radius:10px;background:var(--surface,#fff);color:var(--text,#1e293b)">
            <option value="hour">Hour(s)</option><option value="day">Day(s)</option><option value="month">Month(s)</option><option value="year">Year(s)</option>
          </select>
        </div>
        <small style="display:block;margin-top:8px;color:var(--muted,#64748b);font-size:11px;line-height:1.5">PB expiry Off করলে PB স্বয়ংক্রিয়ভাবে RP হবে না; আপনি নিজে XP বা RP-তে convert করতে পারবেন।</small>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <small id="account-preferences-status" style="color:var(--muted,#64748b);font-size:12px">Server থেকে saved settings load হচ্ছে…</small>
        <button id="account-preferences-save" type="button" style="display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:42px;padding:10px 16px;border:0;border-radius:11px;background:linear-gradient(135deg,#059669,#0284c7);color:white;font-weight:850;cursor:pointer"><i class="fa-solid fa-floppy-disk"></i> Save preferences</button>
      </div>`;
    const acceptedOnly = panel.querySelector('#account-friends-accepted-only');
    const expiryEnabled = panel.querySelector('#account-pb-expiry-enabled');
    const expiryOptions = panel.querySelector('#account-pb-expiry-options');
    const expiryValue = panel.querySelector('#account-pb-expiry-value');
    const expiryUnit = panel.querySelector('#account-pb-expiry-unit');
    const status = panel.querySelector('#account-preferences-status');
    const save = panel.querySelector('#account-preferences-save');
    ensureAccountPreferenceLoadingStyle();
    const setStatus = (message, loading) => {
      status.textContent = message;
      if (loading) {
        const dots = document.createElement('span');
        dots.className = 'account-preferences-dots';
        dots.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < 3; i++) dots.appendChild(document.createElement('span'));
        status.appendChild(dots);
        status.setAttribute('aria-live', 'polite');
      }
    };
    const syncExpiryControls = () => {
      expiryOptions.style.opacity = expiryEnabled.checked ? '1' : '.45';
      expiryValue.disabled = expiryUnit.disabled = !expiryEnabled.checked;
    };
    expiryEnabled.onchange = syncExpiryControls;
    const league = window.MedGlobalLeague;
    const loadId = String(Number(panel.dataset.settingsLoadId || 0) + 1);
    panel.dataset.settingsLoadId = loadId;
    if (league && typeof league.getAccountSettings === 'function') {
      [acceptedOnly, expiryEnabled, expiryValue, expiryUnit, save].forEach(el => { el.disabled = true; });
      syncExpiryControls();
      league.getAccountSettings().then(settings => {
        if (panel.dataset.settingsLoadId !== loadId || !panel.isConnected) return;
        acceptedOnly.checked = !settings.includePendingFriends;
        expiryEnabled.checked = settings.pbExpiryEnabled === true;
        expiryValue.value = String(settings.pbExpiryValue || 2);
        expiryUnit.value = settings.pbExpiryUnit || 'hour';
        [acceptedOnly, expiryEnabled, expiryValue, expiryUnit, save].forEach(el => { el.disabled = false; });
        syncExpiryControls();
        setStatus('আপনার saved settings load হয়েছে।', false);
      }).catch(error => {
        if (panel.dataset.settingsLoadId !== loadId) return;
        [acceptedOnly, expiryEnabled, expiryValue, expiryUnit, save].forEach(el => { el.disabled = false; });
        syncExpiryControls();
        setStatus(error?.message || 'Settings load হয়নি। আবার refresh করে চেষ্টা করুন।', false);
      });
    } else {
      syncExpiryControls();
      setStatus('Account API প্রস্তুত হলে settings load হবে।', false);
    }
    save.onclick = async () => {
      const value = Math.max(1, Math.min(999, Math.floor(Number(expiryValue.value) || 2)));
      expiryValue.value = String(value);
      save.disabled = true;
      setStatus('Saving account preferences', true);
      try {
        const api = window.MedGlobalLeague;
        if (!api || typeof api.saveAccountSettings !== 'function') throw new Error('Account settings API এখনো প্রস্তুত নয়। পেজ refresh করে চেষ্টা করুন।');
        const saved = await api.saveAccountSettings({
          includePendingFriends: !acceptedOnly.checked,
          pbExpiryEnabled: expiryEnabled.checked,
          pbExpiryValue: value,
          pbExpiryUnit: expiryUnit.value
        });
        acceptedOnly.checked = saved.includePendingFriends !== true;
        expiryEnabled.checked = saved.pbExpiryEnabled === true;
        expiryValue.value = String(saved.pbExpiryValue || value);
        expiryUnit.value = saved.pbExpiryUnit || expiryUnit.value;
        syncExpiryControls();
        setStatus('✓ Preferences saved successfully.', false);
      } catch (error) {
        setStatus(error?.message || 'Settings save হয়নি।', false);
      } finally { save.disabled = false; }
    };
  }

  function renderAccountList() {
    const view = document.getElementById('view-account');
    if (!view) return;
    let panel = document.getElementById('enhanced-account-switcher');
    if (!panel) { panel = document.createElement('section'); panel.id='enhanced-account-switcher'; panel.className='enhanced-panel'; view.appendChild(panel); }
    const dangerZone = view.querySelector('#account-danger-zone-title')?.closest('section');
    if (dangerZone && panel.nextElementSibling !== dangerZone) view.insertBefore(panel, dangerZone);
    renderAccountPreferences(view);
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
        if (state.userAnswers[i] != null) { const wrongNow=state.userAnswers[i] !== correctIndex(q); putRecord(q,{wrong:wrongNow,userAnswerIndex:state.userAnswers[i],correctAnswerIndex:correctIndex(q)}); }
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
  humanAvatarStyle.textContent += '.profile-avatar-upload-controls{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:14px}.profile-avatar-upload-button{display:inline-flex;align-items:center;gap:8px;padding:10px 13px;border:1px solid #10b98166;border-radius:11px;background:#10b98114;color:var(--text,#0f172a);font-weight:850;font-size:13px;cursor:pointer}.profile-avatar-upload-button:hover{background:#10b98125}.profile-avatar-upload-hint{display:flex;align-items:center;gap:6px;margin:10px 0 0;padding:7px 10px;border:1px solid var(--border,#dbe3ed);border-radius:11px;background:linear-gradient(110deg,rgba(16,185,129,.07),rgba(14,165,233,.05));color:var(--text,#0f172a);font-size:11px;line-height:1.4;box-sizing:border-box}@media(max-width:480px){.profile-avatar-upload-hint{gap:6px 8px;padding:8px}.profile-avatar-upload-hint .avatar-guide-warning{align-items:flex-start}}.profile-avatar-upload-status{display:block;margin-top:8px;font-size:12px;font-weight:700}.profile-avatar-uploaded-wrap{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0}.profile-avatar-delete-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 12px;border:1px solid #ef444466;border-radius:10px;background:#ef444410;color:#dc2626;font-size:12px;font-weight:800;cursor:pointer}.profile-avatar-delete-button:hover{background:#ef44441c}.profile-avatar-delete-button:disabled{opacity:.45;cursor:not-allowed}.profile-avatar-choice:focus-visible,.profile-avatar-upload-button:focus-visible,.profile-avatar-confirm-button:focus-visible,.profile-avatar-cancel-button:focus-visible,.profile-avatar-delete-button:focus-visible{outline:3px solid #0ea5e9;outline-offset:2px}';
  humanAvatarStyle.textContent += '.profile-avatar-picker{margin:18px 0;padding:18px;border:1px solid var(--line,#dbe3ed);border-radius:20px;background:var(--surface,#fff)}.profile-avatar-picker-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.profile-avatar-picker-heading p{margin:4px 0 0;color:var(--muted,#64748b);font-size:12px}.profile-avatar-builder{display:grid;grid-template-columns:minmax(140px,190px) minmax(0,1fr);gap:12px;margin-top:14px}.profile-avatar-builder-preview{grid-row:span 7;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:12px;border:1px solid var(--line,#dbe3ed);border-radius:16px;background:var(--surface-2,#f8fafc);position:sticky;top:12px;align-self:start}.profile-avatar-builder-preview img{width:min(100%,170px);aspect-ratio:1;object-fit:contain;border-radius:50%}.profile-avatar-builder-preview span{font-size:11px;font-weight:800;color:var(--muted,#64748b)}.profile-avatar-part{min-width:0;padding:10px 11px;border:1px solid var(--line,#dbe3ed);border-radius:13px}.profile-avatar-part h4{margin:0 0 8px;font-size:12px;font-weight:850}.profile-avatar-part-options{display:flex;flex-wrap:wrap;gap:7px}.profile-avatar-part-option{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border:1px solid var(--line,#cbd5e1);border-radius:999px;background:var(--surface,#fff);color:var(--text,#0f172a);font-size:11px;font-weight:750;cursor:pointer}.profile-avatar-part-option.is-selected{border-color:#10b981;background:#10b98114;box-shadow:0 0 0 2px #10b98120}.profile-avatar-swatch{width:17px;height:17px;border:1px solid #0002;border-radius:50%;background:var(--avatar-swatch);flex:0 0 auto}.profile-avatar-builder-actions{grid-column:2;display:flex;flex-wrap:wrap;gap:8px;align-items:center}.profile-avatar-secondary-button{padding:9px 12px;border:1px solid var(--line,#cbd5e1);border-radius:10px;background:var(--surface,#fff);color:var(--text,#0f172a);font-size:12px;font-weight:800;cursor:pointer}.profile-avatar-photo-options{margin-top:15px}.profile-avatar-photo-options>strong{display:block;margin-bottom:8px;font-size:12px}.profile-avatar-upload-controls{margin-top:12px}.profile-avatar-options{display:flex;flex-wrap:wrap;gap:8px;margin-top:7px}.profile-avatar-choice{width:48px;height:48px}.profile-avatar-choice img{width:100%;height:100%;object-fit:cover;border-radius:50%}@media(max-width:640px){.profile-avatar-picker{padding:13px}.profile-avatar-builder{grid-template-columns:minmax(0,1fr)}.profile-avatar-builder-preview{grid-row:auto;position:static}.profile-avatar-builder-preview img{width:128px}.profile-avatar-builder-actions{grid-column:1}.profile-avatar-part{padding:9px}.profile-avatar-part-option{padding:6px 8px}}';
  humanAvatarStyle.textContent += '.profile-avatar-external-preview{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-top:14px;padding:11px;border:1px solid var(--line,#dbe3ed);border-radius:14px}.profile-avatar-external-preview>div:first-child{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:800}.profile-avatar-external-preview img{width:64px;height:64px;border-radius:50%;object-fit:cover}';
  humanAvatarStyle.textContent += '.profile-avatar-customizer{min-width:0}.profile-avatar-group-tabs{display:flex;gap:7px;overflow-x:auto;padding:2px 2px 10px;scrollbar-width:thin}.profile-avatar-group-tab{flex:0 0 auto;padding:8px 11px;border:1px solid var(--line,#cbd5e1);border-radius:999px;background:var(--surface,#fff);color:var(--text,#0f172a);font-size:11px;font-weight:850;cursor:pointer}.profile-avatar-group-tab.is-active{background:#7c3aed;border-color:#7c3aed;color:#fff}.profile-avatar-group-fields{display:grid;gap:10px}.profile-avatar-option-glyph{width:18px;height:18px;display:inline-grid;place-items:center;font-size:16px}.profile-avatar-builder-preview img{animation:matAvatarPreviewFloat 4s ease-in-out infinite}.profile-avatar-builder-preview{animation:matAvatarPreviewGlow 5s ease-in-out infinite}@keyframes matAvatarPreviewFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}@keyframes matAvatarPreviewGlow{0%,100%{box-shadow:0 0 0 rgba(124,58,237,0)}50%{box-shadow:0 0 24px rgba(124,58,237,.13)}}@media(prefers-reduced-motion:reduce){.profile-avatar-builder-preview img,.profile-avatar-builder-preview{animation:none!important}}';
  humanAvatarStyle.textContent += '.profile-avatar-picker.is-expanded{position:fixed;inset:0;z-index:100030;overflow-y:auto;margin:0;padding:clamp(14px,3vw,30px);border:0;border-radius:0;background:var(--page-bg,#f8fafc);box-sizing:border-box;animation:matAvatarScreenIn .28s ease both}.profile-avatar-picker.is-expanded .profile-avatar-picker-heading,.profile-avatar-picker.is-expanded .profile-avatar-upload-controls,.profile-avatar-picker.is-expanded .profile-avatar-photo-options,.profile-avatar-picker.is-expanded .profile-avatar-upload-hint{display:none}.profile-avatar-builder-header{display:flex;align-items:center;gap:14px;max-width:1120px;margin:0 auto 18px}.profile-avatar-builder-header h2{margin:0;font-size:clamp(19px,3vw,27px);font-weight:950;color:var(--text,#111827)}.profile-avatar-builder-header button{width:42px;height:42px;flex:0 0 42px;border:1px solid var(--line,#cbd5e1);border-radius:13px;background:var(--surface,#fff);color:var(--text,#111827);cursor:pointer}.profile-avatar-builder{max-width:1120px;margin:0 auto;grid-template-columns:minmax(230px,.78fr) minmax(0,1.5fr);gap:clamp(14px,2.5vw,28px);align-items:start}.profile-avatar-builder-preview{grid-row:auto;top:18px;min-height:330px;padding:18px;background:var(--surface-2,#f1f5f9)}.profile-avatar-builder-preview img{width:min(100%,240px);margin:auto}.profile-avatar-preview-reset{align-self:flex-end;display:inline-flex;align-items:center;gap:7px;padding:8px 11px;border:1px solid var(--line,#cbd5e1);border-radius:10px;background:var(--surface,#fff);color:var(--text,#111827);font-size:12px;font-weight:850;cursor:pointer}.profile-avatar-customizer{min-width:0;padding:clamp(12px,2vw,20px);border:1px solid var(--line,#dbe3ed);border-radius:18px;background:var(--surface,#fff)}.profile-avatar-group-tab{display:inline-flex;align-items:center;gap:7px}.profile-avatar-group-fields{min-height:210px}.profile-avatar-part-options{gap:9px}.profile-avatar-part-option{min-height:42px;padding:8px 12px}.profile-avatar-builder-actions{position:sticky;bottom:0;z-index:2;grid-column:2;display:grid;grid-template-columns:auto auto 1fr;gap:9px;margin-top:14px;padding:12px 0;background:var(--surface,#fff)}.profile-avatar-confirm-button{grid-column:1/-1;width:100%;min-height:50px;border:0;background:#16a34a;color:#fff;font-size:15px;font-weight:900}.profile-avatar-secondary-button,.profile-avatar-cancel-button{min-height:40px}.profile-avatar-builder-preview span{font-size:12px}@keyframes matAvatarScreenIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@media(max-width:760px){.profile-avatar-builder{grid-template-columns:minmax(0,1fr);gap:12px}.profile-avatar-builder-preview{position:relative;top:auto;min-height:0;display:grid;grid-template-columns:1fr auto;grid-template-rows:auto 1fr;justify-items:center}.profile-avatar-preview-reset{grid-column:2;grid-row:1}.profile-avatar-builder-preview img{grid-column:1/-1;width:132px}.profile-avatar-builder-preview span{grid-column:1/-1}.profile-avatar-customizer{padding:12px}.profile-avatar-builder-actions{grid-column:1;grid-template-columns:1fr 1fr}.profile-avatar-confirm-button{grid-column:1/-1}.profile-avatar-picker.is-expanded{padding-bottom:24px}}@media(prefers-reduced-motion:reduce){.profile-avatar-picker.is-expanded{animation:none!important}}';
  humanAvatarStyle.textContent += "html:not([data-theme=\"light\"]) .profile-avatar-picker.is-expanded{background:#121218;color:#f8fafc}html:not([data-theme=\"light\"]) .profile-avatar-builder-header h2{color:#f8fafc}html:not([data-theme=\"light\"]) .profile-avatar-customizer{background:#191922;border-color:#343443}html:not([data-theme=\"light\"]) .profile-avatar-builder-preview{background:#1c1c27;border-color:#343443}html:not([data-theme=\"light\"]) .profile-avatar-builder-actions{background:#191922}html:not([data-theme=\"light\"]) .profile-avatar-group-tab{background:#20202b;border-color:#3b3b4a;color:#e5e7eb}html:not([data-theme=\"light\"]) .profile-avatar-group-tab.is-active{background:#7c3aed;border-color:#7c3aed;color:#fff}html:not([data-theme=\"light\"]) .profile-avatar-part{border-color:#383846;background:#1b1b25}html:not([data-theme=\"light\"]) .profile-avatar-part-option{background:#242431;border-color:#424253;color:#f3f4f6}html:not([data-theme=\"light\"]) .profile-avatar-preview-reset,html:not([data-theme=\"light\"]) .profile-avatar-builder-header button{background:#242431;border-color:#424253;color:#f8fafc}html[data-theme=\"light\"] .profile-avatar-picker.is-expanded{background:#f8fafc;color:#172033}";
  humanAvatarStyle.textContent += '.med-avatar-stack{position:relative;display:block;width:100%;height:100%;aspect-ratio:1;overflow:hidden;border-radius:50%;isolation:isolate}.med-avatar-stack .med-avatar-base{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%}.med-avatar-stack .med-avatar-pet{position:absolute;z-index:3;right:0;bottom:0;width:36%;height:36%;object-fit:contain;pointer-events:none;filter:drop-shadow(0 2px 2px rgba(0,0,0,.25))}.profile-avatar-builder-preview .med-avatar-stack{width:min(100%,240px);height:auto;margin:auto}.profile-avatar-builder-preview .med-avatar-stack .med-avatar-base{position:relative;display:block}.profile-avatar-builder-preview .med-avatar-stack .med-avatar-pet{width:34%;height:34%}.profile-avatar-picker.is-expanded{height:100dvh;overflow:hidden;display:flex;flex-direction:column;padding:clamp(8px,1.6vh,18px)}.profile-avatar-picker.is-expanded .profile-avatar-builder-header{flex:0 0 auto;margin-bottom:10px}.profile-avatar-picker.is-expanded .profile-avatar-builder{flex:1;min-height:0;overflow:hidden;align-items:stretch}.profile-avatar-picker.is-expanded .profile-avatar-builder-preview{height:100%;min-height:0;max-height:100%;align-self:stretch}.profile-avatar-picker.is-expanded .profile-avatar-customizer{height:100%;max-height:100%;min-height:0;overflow-y:auto;overscroll-behavior:contain}.profile-avatar-picker.is-expanded .profile-avatar-group-fields{min-height:0;overflow:visible;overscroll-behavior:auto}.profile-avatar-picker.is-expanded .profile-avatar-builder-actions{flex:0 0 auto}.profile-avatar-picker.is-expanded .profile-avatar-preview-reset{flex:0 0 auto}@media(max-width:760px){.profile-avatar-picker.is-expanded .profile-avatar-builder{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);gap:8px}.profile-avatar-picker.is-expanded .profile-avatar-builder-preview{display:grid;grid-template-columns:auto 1fr auto;grid-template-rows:auto;gap:8px;padding:7px 10px;min-height:0;height:auto;max-height:132px;align-items:center;justify-content:start}.profile-avatar-picker.is-expanded .profile-avatar-builder-preview .med-avatar-stack{grid-column:2;grid-row:1;width:112px;height:112px;margin:0 auto}.profile-avatar-picker.is-expanded .profile-avatar-builder-preview .med-avatar-stack .med-avatar-base{position:absolute}.profile-avatar-picker.is-expanded .profile-avatar-preview-reset{grid-column:1;grid-row:1;align-self:center;padding:7px 8px;font-size:10px}.profile-avatar-picker.is-expanded .profile-avatar-builder-preview>span{grid-column:3;grid-row:1;font-size:10px}.profile-avatar-picker.is-expanded .profile-avatar-customizer{padding:9px}.profile-avatar-picker.is-expanded .profile-avatar-group-fields{min-height:0}.profile-avatar-picker.is-expanded .profile-avatar-builder-actions{grid-template-columns:1fr 1fr;padding:8px 0}.profile-avatar-picker.is-expanded .profile-avatar-confirm-button{grid-column:1/-1}}@media(max-height:620px) and (max-width:760px){.profile-avatar-picker.is-expanded .profile-avatar-builder-preview{max-height:92px}.profile-avatar-picker.is-expanded .profile-avatar-builder-preview .med-avatar-stack{width:78px;height:78px}.profile-avatar-picker.is-expanded .profile-avatar-part{padding:6px}.profile-avatar-picker.is-expanded .profile-avatar-part-option{min-height:34px;padding:5px 8px}}';
  humanAvatarStyle.textContent += "#view-profile .profile-hero{width:min(100%,360px);margin:0 auto 18px;padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:#1a1a24;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,.3);box-sizing:border-box}#view-profile .profile-hero>.profile-avatar{width:100px!important;height:100px!important;min-width:100px;min-height:100px;flex:0 0 100px;margin:0 auto;position:relative;border-radius:50%;overflow:visible}#view-profile .profile-hero>.min-w-0.flex-1{width:100%;display:flex;flex-direction:column;align-items:center;gap:7px;text-align:center}#view-profile .profile-hero .eyebrow{justify-content:center;color:#9e9e9e}#view-profile .profile-hero .profile-name{margin:0;color:#fff;font-size:21px;font-weight:850;line-height:1.25}#view-profile .profile-hero .profile-subtitle{margin:0;color:#9e9e9e;font-size:13px;overflow-wrap:anywhere}#view-profile .profile-hero .mat-profile-batch{display:inline-flex;align-items:center;justify-content:center;padding:6px 11px;border-radius:999px;background:#4a1525;color:#ff8a80;font-size:12px;font-weight:800}#view-profile .profile-hero .auth-btn-target{width:100%;display:flex;justify-content:center}#view-profile .profile-hero .auth-btn-target button{justify-content:center;min-height:40px}#view-profile .profile-avatar-picker:not(.is-expanded){display:none!important}@media(max-width:420px){#view-profile .profile-hero{width:100%;padding:20px 16px;border-radius:12px}#view-profile .profile-hero .profile-name{font-size:19px}}";
  document.head.appendChild(humanAvatarStyle);

  const avatarCustomizerStyle = document.createElement('style');
  avatarCustomizerStyle.id = 'mat-avatar-customizer-strict-style';
  avatarCustomizerStyle.textContent = `
    body.mat-avatar-customizer-open{overflow-anchor:none!important;overscroll-behavior:none!important}
    #profile-avatar-picker:not(.is-expanded){display:none!important}
    #profile-avatar-picker.is-expanded{position:fixed!important;inset:0!important;z-index:100030!important;width:100vw!important;height:100vh!important;height:100dvh!important;max-width:none!important;margin:0!important;padding:20px!important;display:flex!important;flex-direction:column!important;gap:16px!important;overflow:hidden!important;border:0!important;border-radius:0!important;background:#121218!important;color:#fff!important;box-sizing:border-box!important}
    #profile-avatar-picker.is-expanded .profile-avatar-builder-header{display:flex;align-items:center;gap:12px;flex:0 0 40px;width:100%;max-width:960px;margin:0 auto}
    #profile-avatar-picker.is-expanded .profile-avatar-builder-header h2{margin:0;color:#fff;font-size:clamp(18px,2.4vw,24px);font-weight:800;line-height:1.3}
    #profile-avatar-picker.is-expanded .profile-avatar-builder-header button{display:grid;place-items:center;width:40px;height:40px;flex:0 0 40px;border:1px solid #383846;border-radius:10px;background:#1a1a24;color:#fff}
    #profile-avatar-picker.is-expanded .profile-avatar-builder-header svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .mat-avatar-workspace{display:grid;grid-template-columns:340px minmax(0,1fr);gap:24px;width:100%;max-width:960px;min-height:0;flex:1;margin:0 auto;overflow:hidden}
    .mat-avatar-preview-panel{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0;min-height:0;padding:20px;border-radius:16px;background:#1a1a24}
    .mat-avatar-reset{position:absolute;top:16px;right:16px;padding:6px 12px;border:1px solid #ffffff18;border-radius:12px;background:#ffffff12;color:#fff;font-size:12px;font-weight:700}
    .profile-avatar-preview-stack{display:block;width:min(100%,260px);height:auto;aspect-ratio:1;margin:auto;overflow:hidden;border-radius:50%;isolation:isolate}
    .profile-avatar-preview-stack .med-avatar-base{position:relative;display:block;width:100%;height:100%;object-fit:cover}
    .profile-avatar-preview-stack .med-avatar-pet{right:0;bottom:0;width:36%;height:36%}
    .mat-avatar-preview-caption{margin-top:12px;color:#9e9e9e;font-size:12px}
    .mat-avatar-controls{display:flex;flex-direction:column;min-width:0;min-height:0;padding:20px;border-radius:16px;background:#1a1a24;overflow:hidden}
    .mat-avatar-category-bar{display:flex;flex:0 0 auto;gap:4px;min-width:0;margin-bottom:14px;overflow-x:auto;overflow-y:hidden;border-bottom:1px solid #333344;scrollbar-width:thin}
    .mat-avatar-category{display:flex;flex:0 0 auto;align-items:center;justify-content:center;gap:7px;min-height:42px;padding:8px 11px;border:0;border-bottom:2px solid transparent;background:transparent;color:#9e9e9e;font-size:12px;font-weight:700;white-space:nowrap}
    .mat-avatar-category.is-active{border-bottom-color:#10b981;color:#fff}
    .mat-avatar-category i{font-size:14px}
    .mat-avatar-options-scroll{display:flex;flex:1;flex-direction:column;gap:20px;min-height:0;padding:2px 8px 10px 0;overflow-y:auto;overscroll-behavior:contain}
    .mat-avatar-option-section{min-width:0}
    .mat-avatar-option-section h3{margin:0 0 10px;color:#fff;font-size:13px;font-weight:800}
    .mat-avatar-option-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .mat-avatar-option{display:flex;align-items:center;justify-content:center;gap:8px;min-width:0;min-height:54px;padding:8px;border:1px solid #333344;border-radius:10px;background:#1e1e2d;color:#e5e7eb;font-size:12px;font-weight:650;overflow:hidden}
    .mat-avatar-option.is-selected{border:2px solid #10b981;background:#222230}
    .mat-avatar-swatch{display:block;width:22px;height:22px;flex:0 0 22px;border:2px solid #ffffff25;border-radius:50%;background:var(--swatch)}
    .mat-avatar-option-art{width:34px;height:34px;flex:0 0 34px;object-fit:contain}
    .mat-avatar-actions{flex:0 0 auto;margin-top:14px;padding-top:12px;border-top:1px solid #333344}
    .mat-avatar-actions .profile-avatar-confirm-button{display:flex;width:100%;min-height:48px;align-items:center;justify-content:center;border:0;border-radius:8px;background:#10b981;color:#fff;font-size:15px;font-weight:850}
    .mat-avatar-actions .profile-avatar-confirm-button:disabled{opacity:.45}
    #profile-avatar-upload-status{display:none}
    @media(max-width:760px){
      #profile-avatar-picker.is-expanded{padding:12px!important;gap:10px!important}
      .mat-avatar-workspace{grid-template-columns:minmax(0,1fr);grid-template-rows:clamp(125px,22vh,180px) minmax(0,1fr);gap:10px}
      .mat-avatar-preview-panel{padding:8px;min-height:0}
      .profile-avatar-preview-stack{width:min(100%,112px)}
      .mat-avatar-reset{top:8px;right:8px;padding:5px 9px;font-size:11px}
      .mat-avatar-preview-caption{margin-top:4px;font-size:10px}
      .mat-avatar-controls{padding:10px}
      .mat-avatar-category-bar{margin-bottom:8px}
      .mat-avatar-category{min-height:38px;padding:6px 9px;font-size:11px}
      .mat-avatar-option-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .mat-avatar-option{min-height:46px;padding:6px;font-size:11px}
      .mat-avatar-option-art{width:28px;height:28px;flex-basis:28px}
      .mat-avatar-actions{margin-top:8px;padding-top:8px}
      .mat-avatar-actions .profile-avatar-confirm-button{min-height:44px}
    }
    @media(max-height:560px) and (max-width:760px){
      .mat-avatar-workspace{grid-template-rows:96px minmax(0,1fr)}
      .profile-avatar-preview-stack{width:78px}
      .mat-avatar-preview-caption{display:none}
    }
    @media(prefers-reduced-motion:reduce){#profile-avatar-picker.is-expanded{animation:none!important}}
  `;

  avatarCustomizerStyle.textContent += `
    #profile-avatar-picker.is-expanded{padding:24px 3.2vw!important;gap:18px!important}
    #profile-avatar-picker.is-expanded .profile-avatar-builder-header{max-width:1440px;flex-basis:42px}
    .mat-avatar-workspace{grid-template-columns:minmax(300px,390px) minmax(0,756px);gap:26px;max-width:1172px}
    .mat-avatar-preview-panel{min-height:0;aspect-ratio:0.82;max-height:min(70vh,540px);align-self:start;justify-content:center;padding:0;background:#a5a8ff;border-radius:30px;overflow:hidden}
    .mat-avatar-preview-panel .profile-avatar-preview-stack{width:100%;height:100%;max-width:none;aspect-ratio:auto;margin:0;border-radius:0;overflow:hidden}
    .mat-avatar-preview-panel .profile-avatar-preview-stack .med-avatar-base{width:100%;height:100%;object-fit:cover}
    .mat-avatar-preview-panel .mat-avatar-reset{z-index:3;top:14px;right:14px;border:0;border-radius:20px;background:rgba(24,27,70,.72);color:#fff}
    .mat-avatar-preview-caption{position:absolute;left:14px;bottom:12px;margin:0;padding:5px 9px;border-radius:8px;background:rgba(24,27,70,.5);color:#fff}
    .mat-avatar-controls{padding:0;border:1px solid #77777b;border-radius:30px;background:#121212}
    .mat-avatar-category-bar{height:74px;flex:0 0 74px;align-items:stretch;justify-content:space-around;gap:0;margin:0;padding:0 8px;border-bottom:1px solid #77777b;border-radius:30px 30px 0 0;background:#171717;scrollbar-width:none}
    .mat-avatar-category-bar::-webkit-scrollbar{display:none}
    .mat-avatar-category{position:relative;display:grid;place-items:center;min-width:54px;min-height:72px;flex:1 0 54px;padding:8px 10px;border:0;border-bottom:4px solid transparent;border-radius:0;background:transparent;color:#777;font-size:0}
    .mat-avatar-category svg{width:25px;height:25px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .mat-avatar-category.is-active{border-bottom-color:#10b981;color:#10b981}
    .mat-avatar-category:hover{color:#d1d5db}
    .mat-avatar-category.is-active:hover{color:#10b981}
    .mat-avatar-options-scroll{gap:24px;padding:22px 20px 18px;scrollbar-width:thin;scrollbar-color:#343443 transparent}
    .mat-avatar-option-section h3{margin-bottom:12px;font-size:14px}
    .mat-avatar-option-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .mat-avatar-option{min-height:56px;border:2px solid #777;border-radius:15px;background:#393939;color:#f4f4f5;font-size:12px}
    .mat-avatar-option.is-selected{border:2px solid #10b981;background:#393939;box-shadow:0 0 0 1px #10b98122}
    .mat-avatar-option:has(.mat-avatar-swatch){width:52px;min-width:52px;height:52px;min-height:52px;padding:0;border:0;border-radius:11px;background:transparent;box-shadow:none}
    .mat-avatar-option:has(.mat-avatar-swatch) .mat-avatar-swatch{width:100%;height:100%;border:0;border-radius:11px;background:var(--swatch)}
    .mat-avatar-option:has(.mat-avatar-swatch) span:not(.mat-avatar-swatch){display:none}
    .mat-avatar-option:has(.mat-avatar-swatch).is-selected{border:2px solid #10b981;padding:2px}
    .mat-avatar-option:has(.mat-avatar-swatch).is-selected .mat-avatar-swatch{border-radius:8px}
    .mat-avatar-actions{margin:0;padding:13px 16px;border-top:1px solid #777}
    .mat-avatar-actions .profile-avatar-confirm-button{min-height:54px;border-radius:15px;background:#16a34a;box-shadow:0 4px 0 #087c36;font-size:16px}
    .mat-avatar-actions .profile-avatar-confirm-button:active{transform:translateY(2px);box-shadow:0 2px 0 #087c36}
    .mat-avatar-option:hover,.mat-avatar-category:hover{transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease}
    .mat-avatar-option:hover{transform:scale(1.025);border-color:#10b981}
    @media(max-width:760px){
      #profile-avatar-picker.is-expanded{padding:12px!important;gap:10px!important}
      .mat-avatar-workspace{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(120px,22vh) minmax(0,1fr);gap:10px}
      .mat-avatar-preview-panel{width:100%;max-height:none;aspect-ratio:auto;min-height:0;border-radius:18px}
      .mat-avatar-preview-panel .profile-avatar-preview-stack{width:auto;height:100%;max-width:100%;aspect-ratio:1;margin:0 auto}
      .mat-avatar-preview-panel .mat-avatar-preview-stack .med-avatar-base{width:100%;height:100%;object-fit:contain}
      .mat-avatar-reset{top:8px!important;right:8px!important}
      .mat-avatar-controls{border-radius:20px}
      .mat-avatar-category-bar{height:60px;flex-basis:60px;border-radius:20px 20px 0 0;justify-content:flex-start;overflow-x:auto}
      .mat-avatar-category{min-width:48px;min-height:58px;flex-basis:48px;padding:7px}
      .mat-avatar-category svg{width:22px;height:22px}
      .mat-avatar-options-scroll{padding:14px 12px;gap:18px}
      .mat-avatar-option-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .mat-avatar-option{min-height:48px;padding:6px}
      .mat-avatar-option:has(.mat-avatar-swatch){width:44px;min-width:44px;height:44px;min-height:44px}
      .mat-avatar-actions{padding:9px 10px}
      .mat-avatar-actions .profile-avatar-confirm-button{min-height:46px}
    }
    @media(max-height:560px) and (max-width:760px){
      .mat-avatar-workspace{grid-template-rows:92px minmax(0,1fr)}
      .mat-avatar-preview-panel .profile-avatar-preview-stack{width:90px}
    }
    @media(prefers-reduced-motion:reduce){
      .mat-avatar-option,.mat-avatar-category,.mat-avatar-actions .profile-avatar-confirm-button{transition:none!important}
      .mat-avatar-option:hover{transform:none}
    }
  `;
  avatarCustomizerStyle.textContent += `
    /* Final dual-pane sizing and a single continuous vertical options scroller. */
    html:has(#profile-avatar-picker.is-expanded),body.mat-avatar-customizer-open{width:100%;height:100%}
    #profile-avatar-picker.is-expanded{box-sizing:border-box!important;width:100vw!important;height:100vh!important;height:100dvh!important;overflow:hidden!important;padding:clamp(12px,2.4vw,28px)!important;gap:clamp(10px,1.5vh,18px)!important}
    #profile-avatar-picker.is-expanded .profile-avatar-builder-header{width:100%;max-width:1172px;flex:0 0 42px}
    .mat-avatar-workspace{display:grid;grid-template-columns:minmax(280px,390px) minmax(0,756px);grid-template-rows:minmax(0,1fr);align-items:stretch;gap:clamp(12px,2vw,26px);width:100%;max-width:1172px;min-height:0;flex:1;margin:0 auto;overflow:hidden}
    .mat-avatar-preview-panel{position:relative;align-self:stretch;justify-content:center;min-height:0;max-height:none;aspect-ratio:auto;padding:0;overflow:hidden;border-radius:clamp(16px,2.2vw,30px);background:#a5a8ff}
    .mat-avatar-preview-panel .profile-avatar-preview-stack{position:relative;width:100%;height:100%;max-width:none;aspect-ratio:auto;margin:0;border-radius:inherit;overflow:hidden}
    .mat-avatar-preview-panel .profile-avatar-preview-stack .med-avatar-base{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
    .mat-avatar-preview-panel .profile-avatar-preview-stack .med-avatar-pet{z-index:3;left:0!important;right:auto!important;bottom:5%!important}
    .mat-avatar-preview-panel .mat-avatar-reset{position:absolute;z-index:5;top:14px;right:14px;border:0;border-radius:999px;padding:7px 13px;background:rgba(24,27,70,.72);color:#fff}
    .mat-avatar-controls{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;padding:0;border:1px solid #777;border-radius:clamp(16px,2.2vw,30px);background:#121212}
    .mat-avatar-category-bar{display:flex;flex:0 0 68px;align-items:stretch;justify-content:space-around;gap:0;min-width:0;margin:0;padding:0 8px;overflow-x:auto;overflow-y:hidden;border-bottom:1px solid #555;border-radius:inherit;background:#171717;scrollbar-width:none}
    .mat-avatar-category-bar::-webkit-scrollbar{display:none}
    .mat-avatar-category{display:grid;place-items:center;flex:1 0 48px;min-width:48px;min-height:66px;padding:8px;border:0;border-bottom:3px solid transparent;border-radius:0;background:transparent;color:#888;font-size:0!important}
    .mat-avatar-category svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .mat-avatar-category.is-active{border-bottom-color:#10b981;color:#10b981}
    .mat-avatar-options-scroll{display:block!important;flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;scrollbar-width:thin;scrollbar-color:#45454d transparent;padding:20px 18px 24px!important;scroll-behavior:smooth}
    .mat-avatar-group-section{display:grid;gap:20px;margin:0 0 30px}
    .mat-avatar-option-section{min-width:0}
    .mat-avatar-option-section h3{margin:0 0 11px;color:#f4f4f5;font-size:14px;font-weight:800}
    .mat-avatar-option-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px}
    .mat-avatar-option{display:grid;place-items:center;min-width:0;min-height:72px;aspect-ratio:1;padding:4px;border:1px solid #555;border-radius:13px;background:#29292e;color:#fff;overflow:hidden}
    .mat-avatar-option.is-selected{border:2px solid #10b981;background:#29292e;box-shadow:0 0 0 1px #10b98122}
    .mat-avatar-option-preview-stack{position:relative;display:block;width:100%;height:100%;aspect-ratio:1;overflow:hidden;border-radius:9px;isolation:isolate}
    .mat-avatar-option-preview-stack .med-avatar-base{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
    .mat-avatar-option-preview-stack .med-avatar-pet{position:absolute;z-index:3;left:0!important;right:auto!important;bottom:5%;width:36%;height:36%;object-fit:contain}
    .mat-avatar-option-grid:has(.mat-avatar-swatch){display:flex;flex-wrap:nowrap;gap:9px;overflow-x:auto;padding:2px 2px 7px}
    .mat-avatar-option:has(.mat-avatar-swatch){width:48px;min-width:48px;height:48px;min-height:48px;aspect-ratio:1;padding:0;border-radius:11px;background:transparent}
    .mat-avatar-option:has(.mat-avatar-swatch) .mat-avatar-swatch{width:100%;height:100%;border:0;border-radius:9px}
    .mat-avatar-option:has(.mat-avatar-swatch).is-selected{padding:2px}
    .mat-avatar-actions{flex:0 0 auto;margin:0;padding:12px 16px;border-top:1px solid #555}
    .mat-avatar-actions .profile-avatar-confirm-button{display:flex;width:100%;min-height:52px;align-items:center;justify-content:center;border:0;border-radius:12px;background:#10b981;color:#fff;font-size:16px;font-weight:850}
    .mat-avatar-actions .profile-avatar-confirm-button:disabled{opacity:.45}
    .mat-avatar-option:hover{transform:scale(1.035);border-color:#10b981}
    .mat-avatar-preview-panel .profile-avatar-preview-stack{animation:matAvatarBreath 4s ease-in-out infinite}
    .mat-avatar-preview-panel .profile-avatar-preview-stack .med-avatar-pet{animation:matAvatarPetFloat 3.2s ease-in-out infinite}
    @media(max-width:760px){
      #profile-avatar-picker.is-expanded{padding:10px!important;gap:8px!important}
      .mat-avatar-workspace{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(112px,21vh) minmax(0,1fr);gap:8px}
      .mat-avatar-preview-panel{width:100%;max-height:none;min-height:0;aspect-ratio:auto;border-radius:16px}
      .mat-avatar-preview-panel .profile-avatar-preview-stack{width:auto;height:100%;max-width:100%;aspect-ratio:1;margin:0 auto}
      .mat-avatar-preview-panel .profile-avatar-preview-stack .med-avatar-base{object-fit:contain}
      .mat-avatar-preview-panel .mat-avatar-reset{top:7px;right:7px;padding:5px 10px;font-size:11px}
      .mat-avatar-controls{border-radius:16px}
      .mat-avatar-category-bar{height:56px;flex-basis:56px;justify-content:flex-start;overflow-x:auto}
      .mat-avatar-category{min-width:46px;min-height:54px;flex-basis:46px}
      .mat-avatar-category svg{width:21px;height:21px}
      .mat-avatar-options-scroll{padding:13px 11px 18px!important}
      .mat-avatar-option-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .mat-avatar-option{min-height:60px}
      .mat-avatar-option:has(.mat-avatar-swatch){width:42px;min-width:42px;height:42px;min-height:42px}
      .mat-avatar-actions{padding:8px 10px}
      .mat-avatar-actions .profile-avatar-confirm-button{min-height:44px}
    }
    @media(max-height:560px) and (max-width:760px){
      .mat-avatar-workspace{grid-template-rows:86px minmax(0,1fr)}
    }
    @media(prefers-reduced-motion:reduce){
      .mat-avatar-options-scroll{scroll-behavior:auto!important}
      .mat-avatar-option,.mat-avatar-category,.mat-avatar-actions .profile-avatar-confirm-button{transition:none!important}
      .mat-avatar-option:hover{transform:none}
      .mat-avatar-preview-panel .profile-avatar-preview-stack,.mat-avatar-preview-panel .profile-avatar-preview-stack .med-avatar-pet{animation:none!important}
    }
  `;
  avatarCustomizerStyle.textContent += `
    /* Avatar previews, state transitions and the single-scroll navigation. */
    .mat-avatar-options-scroll{display:block!important;flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;scroll-behavior:smooth}
    .mat-avatar-group-section{display:grid;gap:22px;margin:0 0 28px}
    .mat-avatar-option-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
    .mat-avatar-option{position:relative;display:grid;place-items:center;min-width:0;min-height:76px;aspect-ratio:1;padding:4px;border:1px solid #555;border-radius:13px;background:#29292e;color:#fff;overflow:hidden}
    .mat-avatar-option.is-selected{border:2px solid #10b981;background:#29292e;box-shadow:0 0 0 1px #10b98122}
    .mat-avatar-option-preview-stack{position:relative;display:block;width:100%;height:100%;aspect-ratio:1;overflow:hidden;border-radius:9px;isolation:isolate}
    .mat-avatar-option-preview-stack .med-avatar-base{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
    .mat-avatar-option-preview-stack .med-avatar-pet{position:absolute;z-index:3;left:0!important;right:auto!important;bottom:5%;width:36%;height:36%;object-fit:contain}
    .profile-avatar-preview-stack .med-avatar-pet{left:0!important;right:auto!important;bottom:5%!important}
    .mat-avatar-preview-panel .profile-avatar-preview-stack{animation:matAvatarBreath 4s ease-in-out infinite}
    .mat-avatar-preview-panel .profile-avatar-preview-stack .med-avatar-pet{animation:matAvatarPetFloat 3.2s ease-in-out infinite}
    .mat-avatar-option-grid:has(.mat-avatar-swatch){display:flex;flex-wrap:nowrap;gap:9px;overflow-x:auto;padding:2px 2px 7px}
    .mat-avatar-option:has(.mat-avatar-swatch){width:48px;min-width:48px;height:48px;min-height:48px;aspect-ratio:1;padding:0;border-radius:11px;background:transparent}
    .mat-avatar-option:has(.mat-avatar-swatch) .mat-avatar-swatch{width:100%;height:100%;border:0;border-radius:9px}
    .mat-avatar-option:has(.mat-avatar-swatch).is-selected{padding:2px}
    .mat-avatar-category{font-size:0!important}
    .mat-avatar-category svg{width:25px;height:25px}
    .mat-avatar-preview-caption{display:none!important}
    .mat-avatar-controls{min-height:0}
    .mat-avatar-actions{position:relative;flex:0 0 auto}
    .mat-avatar-actions .profile-avatar-confirm-button{width:100%}
    .mat-avatar-option:hover{transform:scale(1.035);border-color:#10b981}
    @media(max-width:760px){
      .mat-avatar-option-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
      .mat-avatar-option{min-height:64px}
      .mat-avatar-option:has(.mat-avatar-swatch){width:42px;min-width:42px;height:42px;min-height:42px}
      .mat-avatar-options-scroll{padding-bottom:18px}
    }
    .mat-avatar-live-layer{position:absolute;inset:0;display:grid;place-items:center;overflow:hidden;border-radius:50%;opacity:0;transform:scale(.965);filter:blur(3px);transition:opacity .68s cubic-bezier(.22,.61,.36,1),transform .68s cubic-bezier(.22,.61,.36,1),filter .68s cubic-bezier(.22,.61,.36,1);pointer-events:none;will-change:opacity,transform,filter}
    #sidebar-user-avatar{position:relative}
    .sidebar-user-avatar-wrap .mat-sidebar-avatar-edit{position:absolute;right:-2px;bottom:-2px;z-index:20;display:grid;place-items:center;width:20px;height:20px;padding:0;border:2px solid #0a1220;border-radius:50%;background:#10b981;color:#052e20;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.28)}
    .sidebar-user-avatar-wrap .mat-sidebar-avatar-edit svg{width:11px;height:11px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    html[data-theme="light"] .sidebar-user-avatar-wrap .mat-sidebar-avatar-edit{border-color:#fff}
    .mat-avatar-live-layer.is-visible{opacity:1;transform:scale(1);filter:blur(0)}
    .mat-avatar-live-layer>img{width:100%;height:100%;object-fit:cover;border-radius:inherit}
    .mat-avatar-live-layer .med-avatar-stack{width:100%;height:100%;border-radius:inherit}
    .mat-avatar-live-layer .med-avatar-base{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
    .mat-avatar-live-layer .med-avatar-pet{position:absolute;z-index:3;left:0!important;right:auto!important;bottom:5%!important;width:36%;height:36%;object-fit:contain}
    .profile-avatar.mat-avatar-living,#sidebar-user-avatar.mat-avatar-living{animation:matAvatarBreath 4s ease-in-out infinite;isolation:isolate}
    .profile-avatar.mat-avatar-living .mat-profile-edit-badge{z-index:8}
    .mat-avatar-live-layer .med-avatar-pet{transform-origin:50% 100%;animation:matAvatarPetFloat 3.2s ease-in-out infinite}
    @keyframes matAvatarBreath{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-2px) scale(1.015)}}
    @keyframes matAvatarPetFloat{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-2px) rotate(-2deg)}}
    @media(prefers-reduced-motion:reduce){
      .mat-avatar-preview-panel .profile-avatar-preview-stack,.mat-avatar-preview-panel .profile-avatar-preview-stack .med-avatar-pet{animation:none!important}
      .mat-avatar-options-scroll{scroll-behavior:auto!important}
      .mat-avatar-option,.mat-avatar-live-layer{transition:none!important}
      .mat-avatar-option:hover{transform:none}
      .profile-avatar.mat-avatar-living,#sidebar-user-avatar.mat-avatar-living,.mat-avatar-live-layer .med-avatar-pet{animation:none!important}
    }
  `;
  avatarCustomizerStyle.textContent += `
    .mat-avatar-preview-panel{isolation:isolate}
    .mat-avatar-preview-panel .profile-avatar-preview-stack{transform-origin:50% 48%;animation:matAvatarPreviewBreath 4.2s ease-in-out infinite}
    .mat-avatar-preview-panel .profile-avatar-preview-stack .med-avatar-pet{transform-origin:50% 100%;animation:matAvatarPreviewPet 3.1s ease-in-out infinite}
    .mat-avatar-transition-old{position:absolute!important;inset:0!important;z-index:4!important;width:100%!important;height:100%!important;max-width:none!important;margin:0!important;animation:matAvatarCrossFadeOut .24s ease forwards!important;pointer-events:none!important}
    .mat-avatar-transition-new{animation:matAvatarCrossFadeIn .28s ease both!important}
    .mat-avatar-focus-zoom .profile-avatar-preview-stack .med-avatar-base{animation:matAvatarFocusZoom .62s cubic-bezier(.2,.75,.25,1) both}
    @keyframes matAvatarCrossFadeIn{from{opacity:.35;filter:blur(2px)}to{opacity:1;filter:blur(0)}}
    @keyframes matAvatarCrossFadeOut{from{opacity:1}to{opacity:0}}
    @keyframes matAvatarFocusZoom{0%{transform:scale(1);filter:brightness(1)}38%{transform:scale(1.16);filter:brightness(1.04)}100%{transform:scale(1);filter:brightness(1)}}
    @keyframes matAvatarPreviewBreath{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-3px) scale(1.012)}}
    @keyframes matAvatarPreviewPet{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-3px) rotate(-2deg)}}
    @media(prefers-reduced-motion:reduce){
      .mat-avatar-preview-panel .profile-avatar-preview-stack,.mat-avatar-preview-panel .profile-avatar-preview-stack .med-avatar-pet,
      .mat-avatar-transition-old,.mat-avatar-transition-new,.mat-avatar-focus-zoom .profile-avatar-preview-stack .med-avatar-base{animation:none!important}
    }
  `;

  avatarCustomizerStyle.textContent += `

    /* Save feedback stays visible while the real account update is running. */
    .mat-avatar-save-feedback{display:block;margin-top:10px;min-height:18px;text-align:center;font-size:12px;font-weight:750;line-height:1.45}
    .mat-avatar-save-feedback[hidden]{display:none!important}
    .mat-avatar-save-feedback[data-state="loading"]{color:#10b981}
    .mat-avatar-save-feedback[data-state="loading"]:after{content:"";display:inline-block;width:1.2em;text-align:left;animation:matAvatarSavingDots 1.05s steps(4,end) infinite;vertical-align:baseline}
    .mat-avatar-save-feedback[data-state="success"]{color:#10b981}
    .mat-avatar-save-feedback[data-state="warning"]{color:#d97706}
    .mat-avatar-save-feedback[data-state="error"]{color:#ef4444}
    @keyframes matAvatarSavingDots{0%{content:""}25%{content:"."}50%{content:".."}75%,100%{content:"..."}}
    /* Light and Dark use identical geometry and restrained neutral surfaces. */
    html[data-theme="dark"] #profile-avatar-picker.is-expanded{background:#121218!important;color:#f8fafc!important}
    html[data-theme="dark"] #profile-avatar-picker.is-expanded .mat-avatar-controls{background:#121218!important;border-color:#44444d!important}
    html[data-theme="dark"] #profile-avatar-picker.is-expanded .mat-avatar-category-bar{background:#171717!important;border-color:#44444d!important}
    html[data-theme="dark"] #profile-avatar-picker.is-expanded .mat-avatar-option{background:#3b3b3b!important;border-color:#777!important;color:#f8fafc!important}
    html[data-theme="dark"] #profile-avatar-picker.is-expanded .mat-avatar-option.is-selected{border-color:#10b981!important}
    html[data-theme="dark"] #profile-avatar-picker.is-expanded .mat-avatar-option-section h3{color:#f8fafc!important}
    html[data-theme="light"] #profile-avatar-picker.is-expanded{background:#f8fafc!important;color:#111827!important}
    html[data-theme="light"] #profile-avatar-picker.is-expanded .profile-avatar-builder-header h2{color:#111827!important}
    html[data-theme="light"] #profile-avatar-picker.is-expanded .profile-avatar-builder-header button{background:#fff!important;border-color:#d1d5db!important;color:#111827!important}
    html[data-theme="light"] #profile-avatar-picker.is-expanded .mat-avatar-controls{background:#fff!important;border-color:#d1d5db!important}
    html[data-theme="light"] #profile-avatar-picker.is-expanded .mat-avatar-category-bar{background:#fff!important;border-color:#e5e7eb!important}
    html[data-theme="light"] #profile-avatar-picker.is-expanded .mat-avatar-category{color:#6b7280!important}
    html[data-theme="light"] #profile-avatar-picker.is-expanded .mat-avatar-category.is-active{color:#059669!important;border-bottom-color:#10b981!important}
    html[data-theme="light"] #profile-avatar-picker.is-expanded .mat-avatar-option{background:#f1f5f9!important;border-color:#cbd5e1!important;color:#111827!important}
    html[data-theme="light"] #profile-avatar-picker.is-expanded .mat-avatar-option-preview-stack{background:#e5e7eb!important}
    html[data-theme="light"] #profile-avatar-picker.is-expanded .mat-avatar-option.is-selected{background:#ecfdf5!important;border-color:#10b981!important}
    html[data-theme="light"] #profile-avatar-picker.is-expanded .mat-avatar-option-section h3{color:#111827!important}
    html[data-theme="light"] #profile-avatar-picker.is-expanded .mat-avatar-actions{background:#fff!important;border-color:#e5e7eb!important}
    html[data-theme="light"] #profile-avatar-picker.is-expanded .mat-avatar-save-feedback{color:#047857}
    html[data-theme="light"] #profile-avatar-picker.is-expanded .mat-avatar-save-feedback[data-state="warning"]{color:#b45309}
    html[data-theme="light"] #profile-avatar-picker.is-expanded .mat-avatar-save-feedback[data-state="error"]{color:#b91c1c}
    html[data-theme="light"] #profile-avatar-picker.is-expanded .mat-avatar-reset{background:rgba(255,255,255,.9)!important;color:#111827!important;border:1px solid #d1d5db!important}
    html[data-theme="light"] #profile-avatar-picker.is-expanded .mat-avatar-preview-caption{background:rgba(255,255,255,.88)!important;color:#374151!important}


    .mat-avatar-actions .profile-avatar-confirm-button[aria-busy="true"]{opacity:.96;cursor:wait}
    .mat-avatar-actions .profile-avatar-confirm-button.is-success{background:#059669!important;color:#fff!important;opacity:1!important}
    .mat-avatar-button-dots{display:inline-flex;align-items:center;gap:3px;margin-left:5px}
    .mat-avatar-button-dots i{display:block;width:4px;height:4px;border-radius:50%;background:currentColor;animation:matAvatarDotPulse .9s ease-in-out infinite}
    .mat-avatar-button-dots i:nth-child(2){animation-delay:.14s}
    .mat-avatar-button-dots i:nth-child(3){animation-delay:.28s}
    @keyframes matAvatarDotPulse{0%,60%,100%{opacity:.35;transform:translateY(0)}30%{opacity:1;transform:translateY(-2px)}}
    /* Face movement and breathing run continuously, not only during Gmail/custom swapping. */
    .profile-avatar.mat-avatar-living .med-avatar-stack,
    #sidebar-user-avatar.mat-avatar-living .med-avatar-stack,
    .mat-avatar-live-layer.is-visible .med-avatar-stack{
      animation:matAvatarNaturalIdle 5.8s ease-in-out infinite;
      transform-origin:50% 55%;
    }
    .med-avatar-stack .med-avatar-age-lines{
      position:absolute;z-index:1;inset:0;width:100%;height:100%;
      display:block;pointer-events:none;overflow:visible;
    }
    .profile-avatar.mat-avatar-living .med-avatar-stack .med-avatar-pet,
    #sidebar-user-avatar.mat-avatar-living .med-avatar-stack .med-avatar-pet{
      animation:matAvatarPetFloat 3.8s ease-in-out infinite;
    }
    @media(prefers-reduced-motion:reduce){
      .mat-avatar-button-dots i,.profile-avatar.mat-avatar-living .med-avatar-stack,
      #sidebar-user-avatar.mat-avatar-living .med-avatar-stack,
      .mat-avatar-live-layer.is-visible .med-avatar-stack{animation:none!important}
    }

    /* Keep the app sidebar and its bottom profile card visible beside the desktop builder. */
    #profile-avatar-picker.is-expanded{
      left:var(--sidebar-width,264px)!important;
      width:calc(100vw - var(--sidebar-width,264px))!important;
      min-width:0!important;
    }
    body.sidebar-collapsed #profile-avatar-picker.is-expanded{
      left:70px!important;width:calc(100vw - 70px)!important;
    }
    @media(max-width:767px){
      #profile-avatar-picker.is-expanded{left:0!important;width:100vw!important}
    }
    /* Reference finish: clear full-face preview cards and genuinely subtle idle motion. */
    .mat-avatar-option-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:12px!important}
    .mat-avatar-option{min-height:0!important;aspect-ratio:1!important;padding:5px!important;border:2px solid #777!important;border-radius:16px!important;background:#3b3b3b!important}
    .mat-avatar-option.is-selected{border:2px solid #10b981!important;background:#3b3b3b!important;box-shadow:0 0 0 1px rgba(16,185,129,.2)!important}
    .mat-avatar-option-preview-stack{width:100%!important;height:100%!important;border-radius:11px!important;background:#3b3b3b!important}
    .mat-avatar-option-preview-stack .med-avatar-base,.mat-avatar-option-preview-stack .med-avatar-inline-svg{width:100%!important;height:100%!important;object-fit:contain!important}
    .mat-avatar-preview-panel .profile-avatar-preview-stack{transform-origin:50% 55%;animation:matAvatarNaturalIdle 5.8s ease-in-out infinite!important}
    .mat-avatar-preview-panel .profile-avatar-preview-stack .med-avatar-pet{animation:matAvatarPetFloat 3.8s ease-in-out infinite}
    .med-avatar-inline-svg{display:block;overflow:visible}
    @keyframes matAvatarNaturalIdle{0%,100%{transform:translateY(0) rotate(0) scale(1)}42%{transform:translateY(-1.6px) rotate(-.18deg) scale(1.004)}76%{transform:translateY(-.5px) rotate(.12deg) scale(1.002)}}
    @keyframes matAvatarBreath{0%,100%{transform:translateY(0) scale(1)}48%{transform:translateY(-1px) scale(1.005)}}
    @media(max-width:760px){
      .mat-avatar-option-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important}
      .mat-avatar-option{border-radius:13px!important}
    }
    @media(prefers-reduced-motion:reduce){
      .mat-avatar-preview-panel .profile-avatar-preview-stack,.mat-avatar-preview-panel .profile-avatar-preview-stack .med-avatar-pet,
      .profile-avatar.mat-avatar-living,#sidebar-user-avatar.mat-avatar-living{animation:none!important}
    }
  `;

  document.head.appendChild(avatarCustomizerStyle);

  const avatarBuilderFinalStyle = document.createElement('style');
  avatarBuilderFinalStyle.id = 'mat-avatar-builder-final-polish';
  avatarBuilderFinalStyle.textContent = `
    /* Compact portrait preview: the selected accessories remain separate. */
    #profile-avatar-picker.is-expanded .mat-avatar-workspace{
      grid-template-columns:minmax(300px,380px) minmax(0,756px)!important;
      gap:26px!important;max-width:1172px!important;
    }
    #profile-avatar-picker.is-expanded .mat-avatar-preview-panel{
      width:100%!important;height:auto!important;max-height:min(70vh,540px)!important;
      min-height:0!important;aspect-ratio:.82!important;align-self:start!important;
      display:flex!important;align-items:center!important;justify-content:center!important;
      overflow:visible!important;border-radius:16px!important;
    }
    #profile-avatar-picker.is-expanded .profile-avatar-preview-stack{
      position:relative!important;width:100%!important;height:100%!important;
      max-width:none!important;max-height:none!important;aspect-ratio:auto!important;
      margin:auto!important;overflow:visible!important;border-radius:0!important;
      background:transparent!important;clip-path:none!important;mask:none!important;
      box-shadow:none!important;transform-origin:50% 60%!important;
      animation:matAvatarPreviewLife 3.1s ease-in-out infinite!important;
    }
    #profile-avatar-picker.is-expanded .profile-avatar-preview-stack .med-avatar-base,
    #profile-avatar-picker.is-expanded .profile-avatar-preview-stack .med-avatar-inline-svg{
      position:absolute!important;inset:0!important;width:100%!important;height:100%!important;
      border-radius:0!important;object-fit:contain!important;overflow:visible!important;
      animation:matAvatarFaceLife 3.4s ease-in-out infinite!important;
    }
    #profile-avatar-picker.is-expanded .mat-avatar-preview-panel{
      background-image:none!important;transition:background-color .18s ease!important;
    }
    #profile-avatar-picker.is-expanded .profile-avatar-preview-stack .med-avatar-pet{
      position:absolute!important;left:-5%!important;right:auto!important;bottom:2%!important;
      width:20%!important;height:20%!important;z-index:4!important;
      object-fit:contain!important;transform-origin:50% 100%!important;
      animation:matAvatarCompanionLife 2.5s ease-in-out infinite!important;
    }
    #profile-avatar-picker.is-expanded .mat-avatar-option-preview-stack{
      border-radius:0!important;overflow:visible!important;background:transparent!important;
      clip-path:none!important;mask:none!important;box-shadow:none!important;
    }
    #profile-avatar-picker.is-expanded .mat-avatar-option-grid{
      display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;
      gap:8px!important;align-items:start!important;
    }
    #profile-avatar-picker.is-expanded .mat-avatar-option{
      width:100%!important;max-width:none!important;min-width:0!important;
      min-height:0!important;height:auto!important;aspect-ratio:1/1!important;
      justify-self:start!important;padding:4px!important;border:1px solid #777!important;
      border-radius:10px!important;background:#3b3b3b!important;color:#f8fafc!important;
      box-shadow:none!important;overflow:hidden!important;
    }
    #profile-avatar-picker.is-expanded .mat-avatar-option.is-selected{
      border:2px solid #10b981!important;padding:3px!important;
      background:#3b3b3b!important;box-shadow:none!important;
    }
    #profile-avatar-picker.is-expanded .mat-avatar-option-preview-stack{
      display:block!important;width:100%!important;height:100%!important;aspect-ratio:1/1!important;
    }
    #profile-avatar-picker.is-expanded .mat-avatar-option-preview-stack .med-avatar-base,
    #profile-avatar-picker.is-expanded .mat-avatar-option-preview-stack .med-avatar-inline-svg{
      position:absolute!important;inset:0!important;width:100%!important;height:100%!important;
      border-radius:0!important;object-fit:contain!important;
    }
    #profile-avatar-picker.is-expanded .mat-avatar-option-preview-stack .med-avatar-pet{
      position:absolute!important;left:auto!important;right:-9%!important;bottom:-5%!important;
      width:20%!important;height:20%!important;z-index:4!important;
    }
    #profile-avatar-picker.is-expanded .mat-avatar-option-grid:has(.mat-avatar-swatch){
      display:flex!important;flex-wrap:wrap!important;gap:7px!important;
      overflow:visible!important;padding:2px 0 5px!important;
    }
    #profile-avatar-picker.is-expanded .mat-avatar-option:has(.mat-avatar-swatch){
      display:grid!important;place-items:center!important;flex:0 0 36px!important;
      width:36px!important;min-width:36px!important;height:36px!important;
      min-height:36px!important;max-width:36px!important;padding:2px!important;
      border:1px solid #777!important;border-radius:8px!important;background:transparent!important;
    }
    #profile-avatar-picker.is-expanded .mat-avatar-option:has(.mat-avatar-swatch) .mat-avatar-swatch{
      display:block!important;width:100%!important;height:100%!important;
      border:0!important;border-radius:5px!important;background:var(--swatch)!important;
      box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)!important;
    }
    #profile-avatar-picker.is-expanded .mat-avatar-option:has(.mat-avatar-swatch).is-selected{
      border:2px solid #10b981!important;padding:1px!important;
    }
    #profile-avatar-picker.is-expanded .mat-avatar-group-section[hidden]{display:none!important}
    #profile-avatar-picker.is-expanded .mat-avatar-options-scroll{
      scroll-behavior:auto!important;overscroll-behavior:contain!important;
    }
    #profile-avatar-picker.is-expanded .mat-avatar-category-bar{
      scroll-behavior:auto!important;scroll-snap-type:none!important;
    }
    html[data-theme="dark"] #profile-avatar-picker.is-expanded .mat-avatar-option{
      background:#3b3b3b!important;border-color:#777!important;color:#f8fafc!important;
    }
    html[data-theme="dark"] #profile-avatar-picker.is-expanded .mat-avatar-option.is-selected{
      background:#3b3b3b!important;border-color:#10b981!important;
    }
    html[data-theme="dark"] #profile-avatar-picker.is-expanded .mat-avatar-option-section h3{
      color:#f8fafc!important;
    }
    html[data-theme="light"] #profile-avatar-picker.is-expanded .mat-avatar-option{
      background:#f1f5f9!important;border-color:#cbd5e1!important;color:#111827!important;
    }
    html[data-theme="light"] #profile-avatar-picker.is-expanded .mat-avatar-option.is-selected{
      background:#ecfdf5!important;border-color:#10b981!important;
    }
    html[data-theme="light"] #profile-avatar-picker.is-expanded .mat-avatar-option-section h3{
      color:#111827!important;
    }
    html[data-theme="light"] #profile-avatar-picker.is-expanded .mat-avatar-option:has(.mat-avatar-swatch){
      background:transparent!important;border-color:#cbd5e1!important;
    }
    html[data-theme="light"] #profile-avatar-picker.is-expanded .mat-avatar-option:has(.mat-avatar-swatch).is-selected{
      border-color:#059669!important;
    }
    /* A chosen pet remains separate from the character in the application sidebar. */
    .sidebar-bottom{overflow:visible!important}
    .sidebar-user-avatar-wrap{overflow:visible!important}
    #sidebar-user-avatar{overflow:visible!important}
    #sidebar-user-avatar .account-avatar-stack .med-avatar-pet,
    #sidebar-user-avatar .mat-avatar-live-layer .med-avatar-pet{display:none!important}
    #sidebar-user-avatar .account-avatar-stack{
      position:relative!important;display:block!important;width:100%!important;height:100%!important;
      overflow:visible!important;border-radius:0!important;
    }
    #sidebar-user-avatar .account-avatar-stack .med-avatar-base,
    #sidebar-user-avatar .account-avatar-stack .med-avatar-inline-svg{
      border-radius:50%!important;overflow:hidden!important;object-fit:cover!important;
    }
    .mat-sidebar-pet-companion{
      position:absolute!important;right:-5px!important;bottom:-8px!important;
      display:block!important;width:14px!important;height:14px!important;
      object-fit:contain!important;z-index:12!important;pointer-events:none!important;
      transform-origin:50% 100%!important;
      animation:matAvatarCompanionLife 2.5s ease-in-out infinite!important;
      filter:drop-shadow(0 1px 1px rgba(15,23,42,.22));
    }
    #view-profile .profile-hero .profile-avatar .med-avatar-stack,
    #view-account .profile-hero .profile-avatar .med-avatar-stack{
      animation:matAvatarPreviewLife 3.7s ease-in-out infinite!important;
    }
    #sidebar-user-avatar .account-avatar-stack{
      animation:matAvatarPreviewLife 3.7s ease-in-out infinite!important;
    }
    @keyframes matAvatarPreviewLife{
      0%,100%{transform:translateY(0) rotate(0) scale(1)}
      42%{transform:translateY(-3px) rotate(-.55deg) scale(1.012)}
      72%{transform:translateY(-1px) rotate(.35deg) scale(1.006)}
    }
    @keyframes matAvatarFaceLife{
      0%,100%{transform:translateY(0) scale(1)}
      48%{transform:translateY(-1.6px) scale(1.014)}
    }
    @keyframes matAvatarCompanionLife{
      0%,100%{transform:translateY(0) rotate(0)}
      44%{transform:translateY(-3px) rotate(-7deg)}
      72%{transform:translateY(-1px) rotate(5deg)}
    }
    @media(max-width:1024px){
      #profile-avatar-picker.is-expanded .mat-avatar-option-grid{
        grid-template-columns:repeat(4,minmax(0,1fr))!important;
      }
    }
    @media(max-width:767px){
      #profile-avatar-picker.is-expanded .mat-avatar-workspace{
        grid-template-columns:minmax(0,1fr)!important;
        grid-template-rows:minmax(112px,18vh) minmax(0,1fr)!important;gap:7px!important;
      }
       #profile-avatar-picker.is-expanded .mat-avatar-preview-panel{
        height:auto!important;max-height:18vh!important;min-height:112px!important;aspect-ratio:auto!important;
      }
       #profile-avatar-picker.is-expanded .profile-avatar-preview-stack{
        width:auto!important;height:100%!important;max-width:100%!important;max-height:100%!important;
      }
      #profile-avatar-picker.is-expanded .mat-avatar-option-grid{
        grid-template-columns:repeat(3,minmax(0,1fr))!important;
      }
      #profile-avatar-picker.is-expanded .mat-avatar-option{max-width:100%!important}
    }
    @media(prefers-reduced-motion:reduce){
      #profile-avatar-picker.is-expanded .profile-avatar-preview-stack,
      #profile-avatar-picker.is-expanded .profile-avatar-preview-stack .med-avatar-base,
      #profile-avatar-picker.is-expanded .profile-avatar-preview-stack .med-avatar-inline-svg,
      #profile-avatar-picker.is-expanded .profile-avatar-preview-stack .med-avatar-pet,
      #sidebar-user-avatar .account-avatar-stack .med-avatar-pet,
      .mat-sidebar-pet-companion,
      #view-profile .profile-hero .profile-avatar .med-avatar-stack,
      #view-account .profile-hero .profile-avatar .med-avatar-stack{animation:none!important}
    }
    /* Screenshot recovery: preserve the original fixed dual-pane proportions and dark UI. */
    #profile-avatar-picker.is-expanded{background:#141416!important}
    #profile-avatar-picker.is-expanded .profile-avatar-builder-header{max-width:1172px!important}
    #profile-avatar-picker.is-expanded .mat-avatar-preview-caption{display:none!important}
    #profile-avatar-picker.is-expanded .mat-avatar-controls{background:#121212!important}
    #profile-avatar-picker.is-expanded .mat-avatar-options-scroll{gap:24px!important;padding:22px 20px 18px!important}
    #profile-avatar-picker.is-expanded .mat-avatar-option-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important}
    #profile-avatar-picker.is-expanded .mat-avatar-option{max-width:none!important;aspect-ratio:1/1!important;min-height:0!important;padding:4px!important;border-radius:15px!important;background:#393939!important}
    #profile-avatar-picker.is-expanded .mat-avatar-option.is-selected{border:2px solid #10b981!important;padding:3px!important}
    #profile-avatar-picker.is-expanded .mat-avatar-preview-panel .profile-avatar-preview-stack .med-avatar-base,
    #profile-avatar-picker.is-expanded .mat-avatar-preview-panel .profile-avatar-preview-stack .med-avatar-inline-svg{object-fit:cover!important}
    #profile-avatar-picker.is-expanded .mat-avatar-preview-panel .profile-avatar-preview-stack .med-avatar-pet{left:-5%!important;right:auto!important;bottom:2%!important}
    #profile-avatar-picker.is-expanded .mat-avatar-actions{flex:0 0 auto!important;background:#121212!important}
    @media(max-width:767px){
      #profile-avatar-picker.is-expanded .mat-avatar-workspace{grid-template-columns:minmax(0,1fr)!important;grid-template-rows:minmax(112px,18vh) minmax(0,1fr)!important}
      #profile-avatar-picker.is-expanded .mat-avatar-preview-panel{height:auto!important;max-height:18vh!important;min-height:112px!important;aspect-ratio:auto!important}
      #profile-avatar-picker.is-expanded .profile-avatar-preview-stack{width:auto!important;height:100%!important;max-width:100%!important;max-height:100%!important}
      #profile-avatar-picker.is-expanded .mat-avatar-option-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}
    }
    @media(prefers-reduced-motion:reduce){
      #profile-avatar-picker.is-expanded .profile-avatar-preview-stack,
      #profile-avatar-picker.is-expanded .profile-avatar-preview-stack .med-avatar-base,
      #profile-avatar-picker.is-expanded .profile-avatar-preview-stack .med-avatar-inline-svg,
      #profile-avatar-picker.is-expanded .profile-avatar-preview-stack .med-avatar-pet{animation:none!important}
    }
    /* Dynamic Avatar Builder changes must not trigger browser scroll anchoring. */
    html,body{scroll-behavior:auto!important}
    body.mat-avatar-customizer-open{
      overflow-anchor:none!important;overscroll-behavior:none!important;
    }
    /* One continuous vertical scroll region: the options pane only. */
    #profile-avatar-picker.is-expanded,
    #profile-avatar-picker.is-expanded .mat-avatar-workspace,
    #profile-avatar-picker.is-expanded .mat-avatar-preview-panel,
    #profile-avatar-picker.is-expanded .mat-avatar-controls{
      overflow:hidden!important;overflow-anchor:none!important;
    }
    #profile-avatar-picker.is-expanded .mat-avatar-category-bar{
      flex:0 0 auto!important;overflow-x:auto!important;overflow-y:hidden!important;
    }
    #profile-avatar-picker.is-expanded .mat-avatar-options-scroll{
      display:block!important;flex:1 1 0%!important;min-height:0!important;min-width:0!important;
      max-height:100%!important;overflow-x:hidden!important;overflow-y:auto!important;
      overscroll-behavior-y:contain!important;overflow-anchor:none!important;
      scroll-behavior:smooth!important;touch-action:pan-y!important;
      scrollbar-width:thin;scrollbar-gutter:stable;
    }
    #profile-avatar-picker.is-expanded .mat-avatar-group-section,
    #profile-avatar-picker.is-expanded .mat-avatar-option-section{
      overflow:visible!important;
    }
  `;
  document.head.appendChild(avatarBuilderFinalStyle);

  const avatarReferenceLayoutStyle = document.createElement('style');
  avatarReferenceLayoutStyle.id = 'mat-avatar-reference-layout';
  avatarReferenceLayoutStyle.textContent = `
    /* Match the supplied reference: a clipped portrait card with the pet in front. */
    #profile-avatar-picker.is-expanded .mat-avatar-preview-panel{
      border-radius:30px!important;
      overflow:hidden!important;
    }
    #profile-avatar-picker.is-expanded .profile-avatar-preview-stack{
      overflow:hidden!important;
      border-radius:inherit!important;
    }
    #profile-avatar-picker.is-expanded .mat-avatar-preview-panel .profile-avatar-preview-stack .med-avatar-base,
    #profile-avatar-picker.is-expanded .mat-avatar-preview-panel .profile-avatar-preview-stack .med-avatar-inline-svg{
      object-fit:cover!important;
    }
    #profile-avatar-picker.is-expanded .mat-avatar-preview-panel .profile-avatar-preview-stack .med-avatar-pet{
      left:24%!important;right:auto!important;bottom:-1%!important;
      width:52%!important;height:39%!important;z-index:4!important;
      object-fit:contain!important;transform-origin:50% 100%!important;
    }
    .mat-avatar-category-navigation{
      display:flex;flex:0 0 68px;align-items:stretch;min-width:0;
      border-bottom:1px solid #555;border-radius:inherit;background:#171717;
    }
    .mat-avatar-category-navigation .mat-avatar-category-arrow{
      display:grid;place-items:center;flex:0 0 28px;width:28px;min-width:28px;
      margin:0;padding:0;border:0;background:transparent;color:#888;cursor:pointer;
    }
    .mat-avatar-category-navigation .mat-avatar-category-arrow[hidden]{display:none!important}
    .mat-avatar-category-navigation .mat-avatar-category-arrow:hover{color:#f4f4f5}
    .mat-avatar-category-navigation .mat-avatar-category-arrow svg{
      width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;
      stroke-linecap:round;stroke-linejoin:round;
    }
    .mat-avatar-category-navigation .mat-avatar-category-bar{
      display:flex;flex:1 1 auto;align-items:stretch;justify-content:space-around;
      min-width:0;height:68px;margin:0;padding:0;overflow-x:auto;overflow-y:hidden;
      border:0;border-radius:0;background:transparent;scrollbar-width:none;
    }
    .mat-avatar-category-navigation .mat-avatar-category-bar::-webkit-scrollbar{display:none}
    .mat-avatar-category-navigation .mat-avatar-category{flex:1 0 48px;min-width:48px}
    @media(max-width:767px){
      #profile-avatar-picker.is-expanded .mat-avatar-preview-panel{border-radius:16px!important}
      #profile-avatar-picker.is-expanded .mat-avatar-preview-panel .profile-avatar-preview-stack .med-avatar-pet{
        left:24%!important;right:auto!important;bottom:0!important;width:45%!important;height:36%!important;
      }
      .mat-avatar-category-navigation{flex-basis:56px}
      .mat-avatar-category-navigation .mat-avatar-category-bar{height:56px}
      .mat-avatar-category-navigation .mat-avatar-category-arrow{flex-basis:24px;width:24px;min-width:24px}
    }
    @media(prefers-reduced-motion:reduce){
      #profile-avatar-picker.is-expanded .mat-avatar-preview-panel .profile-avatar-preview-stack .med-avatar-pet{animation:none!important}
    }
  `;
  document.head.appendChild(avatarReferenceLayoutStyle);

  /* Per-account avatar selector with multi-upload support for raster and SVG images. */
  const avatarChoices = Array.from({length:16}, (_, i) => window.MedAvatarCreator.render(window.MedAvatarCreator.defaultConfig('student-preset-' + i)));
  // Keep broken remote avatar URLs from exposing their alt text in profile circles.
  // This embedded portrait is local, so it also works offline and when the avatar CDN fails.
  const avatarFallbackDataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><circle cx="64" cy="64" r="64" fill="#7b1fa2"/><text x="64" y="86" text-anchor="middle" font-family="Arial,sans-serif" font-size="68" font-weight="800" fill="#ffffff">R</text></svg>');
  document.addEventListener('error', event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;
    const isAvatarImage = /avatar/i.test(image.alt || '') ||
      !!image.closest('.profile-avatar,.leader-avatar,.podium-avatar,.mat-student-profile-avatar,.profile-avatar-choice,.profile-avatar-comparison');
    if (!isAvatarImage || image.dataset.avatarFallbackApplied === '1') return;
    image.dataset.avatarFallbackApplied = '1';
    image.alt = '';
    image.src = avatarFallbackDataUri;
  }, true);
  const avatarAccountId = () => {
    // Visitor avatar choices stay under a local-only Visitor key. Never invent
    // a Guest server ID in localStorage without a Guest token from the backend.
    return typeof app.getLocalIdentityKey === 'function'
      ? String(app.getLocalIdentityKey())
      : String(app.authUser?.uid || 'visitor');
  };
  const avatarKey = () => 'med_profile_avatar_v1_' + avatarAccountId();
  const legacyAvatarKey = () => 'med_profile_avatar_v1_' + avatarAccountId();
  const manualAvatarKey = () => 'med_profile_avatar_manual_v1_' + avatarAccountId();
  const uploadedAvatarKey = () => 'med_profile_uploaded_avatars_v1_' + avatarAccountId();
  // Google/Gmail photo is saved separately in the Avatar Vault; it is not an uploaded/custom avatar.
  const googleAvatarKey = () => 'med_profile_google_avatar_v1_' + avatarAccountId();
  const readGoogleAvatar = () => {
    const user = app.authUser || {};
    const photo = String(user.photoURL || user.photoUrl || user.avatarUrl || '').trim();
    let saved = '';
    try { saved = String(localStorage.getItem(googleAvatarKey()) || '').trim(); } catch (_) {}
    if (photo && /^https:\/\//i.test(photo)) {
      try { localStorage.setItem(googleAvatarKey(), photo); } catch (_) {}
      return photo;
    }
    return saved && /^https:\/\//i.test(saved) ? saved : '';
  };
  const avatarDefaultMarker = '#mat-default-avatar';
  const avatarCustomMarker = '#mat-custom-avatar';
  const stripAvatarDefaultMarker = value => String(value || '').replace(/#mat-(?:default|custom)-avatar$/i, '');
  const isStoredDefaultAvatar = value => /#mat-default-avatar$/i.test(String(value || ''));
  const isStoredCustomAvatar = value => /#mat-custom-avatar$/i.test(String(value || ''));
  const defaultAvatarForUser = userId => window.MedAvatarCreator.render(window.MedAvatarCreator.defaultConfig('student-default:' + String(userId || 'guest')));
  const isLegacyPortraitAvatar = value => /^https:\/\/i\.pravatar\.cc\/120\?img=\d+$/i.test(String(value || ''));
  const storedDefaultAvatarForUser = userId => defaultAvatarForUser(userId) + avatarDefaultMarker;
  const maxUploadedAvatars = 8;
  let avatarPickerExpanded = false;
  let activeAvatarGroup = 'character';
  let pendingAvatarSource = null;
  let pendingAvatarConfig = null;
  let avatarBuilderScrollState = null;
  const avatarConfigKey = () => 'med_profile_avatar_config_v1_' + avatarAccountId();
  const readAvatarConfig = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(avatarConfigKey()) || 'null');
      if (saved && typeof saved === 'object') return window.MedAvatarCreator.normalize(saved);
    } catch (_) {}
    const sharedConfig = window.MedAvatarCreator.configFromAvatar(app.profile?.avatar);
    if (sharedConfig) return sharedConfig;
    try {
      const localConfig = window.MedAvatarCreator.configFromAvatar(localStorage.getItem(avatarKey()) || localStorage.getItem(legacyAvatarKey()));
      if (localConfig) return localConfig;
    } catch (_) {}
    return window.MedAvatarCreator.defaultConfig(avatarAccountId());
  };
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
  const isAvatarSource = value => {
    const clean = stripAvatarDefaultMarker(value);
    return window.MedAvatarCreator.isAvatar(clean) || avatarChoices.includes(clean) ||
      readUploadedAvatars().includes(clean) || (!!readGoogleAvatar() && clean === readGoogleAvatar());
  };
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
    let manual = false, localValue = '';
    try {
      manual = localStorage.getItem(manualAvatarKey()) === '1';
      localValue = localStorage.getItem(avatarKey()) || localStorage.getItem(legacyAvatarKey()) || '';
    } catch (_) {}
    // An explicitly selected local custom avatar takes precedence while offline
    // or while its server confirmation is pending.
    if (manual && isAvatarSource(localValue) && !isLegacyPortraitAvatar(stripAvatarDefaultMarker(localValue))) {
      return stripAvatarDefaultMarker(localValue);
    }
    // The confirmed shared profile is authoritative across devices. A Gmail photo
    // remains a single image; it is never passed through the character-layer renderer.
    const sharedRaw = String(app.profile?.avatar || '').trim();
    if (isRenderableAvatarSource(sharedRaw) && !isStoredDefaultAvatar(sharedRaw) && !isLegacyPortraitAvatar(stripAvatarDefaultMarker(sharedRaw))) return stripAvatarDefaultMarker(sharedRaw);
    const googleAvatar = readGoogleAvatar();
    if (googleAvatar && !manual) return googleAvatar;
    if (isLegacyPortraitAvatar(stripAvatarDefaultMarker(localValue))) return defaultAvatarForUser(id);
    if (isAvatarSource(localValue)) return stripAvatarDefaultMarker(localValue);
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
      const isOldAutoDefault = isLegacyPortraitAvatar(stripAvatarDefaultMarker(shared)) ||
        (shared === avatarChoices[0] && !isStoredDefaultAvatar(shared) && !isStoredCustomAvatar(shared) && !manual);
      const isMarkedAutoDefault = isStoredDefaultAvatar(shared) || isOldAutoDefault;
      const googleAvatar = readGoogleAvatar();
      if (isRenderableAvatarSource(shared) && !isMarkedAutoDefault && !(googleAvatar && !manual)) return;
      let saved = '';
      try { saved = localStorage.getItem(avatarKey()) || localStorage.getItem(legacyAvatarKey()) || ''; } catch (_) {}
      const savedIsExplicit = isAvatarSource(saved) && !isLegacyPortraitAvatar(stripAvatarDefaultMarker(saved));
      const candidate = !manual && googleAvatar ? googleAvatar : (savedIsExplicit ? stripAvatarDefaultMarker(saved) : storedDefaultAvatarForUser(accountId));
      const updated = await window.MedGlobalLeague.updateProfile({ avatar: candidate });
      const sharedAvatar = String(updated?.avatar || '').trim();
      if (sharedAvatar !== candidate) {
        throw new Error('Avatar was not confirmed by the server. Deploy the latest Medical_Admission_Tracker_Backend.gs Web App and ensure the Students sheet has an Avatar column.');
      }
      app.profile = Object.assign({}, app.profile || {}, updated || {}, { avatar: sharedAvatar });
      try { localStorage.setItem(avatarKey(), stripAvatarDefaultMarker(sharedAvatar)); } catch (_) {}
      renderAvatarPicker();
      window.dispatchEvent(new Event('student-profile-loaded'));
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
  function validateAvatarImageSource(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        if (image.naturalWidth > 0 && image.naturalHeight > 0) resolve(source);
        else reject(new Error('This image could not be decoded. Please choose a different image file.'));
      };
      image.onerror = () => reject(new Error('This image is damaged or cannot be displayed. Please choose a valid PNG, JPG/JPEG, WEBP, or SVG image.'));
      image.src = source;
    });
  }
  function processUploadedAvatar(file) {
    return new Promise((resolve, reject) => {
      if (!file) { reject(new Error('Choose an image file first.')); return; }
      const name = String(file.name || '');
      const type = String(file.type || '').toLowerCase();
      const extension = (name.match(/\.([^.]+)$/) || [,''])[1].toLowerCase();
      const isSvg = type === 'image/svg+xml' || extension === 'svg';
      const knownRasterExtensions = ['png','jpg','jpeg','webp','gif','bmp','avif'];
      if (!file.size) { reject(new Error('This file is empty. Please choose a valid image.')); return; }
      if (file.size > 5 * 1024 * 1024) { reject(new Error('Each avatar file must be 5 MB or smaller.')); return; }
      if (type && !type.startsWith('image/')) {
        reject(new Error('Please choose an image file.'));
        return;
      }
      if (!type && !isSvg && !knownRasterExtensions.includes(extension)) {
        reject(new Error('This image format is not supported by the browser.'));
        return;
      }
      if (isSvg) {
        if (file.size > 50 * 1024) { reject(new Error('SVG avatars must be 50 KB or smaller.')); return; }
        file.text().then(source => {
          const cleaned = sanitizeUploadedSvg(source);
          return validateAvatarImageSource(cleaned);
        }).then(resolve).catch(error => reject(error instanceof Error ? error : new Error('The SVG file is invalid or could not be read.')));
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        try {
          if (!image.naturalWidth || !image.naturalHeight) throw new Error('This file is not a readable image. Please choose another file.');
          if (image.naturalWidth > 8000 || image.naturalHeight > 8000) {
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
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('This image cannot be decoded by the browser. Please choose another image format.'));
      };
      image.src = objectUrl;
    });
  }

  function hydrateLivingAvatarFaces(scope = document) {
    const hydrate = window.MedAvatarCreator?.hydrateLivingFace;
    if (typeof hydrate !== 'function' || !scope?.querySelectorAll) return;
    const selector = '.profile-avatar-stack,.profile-avatar-preview-stack,.account-avatar-stack,.leaderboard-avatar-stack,.podium-avatar-stack,.leaderboard-me-stack';
    const stacks = new Set(scope.matches?.(selector) ? [scope] : []);
    scope.querySelectorAll(selector).forEach(stack => stacks.add(stack));
    stacks.forEach(stack => {
      hydrate(stack).catch(error => console.warn('[Avatar motion] Face hydration skipped:', error));
    });
  }


  function setAvatarSaveFeedback(message, state) {
    const status = document.getElementById('mat-avatar-save-feedback');
    if (!status) return;
    status.textContent = String(message || '');
    status.dataset.state = String(state || 'loading');
    status.hidden = !message;
  }
  function avatarOptionFieldMarkup(field, config) {
    const options = typeof window.MedAvatarCreator.getOptionsForField === 'function'
      ? window.MedAvatarCreator.getOptionsForField(field.key, config)
      : (window.MedAvatarCreator.choices[field.key] || []);
    return '<section class="mat-avatar-option-section" data-avatar-field="' + field.key + '"><h3>' + field.title + '</h3><div class="mat-avatar-option-grid">' +
      options.map(option => {
        const selected = config[field.key] === option.value;
        const raw = String(option.value);
        const label = String(option.label || raw);
        const isColor = field.key !== 'headphones' && /^(?:#[0-9a-f]{6}|[0-9a-f]{6})$/i.test(raw);
        let visual = '';
        if (isColor) {
          const color = '#' + raw.replace(/^#/, '');
          visual = '<span class="mat-avatar-swatch" style="--swatch:' + color + ';background-color:' + color + '" aria-hidden="true"></span>';
        } else {
          const thumbnailInput = field.key === 'characterPreset'
            ? window.MedAvatarCreator.applyCharacterPreset(option.value, config)
            : field.key === 'gender'
              ? window.MedAvatarCreator.applyCharacterPreset(option.value === 'female' ? 'f01' : 'm01', config)
              : Object.assign({}, config, { [field.key]: option.value });
          if (field.key === 'hairStyle') thumbnailInput.hat = 'none';
          if (field.key !== 'petType') thumbnailInput.petType = 'none';
          const thumbnailConfig = window.MedAvatarCreator.normalize(thumbnailInput);
          const thumbnailSource = window.MedAvatarCreator.render(thumbnailConfig);
          visual = window.MedAvatarCreator.renderLayersMarkup(thumbnailSource, thumbnailConfig, 'mat-avatar-option-preview-stack');
        }
        return '<button type="button" class="mat-avatar-option' + (field.key === 'characterPreset' ? ' mat-avatar-character-card' : '') + (selected ? ' is-selected' : '') +
          '" data-avatar-part="' + field.key + '" data-avatar-value="' + raw +
          '" title="' + label.replace(/&/g,'&amp;').replace(/"/g,'&quot;') +
          '" aria-label="' + field.title + ': ' + label + '" aria-pressed="' + String(selected) + '">' + visual +
          (field.key === 'gender' || field.key === 'characterPreset' ? '<span class="mat-avatar-option-label">' + label + '</span>' : '') + '</button>';
      }).join('') +
    '</div></section>';
  }

  function updateAvatarPreviewInPlace(changedPart) {
    const picker = document.getElementById('profile-avatar-picker');
    if (!picker || !avatarPickerExpanded) return;
    const config = window.MedAvatarCreator.normalize(pendingAvatarConfig || readAvatarConfig());
    const panel = picker.querySelector('.mat-avatar-preview-panel');
    const previous = panel?.querySelector('.profile-avatar-preview-stack');
    const previewHost = document.createElement('div');
    previewHost.innerHTML = window.MedAvatarCreator.renderLayersMarkup(
      window.MedAvatarCreator.render(config), config, 'profile-avatar-preview-stack'
    );
    const nextPreview = previewHost.firstElementChild;
    if (previous && nextPreview) {
      previous.replaceWith(nextPreview);
      hydrateLivingAvatarFaces(nextPreview.parentElement || panel);
    }
    if (panel) {
      const background = String(config.background || 'a5a8ff').replace(/^#/, '');
      panel.style.backgroundColor = '#' + background;
      panel.dataset.avatarBackground = background;
    }

    if (changedPart === 'gender' || changedPart === 'ageGroup' || changedPart === 'reset') {
      const dependentFields = [
        { key:'hairStyle', title:'চুলের ধরন' },
        { key:'facialHair', title:'দাড়ি ও গোঁফ' }
      ];
      dependentFields.forEach(field => {
        const existing = picker.querySelector('[data-avatar-field="' + field.key + '"]');
        if (existing) {
          const holder = document.createElement('div');
          holder.innerHTML = avatarOptionFieldMarkup(field, config);
          existing.replaceWith(holder.firstElementChild);
        }
      });
    }

    picker.querySelectorAll('[data-avatar-part]').forEach(button => {
      const key = button.dataset.avatarPart;
      const selected = config[key] === button.dataset.avatarValue;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    hydrateLivingAvatarFaces(picker);
  }

  function avatarScrollStyleSnapshot(element, properties) {
    const snapshot = {};
    properties.forEach(property => {
      snapshot[property] = {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property)
      };
    });
    return snapshot;
  }

  function restoreAvatarScrollStyles(element, snapshot) {
    Object.entries(snapshot || {}).forEach(([property, saved]) => {
      if (saved.value) element.style.setProperty(property, saved.value, saved.priority);
      else element.style.removeProperty(property);
    });
  }

  function lockAvatarBuilderPageScroll() {
    if (avatarBuilderScrollState || !document.body) return;
    const body = document.body;
    const root = document.documentElement;
    const x = window.scrollX || root.scrollLeft || body.scrollLeft || 0;
    const y = window.scrollY || root.scrollTop || body.scrollTop || 0;
    avatarBuilderScrollState = {
      x, y,
      body: avatarScrollStyleSnapshot(body, ['position','top','left','right','width','overflow','overscroll-behavior']),
      root: avatarScrollStyleSnapshot(root, ['overflow'])
    };
    body.style.setProperty('position','fixed');
    body.style.setProperty('top',(-y)+'px');
    body.style.setProperty('left',(-x)+'px');
    body.style.setProperty('right','0');
    body.style.setProperty('width','100%');
    body.style.setProperty('overflow','hidden');
    body.style.setProperty('overscroll-behavior','none');
    root.style.setProperty('overflow','hidden');
  }

  function unlockAvatarBuilderPageScroll() {
    if (!avatarBuilderScrollState) return;
    const saved = avatarBuilderScrollState;
    avatarBuilderScrollState = null;
    restoreAvatarScrollStyles(document.body, saved.body);
    restoreAvatarScrollStyles(document.documentElement, saved.root);
    // This is an exact restoration of the pre-Builder viewport, not navigation.
    window.scrollTo({left:saved.x,top:saved.y,behavior:'auto'});
  }

  function syncAvatarBuilderSidebarLayout(picker) {
    if (!picker || !avatarPickerExpanded) return;
    const mobile = window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
    const sidebar = document.getElementById('app-sidebar');
    const sidebarWidth = mobile ? 0 : Math.max(0, Math.round(sidebar?.getBoundingClientRect().width || 0));
    picker.style.setProperty('position', 'fixed', 'important');
    picker.style.setProperty('top', '0', 'important');
    picker.style.setProperty('bottom', '0', 'important');
    picker.style.setProperty('left', sidebarWidth + 'px', 'important');
    picker.style.setProperty('right', '0', 'important');
    picker.style.setProperty('width', 'calc(100vw - ' + sidebarWidth + 'px)', 'important');
    picker.style.setProperty('height', '100dvh', 'important');
  }
  window.addEventListener('resize', () => {
    const picker = document.getElementById('profile-avatar-picker');
    if (avatarPickerExpanded) syncAvatarBuilderSidebarLayout(picker);
  });

  function renderAvatarPicker() {
    const root = document.getElementById('view-profile');
    if (!root) return;
    let picker = document.getElementById('profile-avatar-picker');
    if (!picker) {
      picker = document.createElement('div');
      picker.id = 'profile-avatar-picker';
      picker.className = 'profile-avatar-picker';
      picker.setAttribute('aria-label', 'Avatar customizer');
      const hero = root.querySelector('.profile-hero');
      if (hero) hero.insertAdjacentElement('afterend', picker);
      else root.prepend(picker);
    }
    if (avatarPickerExpanded && picker.parentNode !== document.body) {
      document.body.appendChild(picker);
    } else if (!avatarPickerExpanded && picker.parentNode === document.body) {
      const hero = root.querySelector('.profile-hero');
      if (hero) hero.insertAdjacentElement('afterend', picker);
      else root.prepend(picker);
    }
    picker.classList.toggle('is-expanded', avatarPickerExpanded);
    if (avatarPickerExpanded) lockAvatarBuilderPageScroll();
    else unlockAvatarBuilderPageScroll();
    document.body.classList.toggle('mat-avatar-customizer-open', avatarPickerExpanded);
    let uploadInput = document.getElementById('profile-avatar-upload-input');
    if (!uploadInput) {
      uploadInput = document.createElement('input');
      uploadInput.id = 'profile-avatar-upload-input';
      uploadInput.type = 'file';
      uploadInput.accept = 'image/*';
      uploadInput.hidden = true;
      document.body.appendChild(uploadInput);
    }

    const current = readAvatar();
    const currentConfig = window.MedAvatarCreator.configFromAvatar(current);
    const avatar = root.querySelector('.profile-hero .profile-avatar');
    if (avatar) {
      avatar.innerHTML = window.MedAvatarCreator.renderLayersMarkup(current, currentConfig, 'profile-avatar-stack');
      avatar.setAttribute('aria-label', 'Current profile avatar');
      hydrateLivingAvatarFaces(avatar);
    }

    const avatarCategoryIcons = {
      body:'<circle cx="12" cy="7" r="3.2"/><path d="M5 21v-2.2a7 7 0 0 1 14 0V21M8 12l-2 2m10-2 2 2"/>',
      eyes:'<path d="M2.5 12s3.4-5 9.5-5 9.5 5 9.5 5-3.4 5-9.5 5-9.5-5-9.5-5Z"/><circle cx="12" cy="12" r="2.2"/>',
      mouth:'<path d="M4 14c2.2 4 13.8 4 16 0"/><path d="M6 12h12"/>',
      hair:'<path d="M4 13a8 8 0 0 1 16 0v2H4zM4 12c0-5 3-8 8-8s8 3 8 8M8 5l-2-2m10 2 2-2"/>',
      beard:'<path d="M5 9c0 7 3 12 7 12s7-5 7-12M5 9l-2-3m16 3 2-3M8 14l4 3 4-3"/>',
      glasses:'<path d="M2 10h3l1 7h5l2-5h-2l2 5h5l1-7h3M11 12h2"/>',
      headphones:'<path d="M4 13v-2a8 8 0 0 1 16 0v2M3 13h4v7H5a2 2 0 0 1-2-2zm14 0h4v5a2 2 0 0 1-2 2h-2z"/>',
      clothes:'<path d="m8 4 4 2 4-2 5 4-3 4-2-2v10H8V10l-2 2-3-4z"/>',
      pets:'<path d="M7 10c-2-3-5-2-5 1 0 2 2 3 4 2m11-3c2-3 5-2 5 1 0 2-2 3-4 2M8 17c0-3 2-5 4-5s4 2 4 5-2 4-4 4-4-1-4-4Z"/>',
      background:'<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/>'
    };
    const groups = [
      {key:'character',title:'চরিত্র',icon:'body',fields:[{key:'gender',title:'Gender / লিঙ্গ'},{key:'characterPreset',title:'চরিত্র বেছে নাও'},{key:'ageGroup',title:'বয়স'}]},
      {key:'face',title:'মুখ ও ত্বক',icon:'mouth',fields:[{key:'skinTone',title:'ত্বকের রঙ'},{key:'expression',title:'মুখের অভিব্যক্তি'}]},
      {key:'eyes',title:'চোখ ও ভ্রু',icon:'eyes',fields:[{key:'eyeShape',title:'চোখ'},{key:'eyebrowShape',title:'ভ্রু'}]},
      {key:'hair',title:'চুল',icon:'hair',fields:[{key:'hairStyle',title:'চুলের ধরন'},{key:'hairColor',title:'চুলের রঙ'}]},
      {key:'beard',title:'দাড়ি ও গোঁফ',icon:'beard',fields:[{key:'facialHair',title:'দাড়ি ও গোঁফ'},{key:'facialHairColor',title:'দাড়ির রঙ'}]},
      {key:'glasses-hat',title:'চশমা ও টুপি',icon:'glasses',fields:[{key:'glasses',title:'চশমা'},{key:'hat',title:'টুপি'},{key:'hatColor',title:'টুপি রঙ'}]},
      {key:'headphones',title:'হেডফোন',icon:'headphones',fields:[{key:'headphones',title:'হেডফোন / কানের অ্যাক্সেসরি'}]},
      {key:'clothing',title:'পোশাক',icon:'clothes',fields:[{key:'clothingType',title:'পোশাকের ধরন'},{key:'clothingColor',title:'পোশাকের রঙ'}]},
      {key:'pets-bg',title:'পোষা সঙ্গী',icon:'pets',fields:[{key:'petType',title:'পোষা সঙ্গী'}]},
      {key:'background',title:'ব্যাকগ্রাউন্ড',icon:'background',fields:[{key:'background',title:'ব্যাকগ্রাউন্ড'}]}
    ];
    // Keep the selected Character card and the live SVG preview on one canonical config.
    // Older saved configs can contain a gender/preset mismatch; normalize once before
    // rendering either side so a male card can never be highlighted over a female preview.
    const config = window.MedAvatarCreator.normalize(pendingAvatarConfig || readAvatarConfig());
    if (avatarPickerExpanded) {
      pendingAvatarConfig = config;
      pendingAvatarSource = window.MedAvatarCreator.render(config);
    }
    const activeGroup = groups.find(group => group.key === activeAvatarGroup) || groups[0];
    const fieldMarkup = field => avatarOptionFieldMarkup(field, config);
    const builderMarkup = avatarPickerExpanded
      ? '<header class="profile-avatar-builder-header"><button type="button" id="profile-avatar-builder-back" aria-label="ফিরে যাও"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button><h2>তোমার আভাটার বানাও</h2></header>' +
        '<div class="mat-avatar-workspace">' +
          '<section class="mat-avatar-preview-panel" style="background-color:#' + String(config.background || 'a5a8ff').replace(/^#/, '') + '"><button type="button" id="profile-avatar-reset" class="mat-avatar-reset">রিসেট করুন</button>' +
            window.MedAvatarCreator.renderLayersMarkup(window.MedAvatarCreator.render(config), config, 'profile-avatar-preview-stack') +
            '<span class="mat-avatar-preview-caption">Live Preview</span></section>' +
          '<section class="mat-avatar-controls"><div class="mat-avatar-category-navigation">' +
            '<button type="button" class="mat-avatar-category-arrow" data-avatar-category-scroll="-1" aria-label="আগের ক্যাটাগরি" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>' +
            '<nav class="mat-avatar-category-bar" aria-label="Avatar categories">' +
            groups.map(group => '<button type="button" class="mat-avatar-category' + (group.key === activeGroup.key ? ' is-active' : '') + '" data-avatar-group="' + group.key + '" aria-label="' + group.title + '" aria-pressed="' + String(group.key === activeGroup.key) + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + avatarCategoryIcons[group.icon] + '</svg></button>').join('') +
            '</nav><button type="button" class="mat-avatar-category-arrow" data-avatar-category-scroll="1" aria-label="পরের ক্যাটাগরি" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button></div><div class="mat-avatar-options-scroll">' + groups.map(group => '<div class="mat-avatar-group-section" id="mat-avatar-group-' + group.key + '" data-avatar-group-section="' + group.key + '">' + group.fields.map(fieldMarkup).join('') + '</div>').join('') + '</div>' +
          '<div class="mat-avatar-actions"><button type="button" id="profile-avatar-confirm" class="profile-avatar-confirm-button"' + (pendingAvatarSource === current ? ' disabled' : '') + '>কনফার্ম করো</button><span id="mat-avatar-save-feedback" class="mat-avatar-save-feedback" role="status" aria-live="polite" hidden></span></div></section>' +
        '</div>'
      : '';
    const pendingUpload = !avatarPickerExpanded && isAvatarSource(pendingAvatarSource) && pendingAvatarSource !== current;
    picker.innerHTML = builderMarkup +
      (pendingUpload ? '<button type="button" id="profile-avatar-confirm" hidden>Confirm uploaded avatar</button>' : '') +
      '<span id="profile-avatar-upload-status" class="profile-avatar-upload-status" aria-live="polite"></span>';
    if (avatarPickerExpanded) {
      const categoryBar = picker.querySelector('.mat-avatar-category-bar');
      const syncCategoryArrows = () => {
        if (!categoryBar) return;
        const canScroll = categoryBar.scrollWidth > categoryBar.clientWidth + 2;
        const previous = picker.querySelector('[data-avatar-category-scroll="-1"]');
        const next = picker.querySelector('[data-avatar-category-scroll="1"]');
        if (previous) previous.hidden = !canScroll || categoryBar.scrollLeft <= 2;
        if (next) next.hidden = !canScroll || categoryBar.scrollLeft + categoryBar.clientWidth >= categoryBar.scrollWidth - 2;
      };
      if (categoryBar) {
        categoryBar.addEventListener('scroll', syncCategoryArrows, {passive:true});
        requestAnimationFrame(syncCategoryArrows);
      }
      const scroller = picker.querySelector('.mat-avatar-options-scroll');
      if (scroller && !scroller.dataset.avatarNavObserver) {
        scroller.dataset.avatarNavObserver = '1';
        let scrollFrame = 0;
        scroller.addEventListener('scroll', () => {
          if (scrollFrame) cancelAnimationFrame(scrollFrame);
          scrollFrame = requestAnimationFrame(() => {
            const sections = Array.from(scroller.querySelectorAll('[data-avatar-group-section]'));
            const marker = scroller.getBoundingClientRect().top + 36;
            let currentSection = sections[0];
            sections.forEach(section => {
              if (section.getBoundingClientRect().top <= marker) currentSection = section;
            });
            if (!currentSection) return;
            const nextActiveGroup = currentSection.dataset.avatarGroupSection;
            const groupChanged = nextActiveGroup !== activeAvatarGroup;
            activeAvatarGroup = nextActiveGroup;
            picker.querySelectorAll('.mat-avatar-category').forEach(tab => {
              const active = tab.dataset.avatarGroup === activeAvatarGroup;
              tab.classList.toggle('is-active', active);
              tab.setAttribute('aria-pressed', String(active));
              if (active && groupChanged) tab.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});
            });
          });
        }, {passive:true});
      }
    }
    hydrateLivingAvatarFaces(picker);
    picker.classList.toggle('is-expanded', avatarPickerExpanded);
    if (avatarPickerExpanded) {
      syncAvatarBuilderSidebarLayout(picker);
      const livePanel = picker.querySelector('.mat-avatar-preview-panel');
      if (livePanel) {
        const background = String((pendingAvatarConfig || readAvatarConfig()).background || 'a5a8ff').replace(/^#/, '');
        livePanel.style.backgroundColor = '#' + background;
        livePanel.dataset.avatarBackground = background;
      }

    }
  }
  function renderAvatarPickerWithTransition({focus=false} = {}) {
    // Re-render a single live preview. Cloning the previous SVG into the panel
    // could leave a second, partially clipped face behind when animationend was
    // skipped (for example after a rapid category/character change).
    renderAvatarPicker();
    const panel = document.querySelector('#profile-avatar-picker.is-expanded .mat-avatar-preview-panel');
    const next = panel?.querySelector('.profile-avatar-preview-stack');
    if (panel && next && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      next.classList.remove('mat-avatar-transition-new');
      void next.offsetWidth;
      next.classList.add('mat-avatar-transition-new');
      next.addEventListener('animationend', () => next.classList.remove('mat-avatar-transition-new'), {once:true});
    }
    if (panel && focus && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      panel.classList.remove('mat-avatar-focus-zoom');
      void panel.offsetWidth;
      panel.classList.add('mat-avatar-focus-zoom');
      const focusImage = panel.querySelector('.profile-avatar-preview-stack .med-avatar-base');
      focusImage?.addEventListener('animationend', () => panel.classList.remove('mat-avatar-focus-zoom'), {once:true});
    }
  }
  function refreshAvatarViews() {
    renderAvatarPicker();
    if (typeof app.loadLeaderboard === 'function') app.loadLeaderboard(true);
    requestAnimationFrame(installAvatarLiveTransitions);
  }

  // Registered accounts alternate between their composed custom avatar and Gmail photo.
  // Guests intentionally keep their own avatar without a Gmail/default-image transition.
  function installAvatarLiveTransitions() {
    const user = app.authUser || null;
    const gmailPhoto = user ? readGoogleAvatar() : '';
    const hasGuestSession = (() => { try { return !!localStorage.getItem('med_sheet_guest_token_v1') && !localStorage.getItem('med_guest_session_expired_v1'); } catch (_) { return false; } })();
    const targets = Array.from(document.querySelectorAll('#view-profile .profile-hero .profile-avatar,#view-account .profile-hero .profile-avatar,#sidebar-user-avatar'));
    const sidebarAvatar = document.getElementById('sidebar-user-avatar');
    const sidebarWrap = sidebarAvatar?.parentElement;
    if (sidebarWrap) {
      const savedConfig = readAvatarConfig();
      const petPath = savedConfig.petType !== 'none'
        ? String(window.MedAvatarCreator.assetPaths?.pets?.[savedConfig.petType] || '')
        : '';
      let companion = sidebarWrap.querySelector('.mat-sidebar-pet-companion');
      if (petPath) {
        if (!companion) {
          companion = document.createElement('img');
          companion.className = 'mat-sidebar-pet-companion';
          companion.alt = '';
          companion.setAttribute('aria-hidden', 'true');
          companion.draggable = false;
          sidebarWrap.appendChild(companion);
        }
        if (companion.getAttribute('src') !== petPath) companion.src = petPath;
      } else {
        companion?.remove();
      }
    }
    targets.forEach(element => {
      element.classList.add('mat-avatar-living');
      if (element.id === 'sidebar-user-avatar' && !(user || hasGuestSession)) {
        element.parentElement?.querySelector('.mat-sidebar-avatar-edit')?.remove();
      }
      if (element.id === 'sidebar-user-avatar' && (user || hasGuestSession)) {
        const wrapper = element.parentElement;
        if (wrapper && !wrapper.querySelector('.mat-sidebar-avatar-edit')) {
          wrapper.style.position = 'relative';
          const edit = document.createElement('button');
          edit.type = 'button';
          edit.className = 'mat-sidebar-avatar-edit';
          edit.setAttribute('aria-label','আভাটার এডিট');
          edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>';
          edit.addEventListener('click',event => { event.preventDefault(); event.stopPropagation(); window.MedAvatarProfileModal?.open(); });
          wrapper.appendChild(edit);
        }
      }
      let customSource = '';
      try {
        const stored = localStorage.getItem(avatarKey()) || '';
        const manual = localStorage.getItem(manualAvatarKey()) === '1';
        const shared = String(app.profile?.avatar || '').replace(/#mat-(?:default|custom)-avatar$/i,'');
        if (manual && isRenderableAvatarSource(stored)) customSource = stored;
        else if (shared && shared !== gmailPhoto && isRenderableAvatarSource(shared) && !isLegacyPortraitAvatar(shared)) customSource = shared;
      } catch (_) {}
      // Every account gets its own composed avatar and live facial motion.
      // A Gmail photo is an optional alternate portrait, never a prerequisite.
      if (!customSource || customSource === gmailPhoto) customSource = window.MedAvatarCreator.render(readAvatarConfig());
      const key = (gmailPhoto || '') + '|' + customSource;
      if (element.dataset.matAvatarMotionKey === key && element.querySelector('.mat-avatar-live-layer')) return;
      element.querySelectorAll('.mat-avatar-live-layer').forEach(node => node.remove());
      element.dataset.matAvatarMotionKey = key;
      const customLayer = document.createElement('span');
      customLayer.className = 'mat-avatar-live-layer is-visible';
      const customConfig = window.MedAvatarCreator.configFromAvatar(customSource);
      if (customConfig) customLayer.innerHTML = window.MedAvatarCreator.renderLayersMarkup(customSource,customConfig,'account-avatar-stack');
      else {
        const image = document.createElement('img');
        image.alt = '';
        image.draggable = false;
        image.src = customSource;
        customLayer.appendChild(image);
      }
      let gmailLayer = null;
      if (gmailPhoto) {
        gmailLayer = document.createElement('span');
        gmailLayer.className = 'mat-avatar-live-layer';
        const gmailImage = document.createElement('img');
        gmailImage.alt = '';
        gmailImage.draggable = false;
        gmailImage.src = gmailPhoto;
        gmailLayer.appendChild(gmailImage);
      }
      element.insertBefore(customLayer, element.firstChild);
      if (gmailLayer) element.insertBefore(gmailLayer, customLayer.nextSibling);
      const badge = element.querySelector('.mat-profile-edit-badge');
      if (badge) element.appendChild(badge);
      element.dataset.matAvatarState = 'custom';
      const switchState = () => {
        if (!gmailLayer) return;
        const showGmail = element.dataset.matAvatarState !== 'gmail';
        element.dataset.matAvatarState = showGmail ? 'gmail' : 'custom';
        customLayer.classList.toggle('is-visible', !showGmail);
        gmailLayer.classList.toggle('is-visible', showGmail);
      };
      element._matAvatarSwitchState = switchState;
    });
    hydrateLivingAvatarFaces(document);
  }
  let avatarTransitionTimer = 0;
  function startAvatarTransitionCycle() {
    if (avatarTransitionTimer) clearInterval(avatarTransitionTimer);
    avatarTransitionTimer = setInterval(() => {
      if (document.querySelector('#profile-avatar-picker.is-expanded')) return;
      document.querySelectorAll('.profile-avatar.mat-avatar-living,#sidebar-user-avatar.mat-avatar-living').forEach(element => element._matAvatarSwitchState?.());
    }, 10000);
  }
  const avatarMotionObserver = new MutationObserver(() => {
    if (installAvatarLiveTransitions._queued) return;
    installAvatarLiveTransitions._queued = true;
    requestAnimationFrame(() => {
      installAvatarLiveTransitions._queued = false;
      installAvatarLiveTransitions();
    });
  });
  avatarMotionObserver.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('student-auth-state-changed',installAvatarLiveTransitions);
  window.addEventListener('student-auth-state-resolved',installAvatarLiveTransitions);
  window.addEventListener('student-profile-loaded',installAvatarLiveTransitions);
  installAvatarLiveTransitions();
  startAvatarTransitionCycle();
  document.addEventListener('mat-open-avatar-builder', () => {
    avatarPickerExpanded = true;
    pendingAvatarConfig = pendingAvatarConfig || readAvatarConfig();
    pendingAvatarSource = pendingAvatarSource || window.MedAvatarCreator.render(pendingAvatarConfig);
    activeAvatarGroup = 'character';
    renderAvatarPicker();
  });
  document.addEventListener('click', event => {
    const builderBack = event.target.closest('#profile-avatar-builder-back');
    if (builderBack) {
      avatarPickerExpanded = false;
      pendingAvatarSource = null;
      pendingAvatarConfig = null;
      renderAvatarPicker();
      window.MedAvatarProfileModal?.close();
      return;
    }
    const categoryScrollButton = event.target.closest('[data-avatar-category-scroll]');
    if (categoryScrollButton) {
      const categoryBar = categoryScrollButton.closest('.mat-avatar-category-navigation')?.querySelector('.mat-avatar-category-bar');
      const direction = Number(categoryScrollButton.dataset.avatarCategoryScroll) || 1;
      categoryBar?.scrollBy({left:direction * 220,behavior:'smooth'});
      return;
    }
    const avatarGroup = event.target.closest('[data-avatar-group]');
    if (avatarGroup) {
      const nextGroup = avatarGroup.dataset.avatarGroup;
      const controls = avatarGroup.closest('.mat-avatar-controls');
      const scroller = controls && controls.querySelector('.mat-avatar-options-scroll');
      const section = scroller && scroller.querySelector('[data-avatar-group-section="' + nextGroup + '"]');
      if (nextGroup && section && scroller) {
        activeAvatarGroup = nextGroup;
        controls.querySelectorAll('.mat-avatar-category').forEach(tab => {
          const active = tab.dataset.avatarGroup === nextGroup;
          tab.classList.toggle('is-active', active);
          tab.setAttribute('aria-pressed', String(active));
          if (active) tab.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});
        });
        const top = section.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
        scroller.scrollTo({top:top, behavior:'smooth'});
      }
      return;
    }
    const avatarPart = event.target.closest('[data-avatar-part]');
    if (avatarPart) {
      const part = avatarPart.dataset.avatarPart;
      const value = avatarPart.dataset.avatarValue;
      const next = Object.assign({}, pendingAvatarConfig || readAvatarConfig(), { [part]: value });
      if (part === 'gender') {
        pendingAvatarConfig = window.MedAvatarCreator.applyCharacterPreset(value === 'female' ? 'f01' : 'm01', next);
        activeAvatarGroup = 'character';
        pendingAvatarSource = window.MedAvatarCreator.render(pendingAvatarConfig);
        renderAvatarPickerWithTransition();
        return;
      }
      if (part === 'characterPreset') {
        pendingAvatarConfig = window.MedAvatarCreator.applyCharacterPreset(value, next);
        activeAvatarGroup = 'character';
        pendingAvatarSource = window.MedAvatarCreator.render(pendingAvatarConfig);
        renderAvatarPickerWithTransition();
        return;
      }
      if (part === 'hairStyle') next.hat = 'none';
      if (part === 'hat' && value !== 'none') next.hairStyle = next.hairStyle || 'shortFlat';
      pendingAvatarConfig = window.MedAvatarCreator.normalize(next);
      pendingAvatarSource = window.MedAvatarCreator.render(pendingAvatarConfig);
      updateAvatarPreviewInPlace(part);
      return;
    }
    const randomizeButton = event.target.closest('#profile-avatar-randomize');
    if (randomizeButton) {
      pendingAvatarConfig = window.MedAvatarCreator.randomize(avatarAccountId() + ':' + Date.now());
      pendingAvatarSource = window.MedAvatarCreator.render(pendingAvatarConfig);
      renderAvatarPickerWithTransition();
      return;
    }
    const resetButton = event.target.closest('#profile-avatar-reset');
    if (resetButton) {
      const latestSavedSource = readAvatar();
      pendingAvatarConfig = window.MedAvatarCreator.configFromAvatar(latestSavedSource) || readAvatarConfig();
      pendingAvatarSource = window.MedAvatarCreator.render(pendingAvatarConfig);
      updateAvatarPreviewInPlace('reset');
      return;
    }
    const togglePicker = event.target.closest('#profile-avatar-toggle-picker');
    if (togglePicker) {
      avatarPickerExpanded = !avatarPickerExpanded;
      pendingAvatarConfig = avatarPickerExpanded ? (pendingAvatarConfig || readAvatarConfig()) : null;
      pendingAvatarSource = avatarPickerExpanded ? (pendingAvatarSource || window.MedAvatarCreator.render(pendingAvatarConfig)) : null;
      renderAvatarPicker();
      return;
    }
    const cancelButton = event.target.closest('#profile-avatar-cancel');
    if (cancelButton) {
      pendingAvatarSource = null;
      pendingAvatarConfig = null;
      avatarPickerExpanded = false;
      renderAvatarPicker();
      return;
    }
    const deleteButton = event.target.closest('#profile-avatar-delete');
    if (deleteButton) {
      const candidate = isAvatarSource(pendingAvatarSource) ? pendingAvatarSource : null;
      const uploaded = readUploadedAvatars();
      if (!candidate || !uploaded.includes(candidate)) return;
      if (!window.confirm('Delete this uploaded avatar permanently from this device?')) return;
      const current = readAvatar();
      const remaining = uploaded.filter(value => value !== candidate);
      try {
        localStorage.setItem(uploadedAvatarKey(), JSON.stringify(remaining));
        if (current === candidate) {
          const fallbackStored = storedDefaultAvatarForUser(avatarAccountId());
          localStorage.setItem(avatarKey(), stripAvatarDefaultMarker(fallbackStored));
          localStorage.removeItem(manualAvatarKey());
          localStorage.removeItem(avatarConfigKey());
          app.profile = Object.assign({}, app.profile || {}, { avatar: fallbackStored });
        }
      } catch (_) {
        const status = document.getElementById('profile-avatar-upload-status');
        if (status) status.textContent = 'Could not delete this avatar. Check browser storage and try again.';
        return;
      }
      const wasCurrent = current === candidate;
      pendingAvatarSource = null;
      renderAvatarPicker();
      const status = document.getElementById('profile-avatar-upload-status');
      if (status) status.textContent = wasCurrent
        ? 'Uploaded avatar deleted. Your default avatar has been restored.'
        : 'Uploaded avatar deleted.';
      refreshAvatarViews();
      if (wasCurrent && typeof window.MedGlobalLeague?.updateProfile === 'function') {
        const fallbackStored = storedDefaultAvatarForUser(avatarAccountId());
        window.MedGlobalLeague.updateProfile({ avatar: fallbackStored }).then(async updated => {
          app.profile = Object.assign({}, app.profile || {}, updated || {}, { avatar: fallbackStored });
          refreshAvatarViews();
        }).catch(error => {
          console.warn('[Profile avatar] Avatar deleted locally, but default avatar sync failed:', error);
          const currentStatus = document.getElementById('profile-avatar-upload-status');
          if (currentStatus) currentStatus.textContent = 'Avatar deleted on this device, but syncing the default avatar to your account failed.';
        });
      }
      return;
    }
    const confirmButton = event.target.closest('#profile-avatar-confirm');
    if (confirmButton) {
      const current = readAvatar();
      const candidate = isAvatarSource(pendingAvatarSource) ? pendingAvatarSource : null;
      const retrySync = confirmButton.dataset.retrySync === '1';
      if (!candidate || (!retrySync && candidate === current) || confirmButton.disabled) return;

      void (async () => {
        let localSaved = retrySync;
        confirmButton.disabled = true;
        confirmButton.setAttribute('aria-busy', 'true');
        confirmButton.classList.remove('is-success');
        confirmButton.innerHTML = 'সংরক্ষণ হচ্ছে<span class="mat-avatar-button-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
        setAvatarSaveFeedback('তোমার আভাটার অ্যাকাউন্টে সংরক্ষণ করা হচ্ছে', 'loading');

        try {
          if (!retrySync) {
            try {
              localStorage.setItem(avatarKey(), candidate);
              localStorage.setItem(manualAvatarKey(), '1');
              if (pendingAvatarConfig) {
                localStorage.setItem(avatarConfigKey(), JSON.stringify(window.MedAvatarCreator.normalize(pendingAvatarConfig)));
              } else {
                localStorage.removeItem(avatarConfigKey());
              }
              localSaved = true;
            } catch (storageError) {
              throw new Error('এই ডিভাইসে Avatar সংরক্ষণ করা যায়নি। Browser storage পরীক্ষা করে আবার চেষ্টা করো।');
            }
          }

          app.profile = Object.assign({}, app.profile || {}, { avatar: candidate });
          if (!window.MedGlobalLeague || typeof window.MedGlobalLeague.updateProfile !== 'function') {
            throw new Error('Account sync service এখনো প্রস্তুত নয়। Internet connection ঠিক করে আবার চেষ্টা করো।');
          }

          const updated = await window.MedGlobalLeague.updateProfile({ avatar: candidate });
          const serverAvatar = String(updated?.avatar || '').trim();
          if (serverAvatar !== candidate) {
            throw new Error('Server থেকে নতুন Avatar নিশ্চিত করা যায়নি। Apps Script backend-এর latest version deploy করা আছে কি না পরীক্ষা করো।');
          }

          app.profile = Object.assign({}, app.profile || {}, updated || {}, { avatar: serverAvatar });
          try { localStorage.setItem(avatarKey(), candidate); } catch (_) {}

          setAvatarSaveFeedback('অ্যাকাউন্টে সংরক্ষিত হয়েছে। Public Profile যাচাই করা হচ্ছে', 'loading');
          let publicState = 'success';
          let finalMessage = 'আভাটার সফলভাবে সংরক্ষিত হয়েছে।';
          try {
            if (typeof window.MedGlobalLeague.reload === 'function') {
              await window.MedGlobalLeague.reload();
            } else if (typeof app.loadLeaderboard === 'function') {
              await app.loadLeaderboard(true);
            }
          } catch (refreshError) {
            console.warn('[Profile avatar] Account save succeeded, but leaderboard refresh failed:', refreshError);
            publicState = 'warning';
            finalMessage = 'আভাটার অ্যাকাউন্টে সংরক্ষিত হয়েছে; Leaderboard refresh আবার চেষ্টা করবে।';
          }

          const stripMarker = value => String(value || '').replace(/#mat-(?:default|custom)-avatar$/i, '');
          const expectedAvatar = stripMarker(serverAvatar);
          const ownId = String(app.authUser?.uid || app.profile?.userId || app.profile?.uid || '');
          let publicRow = null;
          if (ownId && typeof window.MedGlobalLeague?.verifyPublicAvatar === 'function') {
            try {
              publicRow = await window.MedGlobalLeague.verifyPublicAvatar(ownId);
            } catch (verifyError) {
              console.warn('[Profile avatar] Could not verify public leaderboard copy:', verifyError);
              publicState = 'warning';
              finalMessage = 'আভাটার অ্যাকাউন্টে সংরক্ষিত হয়েছে; Public Profile যাচাই করা যায়নি।';
            }
          } else if (ownId && typeof window.MedGlobalLeague?.getCachedRows === 'function') {
            ['monthly', 'weekly', 'friends'].some(period => {
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
              publicState = 'warning';
              finalMessage = 'আভাটার অ্যাকাউন্টে সংরক্ষিত হয়েছে, তবে Public Leaderboard এখনো পুরোনো Avatar দেখাচ্ছে।';
            }
          } else if (!ownId || publicState === 'warning') {
            publicState = 'warning';
            if (!ownId) finalMessage = 'আভাটার সংরক্ষিত হয়েছে; Public Profile যাচাই করা যায়নি।';
          }

          confirmButton.classList.add('is-success');
          confirmButton.textContent = 'সফলভাবে সংরক্ষিত ✓';
          setAvatarSaveFeedback(finalMessage, publicState);
          await new Promise(resolve => window.setTimeout(resolve, 1000));

          pendingAvatarSource = null;
          pendingAvatarConfig = null;
          avatarPickerExpanded = false;
          refreshAvatarViews();
          window.MedAvatarProfileModal?.close();
          // Success remains visible in the Builder footer; no extra floating notification.
        } catch (error) {
          const message = String(error?.message || error || 'Unknown sync error').slice(0, 260);
          setAvatarSaveFeedback(
            localSaved
              ? 'ডিভাইসে সংরক্ষিত হয়েছে, কিন্তু Account Sync হয়নি: ' + message
              : message,
            'error'
          );
          confirmButton.disabled = false;
          confirmButton.dataset.retrySync = localSaved ? '1' : '0';
          confirmButton.textContent = localSaved ? 'আবার Sync করো' : 'আবার চেষ্টা করো';
          console.warn('[Profile avatar] Avatar save/sync failed:', error);
        } finally {
          confirmButton.removeAttribute('aria-busy');
        }
      })();
      return;
    }
    const avatarChoice = event.target.closest('[data-avatar-source]');
    if (!avatarChoice) return;
    const source = avatarChoice.dataset.avatarSource;
    const index = Number(avatarChoice.dataset.avatarIndex);
    let value = null;
    if (source === 'google') {
      value = readGoogleAvatar() || null;
    } else if (source === 'uploaded') {
      const uploaded = readUploadedAvatars();
      if (Number.isInteger(index) && index >= 0 && index < uploaded.length) value = uploaded[index];
    }
    if (!value) return;
    pendingAvatarSource = value;
    pendingAvatarConfig = null;
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
      pendingAvatarConfig = null;
      avatarPickerExpanded = false;
      renderAvatarPicker();
      const newStatus = document.getElementById('profile-avatar-upload-status');
      if (newStatus) newStatus.textContent = 'ছবিটি প্রোফাইলে সেট করা হচ্ছে…';
      document.getElementById('profile-avatar-confirm')?.click();
    } catch (error) {
      const errorStatus = document.getElementById('profile-avatar-upload-status');
      if (errorStatus) errorStatus.textContent = error?.message || 'The avatar upload failed. Try a smaller supported image.';
      window.MedAvatarProfileModal?.showStatus(error?.message || 'ছবিটি আপলোড করা যায়নি। অন্য একটি ছবি দিয়ে চেষ্টা করো।');
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
    pendingAvatarConfig = null;
    renderAvatarPicker();
    return result;
  };
  const originalShowViewForAvatar = app.showView.bind(app);
  app.showView = function(viewName, force = false) {
    const closeBuilder = viewName !== 'profile' && avatarPickerExpanded;
    if (closeBuilder) {
      avatarPickerExpanded = false;
      pendingAvatarSource = null;
      pendingAvatarConfig = null;
    }
    const result = originalShowViewForAvatar(viewName, force);
    if (closeBuilder || viewName === 'profile') renderAvatarPicker();
    return result;
  };

  // Sidebar navigation remains clickable above the Builder. Any non-profile
  // navigation closes the Builder first, then lets the original click continue.
  document.addEventListener('click', event => {
    const navigation = event.target.closest('#app-sidebar .sidebar-nav [data-nav-view], #app-sidebar .sidebar-brand');
    if (!navigation || !avatarPickerExpanded) return;
    avatarPickerExpanded = false;
    pendingAvatarSource = null;
    pendingAvatarConfig = null;
    renderAvatarPicker();
  }, true);
})();


/* Final checklist additions: settings, rank tiers, profile actions, and footer support links. */
(() => {
  'use strict';
  const app = window.app;
  if (!app || app.__studentChecklistExtras) return;
  app.__studentChecklistExtras = true;
  const safeRead = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (_) { return fallback; } };
  const progressKey = () => app.getScopedLocalStorageKey('med_account_progress_v1');
  const readProgress = () => safeRead(progressKey(), { rankPoints: 0, xp: 0, completedExams: 0, rewarded: [] });
  // Friendly RP curve: each promotion costs 500 + 20% of the previous promotion cost.
  const roundRankCost = value => Math.max(5, Math.round(Number(value || 0) / 5) * 5);
  const rankUpgradeCost = step => {
    const n = Math.max(1, Math.floor(Number(step) || 1));
    let cost = 500;
    for (let i = 1; i < n; i++) cost = roundRankCost(500 + cost * 0.2);
    return cost;
  };
  const completedRankUps = points => {
    const value = Math.max(0, Number(points) || 0);
    let total = 0, count = 0;
    while (count < 55) {
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
    return rankIndex >= 50 ? 'Immortal ' + roman[Math.min(4, rankIndex - 50)] : tiers[Math.floor(rankIndex / 5)] + ' ' + roman[rankIndex % 5];
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
    const guestActive = String(app.profile?.accountType || '').toUpperCase() === 'GUEST' &&
      Boolean(localStorage.getItem('med_sheet_guest_token_v1')) &&
      !localStorage.getItem('med_guest_session_expired_v1');
    target.innerHTML = (loggedIn || guestActive)
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
const pkey=()=>app.getScopedLocalStorageKey('med_account_progress_v1');
const progress=()=>{try{return typeof app.getAccountProgress==='function'?app.getAccountProgress():(JSON.parse(localStorage.getItem(pkey())||'{}')||{})}catch(_){return{}}};
const rankUpgradeCost=step=>{const n=Math.max(1,Math.floor(Number(step)||1));let cost=500;for(let i=1;i<n;i++)cost=Math.max(5,Math.round((500+cost*0.2)/5)*5);return cost};
const rank=points=>{const value=Math.max(0,Number(points)||0);let n=0,spent=0,required=rankUpgradeCost(1);while(n<55&&value>=spent+required){spent+=required;n++;required=rankUpgradeCost(n+1)}if(n>=55)return{name:'Immortal I',tier:'immortal',index:55,step:5,points:value,remaining:0,progress:100};if(n>=50)return{name:'Immortal '+roman[n-50],tier:'immortal',index:n+1,step:n-49,points:value,remaining:Math.max(0,required-(value-spent)),progress:Math.min(100,(value-spent)/required*100)};const within=value-spent;return{name:tiers[Math.floor(n/5)]+' '+roman[n%5],tier:tiers[Math.floor(n/5)].toLowerCase(),index:n+1,step:n%5+1,points:value,remaining:Math.max(0,required-within),progress:Math.min(100,within/required*100)}};
const qkey=q=>String(q?.id||[q?.subject,q?.year,q?.question||q?.questionText].join('|')).toLowerCase().replace(/\s+/g,' ').trim();
const hkey=()=>app.getScopedLocalStorageKey('med_review_history_v2');
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
  try{local=JSON.parse(localStorage.getItem(app.getScopedLocalStorageKey('med_account_progress_v1'))||'{}')||{}}catch(_){}
  const xp=Math.max(0,Number(profile.xp??local.xp??local.performanceBonus)||0);
  const rankProgressRP=Math.max(0,Number(profile.rankPoints??local.rankPoints)||0);
  const levelState=typeof app.getPerformanceLevelProgress==='function'?app.getPerformanceLevelProgress(xp):{level:Number(profile.level)||1,toNext:Math.max(0,500-xp),percent:Math.min(100,Math.round(xp/500*100))};
  const ranks=window.MedGlobalLeague&&typeof window.MedGlobalLeague.getRanks==='function'?window.MedGlobalLeague.getRanks():[];
  const rankName=String(profile.rank||(ranks[0]||'Bronze V'));
  const rankIndex=ranks.indexOf(rankName);
  const promotionCost=index=>{if(index<0||index>=ranks.length-1)return 0;let cost=500;for(let step=1;step<=index;step++)cost=Math.max(5,Math.round((500+cost*.2)/5)*5);return cost;};
  const nextRankTarget=promotionCost(rankIndex);
  const rankPercent=Math.max(0,Math.min(100,Math.round(rankProgressRP/Math.max(1,nextRankTarget)*100)));
  const completedExams=Math.max(0,Number(local.completedExams)||0);
  const esc=value=>app.escapeHtml?app.escapeHtml(value):String(value??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  card.innerHTML='<h3>Medical Rank &amp; Achievements</h3><div class="enhanced-actions" style="margin-top:12px"><span class="enhanced-status-pill enhanced-status-reviewed">'+esc(rankName)+'</span><span class="enhanced-status-pill">'+rankProgressRP.toLocaleString()+' Current Rank RP</span><span class="enhanced-status-pill">Account Level '+Math.max(1,Number(profile.level)||levelState.level)+'</span><span class="enhanced-status-pill">🏆 '+Math.floor(completedExams/10)+' trophies</span></div><div class="rank-track" role="progressbar" aria-label="Current rank RP progression" aria-valuemin="0" aria-valuemax="'+Math.max(1,nextRankTarget)+'" aria-valuenow="'+Math.min(rankProgressRP,Math.max(1,nextRankTarget))+'"><span style="width:'+rankPercent+'%"></span></div><p class="enhanced-empty">'+(rankIndex>=0&&rankIndex===ranks.length-1?'Highest rank reached · Immortal':(Math.max(0,nextRankTarget-rankProgressRP)).toLocaleString()+' RP to next sub-rank'+(rankIndex>=0&&ranks[rankIndex+1]?' · Next: '+esc(ranks[rankIndex+1]):''))+'</p><div class="rank-stats"><div class="rank-stat"><small>Medical XP</small><strong>'+xp.toLocaleString()+'</strong><small>'+levelState.toNext.toLocaleString()+' XP to next level</small></div><div class="rank-stat"><small>Completed Exams</small><strong>'+completedExams.toLocaleString()+'</strong><small>Learning activity history</small></div><div class="rank-stat"><small>Level Progress</small><strong>'+levelState.percent+'%</strong><small>XP-based progression</small></div></div><div class="rank-track"><span style="width:'+levelState.percent+'%"></span></div><small>Medical XP and RP are synced from this website&#39;s own API.</small>';
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
    panel.innerHTML='<h3 style="font-weight:900;font-size:1.1rem">Practice Exam Setup</h3><p style="font-size:.82rem;color:var(--muted,#64748b);margin:4px 0 14px">Choose Exam Type and Question Count. Minimum 10 questions.</p><label style="font-size:.85rem;font-weight:900">Exam Type</label><div class="practice-type-grid" role="group"><button type="button" class="practice-type-btn active" data-practice-type="all" aria-pressed="true">All Questions</button><button type="button" class="practice-type-btn" data-practice-type="reviewed" aria-pressed="false">Reviewed</button><button type="button" class="practice-type-btn" data-practice-type="wrong" aria-pressed="false">Wrong Answer</button><button type="button" class="practice-type-btn" data-practice-type="previous" aria-pressed="false">Previous Year</button></div><label style="display:block;font-size:.85rem;font-weight:900;margin-top:14px">Question Count</label><div class="practice-count-grid">'+[20,30,50,75,100].map(n=>'<button type="button" class="practice-count-btn '+(n===20?'active':'')+'" data-practice-count="'+n+'" aria-pressed="'+(n===20?'true':'false')+'">'+n+'</button>').join('')+'</div><label for="practice-custom-count" style="display:block;font-size:.82rem;font-weight:800;margin-top:12px">Custom Question Count</label><input id="practice-custom-count" type="number" min="10" step="1" inputmode="numeric" placeholder="Enter 10 or more questions" oninput="var n=this.value.trim()?Math.max(10,Math.floor(Number(this.value)||10)):Number(document.querySelector(\'#practice-exam-setup [data-practice-count].active\')?.dataset.practiceCount||20);document.getElementById(\'practice-auto-time\').textContent=n+\' questions · \' + Math.max(1,Math.round(n*.6))+\' minutes automatically\'" style="width:100%;min-height:42px;padding:9px 12px;border:1px solid var(--line,#cbd5e1);border-radius:11px;background:var(--surface,#fff);color:var(--text,#1e293b)"><div class="practice-setup-footer"><span id="practice-auto-time">20 questions · 12 minutes automatically</span><span id="practice-available-count">Loading questions…</span></div><div class="practice-start-row"><button type="button" id="practice-start-button" class="practice-start-btn"><i class="fa-solid fa-play" aria-hidden="true"></i> Start Practice</button></div>';
    browser.appendChild(panel);
    panel.addEventListener('click',e=>{
      const typeButton=e.target.closest('[data-practice-type]');
      const countButton=e.target.closest('[data-practice-count]');
      if(typeButton)panel.querySelectorAll('[data-practice-type]').forEach(b=>{b.classList.toggle('active',b===typeButton);b.setAttribute('aria-pressed',String(b===typeButton))});
      if(countButton)panel.querySelectorAll('[data-practice-count]').forEach(b=>{b.classList.toggle('active',b===countButton);b.setAttribute('aria-pressed',String(b===countButton))});
      if(countButton){const custom=panel.querySelector('#practice-custom-count');if(custom)custom.value='';}if(typeButton||countButton)updatePracticeUI();
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
const practiceType=()=>document.querySelector('#practice-exam-setup [data-practice-type].active')?.dataset.practiceType||'all',practiceCount=()=>{const el=document.getElementById('practice-custom-count'),v=el&&el.value.trim();return v?Math.max(10,Math.floor(Number(v)||10)):Number(document.querySelector('#practice-exam-setup [data-practice-count].active')?.dataset.practiceCount||20)};
function practicePool(){const qs=Array.isArray(app.questionBank)?app.questionBank:[],type=practiceType();if(type==='reviewed')return qs.filter(q=>Boolean(record(q).reviewed));if(type==='wrong')return qs.filter(q=>Boolean(record(q).wrong));if(type==='previous')return qs.filter(q=>Boolean(q.isPreviousYear)||(q.year&&!/^practice$/i.test(String(q.year))));return qs.slice()}
function updatePracticeUI(){const pool=practicePool(),count=practiceCount(),mins=Math.max(1,Math.round(count*.6)),time=document.getElementById('practice-auto-time'),available=document.getElementById('practice-available-count');if(time)time.textContent=count+' questions · '+mins+' minutes automatically';if(available)available.textContent=pool.length+' matching questions'+(pool.length<count?' · Not enough questions for this count':'')}
app.startPracticeFromBrowser=function(){
  if(!this.questionsLoaded||!this.questionBank.length){this.showDataError('প্রশ্ন ব্যাংক এখনো লোড হয়নি।');return}
  const pool=practicePool(),requestedCount=practiceCount();
  if(!Number.isFinite(requestedCount)||requestedCount<10){alert('Minimum 10 questions are required.');return}
  if(pool.length<requestedCount){alert('এই Exam Type-এ '+pool.length+'টি প্রশ্ন আছে। '+requestedCount+'টি প্রশ্নের পরীক্ষা দিতে আরও প্রশ্ন প্রয়োজন।');return}
  const selected=pool.slice().sort(()=>Math.random()-.5).slice(0,requestedCount);
  if(this.practiceTimerInterval){clearInterval(this.practiceTimerInterval);this.practiceTimerInterval=null}
  if(this.examState?.timerInterval){clearInterval(this.examState.timerInterval);this.examState.timerInterval=null}
  if(typeof this.shuffleQuestionsAndOptions!=='function'||typeof this.beginPreparedExam!=='function'){this.showDataError('Strict Practice exam চালু করা যাচ্ছে না। পেজটি refresh করে আবার চেষ্টা করুন।');return}
  this.preparedExam={
    questions:this.shuffleQuestionsAndOptions(selected,selected.length),
    mode:'practice',
    subject:'all',
    year:'all',
    durationMins:Math.max(1,Math.round(selected.length*0.6))
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
const oldAnswer=app.answerPractice.bind(app);app.answerPractice=function(index){const q=this.practiceSession?.questions?.[this.practiceSession?.index],result=oldAnswer(index);if(q){const h=readHistory(),key=qkey(q),prior=h[key]||{key,question:q,reviewed:false};h[key]={...prior,question:q,wrong:index!==q.answer,userAnswerIndex:index,correctAnswerIndex:q.answer,updatedAt:Date.now()};localStorage.setItem(hkey(),JSON.stringify(h));updatePracticeUI()}return result};
const oldBrowser=app.renderPracticeBrowser?.bind(app);if(oldBrowser)app.renderPracticeBrowser=function(){const r=oldBrowser();setupPracticeUI();updatePracticeUI();return r};
const oldAuth=app.setAuthState.bind(app);app.setAuthState=function(user,...args){const r=oldAuth(user,...args);renderSidebarAuth();renderRankCard();setupPracticeUI();updatePracticeUI();return r};
const oldShow=app.showView.bind(app);app.showView=function(name,...args){const r=oldShow(name,...args);if(name==='profile')renderRankCard();if(name==='practice'){setupPracticeUI();updatePracticeUI()}renderSidebarAuth();return r};
const oldLeaderboard=app.renderLeaderboardRows?.bind(app);
// This leaderboard enhancement is a separate IIFE from the avatar picker above.
// Recreate its account-scoped storage helpers locally instead of referencing
// lexical constants that are not visible across IIFE boundaries.
const avatarAccountId = () => typeof app.getLocalIdentityKey === 'function'
  ? String(app.getLocalIdentityKey())
  : String(app.authUser?.uid || 'visitor');
const manualAvatarKey = () => 'med_profile_avatar_manual_v1_' + avatarAccountId();
const avatarKey = () => 'med_profile_avatar_v1_' + avatarAccountId();
const legacyAvatarKey = () => 'med_profile_avatar_v1_' + avatarAccountId();
const uploadedAvatarKey = () => 'med_profile_uploaded_avatars_v1_' + avatarAccountId();
function portraitDefaultForId(userId){
  return window.MedAvatarCreator.render(window.MedAvatarCreator.defaultConfig(userId || 'guest'));
}
function portraitForRow(row){
  const rawAvatar=String(row?.avatar||row?.Avatar||'').trim();
  const rowId=String(row?.uid||row?.userId||row?.playerId||row?.id||row?.name||'guest');
  const usableAvatar=value=>{
    const avatar=String(value||'').trim().replace(/#mat-(?:default|custom)-avatar$/i,'');
    if(/^https:\/\//i.test(avatar)||/^data:image\/(?:webp|png);base64,[A-Za-z0-9+/=]+$/.test(avatar)||window.MedAvatarCreator.isAvatar(avatar))return avatar;
    return '';
  };
  const isLegacyPortrait=value=>/^https:\/\/i\.pravatar\.cc\/120\?img=\d+$/i.test(String(value||'').trim());
  const mine=rowId===avatarAccountId();
  const rowAvatar=usableAvatar(rawAvatar);
  if(rowAvatar && !isLegacyPortrait(rowAvatar))return rowAvatar;
  if(mine){
    const profileAvatar=usableAvatar(app.profile?.avatar);
    if(profileAvatar && !isLegacyPortrait(profileAvatar))return profileAvatar;
    try{
      const saved=usableAvatar(localStorage.getItem(avatarKey())||localStorage.getItem(legacyAvatarKey()));
      if(saved && !isLegacyPortrait(saved))return saved;
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
    if (avatar.dataset.avatarSource !== source) {
      const config = window.MedAvatarCreator.configFromAvatar(source);
      avatar.innerHTML = window.MedAvatarCreator.renderLayersMarkup(source, config, 'leaderboard-avatar-stack');
      avatar.dataset.avatarSource = source;
    }
    avatar.setAttribute('aria-label','Student portrait');
  });
  Array.from(document.querySelectorAll('#leaderboard-podium .podium-card')).forEach((card,i)=>{
    const row=rowForElement(card,i),avatar=card.querySelector('.podium-avatar');if(!row||!avatar)return;
    const source=portraitForRow(row);
    if (avatar.dataset.avatarSource !== source) {
      const config = window.MedAvatarCreator.configFromAvatar(source);
      avatar.innerHTML = window.MedAvatarCreator.renderLayersMarkup(source, config, 'podium-avatar-stack');
      avatar.dataset.avatarSource = source;
    }
  });
  const me=document.getElementById('leaderboard-me'),mine=safe.find(row=>String(row?.userId||row?.uid||'')===String(app.authUser?.uid||''));
  if(me&&mine){const source=portraitForRow(mine);let wrap=me.querySelector('.leaderboard-me-avatar-wrap');if(!wrap){wrap=document.createElement('span');wrap.className='leaderboard-me-avatar-wrap';wrap.style.cssText='display:block;width:44px;height:44px;flex:0 0 44px;margin-inline-end:12px';me.prepend(wrap)}if(wrap.dataset.avatarSource!==source){wrap.innerHTML=window.MedAvatarCreator.renderLayersMarkup(source,window.MedAvatarCreator.configFromAvatar(source),'leaderboard-me-stack');wrap.dataset.avatarSource=source}}
  hydrateLivingAvatarFaces(document);
}
if(oldLeaderboard)app.renderLeaderboardRows=function(rows){
  const result=oldLeaderboard(rows);paintLeaderboardPeople(rows);
  const p=progress(),r=rank(p.rankPoints),live=document.getElementById('profile-live-rank'),best=document.getElementById('profile-best-rank');
  if(live)live.textContent=r.name;if(best)best.textContent=r.name;return result
};
document.addEventListener('student-progress-updated',()=>{renderRankCard();renderSidebarAuth();updatePracticeUI()});document.addEventListener('student-auth-state-changed',()=>{renderRankCard();renderSidebarAuth();updatePracticeUI()});window.addEventListener('load',()=>{renderRankCard();renderSidebarAuth();setupPracticeUI();updatePracticeUI()});renderRankCard();renderSidebarAuth();setupPracticeUI();
})();


;/* Avatar Builder icon-strip styling: screenshot-matched monochrome toolbar. */
(function () {
  if (document.getElementById('mat-avatar-icon-strip-style')) return;
  const style = document.createElement('style');
  style.id = 'mat-avatar-icon-strip-style';
  style.textContent = `
    .profile-avatar-group-tabs{
      display:flex!important;align-items:center;justify-content:space-between;gap:clamp(4px,1.1vw,12px);
      width:100%;min-width:0;overflow-x:auto;overflow-y:hidden;
      padding:7px 10px!important;margin:0 0 14px;
      border:1px solid #55545a;border-radius:999px;
      background:linear-gradient(180deg,#17171a 0%,#101012 100%);
      box-shadow:inset 0 1px 0 rgba(255,255,255,.045),0 5px 16px rgba(0,0,0,.18);
      scrollbar-width:none;-webkit-overflow-scrolling:touch;
    }
    .profile-avatar-group-tabs::-webkit-scrollbar{display:none}
    .profile-avatar-group-tab{
      position:relative;display:inline-flex!important;flex:1 0 38px!important;
      align-items:center;justify-content:center;gap:0!important;
      width:clamp(38px,5.2vw,54px);min-width:38px;height:42px;min-height:42px;
      padding:0 5px!important;margin:0;border:1px solid transparent!important;
      border-radius:12px!important;background:transparent!important;
      color:#e7e7e9!important;font-size:0!important;font-weight:700;
      box-shadow:none!important;opacity:.88;
      transition:background .18s ease,border-color .18s ease,opacity .18s ease,transform .18s ease;
    }
    .profile-avatar-group-tab .profile-avatar-option-glyph{
      display:inline-grid!important;place-items:center;width:26px;height:26px;
      color:#f2f2f4!important;font-size:23px!important;line-height:1;
      filter:grayscale(1) brightness(1.12);opacity:.94;
    }
    .profile-avatar-group-tab.is-active{
      border-color:#77767d!important;background:rgba(255,255,255,.095)!important;
      color:#fff!important;opacity:1;box-shadow:inset 0 1px 0 rgba(255,255,255,.08)!important;
    }
    .profile-avatar-group-tab:hover{
      background:rgba(255,255,255,.075)!important;opacity:1;transform:translateY(-1px);
    }
    .profile-avatar-group-tab:focus-visible{
      outline:2px solid #d9d9df!important;outline-offset:2px;
    }
    html:not([data-theme="light"]) .profile-avatar-group-tabs{
      border-color:#55545a;background:linear-gradient(180deg,#17171a,#101012);
    }
    html[data-theme="light"] .profile-avatar-group-tabs{
      border-color:#777780;background:linear-gradient(180deg,#29292e,#17171b);
    }
    @media(max-width:760px){
      .profile-avatar-group-tabs{justify-content:flex-start;gap:5px;padding:6px 8px!important}
      .profile-avatar-group-tab{flex:0 0 42px!important;width:42px;min-width:42px;height:40px;min-height:40px}
      .profile-avatar-group-tab .profile-avatar-option-glyph{font-size:22px!important}
    }
    @media(prefers-reduced-motion:reduce){
      .profile-avatar-group-tab{transition:none!important}
    }
  `;
  document.head.appendChild(style);
})();


;/* MAT avatar builder refinement v2 — actual category toolbar and editor polish. */
(function(){
  if(document.getElementById('mat-avatar-builder-refinement-v2'))return;
  const style=document.createElement('style');
  style.id='mat-avatar-builder-refinement-v2';
  style.textContent=`
    /* Screenshot-inspired monochrome capsule toolbar */
    .mat-avatar-controls .mat-avatar-category-bar{
      display:flex!important;flex:0 0 64px!important;align-items:center!important;
      justify-content:space-between!important;gap:clamp(3px,.8vw,10px)!important;
      min-width:0;margin:0 0 14px!important;padding:6px 10px!important;
      overflow-x:auto!important;overflow-y:hidden!important;
      border:1px solid #5b5a60!important;border-radius:999px!important;
      background:linear-gradient(180deg,#17171a 0%,#101012 100%)!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 5px 18px rgba(0,0,0,.2);
      scrollbar-width:none!important;-webkit-overflow-scrolling:touch;
    }
    .mat-avatar-controls .mat-avatar-category-bar::-webkit-scrollbar{display:none}
    .mat-avatar-controls .mat-avatar-category{
      position:relative;display:flex!important;flex:1 0 40px!important;
      align-items:center!important;justify-content:center!important;
      width:clamp(40px,5.2vw,54px);min-width:40px;height:48px;min-height:48px;
      padding:0 6px!important;margin:0!important;border:1px solid transparent!important;
      border-radius:13px!important;background:transparent!important;
      color:#e8e8eb!important;font-size:0!important;line-height:1;
      opacity:.88;transition:background .18s ease,border-color .18s ease,opacity .18s ease,transform .18s ease;
    }
    .mat-avatar-controls .mat-avatar-category svg{
      display:block!important;width:25px!important;height:25px!important;
      fill:none!important;stroke:#f1f1f3!important;stroke-width:1.85!important;
      stroke-linecap:round!important;stroke-linejoin:round!important;
      filter:grayscale(1);opacity:.96;
    }
    .mat-avatar-controls .mat-avatar-category.is-active{
      border-color:#77767d!important;border-bottom-color:#77767d!important;
      background:rgba(255,255,255,.10)!important;color:#fff!important;
      opacity:1;box-shadow:inset 0 1px 0 rgba(255,255,255,.08)!important;
    }
    .mat-avatar-controls .mat-avatar-category:hover{
      background:rgba(255,255,255,.075)!important;color:#fff!important;
      opacity:1;transform:translateY(-1px);
    }
    .mat-avatar-controls .mat-avatar-category:focus-visible{
      outline:2px solid #e4e4e7!important;outline-offset:2px;
    }
    /* Clearer, tactile option cards */
    .mat-avatar-controls .mat-avatar-options-scroll{
      min-height:0;overscroll-behavior:contain;scrollbar-color:#55545d transparent;
      scrollbar-width:thin;
    }
    .mat-avatar-controls .mat-avatar-option-section h3{
      display:flex;align-items:center;gap:8px;margin:2px 0 12px;
      color:#f2f2f4;font-size:14px;font-weight:850;letter-spacing:.01em;
    }
    .mat-avatar-controls .mat-avatar-option-grid{
      display:grid;grid-template-columns:repeat(auto-fill,minmax(105px,1fr));
      gap:9px;
    }
    .mat-avatar-controls .mat-avatar-option{
      position:relative;min-width:0;min-height:48px;padding:9px 10px;
      border:1px solid #3c3b45!important;border-radius:13px!important;
      background:linear-gradient(180deg,#24242d,#1c1c24)!important;
      color:#e9e9ed!important;font-size:12px;font-weight:700;
      transition:border-color .16s ease,background .16s ease,transform .16s ease,box-shadow .16s ease;
    }
    .mat-avatar-controls .mat-avatar-option:hover{
      border-color:#777681!important;background:#2a2a34!important;
      transform:translateY(-1px);
    }
    .mat-avatar-controls .mat-avatar-option.is-selected{
      border:1px solid #d4d4d8!important;
      background:linear-gradient(180deg,#34343d,#292932)!important;
      box-shadow:0 0 0 2px rgba(255,255,255,.10),inset 0 1px 0 rgba(255,255,255,.08)!important;
    }
    .mat-avatar-controls .mat-avatar-option:focus-visible{
      outline:2px solid #e4e4e7!important;outline-offset:2px;
    }
    .mat-avatar-controls .mat-avatar-option:has(.mat-avatar-swatch){
      width:46px;min-width:46px;height:46px;min-height:46px;
      padding:3px!important;border:1px solid #55545e!important;
      border-radius:12px!important;background:#202027!important;
    }
    .mat-avatar-controls .mat-avatar-option:has(.mat-avatar-swatch).is-selected{
      border:2px solid #f1f1f3!important;box-shadow:0 0 0 2px #777!important;
    }
    .mat-avatar-controls .mat-avatar-swatch{
      width:29px;height:29px;border:1px solid rgba(255,255,255,.32);
      box-shadow:inset 0 1px 2px rgba(0,0,0,.15);
    }
    .mat-avatar-controls .mat-avatar-actions{
      padding:12px 0 2px!important;border-top:1px solid #383840!important;
      background:linear-gradient(180deg,rgba(25,25,32,0),#191920 24%)!important;
    }
    .mat-avatar-controls .mat-avatar-actions .profile-avatar-confirm-button{
      min-height:50px;border:1px solid rgba(255,255,255,.14)!important;
      border-radius:14px!important;background:linear-gradient(135deg,#16a34a,#059669)!important;
      box-shadow:0 5px 16px rgba(5,150,105,.2);
      font-weight:900;letter-spacing:.01em;
    }
    .mat-avatar-controls .mat-avatar-actions .profile-avatar-confirm-button:hover{
      filter:brightness(1.07);transform:translateY(-1px);
    }
    .mat-avatar-preview-panel{
      border:1px solid #3e3d48!important;border-radius:22px!important;
      background:radial-gradient(ellipse at 50% 36%,#292936 0%,#1b1b25 62%,#15151c 100%)!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 12px 34px rgba(0,0,0,.2);
    }
    .mat-avatar-preview-panel .profile-avatar-preview-stack{
      filter:drop-shadow(0 12px 20px rgba(0,0,0,.22));
    }
    .mat-avatar-preview-caption{
      color:#c8c8d0!important;background:rgba(12,12,16,.52)!important;
      border:1px solid rgba(255,255,255,.10);
      backdrop-filter:blur(8px);
    }
    @media(max-width:760px){
      .mat-avatar-controls{padding:10px!important;border-radius:18px!important}
      .mat-avatar-controls .mat-avatar-category-bar{
        flex:0 0 54px!important;justify-content:flex-start!important;
        gap:5px!important;padding:5px 7px!important;margin-bottom:10px!important;
      }
      .mat-avatar-controls .mat-avatar-category{
        flex:0 0 42px!important;width:42px;min-width:42px;height:42px;min-height:42px;
      }
      .mat-avatar-controls .mat-avatar-category svg{width:23px!important;height:23px!important}
      .mat-avatar-controls .mat-avatar-option-grid{
        grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:7px;
      }
      .mat-avatar-controls .mat-avatar-option{min-height:44px;padding:8px}
      .mat-avatar-controls .mat-avatar-options-scroll{padding:2px 3px 10px 0}
      .mat-avatar-controls .mat-avatar-actions{padding-top:9px!important}
    }
    @media(max-width:390px){
      .mat-avatar-controls .mat-avatar-option-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
    }
    @media(prefers-reduced-motion:reduce){
      .mat-avatar-controls .mat-avatar-category,.mat-avatar-controls .mat-avatar-option,
      .mat-avatar-controls .mat-avatar-actions .profile-avatar-confirm-button{transition:none!important}
    }
  `;
  document.head.appendChild(style);
})();

;/* MAT Avatar Builder screenshot-aligned layout and independent asset previews v3. */
(function(){
 if(document.getElementById('mat-avatar-builder-reference-v3'))return;
 const style=document.createElement('style');style.id='mat-avatar-builder-reference-v3';
 style.textContent=`
  .profile-avatar-picker.is-expanded{background:#14131c!important;color:#f7f7fa!important}
  .profile-avatar-picker.is-expanded .profile-avatar-builder-header{max-width:1240px;width:100%;margin:0 auto 14px}
  .profile-avatar-picker.is-expanded .profile-avatar-builder-header h2{color:#f7f7fa!important;font-size:clamp(21px,2vw,30px)}
  .profile-avatar-picker.is-expanded .profile-avatar-builder-header button{background:transparent!important;border:0!important;color:#f7f7fa!important}
  .mat-avatar-workspace{width:min(100%,1240px);margin:0 auto;display:grid;grid-template-columns:minmax(280px,.62fr) minmax(0,1.18fr);gap:clamp(16px,1.6vw,26px);align-items:stretch;min-height:0;flex:1}
  .mat-avatar-preview-panel{position:relative;min-width:0;min-height:420px;height:100%;overflow:hidden;border:1px solid rgba(255,255,255,.35)!important;border-radius:28px!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 12px 32px rgba(0,0,0,.22)!important;display:flex;align-items:flex-end;justify-content:center}
  .mat-avatar-preview-panel .profile-avatar-preview-stack{width:min(100%,440px);height:100%;max-height:100%;margin:auto;display:block;position:relative}
  .mat-avatar-preview-panel .profile-avatar-preview-stack .med-avatar-base{width:100%;height:100%;object-fit:contain;object-position:center bottom}
  .mat-avatar-preview-panel .mat-avatar-reset{top:12px!important;right:12px!important;border:1px solid rgba(255,255,255,.3)!important;border-radius:999px!important;padding:8px 13px!important;background:rgba(31,34,82,.72)!important;color:#fff!important;backdrop-filter:blur(8px)}
  .mat-avatar-preview-caption{left:14px!important;bottom:12px!important;color:#fff!important;background:rgba(12,12,16,.42)!important}
  .mat-avatar-controls{min-width:0;min-height:0;height:100%;display:flex;flex-direction:column;overflow:hidden;padding:0!important;border:1px solid #68676d!important;border-radius:30px!important;background:#111!important;box-shadow:0 12px 32px rgba(0,0,0,.2)}
  .mat-avatar-controls .mat-avatar-category-bar{flex:0 0 70px!important;min-height:70px!important;margin:0!important;padding:7px 10px!important;border:0!important;border-bottom:1px solid #555!important;border-radius:28px 28px 0 0!important;background:#151515!important}
  .mat-avatar-controls .mat-avatar-options-scroll{flex:1 1 auto;min-height:0;overflow-y:auto!important;padding:16px 18px 20px!important;background:#111!important}
  .mat-avatar-option-section{margin:0 0 24px!important}
  .mat-avatar-option-section h3{color:#f4f4f5!important;font-size:15px!important;font-weight:850!important}
  .mat-avatar-option-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:10px!important}
  .mat-avatar-option{min-height:94px!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:10px!important;border:2px solid #8a8a8a!important;border-radius:16px!important;background:#3a3a3a!important;color:#fff!important}
  .mat-avatar-option.is-selected{border-color:#08b95c!important;background:#3a3a3a!important;box-shadow:0 0 0 1px #08b95c!important}
  .mat-avatar-option .mat-avatar-option-preview-stack{width:76px;height:76px;display:block}
  .mat-avatar-option .mat-avatar-option-preview-stack .med-avatar-base{width:100%;height:100%;object-fit:contain}
  .mat-avatar-asset-preview{display:flex;width:100%;height:70px;align-items:center;justify-content:center}
  .mat-avatar-asset-preview svg{display:block;width:92px;height:68px;max-width:100%;overflow:visible}
  .mat-avatar-controls .mat-avatar-actions{flex:0 0 auto;padding:12px 14px!important;border-top:1px solid #5c5c5c!important;background:#111!important}
  .mat-avatar-controls .mat-avatar-actions .profile-avatar-confirm-button{width:100%;min-height:54px!important;border:0!important;border-radius:16px!important;background:#12a34a!important;color:#fff!important;font-size:15px!important;font-weight:900!important}
  .mat-avatar-headphones{position:absolute;inset:0;width:100%;height:100%;z-index:4;pointer-events:none}
  @media(max-width:850px){
   .mat-avatar-workspace{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(210px,34vh) minmax(0,1fr);gap:10px}
   .mat-avatar-preview-panel{min-height:0;height:100%;border-radius:20px!important}
   .mat-avatar-preview-panel .profile-avatar-preview-stack{width:auto;height:100%;max-width:100%;aspect-ratio:1}
   .mat-avatar-controls{border-radius:20px!important}
   .mat-avatar-controls .mat-avatar-category-bar{flex-basis:58px!important;min-height:58px!important;border-radius:19px 19px 0 0!important;justify-content:flex-start!important}
   .mat-avatar-controls .mat-avatar-options-scroll{padding:11px 10px 14px!important}
   .mat-avatar-option-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px!important}
   .mat-avatar-option{min-height:78px!important}
   .mat-avatar-controls .mat-avatar-actions{padding:8px!important}
   .mat-avatar-controls .mat-avatar-actions .profile-avatar-confirm-button{min-height:48px!important}
  }
  @media(max-width:420px){
   .mat-avatar-workspace{grid-template-rows:minmax(180px,29vh) minmax(0,1fr)}
   .mat-avatar-option-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}
  }
 `;
 document.head.appendChild(style);
})();

;/* Character selector labels and thumbnail layout refinement. */
(function(){
 if(document.getElementById('mat-avatar-character-selector-refinement'))return;
 const style=document.createElement('style');style.id='mat-avatar-character-selector-refinement';
 style.textContent=`
  .mat-avatar-option:has(.mat-avatar-option-label){min-height:118px!important;flex-direction:column!important;gap:4px!important}
  .mat-avatar-option-label{display:block;color:#f4f4f5;font-size:11px;font-weight:800;line-height:1.2;text-align:center}
  .mat-avatar-option:has(.mat-avatar-option-label) .mat-avatar-option-preview-stack{width:78px;height:78px}
  @media(max-width:760px){.mat-avatar-option:has(.mat-avatar-option-label){min-height:104px!important}.mat-avatar-option-label{font-size:10px}}
 `;
 document.head.appendChild(style);
})();


/* Avatar builder: real category tabs and portrait character cards. */
(() => {
  if (document.getElementById('mat-avatar-real-tabs-portrait-v4')) return;
  const style = document.createElement('style');
  style.id = 'mat-avatar-real-tabs-portrait-v4';
  style.textContent = `
    .mat-avatar-controls .mat-avatar-category-bar{
      display:flex!important;flex:0 0 72px!important;align-items:center!important;justify-content:space-around!important;
      gap:4px!important;margin:0!important;padding:7px 10px!important;overflow-x:auto!important;overflow-y:hidden!important;
      border:0!important;border-bottom:1px solid #56565b!important;border-radius:26px 26px 0 0!important;background:#151515!important;
    }
    .mat-avatar-controls .mat-avatar-category{
      position:relative!important;display:flex!important;flex:0 0 48px!important;width:48px!important;height:48px!important;
      min-height:48px!important;align-items:center!important;justify-content:center!important;padding:0!important;
      border:1px solid transparent!important;border-radius:15px!important;background:transparent!important;color:#c8c8cc!important;
      transition:background .16s ease,border-color .16s ease,color .16s ease!important;
    }
    .mat-avatar-controls .mat-avatar-category svg{width:25px!important;height:25px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.8!important;stroke-linecap:round!important;stroke-linejoin:round!important}
    .mat-avatar-controls .mat-avatar-category.is-active{border-color:#73737a!important;background:#333338!important;color:#fff!important}
    .mat-avatar-controls .mat-avatar-category.is-active:after{content:"";position:absolute;left:25%;right:25%;bottom:-8px;height:3px;border-radius:3px;background:#10b981}
    .mat-avatar-options-scroll{display:block!important;flex:1 1 auto!important;min-height:0!important;padding:16px 18px 18px!important;overflow-y:auto!important;overflow-x:hidden!important}
    .mat-avatar-group-section{display:block!important;margin:0!important}
    .mat-avatar-option-section{margin:0 0 22px!important}
    .mat-avatar-option-section h3{margin:0 0 12px!important;color:#f4f4f5!important;font-size:15px!important;font-weight:850!important}
    .mat-avatar-option-grid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:10px!important}
    .mat-avatar-option{
      position:relative!important;display:flex!important;flex-direction:column!important;align-items:stretch!important;justify-content:flex-start!important;
      min-width:0!important;min-height:0!important;aspect-ratio: .82!important;padding:7px!important;gap:5px!important;
      border:1.5px solid #777!important;border-radius:16px!important;background:#3a3a3a!important;color:#fff!important;overflow:hidden!important;
    }
    .mat-avatar-option.is-selected{border:2px solid #10b95e!important;background:#3a3a3a!important;box-shadow:0 0 0 1px #10b95e!important}
    .mat-avatar-option-preview-stack{position:relative!important;display:block!important;flex:1 1 auto!important;width:100%!important;height:auto!important;min-height:0!important;aspect-ratio:1/1!important;overflow:hidden!important;border-radius:10px!important}
    .mat-avatar-option-preview-stack .med-avatar-base{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:contain!important;object-position:center bottom!important}
    .mat-avatar-option-label{display:block!important;flex:0 0 auto!important;width:100%!important;min-height:18px!important;overflow:hidden!important;color:#fff!important;font-size:11px!important;font-weight:850!important;line-height:1.2!important;text-align:center!important;text-overflow:ellipsis!important;white-space:nowrap!important}
    .mat-avatar-character-card{min-height:158px!important}
    .mat-avatar-character-card .mat-avatar-option-preview-stack{aspect-ratio: .9!important}
    .mat-avatar-controls .mat-avatar-actions{flex:0 0 auto!important;margin:0!important;padding:12px 14px!important;border-top:1px solid #56565b!important;background:#111!important}
    .mat-avatar-controls .mat-avatar-actions .profile-avatar-confirm-button{min-height:54px!important;border-radius:16px!important;background:#12a34a!important;font-weight:900!important}
    @media(max-width:850px){
      .mat-avatar-controls .mat-avatar-category-bar{flex-basis:60px!important;min-height:60px!important;padding:5px 6px!important;justify-content:flex-start!important}
      .mat-avatar-controls .mat-avatar-category{flex-basis:43px!important;width:43px!important;height:43px!important}
      .mat-avatar-options-scroll{padding:12px 10px!important}
      .mat-avatar-option-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important}
      .mat-avatar-option{padding:5px!important;border-radius:12px!important}
      .mat-avatar-character-card{min-height:132px!important}
      .mat-avatar-option-label{font-size:10px!important}
      .mat-avatar-controls .mat-avatar-actions{padding:8px!important}
      .mat-avatar-controls .mat-avatar-actions .profile-avatar-confirm-button{min-height:48px!important}
    }
    @media(max-width:390px){.mat-avatar-option-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
  `;
  document.head.appendChild(style);
})();
