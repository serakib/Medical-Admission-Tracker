(() => {
  'use strict';
  const ERROR_KEY = 'mat_client_error_log_v1';
  const MAX_ERRORS = 30;
  const SAFE_PREFIXES = {
    history: 'med_history_',
    seenQuestionIds: 'med_seen_questions_',
    answeredQuestionIds: 'med_answered_questions_',
    practicedQuestionIds: 'med_practiced_questions_'
  };
  const offlineHistoryKey = 'med_offline_practice_history_v1';
  const $ = id => document.getElementById(id);
  const safeJson = value => { try { return JSON.parse(value); } catch (_) { return null; } };

  function readErrors() {
    try { const rows = safeJson(localStorage.getItem(ERROR_KEY) || '[]'); return Array.isArray(rows) ? rows.slice(-MAX_ERRORS) : []; } catch (_) { return []; }
  }
  function recordError(type, rawMessage, rawStack) {
    try {
      const redact = value => String(value || '').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
        .replace(/(token|password|authorization)[=: ]+[^\s&]+/gi, '$1=[redacted]').slice(0, 500);
      const rows = readErrors();
      rows.push({ at: new Date().toISOString(), type, message: redact(rawMessage), stack: redact(rawStack).split('\n').slice(0, 3).join('\n') });
      localStorage.setItem(ERROR_KEY, JSON.stringify(rows.slice(-MAX_ERRORS)));
    } catch (_) {}
  }
  window.addEventListener('error', event => recordError('error', event.message, event.error?.stack || event.filename));
  window.addEventListener('unhandledrejection', event => recordError('unhandledrejection', event.reason?.message || event.reason, event.reason?.stack));

  async function fingerprint(identity) {
    if (!globalThis.crypto?.subtle) throw new Error('এই browser-এ secure backup verification support নেই।');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(identity)));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function mergeByKey(existing, incoming, key) {
    const all = [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])];
    const map = new Map();
    all.forEach((item, index) => map.set(String(item?.[key] ?? JSON.stringify(item) ?? index), item));
    return [...map.values()].slice(-10000);
  }

  function getCurrentKeys() {
    const app = window.app;
    if (!app || typeof app.getLocalIdentityKey !== 'function') throw new Error('অ্যাপ প্রস্তুত হলে আবার চেষ্টা করুন।');
    const identity = app.getLocalIdentityKey();
    const suffix = '_' + identity;
    const keys = {};
    Object.entries(SAFE_PREFIXES).forEach(([name, prefix]) => { keys[name] = prefix + identity; });
    return { identity, keys };
  }

  async function exportBackup() {
    const { identity, keys } = getCurrentKeys();
    const data = {};
    Object.entries(keys).forEach(([name, key]) => {
      const raw = localStorage.getItem(key);
      if (raw !== null) data[name] = safeJson(raw);
    });
    const offline = localStorage.getItem(offlineHistoryKey);
    if (offline !== null) data.offlinePracticeHistory = safeJson(offline);
    const payload = {
      format: 'medical-admission-pro-progress-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      identityFingerprint: await fingerprint(identity),
      data
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'medical-admission-pro-progress-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importBackup(file) {
    if (!file || file.size > 5 * 1024 * 1024) throw new Error('Backup file ৫ MB-এর কম হতে হবে।');
    const payload = safeJson(await file.text());
    if (!payload || payload.format !== 'medical-admission-pro-progress-backup' || payload.version !== 1 || !payload.data) {
      throw new Error('Backup file format সঠিক নয়।');
    }
    const { identity, keys } = getCurrentKeys();
    if (payload.identityFingerprint !== await fingerprint(identity)) {
      throw new Error('এই backup অন্য account/device identity-এর। একই account-এ login করে restore করুন।');
    }
    const data = payload.data;
    const validators = {
      history: Array.isArray,
      seenQuestionIds: Array.isArray,
      answeredQuestionIds: Array.isArray,
      practicedQuestionIds: Array.isArray,
      offlinePracticeHistory: Array.isArray
    };
    Object.entries(validators).forEach(([name, validator]) => {
      if (data[name] !== undefined && !validator(data[name])) throw new Error('Backup-এর ' + name + ' data সঠিক নয়।');
    });
    const changes = [];
    Object.entries(keys).forEach(([name, key]) => {
      if (!Array.isArray(data[name])) return;
      const incoming = name === 'history'
        ? data[name].filter(item => item && typeof item === 'object' && !Array.isArray(item))
        : data[name].filter(item => typeof item === 'string').map(item => item.slice(0, 200));
      const current = safeJson(localStorage.getItem(key) || '[]');
      const merged = name === 'history'
        ? mergeByKey(current, incoming, 'attemptId')
        : [...new Set([...(Array.isArray(current) ? current.filter(item => typeof item === 'string') : []), ...incoming])].slice(-20000);
      changes.push([key, JSON.stringify(merged)]);
    });
    if (Array.isArray(data.offlinePracticeHistory)) {
      const current = safeJson(localStorage.getItem(offlineHistoryKey) || '[]');
      changes.push([offlineHistoryKey, JSON.stringify(mergeByKey(current, data.offlinePracticeHistory, 'date').slice(0, 100))]);
    }
    const before = changes.map(([key]) => [key, localStorage.getItem(key)]);
    try { changes.forEach(([key, value]) => localStorage.setItem(key, value)); }
    catch (error) {
      before.forEach(([key, value]) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (_) {} });
      throw new Error('ডিভাইসে জায়গা না থাকায় backup restore হয়নি।');
    }
    window.app?.loadProgressStats?.();
    return changes.length;
  }

  function makeCard(id, title, description) {
    const section = document.createElement('section');
    section.id = id;
    section.className = 'profile-panel mat-system-card';
    const heading = document.createElement('div');
    heading.className = 'profile-panel-head';
    const copy = document.createElement('div');
    const h = document.createElement('h3'); h.textContent = title;
    const p = document.createElement('p'); p.className = 'text-sm text-gray-500 dark:text-gray-400 mt-1'; p.textContent = description;
    copy.append(h, p); heading.append(copy); section.append(heading);
    return section;
  }

  function statusRow(label, status, detail) {
    const row = document.createElement('div');
    row.className = 'mat-health-row';
    const name = document.createElement('strong'); name.textContent = label;
    const info = document.createElement('span'); info.className = 'mat-health-detail'; info.textContent = detail || '';
    const badge = document.createElement('span'); badge.className = 'mat-health-badge ' + status;
    badge.textContent = status === 'ok' ? 'Healthy' : status === 'warn' ? 'Limited' : status === 'fail' ? 'Issue' : 'Checking';
    row.append(name, info, badge);
    return row;
  }

  function initUI() {
    const target = $('account-settings-content');
    if (!target || $('mat-system-health-card')) return;
    const style = document.createElement('style');
    style.textContent = '.mat-system-card{margin-top:18px}.mat-health-row{display:grid;grid-template-columns:minmax(110px,.7fr) minmax(0,2fr) auto;gap:10px;align-items:center;padding:12px 0;border-bottom:1px solid var(--border-color,#e5e7eb)}.mat-health-detail{font-size:13px;color:#64748b;overflow-wrap:anywhere}.mat-health-badge{font-size:11px;font-weight:800;border-radius:99px;padding:4px 9px;background:#64748b18;color:#64748b}.mat-health-badge.ok{background:#05966918;color:#059669}.mat-health-badge.warn{background:#d9770618;color:#b45309}.mat-health-badge.fail{background:#dc262618;color:#dc2626}.mat-tool-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.mat-tool-actions button,.mat-tool-actions label{border:1px solid #05966955;border-radius:12px;padding:10px 14px;font:inherit;font-size:13px;font-weight:800;cursor:pointer;color:#047857;background:#05966912}.mat-tool-note{font-size:12px;color:#64748b;margin-top:10px;line-height:1.6}@media(max-width:560px){.mat-health-row{grid-template-columns:1fr auto}.mat-health-detail{grid-column:1/-1;grid-row:2}}';
    document.head.append(style);

    const health = makeCard('mat-system-health-card', 'Live System Health', 'Firebase, question bank, network ও backend-এর বর্তমান অবস্থা পরীক্ষা করুন।');
    const rows = document.createElement('div'); rows.id = 'mat-health-results';
    rows.append(statusRow('Question Bank', 'warn', 'পরীক্ষা চালানো হয়নি'), statusRow('Firebase Auth', 'warn', 'পরীক্ষা চালানো হয়নি'), statusRow('Firestore', 'warn', 'পরীক্ষা চালানো হয়নি'), statusRow('Apps Script API', 'warn', 'পরীক্ষা চালানো হয়নি'), statusRow('Network', navigator.onLine ? 'ok' : 'warn', navigator.onLine ? 'Online' : 'Offline'));
    const healthActions = document.createElement('div'); healthActions.className = 'mat-tool-actions';
    const check = document.createElement('button'); check.type = 'button'; check.textContent = 'Run Health Check'; check.id = 'mat-run-health-check';
    healthActions.append(check); health.append(rows, healthActions);
    const healthNote = document.createElement('p'); healthNote.className = 'mat-tool-note'; healthNote.textContent = 'Firestore read test কেবল signed-in account-এর নিজের student profile document-এ করা হয়। কোনো data write বা পরিবর্তন করা হয় না.';
    health.append(healthNote);

    const backup = makeCard('mat-data-backup-card', 'Data Backup & Export', 'এই device-এর study history ও practiced question IDs export বা restore করুন।');
    const backupActions = document.createElement('div'); backupActions.className = 'mat-tool-actions';
    const exportButton = document.createElement('button'); exportButton.type = 'button'; exportButton.textContent = 'Download Backup';
    const importLabel = document.createElement('label'); importLabel.textContent = 'Restore Backup';
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json,.json'; input.hidden = true;
    importLabel.append(input); backupActions.append(exportButton, importLabel); backup.append(backupActions);
    const backupNote = document.createElement('p'); backupNote.className = 'mat-tool-note'; backupNote.textContent = 'Backup-এ login token, password, Firebase credentials, profile data বা server-side XP/RP থাকে না। Restore একই account identity-তে merge করে; server progress বদলায় না.';
    backup.append(backupNote);

    const diagnostics = makeCard('mat-error-diagnostics-card', 'Auto Error Detection', 'এই browser-এ ধরা পড়া সাম্প্রতিক JavaScript error local device-এ রাখা হয়।');
    const errorCount = document.createElement('p'); errorCount.id = 'mat-client-error-count'; errorCount.className = 'mat-tool-note';
    const errorActions = document.createElement('div'); errorActions.className = 'mat-tool-actions';
    const downloadErrors = document.createElement('button'); downloadErrors.type = 'button'; downloadErrors.textContent = 'Download Error Log';
    const clearErrors = document.createElement('button'); clearErrors.type = 'button'; clearErrors.textContent = 'Clear Local Error Log';
    errorActions.append(downloadErrors, clearErrors); diagnostics.append(errorCount, errorActions);

    const pwa = makeCard('mat-pwa-card', 'Install & Offline Practice', 'অ্যাপের মতো install করুন এবং আগে cache করা প্রশ্ন দিয়ে offline অনুশীলন করুন।');
    const pwaActions = document.createElement('div'); pwaActions.className = 'mat-tool-actions';
    const install = document.createElement('button'); install.type = 'button'; install.id = 'mat-pwa-install-btn'; install.textContent = 'Install App'; install.hidden = true;
    const offlineLink = document.createElement('a'); offlineLink.href = './offline.html'; offlineLink.textContent = 'Open Offline Practice'; offlineLink.className = 'mat-tool-actions';
    offlineLink.style.textDecoration = 'none';
    pwaActions.append(install, offlineLink); pwa.append(pwaActions);
    const pwaNote = document.createElement('p'); pwaNote.className = 'mat-tool-note'; pwaNote.textContent = 'Offline mode-এ cached question bank ও local practice কাজ করবে; login, leaderboard, Firebase sync এবং server rewards-এর জন্য internet লাগবে.';
    pwa.append(pwaNote);

    target.append(health, backup, diagnostics, pwa);
    const refreshErrors = () => { errorCount.textContent = readErrors().length + 'টি recent client error সংরক্ষিত আছে (সর্বোচ্চ ' + MAX_ERRORS + 'টি)।'; };
    refreshErrors();
    window.addEventListener('error', refreshErrors);
    window.addEventListener('unhandledrejection', refreshErrors);

    check.addEventListener('click', () => runHealthCheck(rows, check));
    exportButton.addEventListener('click', async () => {
      try { await exportBackup(); alert('Study progress backup download হয়েছে।'); }
      catch (error) { alert(error.message || 'Backup তৈরি করা যায়নি।'); }
    });
    input.addEventListener('change', async () => {
      try {
        if (!input.files?.[0]) return;
        if (!confirm('Backup-এর study history বর্তমান device-এর সঙ্গে merge করবেন?')) return;
        const count = await importBackup(input.files[0]);
        alert(count + 'টি progress section restore/merge হয়েছে।');
      } catch (error) { alert(error.message || 'Backup restore করা যায়নি।'); }
      finally { input.value = ''; }
    });
    downloadErrors.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), errors: readErrors() }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = 'medical-admission-client-errors.json'; a.click(); URL.revokeObjectURL(url);
    });
    clearErrors.addEventListener('click', () => { localStorage.removeItem(ERROR_KEY); refreshErrors(); });
    const syncInstall = () => { install.hidden = !window.MATCanInstallPWA?.(); };
    install.addEventListener('click', async () => {
      try { await window.MATInstallPWA?.(); syncInstall(); } catch (error) { console.warn('PWA install prompt failed:', error); }
    });
    window.addEventListener('mat:pwa-install-available', syncInstall);
    window.addEventListener('mat:pwa-installed', syncInstall);
    syncInstall();
  }

  async function runHealthCheck(container, button) {
    const app = window.app;
    const records = [];
    const add = (name, status, detail) => records.push(statusRow(name, status, detail));
    button.disabled = true; button.textContent = 'Checking…';
    try {
      const loaded = Boolean(app?.questionsLoaded && Array.isArray(app.questionBank) && app.questionBank.length);
      add('Question Bank', loaded ? 'ok' : 'fail', loaded ? app.questionBank.length + 'টি প্রশ্ন loaded' : 'প্রশ্নব্যাংক load হয়নি');
      const auth = app?.auth;
      const firestore = app?.firestore;
      const user = auth?.currentUser || app?.authUser;
      if (user?.uid && typeof user.getIdToken === 'function') {
        try {
          await user.getIdToken(true);
          add('Firebase Auth', 'ok', 'Firebase ID token refresh সফল');
        } catch (error) {
          add('Firebase Auth', 'fail', String(error?.code || error?.message || 'Token refresh failed').slice(0, 120));
        }
      } else {
        add('Firebase Auth', app?.authStateResolved && auth ? 'warn' : 'fail',
          app?.authStateResolved ? 'Auth SDK ready · live token test-এর জন্য login প্রয়োজন' : 'Auth state এখনো resolve হয়নি');
      }
      if (user?.uid && firestore) {
        try {
          const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
          await getDoc(doc(firestore, 'students', user.uid));
          add('Firestore', 'ok', 'নিজের student profile read সফল');
        } catch (error) { add('Firestore', 'fail', String(error?.code || error?.message || 'Read failed').slice(0, 120)); }
      } else add('Firestore', 'warn', 'নিজের profile read যাচাই করতে login প্রয়োজন');
      if (navigator.onLine && window.MED_LEADERBOARD_API_URL) {
        try {
          const url = new URL(window.MED_LEADERBOARD_API_URL); url.searchParams.set('action', 'health');
          const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
          const data = await response.json();
          add('Apps Script API', response.ok && data.success && data.status === 'ok' ? 'ok' : 'fail',
            'API ' + String(data.apiVersion || 'unknown'));
        } catch (error) { add('Apps Script API', 'fail', String(error?.message || 'Request failed').slice(0, 120)); }
      } else add('Apps Script API', 'warn', navigator.onLine ? 'API URL পাওয়া যায়নি' : 'Offline · check skipped');
      add('Network', navigator.onLine ? 'ok' : 'warn', navigator.onLine ? 'Online' : 'Offline');
    } finally {
      container.replaceChildren(...records);
      button.disabled = false; button.textContent = 'Run Health Check';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUI, { once: true });
  else initUI();
})();
