/* Medical Admission Tracker — Firebase + dedicated Google Sheets API adapter.
 * Medical profiles, exam rewards, ranks and leaderboard use this site's own backend.
 */
(function () {
  'use strict';
  var app = window.app;
  if (!app || app.__medicalSheetsAdapter) return;
  app.__medicalSheetsAdapter = true;

  var RANKS = [
    'Bronze V','Bronze IV','Bronze III','Bronze II','Bronze I',
    'Silver V','Silver IV','Silver III','Silver II','Silver I',
    'Gold V','Gold IV','Gold III','Gold II','Gold I',
    'Platinum V','Platinum IV','Platinum III','Platinum II','Platinum I',
    'Diamond V','Diamond IV','Diamond III','Diamond II','Diamond I',
    'Master V','Master IV','Master III','Master II','Master I',
    'Grandmaster V','Grandmaster IV','Grandmaster III','Grandmaster II','Grandmaster I',
    'Immortal'
  ];
  var PERIOD_KEY = 'med_sheet_leaderboard_period_v1';
  var GUEST_TOKEN_KEY = 'med_sheet_guest_token_v1';
  var GUEST_ID_KEY = 'med_sheet_guest_id_v1';
  var CACHE_KEY = 'med_sheet_leaderboard_cache_v1';
  var QUEUE_KEY = 'med_sheet_exam_pending_v1';
  var REWARD_KEY = 'med_sheet_exam_rewards_v1';
  var SELECTED_RANK_KEY = 'med_sheet_selected_rank_v1_';
  var API_URL = function () { return String(window.MED_LEADERBOARD_API_URL || '').trim(); };
  var selectedPeriod = readPeriod();
  var selectedRank = readSelectedRank();
  var rawRows = [];
  var currentProfile = null;
  var identityPromise = null;
  var loadSequence = 0;

  function readPeriod() {
    try { return localStorage.getItem(PERIOD_KEY) === 'weekly' ? 'weekly' : 'all-time'; }
    catch (_) { return 'all-time'; }
  }
  function accountKey() {
    return (app.authUser && app.authUser.uid) || localStorage.getItem(GUEST_ID_KEY) || 'guest';
  }
  function readSelectedRank() {
    try {
      var value = localStorage.getItem(SELECTED_RANK_KEY + accountKey()) || '';
      return RANKS.indexOf(value) >= 0 ? value : '';
    } catch (_) { return ''; }
  }
  function safeText(value, max) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max || 120);
  }
  function escapeHtml(value) {
    var input = String(value == null ? '' : value);
    if (typeof app.escapeHtml === 'function') return app.escapeHtml(input);
    return input.replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[ch];
    });
  }
  function parseJson(value, fallback) {
    try { var parsed = JSON.parse(value); return parsed == null ? fallback : parsed; }
    catch (_) { return fallback; }
  }
  function profileName() {
    var profile = app.profile || {};
    return safeText(profile.name || profile.displayName ||
      (app.authUser && app.authUser.displayName) ||
      (app.authUser && app.authUser.email ? app.authUser.email.split('@')[0] : '') ||
      (currentProfile && currentProfile.name) || 'Guest Student', 80);
  }
  function profileCollege() { return safeText((app.profile && app.profile.college) || (currentProfile && currentProfile.college) || '', 120); }
  function profileBatch() {
    var profile = app.profile || {};
    return safeText(profile.batch || profile.class || (currentProfile && currentProfile.batch) || '', 40);
  }
  function apiErrorMessage(error) {
    var msg = String(error && error.message || error || 'Unknown error');
    if (/failed to fetch|networkerror|load failed|cors|redirect/i.test(msg)) {
      return 'Google Apps Script response browser-এ পড়া যায়নি। CORS/redirect সমস্যা হলে আলাদা Cloudflare Worker proxy deploy করে MED_LEADERBOARD_API_URL-এ তার URL দিতে হবে।';
    }
    return msg;
  }
  async function request(payload, options) {
    var endpoint = API_URL();
    if (!endpoint) throw new Error('Medical Sheets API URL is not configured.');
    payload = payload || {};
    options = options || {};
    var method = String(options.method || 'POST').toUpperCase();
    var url = endpoint;
    var init = {
      method: method,
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      headers: { 'Accept': 'application/json,text/plain,*/*' }
    };
    if (method === 'GET') {
      var params = new URLSearchParams();
      params.set('action', String(payload.action || 'health'));
      if (payload.period) params.set('period', String(payload.period));
      url += (url.indexOf('?') >= 0 ? '&' : '?') + params.toString();
    } else {
      // text/plain keeps this a simple browser request and avoids an OPTIONS preflight.
      init.headers['Content-Type'] = 'text/plain;charset=utf-8';
      init.body = JSON.stringify(payload);
    }
    var response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      throw new Error(apiErrorMessage(error));
    }
    var body = '';
    try { body = await response.text(); }
    catch (_) { throw new Error('Medical API response body could not be read.'); }
    var data;
    try { data = JSON.parse(body); }
    catch (_) {
      throw new Error('Medical API did not return JSON (HTTP ' + response.status + '). Check the Apps Script deployment and redirect response.');
    }
    if (!response.ok) throw new Error(data.error || data.message || ('Medical API HTTP ' + response.status));
    if (data && data.success === false) throw new Error(data.error || data.message || 'Medical API request failed.');
    return data || {};
  }
  function getGuestToken() {
    try { return String(localStorage.getItem(GUEST_TOKEN_KEY) || '').trim(); }
    catch (_) { return ''; }
  }
  function getRewardCache() { return parseJson(localStorage.getItem(REWARD_KEY), {}) || {}; }
  function saveReward(reward) {
    if (!reward || !reward.attemptId) return reward;
    var cache = getRewardCache();
    cache[String(reward.attemptId)] = reward;
    var keys = Object.keys(cache);
    if (keys.length > 150) keys.slice(0, keys.length - 150).forEach(function (k) { delete cache[k]; });
    try { localStorage.setItem(REWARD_KEY, JSON.stringify(cache)); } catch (_) {}
    if (typeof window.updateExamRewardDisplay === 'function') window.updateExamRewardDisplay(reward);
    return reward;
  }
  function getSavedReward(attemptId) { return getRewardCache()[String(attemptId || '')] || null; }
  function getCache() {
    var rows = parseJson(localStorage.getItem(CACHE_KEY), []);
    return Array.isArray(rows) ? rows.filter(function (row) { return row && !row.isDemo; }) : [];
  }
  function saveCache(rows) {
    var list = Array.isArray(rows) ? rows.filter(function (row) { return row && !row.isDemo; }) : [];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch (_) {}
    return list;
  }
  function getQueue() {
    var value = parseJson(localStorage.getItem(QUEUE_KEY), []);
    return Array.isArray(value) ? value : [];
  }
  function saveQueue(queue) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify((Array.isArray(queue) ? queue : []).slice(-100))); } catch (_) {}
  }
  function currentUserId() {
    if (app.authUser && app.authUser.uid) return String(app.authUser.uid);
    return String((currentProfile && (currentProfile.userId || currentProfile.uid)) || localStorage.getItem(GUEST_ID_KEY) || '');
  }
  function rankClass(rank) {
    var value = String(rank || '').toLowerCase();
    if (value.indexOf('bronze') === 0) return 'bronze';
    if (value.indexOf('silver') === 0) return 'silver';
    if (value.indexOf('gold') === 0) return 'gold';
    if (value.indexOf('platinum') === 0) return 'platinum';
    if (value.indexOf('diamond') === 0) return 'diamond';
    if (value.indexOf('immortal') === 0) return 'immortal';
    if (value.indexOf('grandmaster') === 0) return 'grandmaster';
    if (value.indexOf('master') === 0) return 'master';
    return 'legend';
  }
  function rankIcon(index) {
    if (index === RANKS.length - 1) return 'fa-crown';
    if (index >= 30) return 'fa-crown';
    if (index >= 20) return 'fa-gem';
    if (index >= 15) return 'fa-star';
    if (index >= 10) return 'fa-trophy';
    if (index >= 5) return 'fa-shield-halved';
    return 'fa-medal';
  }
  function rankTrophy(rank) {
    var value = String(rank || '').toLowerCase();
    if (value.indexOf('immortal') === 0) return '🏆';
    if (value.indexOf('grandmaster') === 0 || value.indexOf('master') === 0) return '👑';
    if (value.indexOf('diamond') === 0) return '💎';
    if (value.indexOf('platinum') === 0) return '🛡️';
    if (value.indexOf('gold') === 0) return '🥇';
    if (value.indexOf('silver') === 0) return '🥈';
    return '🥉';
  }
  function applyProfile(user) {
    if (!user) return null;
    currentProfile = user;
    var profile = Object.assign({}, app.profile || {});
    profile.uid = user.uid || user.userId || user.playerId || profile.uid || '';
    profile.userId = user.userId || user.uid || '';
    profile.name = safeText(user.name || user.username || profile.name || 'Guest Student', 80);
    profile.displayName = profile.name;
    profile.email = user.email || profile.email || (app.authUser && app.authUser.email) || '';
    profile.college = safeText(user.college != null ? user.college : profile.college, 120);
    profile.batch = safeText(user.batch != null ? user.batch : (profile.batch || profile.class || ''), 40);
    profile.avatar = safeText(user.avatar != null ? user.avatar : profile.avatar, 500);
    profile.accountType = user.accountType || (app.authUser ? 'REGISTERED' : 'GUEST');
    profile.xp = Math.max(0, Number(user.xp) || 0);
    profile.rankPoints = Math.max(0, Number(user.rankPoints != null ? user.rankPoints : user.rp) || 0);
    profile.totalRP = Math.max(0, Number(user.totalRP != null ? user.totalRP : profile.rankPoints) || 0);
    profile.level = Math.max(1, Number(user.level) || 1);
    profile.rank = RANKS.indexOf(user.rank) >= 0 ? user.rank : RANKS[0];
    app.profile = profile;
    var storageKey = 'med_sheet_profile_v1_' + accountKey();
    try { localStorage.setItem(storageKey, JSON.stringify(profile)); } catch (_) {}
    // Keep local profile widgets aligned with the server-authoritative Medical XP/RP.
    // Clear the retired client-side pending-PB queue so it cannot add rewards twice.
    try {
      var progressKey = 'med_account_progress_v1_' + ((app.authUser && app.authUser.uid) || 'guest');
      var localProgress = parseJson(localStorage.getItem(progressKey), {}) || {};
      localProgress.xp = profile.xp;
      localProgress.performanceBonus = profile.xp;
      localProgress.rankPoints = profile.rankPoints;
      localProgress.pendingPBEntries = [];
      localProgress.pendingPB = 0;
      localProgress.rewarded = Array.isArray(localProgress.rewarded) ? localProgress.rewarded : [];
      localStorage.setItem(progressKey, JSON.stringify(localProgress));
    } catch (_) {}
    setText('profile-name', profile.name);
    setText('account-profile-name', profile.name);
    setText('profile-email', app.authUser ? (profile.email || 'Signed in') : 'Guest mode · আপনার profile server-এ সংরক্ষিত');
    setText('account-profile-email', app.authUser ? (profile.email || 'Registered account') : 'Guest account · Device session');
    setText('account-profile-status', app.authUser ? 'Registered account' : 'Guest account');
    var form = document.getElementById('medical-profile-form');
    if (form) {
      setInput('medical-profile-name', profile.name);
      setInput('medical-profile-college', profile.college);
      setInput('medical-profile-batch', profile.batch);
      setInput('medical-profile-avatar', profile.avatar);
    }
    renderAccountRank(profile);
    try {
      window.dispatchEvent(new CustomEvent('student-progress-updated', { detail: Object.assign({}, profile, { source: 'medical-sheets-api' }) }));
    } catch (_) {}
    return profile;
  }
  function setText(id, value) {
    var el = document.getElementById(id);
    if (el && value != null) el.textContent = String(value);
  }
  function setInput(id, value) {
    var el = document.getElementById(id);
    if (el && document.activeElement !== el) el.value = String(value == null ? '' : value);
  }
  function renderAccountRank(profile) {
    if (!profile) return;
    setText('profile-live-rank', profile.rank || RANKS[0]);
    setText('profile-best-rank', profile.rank || RANKS[0]);
  }
  function setStatus(message, isError) {
    var el = document.getElementById('leaderboard-status');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'mb-4 rounded-xl p-3 text-sm ' + (isError
      ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300');
    el.classList.remove('hidden');
  }

  async function ensureGuest() {
    var savedToken = getGuestToken();
    var response = await request({ action: 'createGuest', guestToken: savedToken });
    if (!response.guestToken) throw new Error('Guest API returned no guest token.');
    try {
      localStorage.setItem(GUEST_TOKEN_KEY, response.guestToken);
      if (response.user && response.user.userId) localStorage.setItem(GUEST_ID_KEY, String(response.user.userId));
    } catch (_) {}
    return applyProfile(response.user || {});
  }
  async function registerUser(fields) {
    if (!app.authUser || typeof app.authUser.getIdToken !== 'function') return ensureGuest();
    fields = fields || {};
    var idToken = await app.authUser.getIdToken();
    var existing = app.profile || {};
    var response = await request({
      action: 'registerUser',
      idToken: idToken,
      name: safeText(fields.name || existing.name || app.authUser.displayName || '', 80),
      college: safeText(fields.college || existing.college || '', 120),
      batch: safeText(fields.batch || existing.batch || existing.class || '', 40),
      avatar: safeText(fields.avatar || existing.avatar || '', 500)
    });
    if (!response.user) throw new Error('Medical API did not return the registered profile.');
    return applyProfile(response.user);
  }
  async function syncIdentity() {
    if (app.__medicalRegistrationInProgress) return null;
    if (identityPromise) return identityPromise;
    identityPromise = (async function () {
      if (app.authUser) return registerUser({});
      return ensureGuest();
    })();
    try { return await identityPromise; }
    finally { identityPromise = null; }
  }
  async function credentialsForCurrentUser() {
    if (app.authUser && typeof app.authUser.getIdToken === 'function') {
      return { idToken: await app.authUser.getIdToken() };
    }
    var token = getGuestToken();
    if (!token) {
      await ensureGuest();
      token = getGuestToken();
    }
    if (!token) throw new Error('Guest session is unavailable. Please reload the page.');
    return { guestToken: token };
  }
  async function updateProfile(fields) {
    fields = fields || {};
    var allowed = {};
    ['name','college','batch','avatar'].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) allowed[key] = safeText(fields[key], key === 'avatar' ? 500 : (key === 'college' ? 120 : (key === 'batch' ? 40 : 80)));
    });
    if (Object.prototype.hasOwnProperty.call(allowed, 'name') && allowed.name.length < 2) {
      throw new Error('নাম কমপক্ষে ২ অক্ষরের হতে হবে।');
    }
    var creds = await credentialsForCurrentUser();
    var response = await request(Object.assign({ action: 'updateProfile' }, creds, allowed));
    if (!response.user) throw new Error('Updated profile was not returned by the API.');
    return applyProfile(response.user);
  }

  function normalizeEntry(raw) {
    raw = raw || {};
    var id = safeText(raw.userId || raw.uid || raw.playerId || raw.UserID || raw.id || raw.name || 'unknown-user', 140);
    var rank = RANKS.indexOf(raw.rank || raw.Rank) >= 0 ? (raw.rank || raw.Rank) : RANKS[0];
    var currentRP = Math.max(0, Number(raw.rankPoints != null ? raw.rankPoints : (raw.rp != null ? raw.rp : raw.RP)) || 0);
    var totalRP = Math.max(currentRP, Number(raw.totalRP != null ? raw.totalRP : raw.TotalRP != null ? raw.TotalRP : currentRP) || 0);
    var weeklyRP = Math.max(0, Number(raw.weeklyRP != null ? raw.weeklyRP : raw.weeklyRankPoints != null ? raw.weeklyRankPoints : 0) || 0);
    var boardPoints = selectedPeriod === 'weekly' ? weeklyRP : totalRP;
    return {
      uid: id, userId: id, playerId: id,
      name: safeText(raw.name || raw.username || raw.Name || 'Medical Student', 80),
      college: safeText(raw.college || raw.College || '', 120),
      batch: safeText(raw.batch || raw.Batch || '', 40),
      avatar: safeText(raw.avatar || raw.Avatar || '', 500),
      accountType: safeText(raw.accountType || raw.AccountType || '', 20),
      xp: Math.max(0, Number(raw.xp != null ? raw.xp : raw.XP) || 0),
      level: Math.max(1, Number(raw.level != null ? raw.level : raw.Level) || 1),
      rank: rank, rankPoints: currentRP, totalRP: totalRP,
      weeklyRankPoints: weeklyRP, boardPoints: boardPoints,
      quizzes: Math.max(0, Number(raw.matches != null ? raw.matches : raw.quizzes || 0)),
      accuracy: Math.max(0, Number(raw.accuracy) || 0),
      isMine: (app.authUser && id === String(app.authUser.uid)) || (!app.authUser && id === String(localStorage.getItem(GUEST_ID_KEY) || '')),
      raw: raw
    };
  }
  function sortRows(rows) {
    return (Array.isArray(rows) ? rows : []).slice().sort(function (a, b) {
      var pa = selectedPeriod === 'weekly' ? Number(a.weeklyRP != null ? a.weeklyRP : a.weeklyRankPoints || 0) : Number(a.totalRP != null ? a.totalRP : a.rankPoints || a.rp || 0);
      var pb = selectedPeriod === 'weekly' ? Number(b.weeklyRP != null ? b.weeklyRP : b.weeklyRankPoints || 0) : Number(b.totalRP != null ? b.totalRP : b.rankPoints || b.rp || 0);
      return pb - pa || Number(b.xp || 0) - Number(a.xp || 0) ||
        String(a.name || a.username || '').localeCompare(String(b.name || b.username || ''));
    });
  }
  function normalizeRows(rows) {
    var seen = {};
    return sortRows((Array.isArray(rows) ? rows : []).map(normalizeEntry)).filter(function (row) {
      var key = String(row.userId || row.name).toLowerCase();
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }
  function getMe(rows) {
    var id = currentUserId();
    return (Array.isArray(rows) ? rows : []).find(function (row) { return String(row.userId || row.uid || '') === String(id); }) || null;
  }
  function injectStyles() {
    if (document.getElementById('med-sheet-style')) return;
    var style = document.createElement('style');
    style.id = 'med-sheet-style';
    style.textContent =
      '.mat-rank-banner{margin:0 0 20px;padding:20px 14px 18px;border-radius:22px;background:radial-gradient(circle at 50% 0,rgba(129,140,248,.3),transparent 45%),linear-gradient(145deg,#101a31,#172744 55%,#101827);border:1px solid rgba(148,163,184,.2);color:#f8fafc;overflow:hidden}' +
      '.mat-rank-head{text-align:center;display:flex;flex-direction:column;gap:4px;margin-bottom:12px}.mat-rank-head strong{font-size:11px;letter-spacing:.18em;color:#c4b5fd}.mat-rank-head small{font-size:12px;color:#cbd5e1}' +
      '.mat-rank-rail{display:flex;align-items:center;gap:8px;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;padding:9px 3px 12px;scroll-snap-type:x mandatory}.mat-rank-rail::-webkit-scrollbar{display:none}' +
      '.mat-rank-tier{flex:0 0 76px;min-width:76px;min-height:88px;border:1px solid rgba(148,163,184,.22);border-radius:15px;padding:8px 5px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;opacity:.67;transform:scale(.92);transition:transform .18s ease,opacity .18s ease,box-shadow .18s ease,border-color .18s ease;scroll-snap-align:center;color:#f8fafc;background:rgba(15,23,42,.72);cursor:pointer;font-size:11px;font-weight:850;text-align:center}.mat-rank-tier.is-active{flex-basis:118px;min-width:118px;min-height:108px;opacity:1;transform:scale(1);border-color:rgba(255,255,255,.6);box-shadow:0 0 0 2px rgba(255,255,255,.08),0 12px 26px rgba(0,0,0,.22)}.mat-rank-tier i{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;font-size:18px;background:rgba(255,255,255,.1)}.mat-rank-tier.is-active i{width:43px;height:43px;font-size:22px}.mat-rank-tier small{font-size:8px;letter-spacing:.07em;opacity:.8}.mat-rank-tier.bronze i{color:#f1b47b;background:linear-gradient(145deg,#6e442c,#bd804f)}.mat-rank-tier.silver i{color:#e2e8f0;background:linear-gradient(145deg,#475569,#94a3b8)}.mat-rank-tier.gold i{color:#fff1aa;background:linear-gradient(145deg,#8b5e0b,#eab308)}.mat-rank-tier.platinum i{color:#ddd6fe;background:linear-gradient(145deg,#6d28d9,#a78bfa)}.mat-rank-tier.diamond i{color:#cffafe;background:linear-gradient(145deg,#0e7490,#67e8f9)}.mat-rank-tier.master i,.mat-rank-tier.grandmaster i,.mat-rank-tier.legend i,.mat-rank-tier.immortal i{color:#fde68a;background:linear-gradient(145deg,#7f1d1d,#f59e0b)}' +
      '.mat-rank-progress{padding:8px 9px 0}.mat-rank-progress-line{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.mat-rank-progress-line>span:first-child{display:flex;flex-direction:column;gap:3px}.mat-rank-progress-line strong{font-size:13px}.mat-rank-progress-line small,.mat-rank-foot{font-size:11px;color:#cbd5e1}.mat-rank-rp{font-weight:950;color:#fde68a;white-space:nowrap}.mat-rank-track{position:relative;height:11px;border-radius:99px;background:rgba(148,163,184,.25);margin:14px 10px 8px}.mat-rank-track>span{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,#a78bfa,#fbbf24);transition:width .35s ease}.mat-rank-track>i{position:absolute;top:50%;transform:translate(-50%,-50%);display:grid;place-items:center;width:23px;height:23px;border-radius:50%;background:#fef3c7;color:#a16207;border:2px solid #fff7ed;box-shadow:0 2px 8px rgba(0,0,0,.3)}.mat-rank-foot{display:flex;justify-content:space-between;gap:8px}.mat-rank-locked{display:flex;gap:10px;align-items:center;border:1px solid rgba(148,163,184,.25);border-radius:14px;padding:12px;background:rgba(15,23,42,.46);font-size:12px;line-height:1.6}' +
      '#med-rank-controls{position:fixed;z-index:9998;top:13px;right:16px;display:flex;align-items:center;gap:7px;padding:5px;border-radius:15px;background:rgba(10,18,32,.95);border:1px solid rgba(148,163,184,.23);box-shadow:0 10px 28px rgba(0,0,0,.18);backdrop-filter:blur(14px);color:#f8fafc}body.exam-active #med-rank-controls{display:none}.mat-top-icon{position:relative;display:grid;place-items:center;width:39px;height:39px;border-radius:11px;border:1px solid rgba(148,163,184,.18);background:rgba(255,255,255,.05);color:#e2e8f0;font-size:16px;cursor:pointer}.mat-top-icon:first-child{color:#fb923c}.mat-top-rp{display:flex;align-items:center;gap:7px;height:39px;padding:0 11px;border-radius:11px;background:rgba(255,255,255,.05);border:1px solid rgba(148,163,184,.18);color:#f8fafc;font-weight:950;white-space:nowrap;cursor:pointer}.mat-top-rp i{color:#facc15}' +
      '.mat-overlay{position:fixed;inset:0;z-index:10020;display:flex;align-items:center;justify-content:center;padding:17px;background:rgba(2,6,23,.7);backdrop-filter:blur(8px)}.mat-overlay.hidden{display:none}.mat-dialog{position:relative;width:min(100%,520px);max-height:min(86vh,760px);overflow:auto;border:1px solid rgba(148,163,184,.24);border-radius:23px;padding:24px;background:var(--surface,#fff);color:var(--text,#0f172a);box-shadow:0 28px 80px rgba(0,0,0,.36)}.dark .mat-dialog{background:#101827;color:#f8fafc}.mat-dialog h2{font-size:21px;font-weight:950;margin:0 34px 8px 0}.mat-dialog-note{font-size:13px;color:var(--muted,#64748b);margin:0 0 15px;line-height:1.6}.mat-close{position:absolute;right:13px;top:11px;width:35px;height:35px;border-radius:11px;background:rgba(148,163,184,.14);font-size:24px}.mat-player-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:15px 0}.mat-player-stat{padding:11px;border-radius:13px;background:rgba(148,163,184,.12)}.mat-player-stat small{display:block;font-size:11px;color:var(--muted,#64748b)}.mat-player-stat strong{display:block;margin-top:4px;font-size:15px;overflow-wrap:anywhere}.leaderboard-period-tab.is-active{border-color:#0d9488!important;background:rgba(13,148,136,.1)!important;color:#0d9488!important}.leader-tier-trophy{font-size:13px;vertical-align:middle}' +
      '@media(max-width:650px){#med-rank-controls{top:9px;right:8px;gap:4px;padding:4px}.mat-top-icon{width:35px;height:35px}.mat-top-rp{height:35px;padding:0 8px;font-size:12px}main{padding-top:68px!important}.mat-dialog{padding:20px 15px}.mat-rank-rail{gap:6px}.mat-rank-tier{flex-basis:69px;min-width:69px;min-height:82px}.mat-rank-tier.is-active{flex-basis:105px;min-width:105px;min-height:100px}}';
    document.head.appendChild(style);
  }
  function ensureTopControls() {
    if (document.getElementById('med-rank-controls')) return;
    var root = document.createElement('div');
    root.id = 'med-rank-controls';
    root.innerHTML =
      '<button type="button" class="mat-top-icon" data-med-action="streak" title="Daily study streak" aria-label="Daily study streak"><i class="fa-solid fa-fire"></i></button>' +
      '<button type="button" class="mat-top-icon" data-med-action="rules" title="Rank rules" aria-label="Rank rules"><i class="fa-solid fa-circle-info"></i></button>' +
      '<button type="button" class="mat-top-rp" data-med-action="rank-points" title="Medical Rank Points" aria-label="Medical Rank Points"><i class="fa-solid fa-star"></i><span id="med-top-rp">0 RP</span></button>';
    document.body.appendChild(root);
  }
  function ensureOverlays() {
    if (!document.getElementById('med-player-modal')) {
      var modal = document.createElement('div');
      modal.id = 'med-player-modal';
      modal.className = 'mat-overlay hidden';
      modal.innerHTML = '<div class="mat-dialog" role="dialog" aria-modal="true" aria-labelledby="med-player-title"><button class="mat-close" type="button" data-med-close aria-label="Close">×</button><div id="med-player-content"></div></div>';
      document.body.appendChild(modal);
    }
    if (!document.getElementById('med-rules-modal')) {
      var rules = document.createElement('div');
      rules.id = 'med-rules-modal';
      rules.className = 'mat-overlay hidden';
      rules.innerHTML = '<div class="mat-dialog" role="dialog" aria-modal="true" aria-labelledby="med-rules-title">' +
        '<button class="mat-close" type="button" data-med-close aria-label="Close">×</button>' +
        '<h2 id="med-rules-title">Medical Rank & Leaderboard Rules</h2><p class="mat-dialog-note">শিক্ষামূলক competition-এর নিয়ম।</p>' +
        '<div class="mat-rule-list">' +
        '<details open><summary>🏅 Rank progression</summary><div>প্রতিটি league-এ Bronze V থেকে I, তারপর পরের league-এর V থেকে I। ধাপ বাদ দিয়ে promotion হয় না; Immortal সর্বোচ্চ rank।</div></details>' +
        '<details><summary>📅 Weekly leaderboard</summary><div>এই সপ্তাহে জমা হওয়া Medical RP দিয়ে Weekly ranking; All Time-এ মোট অর্জিত RP দিয়ে ranking।</div></details>' +
        '<details><summary>⭐ XP & RP</summary><div>Medical XP ও RP এই website-এর নিজস্ব API-তে সংরক্ষিত এবং আলাদা balance হিসেবে হিসাব হয়।</div></details>' +
        '<details><summary>🔐 Account & profile</summary><div>Registered account Firebase দিয়ে যাচাই হয়। Guest profile আলাদা Guest token দিয়ে সংরক্ষিত হয়।</div></details>' +
        '</div></div>';
      document.body.appendChild(rules);
    }
  }
  function ensureRankBanner() {
    var view = document.getElementById('view-leaderboard');
    if (!view) return;
    var podium = document.getElementById('leaderboard-podium');
    var host = document.getElementById('med-sheet-rank-banner');
    if (!host) {
      host = document.createElement('section');
      host.id = 'med-sheet-rank-banner';
      host.className = 'mat-rank-banner';
      host.setAttribute('aria-label', 'Medical Rank tier and RP progress');
      host.innerHTML = '<div class="mat-rank-head"><strong>MEDICAL RANK</strong><small>বর্তমান rank বড় করে দেখানো হয়েছে; অন্য rank দেখতে swipe করুন</small></div><div class="mat-rank-rail" id="med-rank-rail" role="tablist" aria-label="Select Medical Rank tier"></div><div id="med-rank-progress" class="mat-rank-progress"></div>';
      if (podium && podium.parentNode) podium.parentNode.insertBefore(host, podium);
      else view.appendChild(host);
    }
  }
  function getMyRankEntry(rows) { return getMe(rows || []); }
  function renderRankRail(rows) {
    var rail = document.getElementById('med-rank-rail');
    if (!rail) return;
    var me = getMyRankEntry(rows);
    if (!selectedRank || RANKS.indexOf(selectedRank) < 0) selectedRank = (me && me.rank) || (currentProfile && currentProfile.rank) || RANKS[0];
    rail.innerHTML = RANKS.map(function (rank, index) {
      var active = rank === selectedRank;
      var own = me && me.rank === rank;
      return '<button type="button" role="tab" aria-selected="' + (active ? 'true' : 'false') + '" class="mat-rank-tier ' + rankClass(rank) + (active ? ' is-active' : '') + '" data-med-rank="' + escapeHtml(rank) + '">' +
        '<i class="fa-solid ' + rankIcon(index) + '"></i><span>' + escapeHtml(rank) + '</span><small>' + (own ? 'YOUR RANK' : 'RANK TIER') + '</small></button>';
    }).join('');
    try {
      var activeButton = rail.querySelector('[data-med-rank="' + selectedRank.replace(/"/g, '\\"') + '"]');
      if (activeButton) activeButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } catch (_) {}
    renderRankProgress(me);
  }
  function renderRankProgress(me) {
    var area = document.getElementById('med-rank-progress');
    if (!area) return;
    if (!me) {
      area.innerHTML = '<div class="mat-rank-locked"><i class="fa-solid fa-circle-info"></i><span>Leaderboard দেখতে login বা Guest session তৈরি করুন। Exam দেওয়া আবশ্যক নয়।</span></div>';
      return;
    }
    if (selectedRank !== me.rank) {
      area.innerHTML = '<div class="mat-rank-locked"><i class="fa-solid fa-lock"></i><span><strong>Unlock ' + escapeHtml(selectedRank) + '</strong><br>আপনার বর্তমান rank: ' + escapeHtml(me.rank) + '.</span></div>';
      return;
    }
    var rp = Math.max(0, Number(me.rankPoints || 0));
    var pct = Math.max(0, Math.min(100, Math.round(rp / 300 * 100)));
    var index = RANKS.indexOf(me.rank);
    area.innerHTML = '<div class="mat-rank-progress-line"><span><strong>' + escapeHtml(me.rank) + ' Progress</strong><small>' + rp + ' / 300 RP</small></span><span class="mat-rank-rp"><i class="fa-solid fa-star"></i> ' + rp + ' RP</span></div>' +
      '<div class="mat-rank-track" role="progressbar" aria-valuemin="0" aria-valuemax="300" aria-valuenow="' + Math.min(rp, 300) + '"><span style="width:' + pct + '%"></span><i class="fa-solid fa-star" style="left:clamp(10px,' + pct + '%,calc(100% - 10px))"></i></div>' +
      '<div class="mat-rank-foot"><span>0 RP</span><span>' + (index === RANKS.length - 1 ? 'Highest Rank · Immortal' : 'Next: ' + escapeHtml(RANKS[index + 1])) + '</span><span>300 RP</span></div>';
  }
  function updateTopControls(me) {
    var rp = document.getElementById('med-top-rp');
    if (rp) rp.textContent = String(Math.max(0, Number(me && me.rankPoints) || Number(currentProfile && currentProfile.rankPoints) || 0)) + ' RP';
    var progress = {};
    try { progress = typeof app.getAccountProgress === 'function' ? app.getAccountProgress() : {}; } catch (_) {}
    var streakButton = document.querySelector('[data-med-action="streak"]');
    if (streakButton) {
      var streak = Math.max(0, Number(progress.streak) || 0);
      streakButton.title = 'Daily study streak: ' + streak + ' day(s)';
      streakButton.setAttribute('aria-label', 'Daily study streak: ' + streak + ' day(s)');
    }
  }
  function showOverlay(id) { var el = document.getElementById(id); if (el) el.classList.remove('hidden'); }
  function closeOverlay(el) { if (el) el.classList.add('hidden'); }
  function extractEntries(response) {
    if (Array.isArray(response)) return response;
    if (!response) return [];
    if (Array.isArray(response.entries)) return response.entries;
    if (Array.isArray(response.users)) return response.users;
    if (Array.isArray(response.leaderboard)) return response.leaderboard;
    return [];
  }
  function renderRows(rows) {
    var all = normalizeRows(rows || []);
    var me = getMe(all);
    if (me && (!selectedRank || RANKS.indexOf(selectedRank) < 0)) selectedRank = me.rank;
    if (RANKS.indexOf(selectedRank) < 0) selectedRank = (me && me.rank) || RANKS[0];
    var rankRows = all.filter(function (row) { return row.rank === selectedRank; });
    var body = document.getElementById('leaderboard-body');
    var podium = document.getElementById('leaderboard-podium');
    var mePanel = document.getElementById('leaderboard-me');
    if (!body) return;
    if (podium) podium.innerHTML = '';
    body.innerHTML = '';
    if (mePanel) { mePanel.innerHTML = ''; mePanel.classList.add('hidden'); }
    if (rankRows.length) {
      if (podium) {
        podium.innerHTML = rankRows.slice(0, 3).map(function (row, index) {
          return '<article class="podium-card podium-' + (index + 1) + '" data-med-player="' + escapeHtml(row.userId) + '" tabindex="0" role="button" aria-label="Open ' + escapeHtml(row.name) + ' profile">' +
            '<div class="podium-medal">' + ['🥇','🥈','🥉'][index] + '</div><div class="podium-avatar">' + avatarMarkup(row) + '</div>' +
            '<strong>' + escapeHtml(row.name || 'Medical Student') + '</strong><span>' + Number(row.boardPoints || 0) + ' ' + (selectedPeriod === 'weekly' ? 'Weekly RP' : 'Total RP') + '</span>' +
            '<small>' + rankTrophy(row.rank) + ' ' + escapeHtml(row.rank) + ' · Lv.' + Number(row.level || 1) + '</small></article>';
        }).join('');
      }
      rankRows.forEach(function (row, index) {
        var tr = document.createElement('tr');
        tr.className = 'leader-row' + (row.isMine ? ' is-me' : '');
        tr.dataset.medPlayer = String(row.userId || '');
        tr.tabIndex = 0;
        tr.setAttribute('role', 'button');
        tr.setAttribute('aria-label', 'Open ' + row.name + ' profile');
        tr.innerHTML = '<td class="py-4 px-3"><div class="leader-person"><span class="leader-avatar">' + avatarMarkup(row) + '</span><span><b>' + escapeHtml(row.name || 'Medical Student') + '</b>' +
          (row.isMine ? '<em>YOU</em>' : '') + '<small class="block text-xs opacity-70">' + rankTrophy(row.rank) + ' ' + escapeHtml(row.rank) + ' · Lv.' + Number(row.level || 1) + '</small></span></div></td>' +
          '<td class="py-4 px-3">' + escapeHtml(row.college || '—') + '</td>' +
          '<td class="py-4 px-3">' + escapeHtml(row.batch || '—') + '</td>' +
          '<td class="py-4 px-3">' + Number(row.xp || 0) + ' XP</td>' +
          '<td class="leader-rank-points py-4 px-3"><strong class="leader-rank-number">' + (index + 1) + '</strong><small class="leader-points-label">' + Number(row.boardPoints || 0) + ' ' + (selectedPeriod === 'weekly' ? 'Weekly RP' : 'Total RP') + '</small><small class="leader-points-label">' + Number(row.rankPoints || 0) + ' current RP</small></td>';
        body.appendChild(tr);
      });
      var own = rankRows.find(function (row) { return row.isMine; });
      if (mePanel && own) {
        mePanel.classList.remove('hidden');
        mePanel.innerHTML = '<div><span>Your Position</span><strong>#' + (rankRows.indexOf(own) + 1) + '</strong></div><div><b>' + escapeHtml(own.name) + '</b><small>' + Number(own.boardPoints || 0) + ' ' + (selectedPeriod === 'weekly' ? 'Weekly RP' : 'Total RP') + ' · ' + escapeHtml(own.rank) + '</small></div>';
      }
    } else {
      body.innerHTML = '<tr><td colspan="5" class="py-10 text-center text-sm text-gray-500">এই rank-এ এখনো কোনো student নেই। অন্য rank নির্বাচন করুন।</td></tr>';
    }
    renderRankRail(all);
    updateTopControls(me);
    if (me) applyProfile(Object.assign({}, currentProfile || {}, {
      userId: me.userId, name: me.name, college: me.college, batch: me.batch,
      avatar: me.avatar, xp: me.xp, rankPoints: me.rankPoints, totalRP: me.totalRP,
      level: me.level, rank: me.rank, accountType: me.accountType
    }));
  }
  function avatarMarkup(row) {
    var avatar = safeText(row && row.avatar || '', 500);
    if (/^https:\/\//i.test(avatar)) {
      return '<img src="' + escapeHtml(avatar) + '" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
    }
    if (avatar && avatar.length <= 12 && !/[<>]/.test(avatar)) return escapeHtml(avatar);
    var name = String(row && row.name || 'M').trim();
    return escapeHtml(name ? name.charAt(0).toUpperCase() : 'M');
  }
  function updatePeriodTabs() {
    document.querySelectorAll('[data-leaderboard-period]').forEach(function (button) {
      var active = button.dataset.leaderboardPeriod === selectedPeriod;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    var note = document.getElementById('leaderboard-period-note');
    if (note) {
      note.classList.toggle('hidden', selectedPeriod !== 'weekly');
      note.textContent = selectedPeriod === 'weekly'
        ? 'Weekly ranking এই সপ্তাহের Medical RP থেকে হিসাব হয়। All Time ranking মোট অর্জিত RP ব্যবহার করে।'
        : '';
    }
  }
  function cachedRowsForDisplay() {
    var cached = getCache();
    return cached.length ? cached : [];
  }
  async function loadLeaderboard(silent) {
    ensureUI();
    selectedPeriod = readPeriod();
    var requestId = ++loadSequence;
    var cache = cachedRowsForDisplay();
    if (cache.length) {
      rawRows = cache.map(function (row) { return row && row.raw ? row.raw : row; });
      renderRows(cache);
    }
    if (!API_URL()) { setStatus('Medical Sheets API URL সেট করা নেই।', true); return; }
    if (!app.authStateResolved && !app.authUser) {
      setStatus('Account session যাচাই হচ্ছে…', false);
      return;
    }
    if (app.__medicalRegistrationInProgress) {
      setStatus('Account তৈরি হচ্ছে…', false);
      return;
    }
    try {
      await syncIdentity();
      var response = await request({ action: 'leaderboard', period: selectedPeriod }, { method: 'GET' });
      if (requestId !== loadSequence) return;
      var entries = extractEntries(response);
      rawRows = entries.slice();
      var rows = normalizeRows(entries);
      saveCache(rows);
      renderRows(rows);
      var weekLabel = response && response.weekStart ? ' · week of ' + response.weekStart : '';
      setStatus('Medical leaderboard synced' + weekLabel + '.', false);
    } catch (error) {
      if (requestId !== loadSequence) return;
      setStatus('Medical leaderboard sync হয়নি; available cached data দেখানো হচ্ছে। ' + apiErrorMessage(error), true);
    }
  }
  function queueResult(item) {
    var queue = getQueue();
    if (!queue.some(function (entry) { return entry && entry.attemptId === item.attemptId && entry.userId === item.userId; })) queue.push(item);
    saveQueue(queue);
  }
  async function submitResult(item) {
    var creds = await credentialsForCurrentUser();
    var currentId = currentUserId();
    if (item.userId && currentId && String(item.userId) !== String(currentId)) {
      throw new Error('এই attempt অন্য account-এ শুরু হয়েছিল। Reward sync করতে সেই account-এ ফিরে যান।');
    }
    var apiAttemptId = 'MAT-' + safeText(item.userId || currentUserId() || 'guest', 80) + '-' + safeText(item.attemptId || '', 48);
    var response = await request(Object.assign({}, creds, {
      action: 'submitExam',
      attemptId: apiAttemptId,
      examMode: safeText(item.examMode || 'Exam', 60),
      totalQuestions: Math.max(1, Number(item.totalQuestions) || 1),
      correctCount: Math.max(0, Number(item.correctCount) || 0),
      wrongCount: Math.max(0, Number(item.wrongCount) || 0),
      score: Math.max(0, Number(item.score != null ? item.score : item.quizPoints) || 0)
    }));
    var user = response.user || response.profile || null;
    if (user) applyProfile(user);
    var reward = {
      success: true, synced: true, pending: false,
      attemptId: String(item.attemptId || response.attemptId || ''),
      xpGained: Number(response.xpGained || 0),
      rankPointsDelta: Number(response.rankPointsDelta || 0),
      rank: (user && user.rank) || response.rankAfter || response.rank || (currentProfile && currentProfile.rank) || '',
      rankPoints: user && user.rankPoints != null ? Number(user.rankPoints) : (response.rankPoints == null ? null : Number(response.rankPoints)),
      totalRP: user && user.totalRP != null ? Number(user.totalRP) : (response.totalRP == null ? null : Number(response.totalRP)),
      level: user && user.level != null ? Number(user.level) : (response.level == null ? null : Number(response.level)),
      duplicate: !!response.duplicate,
      message: response.message || 'Medical reward synced.'
    };
    saveReward(reward);
    return reward;
  }
  async function recordLeaderboardResult(meta) {
    meta = meta || {};
    var attemptId = String(meta.attemptId || (app.examState && app.examState.startedAt) || Date.now());
    var saved = getSavedReward(attemptId);
    if (saved) return saved;
    var item = {
      attemptId: attemptId,
      userId: currentUserId(),
      totalQuestions: Math.max(1, Number(meta.totalQuestions) || 1),
      correctCount: Math.max(0, Number(meta.correctCount) || 0),
      wrongCount: Math.max(0, Number(meta.wrongCount) || 0),
      quizPoints: Math.max(0, Number(meta.quizPoints) || 0),
      score: Math.max(0, Number(meta.score != null ? meta.score : meta.quizPoints) || 0),
      examMode: safeText(meta.examMode || (app.examState && app.examState.mode) || 'Exam', 60)
    };
    try {
      await syncIdentity();
      item.userId = currentUserId();
      var reward = await submitResult(item);
      await loadLeaderboard(true);
      return reward;
    } catch (error) {
      queueResult(item);
      var pending = {
        success: false, pending: true, synced: false, attemptId: attemptId,
        xpGained: null, rankPointsDelta: null,
        message: 'Medical API-তে result sync হয়নি; attempt pending queue-তে রাখা হয়েছে। ' + apiErrorMessage(error)
      };
      saveReward(pending);
      setStatus(pending.message, true);
      return pending;
    }
  }
  async function flushQueue() {
    if (!navigator.onLine) return;
    var queue = getQueue();
    if (!queue.length) return;
    try { await syncIdentity(); } catch (_) { return; }
    var activeId = currentUserId();
    var keep = [];
    var sent = false;
    for (var i = 0; i < queue.length; i++) {
      var item = queue[i];
      if (!item || String(item.userId || '') !== String(activeId || '')) { keep.push(item); continue; }
      try {
        var reward = await submitResult(item);
        if (reward && reward.success) sent = true;
      } catch (_) { keep.push(item); }
    }
    saveQueue(keep);
    if (sent) await loadLeaderboard(true);
  }
  function showPublicProfile(userId) {
    var row = normalizeRows(rawRows).find(function (entry) { return String(entry.userId) === String(userId); });
    if (!row) return;
    var content = document.getElementById('med-player-content');
    if (!content) return;
    content.innerHTML = '<div class="mat-player-avatar">' + rankTrophy(row.rank) + '</div>' +
      '<h2 id="med-player-title">' + escapeHtml(row.name || 'Medical Student') + '</h2>' +
      '<p class="mat-dialog-note">' + escapeHtml([row.college, row.batch].filter(Boolean).join(' · ') || 'Student profile') + '</p>' +
      '<div class="mat-player-stats">' +
      '<div class="mat-player-stat"><small>Medical Rank</small><strong>' + escapeHtml(row.rank) + '</strong></div>' +
      '<div class="mat-player-stat"><small>Current RP</small><strong>' + Number(row.rankPoints || 0) + '</strong></div>' +
      '<div class="mat-player-stat"><small>Total RP</small><strong>' + Number(row.totalRP || 0) + '</strong></div>' +
      '<div class="mat-player-stat"><small>Medical XP</small><strong>' + Number(row.xp || 0) + '</strong></div>' +
      '<div class="mat-player-stat"><small>Level</small><strong>' + Number(row.level || 1) + '</strong></div>' +
      '</div><p class="mat-dialog-note">Medical Admission Tracker education profile.</p>';
    showOverlay('med-player-modal');
  }
  function ensureUI() {
    injectStyles();
    ensureTopControls();
    ensureOverlays();
    ensureRankBanner();
    selectedPeriod = readPeriod();
    if (RANKS.indexOf(selectedRank) < 0) selectedRank = readSelectedRank();
    updatePeriodTabs();
  }
  function bindEvents() {
    document.addEventListener('click', async function (event) {
      var periodButton = event.target.closest && event.target.closest('[data-leaderboard-period]');
      if (periodButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        selectedPeriod = periodButton.dataset.leaderboardPeriod === 'weekly' ? 'weekly' : 'all-time';
        try { localStorage.setItem(PERIOD_KEY, selectedPeriod); } catch (_) {}
        updatePeriodTabs();
        await loadLeaderboard(true);
        return;
      }
      var rankButton = event.target.closest && event.target.closest('[data-med-rank]');
      if (rankButton) {
        selectedRank = rankButton.dataset.medRank;
        if (RANKS.indexOf(selectedRank) < 0) return;
        try { localStorage.setItem(SELECTED_RANK_KEY + accountKey(), selectedRank); } catch (_) {}
        renderRows(rawRows);
        var rail = document.getElementById('med-rank-rail');
        var active = rail && rail.querySelector('[data-med-rank="' + selectedRank + '"]');
        if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        return;
      }
      var action = event.target.closest && event.target.closest('[data-med-action]');
      if (action) {
        if (action.dataset.medAction === 'rules') showOverlay('med-rules-modal');
        else if (action.dataset.medAction === 'streak') {
          var progress = {};
          try { progress = typeof app.getAccountProgress === 'function' ? app.getAccountProgress() : {}; } catch (_) {}
          setStatus('📚 Current daily study streak: ' + Math.max(0, Number(progress.streak) || 0) + ' day(s).', false);
        } else {
          var view = document.getElementById('view-leaderboard');
          if (view && view.classList.contains('hidden') && typeof app.showView === 'function') app.showView('leaderboard');
          await loadLeaderboard(true);
        }
        return;
      }
      var player = event.target.closest && event.target.closest('[data-med-player]');
      if (player) { showPublicProfile(player.dataset.medPlayer); return; }
      var close = event.target.closest && event.target.closest('[data-med-close]');
      if (close) { closeOverlay(close.closest('.mat-overlay')); return; }
      if (event.target.classList && event.target.classList.contains('mat-overlay')) closeOverlay(event.target);
    }, true);
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      var player = event.target.closest && event.target.closest('[data-med-player]');
      if (player) { event.preventDefault(); showPublicProfile(player.dataset.medPlayer); }
    });
    var profileForm = document.getElementById('medical-profile-form');
    if (profileForm) {
      profileForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        var status = document.getElementById('medical-profile-save-status');
        var button = document.getElementById('medical-profile-save');
        if (button) button.disabled = true;
        if (status) status.textContent = 'Profile save হচ্ছে…';
        try {
          var updated = await updateProfile({
            name: (document.getElementById('medical-profile-name') || {}).value || '',
            college: (document.getElementById('medical-profile-college') || {}).value || '',
            batch: (document.getElementById('medical-profile-batch') || {}).value || '',
            avatar: (document.getElementById('medical-profile-avatar') || {}).value || ''
          });
          if (app.authUser && typeof app.syncFirebaseStudentProfile === 'function') {
            await app.syncFirebaseStudentProfile({
              name: updated.name, college: updated.college, batch: updated.batch, avatar: updated.avatar
            });
          }
          if (status) status.textContent = 'Profile update সফল হয়েছে।';
          await loadLeaderboard(true);
        } catch (error) {
          if (status) status.textContent = apiErrorMessage(error);
          setStatus('Profile update হয়নি। ' + apiErrorMessage(error), true);
        } finally {
          if (button) button.disabled = false;
        }
      });
    }
  }

  app.getDemoLeaderboardRows = function () { return []; };
  app.getLocalLeaderboardRows = function () { return getCache(); };
  app.setLocalLeaderboardRows = function (rows) { return saveCache(rows); };
  app.mergeLeaderboardRows = function (rows) { return normalizeRows(rows); };
  app.recordLeaderboardResult = recordLeaderboardResult;
  app.loadLeaderboard = loadLeaderboard;
  app.syncPendingLeaderboard = flushQueue;
  app.syncLeaderboardUser = syncIdentity;
  app.renderLeaderboardRows = renderRows;
  app.updateMedicalProfile = updateProfile;

  window.MedGlobalLeague = Object.freeze({
    loadLeaderboard: loadLeaderboard,
    recordLeaderboardResult: recordLeaderboardResult,
    syncIdentity: syncIdentity,
    registerUser: registerUser,
    updateProfile: updateProfile,
    getCachedRows: getCache,
    getRanks: function () { return RANKS.slice(); },
    flushPending: flushQueue,
    reload: function () { return loadLeaderboard(true); }
  });

  ensureUI();
  bindEvents();
  window.addEventListener('online', function () { flushQueue(); loadLeaderboard(true); });
  window.addEventListener('student-auth-state-resolved', function () {
    syncIdentity().then(function () { return loadLeaderboard(true); }).catch(function (error) { setStatus(apiErrorMessage(error), true); });
  });
  window.addEventListener('student-profile-loaded', function () {
    syncIdentity().then(function () { return loadLeaderboard(true); }).catch(function (error) { setStatus(apiErrorMessage(error), true); });
  });
  window.addEventListener('storage', function (event) {
    if (event.key === PERIOD_KEY || event.key === GUEST_TOKEN_KEY) { selectedPeriod = readPeriod(); loadLeaderboard(true); }
  });
  if (app.authStateResolved) {
    syncIdentity().then(function () { return loadLeaderboard(true); }).catch(function (error) { setStatus(apiErrorMessage(error), true); });
  }
  window.setInterval(flushQueue, 30000);
})();