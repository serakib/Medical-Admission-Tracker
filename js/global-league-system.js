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
    try {
      var saved = localStorage.getItem(PERIOD_KEY);
      return saved === 'weekly' || saved === 'friends' ? saved : 'all-time';
    } catch (_) { return 'all-time'; }
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
      return 'Google Apps Script response browser-এ পড়া যায়নি। Apps Script Web App deployment access, URL এবং browser CORS/redirect response পরীক্ষা করুন।';
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
      if (Array.isArray(payload.userIds) && payload.userIds.length) {
        params.set('ids', Array.from(new Set(payload.userIds.map(function (id) { return String(id || '').trim(); }).filter(Boolean)).values()).join(','));
      }
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
      '#med-rank-controls{position:fixed;z-index:9998;top:13px;right:16px;display:flex;align-items:center;gap:7px;padding:5px;border-radius:15px;background:rgba(10,18,32,.95);border:1px solid rgba(148,163,184,.23);box-shadow:0 10px 28px rgba(0,0,0,.18);backdrop-filter:blur(14px);color:#f8fafc}body.exam-active #med-rank-controls{display:none}.mat-top-icon{position:relative;display:grid;place-items:center;width:39px;height:39px;border-radius:11px;border:1px solid rgba(148,163,184,.18);background:rgba(255,255,255,.05);color:#e2e8f0;font-size:16px;cursor:pointer;transition:transform .18s ease,border-color .18s ease,background .18s ease,box-shadow .18s ease}.mat-top-icon:hover{transform:translateY(-1px);border-color:rgba(110,231,183,.55);background:rgba(16,185,129,.12);box-shadow:0 7px 18px rgba(16,185,129,.12)}.mat-top-icon:first-child{color:#fb923c}.mat-streak-control{display:flex;align-items:center;justify-content:center;gap:7px;width:auto;min-width:112px;height:39px;padding:0 10px;border-color:rgba(251,146,60,.28);background:linear-gradient(135deg,rgba(249,115,22,.12),rgba(245,158,11,.06))}.mat-streak-control>i{color:#fb923c;font-size:17px;filter:drop-shadow(0 0 5px rgba(251,146,60,.28))}.mat-top-streak-count{font-size:18px;line-height:1;font-weight:950;color:#fff7ed;font-variant-numeric:tabular-nums}.mat-streak-copy{font-size:8px;line-height:1.2;font-weight:950;letter-spacing:.08em;color:#fed7aa;white-space:nowrap}.mat-info-control{color:#c4b5fd;border-color:rgba(167,139,250,.4);background:linear-gradient(145deg,rgba(139,92,246,.22),rgba(79,70,229,.12));box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 0 15px rgba(139,92,246,.08)}.mat-info-glyph{display:grid;place-items:center;width:20px;height:20px;border:2px solid currentColor;border-radius:50%;font-family:Georgia,serif;font-style:normal;font-size:13px;font-weight:900;line-height:1;color:#ddd6fe;box-shadow:0 0 0 3px rgba(167,139,250,.09),inset 0 1px 3px rgba(255,255,255,.12)}.mat-info-control:hover .mat-info-glyph{background:rgba(167,139,250,.16);box-shadow:0 0 0 4px rgba(167,139,250,.12),0 0 12px rgba(167,139,250,.22)}.mat-top-rp{display:flex;align-items:center;gap:7px;height:39px;padding:0 11px;border-radius:11px;background:rgba(255,255,255,.05);border:1px solid rgba(148,163,184,.18);color:#f8fafc;font-weight:950;white-space:nowrap;cursor:pointer}.mat-top-rp i{color:#facc15}' +
      '.mat-overlay{position:fixed;inset:0;z-index:10020;display:flex;align-items:center;justify-content:center;padding:17px;background:rgba(2,6,23,.7);backdrop-filter:blur(8px)}.mat-overlay.hidden{display:none}.mat-dialog{position:relative;width:min(100%,520px);max-height:min(86vh,760px);overflow:auto;border:1px solid rgba(148,163,184,.24);border-radius:23px;padding:24px;background:var(--surface,#fff);color:var(--text,#0f172a);box-shadow:0 28px 80px rgba(0,0,0,.36)}.dark .mat-dialog{background:#101827;color:#f8fafc}.mat-dialog h2{font-size:21px;font-weight:950;margin:0 34px 8px 0}.mat-dialog-note{font-size:13px;color:var(--muted,#64748b);margin:0 0 15px;line-height:1.6}.mat-close{position:absolute;right:13px;top:11px;width:35px;height:35px;border-radius:11px;background:rgba(148,163,184,.14);font-size:24px}.mat-player-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:15px 0}.mat-player-stat{padding:11px;border-radius:13px;background:rgba(148,163,184,.12)}.mat-player-stat small{display:block;font-size:11px;color:var(--muted,#64748b)}.mat-player-stat strong{display:block;margin-top:4px;font-size:15px;overflow-wrap:anywhere}.leaderboard-period-tab.is-active{border-color:#0d9488!important;background:rgba(13,148,136,.1)!important;color:#0d9488!important}.leader-tier-trophy{font-size:13px;vertical-align:middle}' +
      '@media(max-width:650px){#med-rank-controls{top:9px;right:8px;gap:4px;padding:4px}.mat-top-icon{width:35px;height:35px}.mat-streak-control{width:auto;min-width:91px;height:35px;padding:0 7px;gap:5px}.mat-top-streak-count{font-size:15px}.mat-streak-copy{font-size:7px}.mat-info-control{width:35px;height:35px}.mat-info-glyph{width:18px;height:18px;font-size:12px}.mat-top-rp{height:35px;padding:0 8px;font-size:12px}main{padding-top:68px!important}.mat-dialog{padding:20px 15px}.mat-rank-rail{gap:6px}.mat-rank-tier{flex-basis:69px;min-width:69px;min-height:82px}.mat-rank-tier.is-active{flex-basis:105px;min-width:105px;min-height:100px}}';
    style.textContent += '.mat-rank-banner{margin:8px 0 18px;padding:0;background:transparent;border:0;border-radius:0;box-shadow:none;color:var(--text,#0f172a);overflow:visible}.mat-rank-head{text-align:left;margin:0 0 8px;gap:2px}.mat-rank-head strong{color:var(--brand,#059669);letter-spacing:.14em}.mat-rank-head small{color:var(--muted,#64748b)}.mat-rank-rail{display:flex;align-items:flex-end;gap:15px;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin;padding:12px 4px 14px;scroll-snap-type:x mandatory}.mat-rank-tier{flex:0 0 64px;min-width:64px;min-height:88px;padding:0 2px 5px;border:0!important;border-radius:0!important;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;opacity:.7;transform:scale(.94);transition:transform .2s ease,opacity .2s ease,color .2s ease;scroll-snap-align:center;color:var(--muted,#64748b);background:transparent!important;box-shadow:none!important;cursor:pointer;font-size:10px;font-weight:850;text-align:center}.mat-rank-tier.is-active{flex-basis:72px;min-width:72px;min-height:96px;opacity:1;transform:scale(1.08);color:var(--text,#0f172a);border:0!important;box-shadow:none!important}.mat-rank-tier .vault-rank-trophy-svg{display:block;width:43px;height:49px;filter:drop-shadow(0 3px 2px #0002);transition:width .2s ease,height .2s ease,filter .2s ease}.mat-rank-tier.is-active .vault-rank-trophy-svg{width:62px;height:69px;filter:drop-shadow(0 6px 4px #0003)}.mat-rank-tier>span{display:block;font-size:10px;font-weight:850;line-height:1.2;white-space:nowrap}.mat-rank-tier small,.mat-rank-tier i{display:none!important}.mat-rank-tier.is-active>span{font-size:11px;color:var(--brand,#047857)}.mat-rank-progress{padding:5px 0 0}.mat-rank-progress-line{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.mat-rank-progress-line>span:first-child{display:flex;flex-direction:column;gap:3px}.mat-rank-progress-line strong{font-size:13px}.mat-rank-progress-line small,.mat-rank-foot{font-size:11px;color:var(--muted,#64748b)}.mat-rank-rp{font-weight:950;color:#b7791f;white-space:nowrap}.mat-rank-track{position:relative;height:11px;border-radius:99px;background:rgba(148,163,184,.22);margin:14px 1px 8px;overflow:visible}.mat-rank-track>span{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,#f59e0b,#10b981);transition:width .35s ease}.mat-rank-track>.mat-safe-zone-marker{position:absolute;top:-5px;bottom:-5px;width:3px;height:auto;transform:translateX(-50%);border-radius:99px;background:var(--text,#334155);border:1px solid var(--surface,#fff);box-shadow:0 0 0 2px rgba(16,185,129,.22);z-index:2}.mat-safe-zone-caption{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;color:#059669}.mat-safe-zone-caption.at-risk{color:#d97706}.mat-rank-locked{display:flex;gap:10px;align-items:center;border:1px solid rgba(148,163,184,.25);border-radius:14px;padding:12px;background:rgba(148,163,184,.08);font-size:12px;line-height:1.6}.mat-rule-list{display:grid;gap:9px;margin-top:18px}.mat-rules-kicker{display:inline-flex;align-items:center;gap:7px;font-size:10px;font-weight:950;letter-spacing:.14em;color:#059669;margin-bottom:8px}.mat-rules-dialog h2{margin-top:0}.mat-rule-list details{overflow:hidden;border:1px solid var(--line,rgba(148,163,184,.24));border-radius:15px;background:var(--surface-2,rgba(148,163,184,.05));transition:border-color .18s,background .18s}.mat-rule-list details[open]{border-color:rgba(16,185,129,.4);background:color-mix(in srgb,#10b981 5%,var(--surface,#fff))}.mat-rule-list summary{display:flex;align-items:center;gap:10px;padding:12px;list-style:none;cursor:pointer}.mat-rule-list summary::-webkit-details-marker{display:none}.mat-rule-list summary>span:nth-child(2){display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}.mat-rule-list summary strong{font-size:13px;font-weight:900}.mat-rule-list summary small{font-size:11px;color:var(--muted,#64748b)}.mat-rule-icon{display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;border-radius:11px;background:rgba(16,185,129,.12);color:#059669;font-size:15px}.mat-rule-icon.reward{background:rgba(217,119,6,.13);color:#d97706}.mat-rule-icon.trophy{background:rgba(139,92,246,.13);color:#8b5cf6}.mat-rule-icon.weekly{background:rgba(14,165,233,.13);color:#0284c7}.mat-rule-icon.board{background:rgba(99,102,241,.13);color:#6366f1}.mat-rule-icon.account{background:rgba(100,116,139,.13);color:#64748b}.mat-rule-chevron{font-size:11px;color:var(--muted,#64748b);transition:transform .18s}.mat-rule-list details[open] .mat-rule-chevron{transform:rotate(180deg)}.mat-rule-list details>div{padding:0 14px 14px 58px;font-size:12px;line-height:1.75;color:var(--muted,#64748b)}.mat-rules-foot{display:flex;gap:7px;margin:16px 0 0;font-size:11px;line-height:1.7;color:var(--muted,#64748b)}.leader-safe-status{display:block;margin-top:5px;color:#059669;font-size:10px;font-weight:850}.leader-risk-status{display:block;margin-top:5px;color:#d97706;font-size:10px;font-weight:850}.safe-zone-divider td{padding:12px 8px!important;border-top:2px solid #10b981!important;border-bottom:2px solid #10b981!important;text-align:center!important;background:color-mix(in srgb,#10b981 5%,var(--surface,#fff));color:#059669!important;font-weight:950;letter-spacing:.12em}.safe-zone-divider td:before{content:"";display:inline-block;width:24px;height:1px;vertical-align:middle;background:#10b981;margin:0 10px}.safe-zone-divider td:after{content:"";display:inline-block;width:24px;height:1px;vertical-align:middle;background:#10b981;margin:0 10px}.leaderboard-period-tab{transition:background .18s,border-color .18s,color .18s}.leaderboard-period-tab.is-active{background:#047857!important;border-color:#047857!important;color:#fff!important}.mat-student-profile{max-width:1050px}.mat-student-profile-hero{display:flex;align-items:center;gap:16px;padding:24px;border-bottom:1px solid var(--line,rgba(148,163,184,.2))}.mat-student-profile-avatar{display:grid;place-items:center;flex:0 0 76px;width:76px;height:76px;border-radius:50%;overflow:hidden;background:var(--surface-2,rgba(148,163,184,.12));font-size:26px;font-weight:900}.mat-student-profile-avatar img{width:100%;height:100%;object-fit:cover}.mat-student-profile-title{font-size:clamp(23px,4vw,31px);font-weight:950;line-height:1.2;overflow-wrap:anywhere}.mat-student-profile-meta{font-size:13px;color:var(--muted,#64748b);line-height:1.7}.mat-student-profile-stat{padding:16px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:17px;background:var(--surface,#fff)}.mat-student-profile-stat small{display:block;font-size:11px;color:var(--muted,#64748b);font-weight:750}.mat-student-profile-stat strong{display:block;margin-top:5px;font-size:23px;font-weight:950;overflow-wrap:anywhere}.mat-student-vault-trophy{display:flex;align-items:center;gap:13px;padding:18px 0}.mat-student-vault-trophy svg{width:66px;height:74px;filter:drop-shadow(0 6px 4px #0002)}.mat-student-vault-trophy strong{display:block;font-size:17px;font-weight:950}.mat-student-vault-trophy small{display:block;color:var(--muted,#64748b);font-size:12px;margin-top:3px}.mat-profile-actions{display:flex;gap:8px;flex-wrap:wrap}.mat-profile-actions button{min-height:40px;padding:9px 13px;border:1px solid var(--line,rgba(148,163,184,.25));border-radius:11px;font-size:12px;font-weight:850;background:var(--surface,#fff);color:var(--text,#0f172a)}.mat-profile-actions button.primary{border-color:#059669;background:#059669;color:#fff}.mat-profile-actions button.danger{border-color:rgba(220,38,38,.35);color:#dc2626}.mat-friends-request{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:13px;margin-top:8px}.mat-friends-request strong{font-size:13px}.mat-friends-request small{display:block;color:var(--muted,#64748b);font-size:11px}.mat-profile-empty{padding:22px;border:1px dashed var(--line,rgba(148,163,184,.25));border-radius:14px;color:var(--muted,#64748b);font-size:13px;line-height:1.7}.mat-profile-gate-notice{display:flex;align-items:flex-start;gap:11px;margin:0 0 16px;padding:14px 15px;border:1px solid rgba(217,119,6,.28);border-radius:14px;background:linear-gradient(135deg,rgba(245,158,11,.10),rgba(16,185,129,.05));color:var(--text,#0f172a)}.mat-profile-gate-notice>i{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;border-radius:11px;background:rgba(217,119,6,.13);color:#d97706}.mat-profile-gate-notice span{display:flex;flex-direction:column;gap:4px}.mat-profile-gate-notice strong{font-size:13px;font-weight:900}.mat-profile-gate-notice small{font-size:12px;line-height:1.6;color:var(--muted,#64748b)}.mat-profile-gate-notice[hidden]{display:none!important}@media(max-width:650px){#med-rank-controls{top:9px;right:8px;gap:4px;padding:4px}.mat-streak-control{min-width:92px;height:35px;padding:0 7px;gap:5px}.mat-top-streak-count{font-size:15px}.mat-streak-copy{font-size:7px}.mat-rank-banner{margin:4px 0 10px}.mat-rank-rail{gap:9px;padding:9px 4px 10px}.mat-rank-tier{flex-basis:54px;min-width:54px;min-height:74px}.mat-rank-tier.is-active{flex-basis:65px;min-width:65px;min-height:88px}.mat-rank-tier .vault-rank-trophy-svg{width:37px;height:42px}.mat-rank-tier.is-active .vault-rank-trophy-svg{width:54px;height:61px}.mat-rank-progress-line{align-items:flex-start}.mat-student-profile-hero{padding:18px 14px;align-items:flex-start}.mat-student-profile-avatar{flex-basis:60px;width:60px;height:60px}.mat-student-profile-stat{padding:12px}.mat-student-profile-stat strong{font-size:20px}.mat-rule-list details>div{padding-left:14px}.mat-rule-list summary{padding:10px}.mat-rule-icon{flex-basis:32px;width:32px;height:32px}}';
    document.head.appendChild(style);
  }
  function ensureTopControls() {
    if (document.getElementById('med-rank-controls')) return;
    var root = document.createElement('div');
    root.id = 'med-rank-controls';
    root.innerHTML =
      '<button type="button" class="mat-top-icon mat-streak-control" data-med-action="streak" title="Daily study streak" aria-label="Daily study streak: 0 days"><i class="fa-solid fa-fire" aria-hidden="true"></i><strong class="mat-top-streak-count" id="med-top-streak-count">0</strong><span class="mat-streak-copy">DAY STREAK</span></button>';
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
      rules.innerHTML = '<div class="mat-dialog mat-rules-dialog" role="dialog" aria-modal="true" aria-labelledby="med-rules-title">' +
        '<button class="mat-close" type="button" data-med-close aria-label="Close">×</button>' +
        '<span class="mat-rules-kicker"><i class="fa-solid fa-book-open"></i> STUDENT GUIDE</span>' +
        '<h2 id="med-rules-title">Exam, Rewards & Rank Rules</h2><p class="mat-dialog-note">পরীক্ষা দিন, reward বুঝুন এবং নিজের rank progression অনুসরণ করুন।</p>' +
        '<div class="mat-rule-list">' +
        '<details open><summary><span class="mat-rule-icon exam"><i class="fa-solid fa-clipboard-check"></i></span><span><strong>১. Exam Scoring</strong><small>নম্বর কীভাবে হিসাব হয়</small></span><i class="fa-solid fa-chevron-down mat-rule-chevron"></i></summary><div>সঠিক উত্তরে +১.০০, ভুল উত্তরে −০.২৫ এবং উত্তর না দিলে ০ নম্বর। Submit করার পর score, accuracy, correct, wrong ও skipped প্রশ্নের ফলাফল দেখুন।</div></details>' +
        '<details><summary><span class="mat-rule-icon reward"><i class="fa-solid fa-gift"></i></span><span><strong>২. ১০০ নম্বরের Model Test ও Rewards</strong><small>পরীক্ষা শেষে reward পাওয়ার প্রক্রিয়া</small></span><i class="fa-solid fa-chevron-down mat-rule-chevron"></i></summary><div>১০০ নম্বরের Model Test শেষ করে Submit করুন। Reward API result গ্রহণ করার পর নিশ্চিত XP ও RP result screen-এ sync হবে। এই version-এর backend আলাদা PB (Performance Bonus) amount ফেরত দেয় না—তাই PB-এর কোনো আলাদা অঙ্ক দেখানো হয় না। Reward pending থাকলে screen-এর sync status দেখুন; নিশ্চিত না হওয়া reward-কে earned ধরে নেবেন না।</div></details>' +
        '<details><summary><span class="mat-rule-icon trophy"><i class="fa-solid fa-trophy"></i></span><span><strong>৩. Trophy & Subrank</strong><small>পরবর্তী rank-এ ওঠার নিয়ম</small></span><i class="fa-solid fa-chevron-down mat-rule-chevron"></i></summary><div>Achievement Vault-এর trophy-গুলো rank progression দেখায়। Bronze V থেকে Bronze IV, III, II, I—তারপর পরবর্তী tier-এর V। ধাপ বাদ দিয়ে promotion হয় না। সর্বোচ্চ rank Immortal।</div></details>' +
        '<details><summary><span class="mat-rule-icon weekly"><i class="fa-solid fa-shield-halved"></i></span><span><strong>৪. Weekly Safe Zone</strong><small>সাপ্তাহিক অবস্থান ও demotion</small></span><i class="fa-solid fa-chevron-down mat-rule-chevron"></i></summary><div>Weekly leaderboard-এ line-এর ওপরে থাকা student-রা Safe Zone-এ থাকে। নিচে থাকলে Safe Zone-এ যেতে কত RP বাকি তা দেখা যায়। সাপ্তাহিক cycle শেষেও threshold পূরণ না হলে নিয়ম অনুযায়ী এক subrank demotion হতে পারে; কাউকে সরাসরি সর্বনিম্ন rank-এ নামানো হবে না।</div></details>' +
        '<details><summary><span class="mat-rule-icon board"><i class="fa-solid fa-ranking-star"></i></span><span><strong>৫. All Time, Friends & Weekly</strong><small>তিনটি আলাদা ranking</small></span><i class="fa-solid fa-chevron-down mat-rule-chevron"></i></summary><div>All Time মোট lifetime RP অনুযায়ী; Friends শুধু accepted friends-দের মধ্যে; Weekly চলতি সপ্তাহের RP অনুযায়ী। এই তিনটি tab-এর ranking আলাদা, তবে student profile ও rank-এর তথ্য একই account-এর সঙ্গে sync হবে।</div></details>' +
        '<details><summary><span class="mat-rule-icon account"><i class="fa-solid fa-user-check"></i></span><span><strong>৬. Profile & Reward Sync</strong><small>তথ্য সম্পূর্ণ রাখুন</small></span><i class="fa-solid fa-chevron-down mat-rule-chevron"></i></summary><div>Leaderboard ব্যবহারের আগে নিজের নাম, কলেজ ও ব্যাচ পূরণ করে Save করুন। Network সমস্যা হলে status দেখে আবার sync করুন; নিশ্চিত না হওয়া reward-কে সফল ধরে নেবেন না।</div></details>' +
        '</div><p class="mat-rules-foot"><i class="fa-solid fa-circle-info"></i> PB-এর নির্দিষ্ট পরিমাণ reward service যে result নিশ্চিত করে, সেটিই চূড়ান্ত।</p></div>';
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
      host.innerHTML = '<div class="mat-rank-head"><strong>ACHIEVEMENT VAULT</strong><small>আপনার বর্তমান trophy বড় করে দেখানো হবে; অন্য trophy দেখতে swipe করুন</small></div><div class="mat-rank-rail" id="med-rank-rail" role="tablist" aria-label="Achievement Vault trophies"></div><div id="med-rank-progress" class="mat-rank-progress"></div>';
      if (podium && podium.parentNode) podium.parentNode.insertBefore(host, podium);
      else view.appendChild(host);
    }
  }
  function getMyRankEntry(rows) { return getMe(rows || []); }
  function renderRankRail(rows) {
    var rail = document.getElementById('med-rank-rail');
    if (!rail) return;
    var me = getMyRankEntry(rows || []);
    var vault = window.MedAchievementVaultTrophies;
    var vaultRanks = vault && typeof vault.getRanks === 'function'
      ? vault.getRanks()
      : RANKS.map(function (name, index) { return { name: name, index: index }; });
    if (me && (!selectedRank || !vaultRanks.some(function (item) { return item.name === selectedRank; }))) selectedRank = me.rank;
    if (!selectedRank || !vaultRanks.some(function (item) { return item.name === selectedRank; })) selectedRank = (me && me.rank) || RANKS[0];
    rail.innerHTML = vaultRanks.map(function (item) {
      var rank = item.name;
      var active = rank === selectedRank;
      var svg = vault && typeof vault.trophySvgForIndex === 'function'
        ? vault.trophySvgForIndex(item.index, 'vault-rank-trophy-svg')
        : '<span aria-hidden="true">🏆</span>';
      return '<button type="button" role="tab" aria-selected="' + (active ? 'true' : 'false') + '" class="mat-rank-tier ' + rankClass(rank) + (active ? ' is-active' : '') + '" data-med-rank="' + escapeHtml(rank) + '" aria-label="' + escapeHtml(rank) + ' trophy">' +
        svg + '<span>' + escapeHtml(rank) + '</span></button>';
    }).join('');
    try {
      var activeButton = Array.from(rail.querySelectorAll('[data-med-rank]')).find(function (button) { return button.dataset.medRank === selectedRank; });
      if (activeButton) activeButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } catch (_) {}
    renderRankProgress(me);
  }
  function renderRankProgress(me) {
    var area = document.getElementById('med-rank-progress');
    if (!area) return;
    if (!me) {
      area.innerHTML = '<div class="mat-rank-locked"><i class="fa-solid fa-circle-info"></i><span>নিজের নাম, কলেজ ও ব্যাচ পূরণ করে Save করলে Leaderboard ও trophy progress ব্যবহার করতে পারবেন।</span></div>';
      return;
    }
    var vault = window.MedAchievementVaultTrophies;
    var info = vault && typeof vault.getRankInfoForName === 'function' ? vault.getRankInfoForName(me.rank) : null;
    if (!info && vault && typeof vault.getRankInfoForPoints === 'function') info = vault.getRankInfoForPoints(me.totalRP || me.rankPoints || 0);
    var required = Math.max(0, Number(info && info.required) || 0);
    var threshold = Math.max(0, Number(info && info.safeZoneRP) || 0);
    var weeklyMode = selectedPeriod === 'weekly';
    var earnedThisPeriod = Math.max(0, Number(weeklyMode ? me.weeklyRankPoints : me.rankPoints) || 0);
    var atMax = !!(info && info.atMax) || String(me.rank || '').toLowerCase() === 'immortal';
    if (atMax || !required) {
      area.innerHTML = '<div class="mat-rank-progress-line"><span><strong>' + escapeHtml(me.rank || 'Immortal') + ' · সর্বোচ্চ Trophy</strong><small>আপনি সর্বোচ্চ rank-এ পৌঁছেছেন।</small></span><span class="mat-rank-rp"><i class="fa-solid fa-star"></i> ' + Math.floor(Number(me.totalRP || me.rankPoints) || 0).toLocaleString() + ' RP</span></div><div class="mat-safe-zone-caption"><i class="fa-solid fa-shield-check"></i> সর্বোচ্চ rank · Demotion protection প্রযোজ্য নয়</div>';
      return;
    }
    var pct = Math.max(0, Math.min(100, earnedThisPeriod / required * 100));
    var markerPct = Math.max(0, Math.min(100, threshold / required * 100));
    var safe = earnedThisPeriod >= threshold;
    var remaining = Math.max(0, threshold - earnedThisPeriod);
    var rpLabel = weeklyMode ? 'Weekly RP' : 'Current RP';
    var statusText = safe
      ? 'Safe Zone-এ আছেন'
      : 'Safe Zone-এ যেতে আরও ' + remaining.toLocaleString() + ' RP প্রয়োজন';
    area.innerHTML = '<div class="mat-rank-progress-line"><span><strong>' + escapeHtml(me.rank) + ' → ' + escapeHtml(info.nextName || 'পরবর্তী Trophy') + '</strong><small>' + earnedThisPeriod.toLocaleString() + ' / ' + required.toLocaleString() + ' ' + rpLabel + '</small></span><span class="mat-rank-rp"><i class="fa-solid fa-star"></i> ' + earnedThisPeriod.toLocaleString() + ' RP</span></div>' +
      '<div class="mat-rank-track" role="progressbar" aria-label="Trophy rank progress" aria-valuemin="0" aria-valuemax="' + required + '" aria-valuenow="' + Math.min(earnedThisPeriod, required) + '"><span style="width:' + pct + '%;background:' + (safe ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#f59e0b,#fb923c)') + '"></span><i class="mat-safe-zone-marker" style="left:' + markerPct + '%" aria-hidden="true"></i></div>' +
      '<div class="mat-rank-foot"><span>0 RP</span><span>' + required.toLocaleString() + ' RP</span></div>' +
      '<div class="mat-safe-zone-caption ' + (safe ? '' : 'at-risk') + '"><i class="fa-solid ' + (safe ? 'fa-shield-check' : 'fa-triangle-exclamation') + '"></i> ' + statusText + '</div>';
  }
  function updateTopControls(me) {
    var rp = document.getElementById('med-top-rp');
    if (rp) rp.textContent = String(Math.max(0, Number(me && me.rankPoints) || Number(currentProfile && currentProfile.rankPoints) || 0)) + ' RP';
    var progress = {};
    try { progress = typeof app.getAccountProgress === 'function' ? app.getAccountProgress() : {}; } catch (_) {}
    var streakButton = document.querySelector('[data-med-action="streak"]');
    if (streakButton) {
      var streak = Math.max(0, Number(progress.streak) || 0);
      var streakCount = document.getElementById('med-top-streak-count');
      if (streakCount) streakCount.textContent = String(streak);
      streakButton.title = 'Daily study streak: ' + streak + ' day(s)';
      streakButton.setAttribute('aria-label', 'Daily study streak: ' + streak + ' day(s)');
    }
    var dashboard = document.getElementById('view-home');
    var controls = document.getElementById('med-rank-controls');
    if (controls) controls.style.display = dashboard && !dashboard.classList.contains('hidden') ? 'flex' : 'none';
    var infoRp = document.getElementById('med-top-rp');
    if (infoRp) infoRp.textContent = String(Math.max(0, Number(me && me.totalRP) || Number(currentProfile && currentProfile.totalRP) || Number(me && me.rankPoints) || 0)) + ' RP';
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
  function safeZoneThresholdFor(row) {
    var vault = window.MedAchievementVaultTrophies;
    var info = vault && typeof vault.getRankInfoForName === 'function' ? vault.getRankInfoForName(row && row.rank) : null;
    if (!info && vault && typeof vault.getRankInfoForPoints === 'function') info = vault.getRankInfoForPoints(row && (row.totalRP || row.rankPoints) || 0);
    if (info && info.atMax) return 0;
    return Math.max(0, Number(info && info.safeZoneRP) || 0);
  }
  function isInWeeklySafeZone(row) {
    if (String(row && row.rank || '').toLowerCase() === 'immortal') return true;
    var threshold = safeZoneThresholdFor(row);
    return Math.max(0, Number(row && row.weeklyRankPoints) || 0) >= threshold;
  }
  function renderRows(rows) {
    var all = normalizeRows(rows || []);
    if (selectedPeriod === 'friends') {
      if (window.MedStudentFriends && typeof window.MedStudentFriends.getFriendIds === 'function') {
        var friendIds = new Set(window.MedStudentFriends.getFriendIds().map(String));
        all = all.filter(function (row) { return row.isMine || friendIds.has(String(row.userId)); });
      } else {
        // Never expose the full public leaderboard as a fallback Friends list.
        all = all.filter(function (row) { return row.isMine; });
      }
    }
    var me = getMe(all);
    if (!selectedRank || !me) selectedRank = (me && me.rank) || selectedRank || RANKS[0];
    var displayRows = all.slice();
    var safeRows = [], riskRows = [];
    if (selectedPeriod === 'weekly') {
      safeRows = displayRows.filter(isInWeeklySafeZone);
      riskRows = displayRows.filter(function (row) { return !isInWeeklySafeZone(row); });
      displayRows = safeRows.concat(riskRows);
    }
    var body = document.getElementById('leaderboard-body');
    var podium = document.getElementById('leaderboard-podium');
    var mePanel = document.getElementById('leaderboard-me');
    if (!body) return;
    if (podium) podium.innerHTML = '';
    body.innerHTML = '';
    if (mePanel) { mePanel.innerHTML = ''; mePanel.classList.add('hidden'); }
    if (displayRows.length) {
      if (podium) {
        podium.innerHTML = displayRows.slice(0, 3).map(function (row, index) {
          return '<article class="podium-card podium-' + (index + 1) + '" data-med-player="' + escapeHtml(row.userId) + '" data-total-rp="' + Number(row.totalRP || row.rankPoints || 0) + '" data-rank="' + escapeHtml(row.rank) + '" tabindex="0" role="button" aria-label="Open ' + escapeHtml(row.name) + ' student profile">' +
            '<div class="podium-place-label">#' + (index + 1) + '</div><div class="podium-avatar">' + avatarMarkup(row) + '</div>' +
            '<strong>' + escapeHtml(row.name || 'Medical Student') + '</strong><span>' + Number(row.boardPoints || 0).toLocaleString() + ' ' + (selectedPeriod === 'weekly' ? 'Weekly RP' : 'Total RP') + '</span>' +
            '<small>' + escapeHtml(row.rank) + ' · Lv.' + Number(row.level || 1) + '</small></article>';
        }).join('');
      }
      var safeDividerInserted = false;
      displayRows.forEach(function (row, index) {
        if (selectedPeriod === 'weekly' && !safeDividerInserted && index === safeRows.length && riskRows.length) {
          var divider = document.createElement('tr');
          divider.className = 'safe-zone-divider';
          divider.innerHTML = '<td colspan="5"><i class="fa-solid fa-shield-halved"></i> SAFE ZONE BOUNDARY <span class="sr-only">Students below this line have not reached the required weekly RP threshold.</span></td>';
          body.appendChild(divider);
          safeDividerInserted = true;
        }
        var tr = document.createElement('tr');
        tr.className = 'leader-row' + (row.isMine ? ' is-me' : '') + (selectedPeriod === 'weekly' && !isInWeeklySafeZone(row) ? ' is-below-safe-zone' : '');
        tr.dataset.medPlayer = String(row.userId || '');
        tr.dataset.totalRp = String(Number(row.totalRP || row.rankPoints || 0));
        tr.dataset.rankPoints = String(Number(row.rankPoints || 0));
        tr.dataset.weeklyRp = String(Number(row.weeklyRankPoints || 0));
        tr.dataset.rank = String(row.rank || '');
        tr.dataset.uid = String(row.userId || '');
        tr.tabIndex = 0;
        tr.setAttribute('role', 'button');
        tr.setAttribute('aria-label', 'Open ' + row.name + ' student profile');
        var safeThreshold = safeZoneThresholdFor(row);
        var weeklyRP = Math.max(0, Number(row.weeklyRankPoints) || 0);
        var safeStatus = selectedPeriod !== 'weekly' ? '' : isInWeeklySafeZone(row)
          ? '<small class="leader-safe-status"><i class="fa-solid fa-shield-check"></i> Safe Zone</small>'
          : '<small class="leader-risk-status"><i class="fa-solid fa-arrow-trend-up"></i> আরও ' + Math.max(0, safeThreshold - weeklyRP).toLocaleString() + ' RP প্রয়োজন</small>';
        tr.innerHTML = '<td class="py-4 px-3"><div class="leader-person"><span class="leader-avatar">' + avatarMarkup(row) + '</span><span><b>' + escapeHtml(row.name || 'Medical Student') + '</b>' + (row.isMine ? '<em>YOU</em>' : '') + '</span></div></td>' +
          '<td class="py-4 px-3 leader-college">' + escapeHtml(row.college || '—') + '</td>' +
          '<td class="py-4 px-3 leader-batch">' + escapeHtml(row.batch || '—') + '</td>' +
          '<td class="py-4 px-3 leader-xp">' + Number(row.xp || 0).toLocaleString() + ' XP</td>' +
          '<td class="leader-rank-points py-4 px-3"><strong class="leader-rank-number">#' + (index + 1) + '</strong><small class="leader-points-label">' + Number(row.boardPoints || 0).toLocaleString() + ' ' + (selectedPeriod === 'weekly' ? 'Weekly RP' : 'Lifetime RP') + '</small>' + safeStatus + '</td>';
        body.appendChild(tr);
      });
      if (mePanel && me) {
        var ownIndex = displayRows.findIndex(function (row) { return row.isMine || String(row.userId) === String(me.userId); });
        mePanel.classList.remove('hidden');
        mePanel.innerHTML = '<div><span>Your Position</span><strong>#' + (ownIndex >= 0 ? ownIndex + 1 : '—') + '</strong></div><div><b>' + escapeHtml(me.name) + '</b><small>' + Number(me.boardPoints || 0).toLocaleString() + ' ' + (selectedPeriod === 'weekly' ? 'Weekly RP' : 'Lifetime RP') + ' · ' + escapeHtml(me.rank) + '</small></div>';
      }
    } else {
      var emptyText = selectedPeriod === 'friends'
        ? 'আপনার Friends leaderboard এখন খালি। অন্য student-এর profile খুলে Friend Request পাঠান।'
        : 'এই leaderboard-এ এখনো দেখানোর মতো student নেই।';
      body.innerHTML = '<tr><td colspan="5" class="py-10 text-center text-sm text-gray-500">' + emptyText + '</td></tr>';
    }
    renderRankRail(all);
    updateTopControls(me);
    if (window.MedAchievementVaultTrophies && typeof window.MedAchievementVaultTrophies.paint === 'function') {
      window.MedAchievementVaultTrophies.paint(displayRows);
    }
    if (window.MedStudentFriends && typeof window.MedStudentFriends.renderRequestPanel === 'function') {
      window.MedStudentFriends.renderRequestPanel(selectedPeriod === 'friends');
    }
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
      note.classList.toggle('hidden', selectedPeriod === 'all-time');
      note.textContent = selectedPeriod === 'weekly'
        ? 'Weekly RP অনুযায়ী ranking। Safe Zone line-এর নিচে থাকলে কত RP প্রয়োজন তা দেখানো হবে।'
        : selectedPeriod === 'friends'
          ? 'শুধু accepted friends-দের ranking। Friend request আপনার student profile থেকেই পরিচালনা করুন।'
          : '';
    }
    var friendsPanel = document.getElementById('leaderboard-friends-panel');
    if (friendsPanel) friendsPanel.classList.toggle('hidden', selectedPeriod !== 'friends');
  }
  function cachedRowsForDisplay() {
    var cached = getCache();
    return cached.length ? cached : [];
  }
  async function loadLeaderboard(silent) {
    ensureUI();
    selectedPeriod = readPeriod();
    var leaderboardView = document.getElementById('view-leaderboard');
    if (leaderboardView && !leaderboardView.classList.contains('hidden') && !hasRequiredLeaderboardProfile()) {
      showLeaderboardProfileGate();
      return;
    }
    if (selectedPeriod === 'friends' && window.MedStudentFriends && typeof window.MedStudentFriends.loadConnections === 'function') {
      try { await window.MedStudentFriends.loadConnections(); }
      catch (friendError) { setStatus('Friends list load হয়নি। Firebase permission/status পরীক্ষা করুন।', true); }
    }
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
      var apiPeriod = selectedPeriod === 'weekly' ? 'weekly' : 'all-time';
      var leaderboardPayload = { action: 'leaderboard', period: apiPeriod };
      if (selectedPeriod === 'friends') {
        var friendIds = window.MedStudentFriends && typeof window.MedStudentFriends.getFriendIds === 'function'
          ? window.MedStudentFriends.getFriendIds().map(String) : [];
        var myId = currentUserId();
        if (myId) friendIds.push(String(myId));
        leaderboardPayload.userIds = Array.from(new Set(friendIds)).slice(0, 500);
      }
      var response = await request(leaderboardPayload, { method: 'GET' });
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
    if (window.MedStudentProfile && typeof window.MedStudentProfile.open === 'function') {
      window.MedStudentProfile.open(row);
      return;
    }
    var view = document.getElementById('view-student-profile');
    if (view && typeof app.showView === 'function') {
      app.__pendingStudentProfile = row;
      app.showView('student-profile');
    }
  }
  function leaderboardProfileFields() {
    var local = app.profile || {};
    var remote = currentProfile || {};
    return {
      name: safeText(local.name || remote.name || profileName(), 80),
      college: safeText(local.college || remote.college || '', 120),
      batch: safeText(local.batch || remote.batch || local.class || '', 40)
    };
  }
  function hasRequiredLeaderboardProfile() {
    var profile = leaderboardProfileFields();
    return profile.name.length >= 2 && !!profile.college && !!profile.batch;
  }
  function showLeaderboardProfileGate() {
    var fields = leaderboardProfileFields();
    var accountView = document.getElementById('view-account');
    if (accountView && accountView.classList.contains('hidden') && typeof app.showView === 'function') app.showView('account');
    var editor = document.getElementById('medical-profile-editor');
    var form = document.getElementById('medical-profile-form');
    if (!editor || !form) return false;
    var notice = document.getElementById('leaderboard-profile-gate-message');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'leaderboard-profile-gate-message';
      notice.className = 'mat-profile-gate-notice';
      notice.setAttribute('role', 'alert');
      notice.innerHTML = '<i class="fa-solid fa-user-check" aria-hidden="true"></i><span><strong>Leaderboard খুলতে Personal Information পূরণ করুন</strong><small>আপনার নাম, কলেজ এবং ব্যাচ লিখে Save Profile করুন।</small></span>';
      form.insertAdjacentElement('beforebegin', notice);
    }
    notice.hidden = false;
    var nameInput = document.getElementById('medical-profile-name');
    var collegeInput = document.getElementById('medical-profile-college');
    var batchInput = document.getElementById('medical-profile-batch');
    var avatarInput = document.getElementById('medical-profile-avatar');
    if (nameInput && !nameInput.value) nameInput.value = fields.name;
    if (collegeInput && !collegeInput.value) collegeInput.value = fields.college;
    if (batchInput && !batchInput.value) batchInput.value = fields.batch;
    if (avatarInput && !avatarInput.value) avatarInput.value = safeText(app.profile && app.profile.avatar || currentProfile && currentProfile.avatar || '', 500);
    setTimeout(function () {
      editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var firstMissing = !fields.name || fields.name.length < 2 ? nameInput : !fields.college ? collegeInput : batchInput;
      if (firstMissing) firstMissing.focus({ preventScroll: true });
    }, 50);
    return false;
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
        var requestedPeriod = periodButton.dataset.leaderboardPeriod;
        selectedPeriod = requestedPeriod === 'weekly' || requestedPeriod === 'friends' ? requestedPeriod : 'all-time';
        try { localStorage.setItem(PERIOD_KEY, selectedPeriod); } catch (_) {}
        updatePeriodTabs();
        await loadLeaderboard(true);
        return;
      }
      var rankButton = event.target.closest && event.target.closest('[data-med-rank]');
      if (rankButton) {
        selectedRank = rankButton.dataset.medRank;
        var vaultRanks = window.MedAchievementVaultTrophies && typeof window.MedAchievementVaultTrophies.getRanks === 'function'
          ? window.MedAchievementVaultTrophies.getRanks().map(function (item) { return item.name; }) : RANKS;
        if (vaultRanks.indexOf(selectedRank) < 0) return;
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
      if (player) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showPublicProfile(player.dataset.medPlayer);
        return;
      }
      var close = event.target.closest && event.target.closest('[data-med-close]');
      if (close) { closeOverlay(close.closest('.mat-overlay')); return; }
      if (event.target.classList && event.target.classList.contains('mat-overlay')) closeOverlay(event.target);
    }, true);
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      var player = event.target.closest && event.target.closest('[data-med-player]');
      if (player) { event.preventDefault(); event.stopImmediatePropagation(); showPublicProfile(player.dataset.medPlayer); }
    });
    var profileForm = document.getElementById('medical-profile-form');
    if (profileForm) {
      profileForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        var status = document.getElementById('medical-profile-save-status');
        var button = document.getElementById('medical-profile-save');
        var submittedName = safeText((document.getElementById('medical-profile-name') || {}).value || '', 80);
        var submittedCollege = safeText((document.getElementById('medical-profile-college') || {}).value || '', 120);
        var submittedBatch = safeText((document.getElementById('medical-profile-batch') || {}).value || '', 40);
        if (submittedName.length < 2 || !submittedCollege || !submittedBatch) {
          if (status) status.textContent = 'Leaderboard খুলতে Name, College ও Batch—তিনটিই পূরণ করুন।';
          var missingField = submittedName.length < 2 ? document.getElementById('medical-profile-name') : !submittedCollege ? document.getElementById('medical-profile-college') : document.getElementById('medical-profile-batch');
          if (missingField) missingField.focus();
          return;
        }
        if (button) button.disabled = true;
        if (status) status.textContent = 'Profile save হচ্ছে…';
        try {
          var updated = await updateProfile({
            name: submittedName,
            college: submittedCollege,
            batch: submittedBatch,
            avatar: (document.getElementById('medical-profile-avatar') || {}).value || ''
          });
          if (app.authUser && typeof app.syncFirebaseStudentProfile === 'function') {
            await app.syncFirebaseStudentProfile({
              name: updated.name, college: updated.college, batch: updated.batch, avatar: updated.avatar
            });
          }
          var gateNotice = document.getElementById('leaderboard-profile-gate-message');
          if (gateNotice) gateNotice.hidden = true;
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

  var originalShowViewWithLeaderboardGate = app.showView.bind(app);
  app.showView = function (viewName, force) {
    if (viewName === 'leaderboard' && !hasRequiredLeaderboardProfile()) {
      showLeaderboardProfileGate();
      return false;
    }
    var result = originalShowViewWithLeaderboardGate(viewName, force);
    var controls = document.getElementById('med-rank-controls');
    if (controls) controls.style.display = viewName === 'home' ? 'flex' : 'none';
    return result;
  };
  app.openLeaderboard = function () {
    if (!hasRequiredLeaderboardProfile()) {
      showLeaderboardProfileGate();
      return false;
    }
    app.showView('leaderboard');
    loadLeaderboard(true);
    return true;
  };
  ensureUI();
  updateTopControls(currentProfile || app.profile || {});
  document.addEventListener('student-progress-updated', function () {
    updateTopControls(currentProfile || app.profile || {});
  });
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