/* Medical Admission Tracker — Firebase + dedicated Google Sheets API adapter.
 * Medical profiles, exam rewards, ranks and leaderboard use this site's own backend.
 */
(function () {
  'use strict';
  var app = window.app;
  if (!app || app.__medicalSheetsAdapter) return;
  app.__medicalSheetsAdapter = true;

  var DEFAULT_STUDENT_AVATAR = 'https://i.pravatar.cc/120?img=1';
  var STUDENT_AVATAR_CHOICES = Array.from({length:24}, function (_, i) { return 'https://i.pravatar.cc/120?img=' + (i + 1); });
  function defaultStudentAvatarForUser(userId) {
    var key = String(userId || 'guest'); var hash = 2166136261;
    for (var i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
    return STUDENT_AVATAR_CHOICES[(hash >>> 0) % STUDENT_AVATAR_CHOICES.length];
  }
  function avatarHasDefaultMarker(value) { return /#mat-default-avatar$/i.test(String(value || '')); }
  function avatarHasCustomMarker(value) { return /#mat-custom-avatar$/i.test(String(value || '')); }
  function stripAvatarDefaultMarker(value) { return String(value || '').replace(/#mat-(?:default|custom)-avatar$/i, ''); }
  function avatarIdForRow(row) { return String(row && (row.userId || row.uid || row.playerId || row.id || row.name) || 'guest'); }
  var friendDirectoryRows = [];
  var friendDirectoryLoadPromise = null;
  var friendDirectorySearchSequence = 0;
  var friendDirectorySearchTimer = null;
  var RANKS = [
    'Bronze V','Bronze IV','Bronze III','Bronze II','Bronze I',
    'Silver V','Silver IV','Silver III','Silver II','Silver I',
    'Gold V','Gold IV','Gold III','Gold II','Gold I',
    'Platinum V','Platinum IV','Platinum III','Platinum II','Platinum I',
    'Emerald V','Emerald IV','Emerald III','Emerald II','Emerald I',
    'Diamond V','Diamond IV','Diamond III','Diamond II','Diamond I',
    'Master V','Master IV','Master III','Master II','Master I',
    'Grandmaster V','Grandmaster IV','Grandmaster III','Grandmaster II','Grandmaster I',
    'Legend V','Legend IV','Legend III','Legend II','Legend I',
    'Mythic V','Mythic IV','Mythic III','Mythic II','Mythic I',
    'Immortal V','Immortal IV','Immortal III','Immortal II','Immortal I'
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
  var selectedRank = '';
  var rawRows = [];
  var currentProfile = null;
  var identityPromise = null;
  var loadSequence = 0;
  var suppressRankClickUntil = 0;
  var rankSelectionTouched = false;

  function normalizePeriod(value) {
    return value === 'all-time' || value === 'weekly' || value === 'friends' ? value : '';
  }
  function readPeriod() {
    // Keep this browser tab's selected period across a full page refresh.
    try {
      var sessionSaved = normalizePeriod(sessionStorage.getItem(PERIOD_KEY));
      if (sessionSaved) return sessionSaved;
    } catch (_) {}
    try {
      var saved = normalizePeriod(localStorage.getItem(PERIOD_KEY));
      if (saved) {
        try { sessionStorage.setItem(PERIOD_KEY, saved); } catch (_) {}
        return saved;
      }
    } catch (_) {}
    return 'all-time';
  }
  function savePeriod(value) {
    var period = normalizePeriod(value) || 'all-time';
    try { sessionStorage.setItem(PERIOD_KEY, period); } catch (_) {}
    try { localStorage.setItem(PERIOD_KEY, period); } catch (_) {}
    return period;
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
      if (Array.isArray(payload.includeUserIds) && payload.includeUserIds.length) {
        params.set('includeIds', Array.from(new Set(payload.includeUserIds.map(function (id) { return String(id || '').trim(); }).filter(Boolean)).values()).join(','));
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
  function cacheKeyForPeriod(period) {
    if (period === 'weekly') return CACHE_KEY + '_weekly';
    if (period === 'friends') return CACHE_KEY + '_friends';
    return CACHE_KEY + '_all-time';
  }
  function getCache(period) {
    var key = cacheKeyForPeriod(period || 'all-time');
    var rows = parseJson(localStorage.getItem(key), []);
    return Array.isArray(rows) ? rows.filter(function (row) { return row && !row.isDemo; }) : [];
  }
  function saveCache(rows, period) {
    var list = Array.isArray(rows) ? rows.filter(function (row) { return row && !row.isDemo; }) : [];
    try { localStorage.setItem(cacheKeyForPeriod(period || 'all-time'), JSON.stringify(list)); } catch (_) {}
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
    if (value.indexOf('emerald') === 0) return 'emerald';
    if (value.indexOf('diamond') === 0) return 'diamond';
    if (value.indexOf('immortal') === 0) return 'immortal';
    if (value.indexOf('grandmaster') === 0) return 'grandmaster';
    if (value.indexOf('master') === 0) return 'master';
    if (value.indexOf('mythic') === 0) return 'mythic';
    if (value.indexOf('legend') === 0) return 'legend';
    return 'bronze';
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
    var incomingUserId = String(user.userId || user.uid || user.playerId || '');
    var previousUserId = String(profile.userId || profile.uid || '');
    var previousAvatar = previousUserId && incomingUserId && previousUserId === incomingUserId
      ? safeText(profile.avatar || '', 20000) : '';
    profile.uid = user.uid || user.userId || user.playerId || profile.uid || '';
    profile.userId = user.userId || user.uid || '';
    profile.name = safeText(user.name || user.username || profile.name || 'Guest Student', 80);
    profile.displayName = profile.name;
    profile.email = user.email || profile.email || (app.authUser && app.authUser.email) || '';
    profile.college = safeText(user.college != null ? user.college : profile.college, 120);
    profile.batch = safeText(user.batch != null ? user.batch : (profile.batch || profile.class || ''), 40);
    var incomingAvatar = safeText(user.avatar != null ? user.avatar : '', 20000);
    // Some older leaderboard deployments omit Avatar in their row payload.
    // Do not erase this account's already-confirmed avatar when such a row is applied.
    profile.avatar = incomingAvatar || previousAvatar;
    profile.accountType = user.accountType || (app.authUser ? 'REGISTERED' : 'GUEST');
    profile.xp = Math.max(0, Number(user.xp) || 0);
    profile.pb = Math.max(0, Number(user.pb != null ? user.pb : user.pendingPB) || 0);
    profile.pendingPB = profile.pb;
    profile.rankPoints = Math.max(0, Number(user.rankPoints != null ? user.rankPoints : user.rp) || 0);
    profile.totalRP = Math.max(0, Number(user.totalRP != null ? user.totalRP : profile.rankPoints) || 0);
    profile.level = Math.max(1, Number(user.level) || 1);
    // Preserve queued local activity until the server acknowledges it; otherwise use
    // the server's latest current streak instead of reviving a stale pre-gap value.
    try {
      var localProgressKey = 'med_account_progress_v1_' + ((app.authUser && app.authUser.uid) || 'guest');
      var localStreakProgress = parseJson(localStorage.getItem(localProgressKey), {}) || {};
      var localStreak = Math.max(0, Number(localStreakProgress.streak) || 0);
      var serverStreak = Math.max(0, Number(user.streak) || 0);
      var localPendingStreak = !!localStreakProgress.streakSyncPending;
      var serverActivityDates = Array.isArray(user.streakActivityDates) ? user.streakActivityDates : [];
      var serverHasStreakState = !!user.lastStreakActivityDate || serverActivityDates.length > 0 ||
        Number(user.highestStreak || 0) > 0 || Number(user.streak || 0) > 0;
      profile.streak = localPendingStreak ? localStreak : (serverHasStreakState ? serverStreak : Math.max(serverStreak, localStreak));
      profile.highestStreak = Math.max(
        Number(localStreakProgress.highestStreak || localStreakProgress.maxStreak) || 0,
        Number(user.highestStreak) || 0, profile.streak
      );
      profile.lastStreakActivityDate = localPendingStreak && String(localStreakProgress.lastStreakActivityDate || '') >= String(user.lastStreakActivityDate || '')
        ? String(localStreakProgress.lastStreakActivityDate || '')
        : String(user.lastStreakActivityDate || localStreakProgress.lastStreakActivityDate || '');
      profile.streakActivityDates = Array.from(new Set(
        (Array.isArray(localStreakProgress.streakActivityDates) ? localStreakProgress.streakActivityDates : [])
          .concat(serverActivityDates)
          .filter(function (date) { return /^\d{4}-\d{2}-\d{2}$/.test(String(date)); })
      )).sort().slice(-366);
    } catch (_) {
      if (user.streak != null && Number.isFinite(Number(user.streak))) profile.streak = Math.max(0, Number(user.streak) || 0);
    }
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
      // Local pending activity stays authoritative until a successful sync.
      // After sync, take the server current value so an expired streak remains reset.
      var hasServerStreakState = !!profile.lastStreakActivityDate ||
        (Array.isArray(profile.streakActivityDates) && profile.streakActivityDates.length > 0) ||
        Number(profile.highestStreak || 0) > 0 || Number(profile.streak || 0) > 0;
      localProgress.streak = localProgress.streakSyncPending
        ? Math.max(0, Number(localProgress.streak) || 0)
        : (hasServerStreakState ? Math.max(0, Number(profile.streak) || 0) : Math.max(0, Number(localProgress.streak) || 0, Number(profile.streak) || 0));
      localProgress.highestStreak = Math.max(
        Number(localProgress.highestStreak || localProgress.maxStreak) || 0,
        Number(profile.highestStreak) || 0,
        localProgress.streak
      );
      localProgress.lastStreakActivityDate = String(profile.lastStreakActivityDate || localProgress.lastStreakActivityDate || '');
      localProgress.streakActivityDates = Array.from(new Set(
        (Array.isArray(localProgress.streakActivityDates) ? localProgress.streakActivityDates : [])
          .concat(Array.isArray(profile.streakActivityDates) ? profile.streakActivityDates : [])
          .filter(function (date) { return /^\d{4}-\d{2}-\d{2}$/.test(String(date)); })
      )).sort().slice(-366);
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
      avatar: safeText(fields.avatar || existing.avatar || '', 20000)
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
  async function getServerProgress() {
    await syncIdentity();
    var creds = await credentialsForCurrentUser();
    var response = await request(Object.assign({ action: 'progress' }, creds));
    if (response.user) applyProfile(response.user);
    return response;
  }
  async function convertPB(amount, kind) {
    var points = Number(amount);
    var target = String(kind || '').toLowerCase();
    if (!Number.isSafeInteger(points) || points < 1) throw new Error('একটি পূর্ণসংখ্যা PB amount লিখুন।');
    if (target !== 'xp' && target !== 'rp') throw new Error('XP অথবা RP conversion বেছে নিন।');
    await syncIdentity();
    var creds = await credentialsForCurrentUser();
    var response = await request(Object.assign({ action: 'convertPB', amount: points, kind: target }, creds));
    if (response.user) applyProfile(response.user);
    // Refresh leaderboard after the server commits the canonical wallet conversion.
    try { await loadLeaderboard(true); } catch (_) {}
    return {
      ok: true,
      convertedPB: Number(response.convertedPB || 0),
      earnedXP: Number(response.earnedXP || 0),
      earnedRP: Number(response.earnedRP || 0),
      expiredPBToRP: Number(response.expiredPBToRP || 0),
      user: response.user || currentProfile
    };
  }
  async function syncDailyStreak() {
    if (!navigator.onLine || typeof app.getAccountProgress !== 'function') return false;
    var progress = app.getAccountProgress() || {};
    if (!progress.streakSyncPending) return true;
    try {
      await syncIdentity();
      var creds = await credentialsForCurrentUser();
      var response = await request(Object.assign({
        action: 'syncStreak',
        streak: Math.max(0, Number(progress.streak) || 0),
        lastStreakActivityDate: String(progress.lastStreakActivityDate || ''),
        highestStreak: Math.max(0, Number(progress.highestStreak || progress.maxStreak) || 0),
        streakActivityDates: Array.isArray(progress.streakActivityDates) ? progress.streakActivityDates.slice(-366) : []
      }, creds));
      if (response.user) applyProfile(response.user);
      var key = 'med_account_progress_v1_' + ((app.authUser && app.authUser.uid) || 'guest');
      var local = parseJson(localStorage.getItem(key), {}) || {};
      // Only clear the pending marker when the backend explicitly confirms success.
      if (response.success === true || response.synced === true || response.streakSynced === true) {
        // Server current streak may correctly reset after a missed day; Highest Streak never decreases.
        if (response.streak != null) local.streak = Math.max(0, Number(response.streak) || 0);
        local.highestStreak = Math.max(Number(local.highestStreak || local.maxStreak) || 0, Number(local.streak) || 0, Number(response.highestStreak) || 0);
        local.lastStreakActivityDate = String(response.lastStreakActivityDate || (response.user && response.user.lastStreakActivityDate) || local.lastStreakActivityDate || '');
        local.streakActivityDates = Array.from(new Set(
          (Array.isArray(local.streakActivityDates) ? local.streakActivityDates : [])
            .concat(Array.isArray(response.streakActivityDates) ? response.streakActivityDates : [])
            .filter(function (date) { return /^\d{4}-\d{2}-\d{2}$/.test(String(date)); })
        )).sort().slice(-366);
        local.streakSyncPending = false;
        localStorage.setItem(key, JSON.stringify(local));
        if (app.profile) {
          app.profile.streak = local.streak;
          app.profile.highestStreak = local.highestStreak;
          app.profile.lastStreakActivityDate = local.lastStreakActivityDate;
          app.profile.streakActivityDates = local.streakActivityDates.slice();
        }
        updateTopControls(currentProfile || app.profile || {});
        return true;
      }
      return false;
    } catch (_) {
      // Keep the local streak and pending marker for the next reconnect.
      return false;
    }
  }

  async function updateProfile(fields) {
    fields = fields || {};
    var allowed = {};
    ['name','college','batch','avatar'].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) allowed[key] = safeText(fields[key], key === 'avatar' ? 20000 : (key === 'college' ? 120 : (key === 'batch' ? 40 : 80)));
    });
    if (Object.prototype.hasOwnProperty.call(allowed, 'name') && allowed.name.length < 2) {
      throw new Error('নাম কমপক্ষে ২ অক্ষরের হতে হবে।');
    }
    var creds = await credentialsForCurrentUser();
    var response = await request(Object.assign({ action: 'updateProfile' }, creds, allowed));
    if (!response.user) throw new Error('Updated profile was not returned by the API.');
    return applyProfile(response.user);
  }

  // Reuse the exact avatar selected on Student Profile for the signed-in student.
  // The leaderboard API may omit avatar, so its blank value must not replace the profile image.
  function profileAvatarForUser(id) {
    if (!id || String(id) !== String(currentUserId())) return '';
    var uid = (app.authUser && app.authUser.uid) || String(id);
    try {
      var selected = localStorage.getItem('med_profile_avatar_v1_' + uid);
      if (selected) return safeText(selected, 20000);
    } catch (_) {}
    try {
      var storedProfile = parseJson(localStorage.getItem('med_sheet_profile_v1_' + accountKey()), {});
      if (storedProfile && storedProfile.avatar) return safeText(storedProfile.avatar, 20000);
    } catch (_) {}
    var candidates = [(app.profile && app.profile.avatar), (currentProfile && currentProfile.avatar)];
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i]) return safeText(candidates[i], 20000);
    }
    return '';
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
      // Server-owned profile avatar is authoritative for every viewer; local storage is fallback only.
      avatar: safeText(raw.avatar || raw.Avatar || profileAvatarForUser(id) || '', 20000),
      accountType: safeText(raw.accountType || raw.AccountType || '', 20),
      xp: Math.max(0, Number(raw.xp != null ? raw.xp : raw.XP) || 0),
      level: Math.max(1, Number(raw.level != null ? raw.level : raw.Level) || 1),
      rank: rank, rankPoints: currentRP, totalRP: totalRP,
      weeklyRankPoints: weeklyRP, boardPoints: boardPoints,
      quizzes: Math.max(0, Number(raw.matches != null ? raw.matches : raw.quizzes || 0)),
      accuracy: Math.max(0, Number(raw.accuracy) || 0),
      streak: Math.max(0, Number(raw.streak) || 0),
      highestStreak: Math.max(Number(raw.highestStreak || raw.HighestStreak) || 0, Number(raw.streak) || 0),
      lastStreakActivityDate: safeText(raw.lastStreakActivityDate || raw.LastStreakActivityDate || '', 10),
      streakActivityDates: Array.isArray(raw.streakActivityDates)
        ? Array.from(new Set(raw.streakActivityDates.map(String).filter(function (date) { return /^\d{4}-\d{2}-\d{2}$/.test(date); }))).sort().slice(-366)
        : [],
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
      '.mat-rank-rail{display:flex;align-items:center;width:100%;max-width:none;box-sizing:border-box;margin:0;gap:8px;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;scrollbar-width:none;-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y;cursor:grab;user-select:none;padding:9px max(0px,calc((100% - 76px)/2)) 12px;scroll-snap-type:x mandatory}.mat-rank-rail.is-mouse-dragging{cursor:grabbing;scroll-snap-type:none}.mat-rank-rail::-webkit-scrollbar{display:none}' +
      '.mat-rank-tier{flex:0 0 76px;min-width:76px;min-height:88px;border:1px solid rgba(148,163,184,.22);border-radius:15px;padding:8px 5px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;opacity:.67;transform:scale(.92);transition:transform .18s ease,opacity .18s ease,box-shadow .18s ease,border-color .18s ease;scroll-snap-align:center;color:#f8fafc;background:rgba(15,23,42,.72);cursor:pointer;font-size:11px;font-weight:850;text-align:center}.mat-rank-tier.is-active{flex-basis:118px;min-width:118px;min-height:108px;opacity:1;transform:scale(1);border-color:rgba(255,255,255,.6);box-shadow:0 0 0 2px rgba(255,255,255,.08),0 12px 26px rgba(0,0,0,.22)}.mat-rank-tier i{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;font-size:18px;background:rgba(255,255,255,.1)}.mat-rank-tier.is-active i{width:43px;height:43px;font-size:22px}.mat-rank-tier small{font-size:8px;letter-spacing:.07em;opacity:.8}.mat-rank-tier.bronze i{color:#f1b47b;background:linear-gradient(145deg,#6e442c,#bd804f)}.mat-rank-tier.silver i{color:#e2e8f0;background:linear-gradient(145deg,#475569,#94a3b8)}.mat-rank-tier.gold i{color:#fff1aa;background:linear-gradient(145deg,#8b5e0b,#eab308)}.mat-rank-tier.platinum i{color:#ddd6fe;background:linear-gradient(145deg,#6d28d9,#a78bfa)}.mat-rank-tier.diamond i{color:#cffafe;background:linear-gradient(145deg,#0e7490,#67e8f9)}.mat-rank-tier.master i,.mat-rank-tier.grandmaster i,.mat-rank-tier.legend i,.mat-rank-tier.immortal i{color:#fde68a;background:linear-gradient(145deg,#7f1d1d,#f59e0b)}' +
      '.mat-rank-progress{padding:8px 9px 0}.mat-rank-progress-line{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.mat-rank-progress-line>span:first-child{display:flex;flex-direction:column;gap:3px}.mat-rank-progress-line strong{font-size:13px}.mat-rank-progress-line small,.mat-rank-foot{font-size:11px;color:#cbd5e1}.mat-rank-rp{font-weight:950;color:#fde68a;white-space:nowrap}.mat-rank-track{position:relative;height:11px;border-radius:99px;background:rgba(148,163,184,.25);margin:14px 10px 8px}.mat-rank-track>span{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,#a78bfa,#fbbf24);transition:width .35s ease}.mat-rank-track>i{position:absolute;top:50%;transform:translate(-50%,-50%);display:grid;place-items:center;width:23px;height:23px;border-radius:50%;background:#fef3c7;color:#a16207;border:2px solid #fff7ed;box-shadow:0 2px 8px rgba(0,0,0,.3)}.mat-rank-foot{display:flex;justify-content:space-between;gap:8px}.mat-rank-locked{display:flex;gap:10px;align-items:center;border:1px solid rgba(148,163,184,.25);border-radius:14px;padding:12px;background:rgba(15,23,42,.46);font-size:12px;line-height:1.6}' +
      '#med-rank-controls{position:fixed;z-index:9998;top:13px;right:16px;display:flex;align-items:center;justify-content:flex-end;gap:0;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;backdrop-filter:none;color:#f8fafc;pointer-events:none}#med-rank-controls .mat-top-icon{pointer-events:auto}body.exam-active #med-rank-controls{display:none}.mat-top-icon{position:relative;display:grid;place-items:center;width:39px;height:39px;border-radius:11px;border:1px solid rgba(148,163,184,.18);background:rgba(255,255,255,.05);color:#e2e8f0;font-size:16px;cursor:pointer;transition:transform .18s ease,border-color .18s ease,background .18s ease,box-shadow .18s ease}.mat-top-icon:hover{transform:translateY(-1px);border-color:rgba(110,231,183,.55);background:rgba(16,185,129,.12);box-shadow:0 7px 18px rgba(16,185,129,.12)}.mat-top-icon:first-child{color:#fb923c}.mat-streak-control{display:flex;align-items:center;justify-content:center;gap:6px;width:auto;min-width:98px;height:35px;padding:0 8px;border-color:rgba(251,146,60,.28);background:linear-gradient(135deg,rgba(249,115,22,.12),rgba(245,158,11,.06))}.mat-streak-control>i{color:#fb923c;font-size:17px;filter:drop-shadow(0 0 5px rgba(251,146,60,.28))}.mat-top-streak-count{font-size:18px;line-height:1;font-weight:950;color:#fff7ed;font-variant-numeric:tabular-nums}.mat-streak-copy{font-size:8px;line-height:1.2;font-weight:950;letter-spacing:.08em;color:#fed7aa;white-space:nowrap}.mat-info-control{color:#c4b5fd;border-color:rgba(167,139,250,.4);background:linear-gradient(145deg,rgba(139,92,246,.22),rgba(79,70,229,.12));box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 0 15px rgba(139,92,246,.08)}.mat-info-glyph{display:grid;place-items:center;width:20px;height:20px;border:2px solid currentColor;border-radius:50%;font-family:Georgia,serif;font-style:normal;font-size:13px;font-weight:900;line-height:1;color:#ddd6fe;box-shadow:0 0 0 3px rgba(167,139,250,.09),inset 0 1px 3px rgba(255,255,255,.12)}.mat-info-control:hover .mat-info-glyph{background:rgba(167,139,250,.16);box-shadow:0 0 0 4px rgba(167,139,250,.12),0 0 12px rgba(167,139,250,.22)}.mat-top-rp{display:flex;align-items:center;gap:7px;height:39px;padding:0 11px;border-radius:11px;background:rgba(255,255,255,.05);border:1px solid rgba(148,163,184,.18);color:#f8fafc;font-weight:950;white-space:nowrap;cursor:pointer}.mat-top-rp i{color:#facc15}' +
      '.mat-overlay{position:fixed;inset:0;z-index:10020;display:flex;align-items:center;justify-content:center;padding:17px;background:rgba(2,6,23,.7);backdrop-filter:blur(8px)}.mat-overlay.hidden{display:none}.mat-dialog{position:relative;width:min(100%,520px);max-height:min(86vh,760px);overflow:auto;border:1px solid rgba(148,163,184,.24);border-radius:23px;padding:24px;background:var(--surface,#fff);color:var(--text,#0f172a);box-shadow:0 28px 80px rgba(0,0,0,.36)}.dark .mat-dialog{background:#101827;color:#f8fafc}.mat-dialog h2{font-size:21px;font-weight:950;margin:0 34px 8px 0}.mat-dialog-note{font-size:13px;color:var(--muted,#64748b);margin:0 0 15px;line-height:1.6}.mat-close{position:absolute;right:13px;top:11px;width:35px;height:35px;border-radius:11px;background:rgba(148,163,184,.14);font-size:24px}.mat-player-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:15px 0}.mat-player-stat{padding:11px;border-radius:13px;background:rgba(148,163,184,.12)}.mat-player-stat small{display:block;font-size:11px;color:var(--muted,#64748b)}.mat-player-stat strong{display:block;margin-top:4px;font-size:15px;overflow-wrap:anywhere}.leaderboard-period-tab.is-active{border-color:#0d9488!important;background:rgba(13,148,136,.1)!important;color:#0d9488!important}.leader-tier-trophy{font-size:13px;vertical-align:middle}' +
      '@media(max-width:650px){.mat-rank-rail{width:100%;max-width:none;gap:9px;padding:9px 0 10px}#med-rank-controls{top:9px;right:8px;gap:0;padding:0}.mat-top-icon{width:33px;height:33px}.mat-streak-control{width:auto;min-width:86px;height:33px;padding:0 6px;gap:4px}.mat-top-streak-count{font-size:14px}.mat-streak-copy{font-size:7px}.mat-info-control{width:35px;height:35px}.mat-info-glyph{width:18px;height:18px;font-size:12px}.mat-top-rp{height:35px;padding:0 8px;font-size:12px}main{padding-top:68px!important}.mat-dialog{padding:20px 15px}.mat-rank-rail{gap:6px}.mat-rank-tier{flex-basis:69px;min-width:69px;min-height:82px}.mat-rank-tier.is-active{flex-basis:105px;min-width:105px;min-height:100px}}';
    style.textContent += '@keyframes matRefreshSpin{to{transform:rotate(360deg)}}.mat-refresh-spin{animation:matRefreshSpin .8s linear infinite}.is-refreshing{cursor:progress;opacity:.8}.mat-progress-star-label{position:absolute;top:calc(100% + 9px);z-index:3;transform:translateX(-50%);font-size:9px;font-weight:800;line-height:1;color:var(--text,#cbd5e1);white-space:nowrap;pointer-events:none;transition:left .35s ease}.mat-progress-star{position:absolute;top:50%;z-index:3;display:grid;place-items:center;width:26px;height:26px;transform:translate(-50%,-50%);color:#fbbf24;font-size:21px;line-height:1;filter:drop-shadow(0 2px 3px rgba(15,23,42,.38));pointer-events:none;transition:left .35s ease}.mat-progress-star i{font-style:normal}.mat-rank-banner{margin:8px 0 18px;padding:0;background:transparent;border:0;border-radius:0;box-shadow:none;color:var(--text,#0f172a);overflow:visible}.mat-rank-head{text-align:left;margin:0 0 8px;gap:2px}.mat-rank-head strong{color:var(--brand,#059669);letter-spacing:.14em}.mat-rank-head small{color:var(--muted,#64748b)}.mat-rank-rail{display:flex;align-items:flex-end;width:100%;max-width:none;box-sizing:border-box;gap:15px;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;scrollbar-width:thin;padding:12px 0 14px;scroll-snap-type:x mandatory}.mat-rank-tier{flex:0 0 64px;min-width:64px;min-height:88px;padding:0 2px 5px;border:0!important;border-radius:0!important;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;opacity:.7;transform:scale(.94);transition:transform .2s ease,opacity .2s ease,color .2s ease;scroll-snap-align:center;color:var(--muted,#64748b);background:transparent!important;box-shadow:none!important;cursor:pointer;font-size:10px;font-weight:850;text-align:center}.mat-rank-tier.is-active{flex-basis:72px;min-width:72px;min-height:96px;opacity:1;transform:scale(1.08);color:var(--text,#0f172a);border:0!important;box-shadow:none!important}.mat-rank-tier .vault-rank-trophy-svg{display:block;width:43px;height:49px;filter:drop-shadow(0 3px 2px #0002);transition:width .2s ease,height .2s ease,filter .2s ease}.mat-rank-tier.is-active .vault-rank-trophy-svg{width:62px;height:69px;filter:drop-shadow(0 6px 4px #0003)}.mat-rank-tier>span{display:block;font-size:10px;font-weight:850;line-height:1.2;white-space:nowrap}.mat-rank-tier small,.mat-rank-tier i{display:none!important}.mat-rank-tier.is-active>span{font-size:11px;color:var(--brand,#047857)}.mat-rank-progress{padding:5px 0 0}.mat-rank-progress-line{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.mat-rank-progress-line>span:first-child{display:flex;flex-direction:column;gap:3px}.mat-rank-progress-line strong{font-size:13px}.mat-rank-progress-line small,.mat-rank-foot{font-size:11px;color:var(--muted,#64748b)}.mat-rank-rp{font-weight:950;color:#b7791f;white-space:nowrap}.mat-rank-track{position:relative;height:12px;border-radius:99px;background:rgba(148,163,184,.22);margin:24px 1px 12px;overflow:visible;box-shadow:inset 0 1px 2px rgba(15,23,42,.10)}.mat-rank-track>span:not(.mat-progress-star){position:relative;z-index:1;display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,#f59e0b,#fb923c);transition:width .35s ease,background .25s ease}.mat-rank-track.is-safe>span:not(.mat-progress-star){background:linear-gradient(90deg,#059669,#34d399)!important;box-shadow:0 0 8px rgba(16,185,129,.2)}.mat-rank-track>.mat-safe-zone-marker{position:absolute;top:-7px;bottom:-7px;width:4px;height:auto;transform:translateX(-50%);border-radius:99px;background:#047857;border:2px solid var(--surface,#fff);box-shadow:0 0 0 2px rgba(16,185,129,.28);z-index:2}.mat-rank-track>.mat-safe-zone-marker:before{content:"SAFE ZONE";position:absolute;left:50%;bottom:calc(100% + 7px);transform:translateX(-50%);padding:4px 7px;border-radius:6px;background:#047857;color:#fff;font-size:9px;font-weight:950;letter-spacing:.04em;line-height:1;white-space:nowrap;box-shadow:0 2px 5px rgba(4,120,87,.2)}.mat-rank-track.is-safe .mat-progress-star{color:#10b981;filter:drop-shadow(0 2px 4px rgba(5,150,105,.4))}.mat-rank-track.is-safe .mat-safe-zone-marker{background:#10b981;box-shadow:0 0 0 3px rgba(16,185,129,.2)}.mat-safe-zone-caption{display:flex;align-items:center;gap:7px;width:fit-content;max-width:100%;margin-top:9px;padding:7px 10px;border:1px solid rgba(16,185,129,.24);border-radius:10px;background:rgba(16,185,129,.08);font-size:11px;font-weight:850;color:#047857}.mat-safe-zone-caption.at-risk{border-color:rgba(245,158,11,.25);background:rgba(245,158,11,.09);color:#b45309}.mat-safe-zone-caption i{font-size:13px}.mat-safe-zone-caption{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;color:#059669}.mat-safe-zone-caption.at-risk{color:#d97706}.mat-rank-locked{display:flex;gap:10px;align-items:center;border:1px solid rgba(148,163,184,.25);border-radius:14px;padding:12px;background:rgba(148,163,184,.08);font-size:12px;line-height:1.6}.mat-rule-list{display:grid;gap:9px;margin-top:18px}.mat-rules-kicker{display:inline-flex;align-items:center;gap:7px;font-size:10px;font-weight:950;letter-spacing:.14em;color:#059669;margin-bottom:8px}.mat-rules-dialog h2{margin-top:0}.mat-rule-list details{overflow:hidden;border:1px solid var(--line,rgba(148,163,184,.24));border-radius:15px;background:var(--surface-2,rgba(148,163,184,.05));transition:border-color .18s,background .18s}.mat-rule-list details[open]{border-color:rgba(16,185,129,.4);background:color-mix(in srgb,#10b981 5%,var(--surface,#fff))}.mat-rule-list summary{display:flex;align-items:center;gap:10px;padding:12px;list-style:none;cursor:pointer}.mat-rule-list summary::-webkit-details-marker{display:none}.mat-rule-list summary>span:nth-child(2){display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}.mat-rule-list summary strong{font-size:13px;font-weight:900}.mat-rule-list summary small{font-size:11px;color:var(--muted,#64748b)}.mat-rule-icon{display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;border-radius:11px;background:rgba(16,185,129,.12);color:#059669;font-size:15px}.mat-rule-icon.reward{background:rgba(217,119,6,.13);color:#d97706}.mat-rule-icon.trophy{background:rgba(139,92,246,.13);color:#8b5cf6}.mat-rule-icon.weekly{background:rgba(14,165,233,.13);color:#0284c7}.mat-rule-icon.board{background:rgba(99,102,241,.13);color:#6366f1}.mat-rule-icon.account{background:rgba(100,116,139,.13);color:#64748b}.mat-rule-chevron{font-size:11px;color:var(--muted,#64748b);transition:transform .18s}.mat-rule-list details[open] .mat-rule-chevron{transform:rotate(180deg)}.mat-rule-list details>div{padding:0 14px 14px 58px;font-size:12px;line-height:1.75;color:var(--muted,#64748b)}.mat-rules-foot{display:flex;gap:7px;margin:16px 0 0;font-size:11px;line-height:1.7;color:var(--muted,#64748b)}.leader-safe-status{display:block;margin-top:5px;color:#059669;font-size:10px;font-weight:850}.leader-risk-status{display:block;margin-top:5px;color:#d97706;font-size:10px;font-weight:850}.safe-zone-divider td{padding:12px 8px!important;border-top:2px solid #10b981!important;border-bottom:2px solid #10b981!important;text-align:center!important;background:color-mix(in srgb,#10b981 5%,var(--surface,#fff));color:#059669!important;font-weight:950;letter-spacing:.12em}.safe-zone-divider td:before{content:"";display:inline-block;width:24px;height:1px;vertical-align:middle;background:#10b981;margin:0 10px}.safe-zone-divider td:after{content:"";display:inline-block;width:24px;height:1px;vertical-align:middle;background:#10b981;margin:0 10px}.promotion-zone-divider td{padding:12px 8px!important;border-top:2px solid #a855f7!important;border-bottom:2px solid #a855f7!important;text-align:center!important;background:linear-gradient(90deg,color-mix(in srgb,#8b5cf6 7%,var(--surface,#fff)),color-mix(in srgb,#d946ef 8%,var(--surface,#fff)));color:#a855f7!important;font-weight:950;letter-spacing:.12em}.promotion-zone-divider td:before,.promotion-zone-divider td:after{content:"";display:inline-block;width:24px;height:1px;vertical-align:middle;background:#c084fc;margin:0 10px}.promotion-zone-divider td i{margin-right:6px}.leaderboard-period-tab{transition:background .18s,border-color .18s,color .18s}.leaderboard-period-tab.is-active{background:#047857!important;border-color:#047857!important;color:#fff!important}.mat-student-profile{max-width:1050px}.mat-student-profile-hero{display:flex;align-items:center;gap:16px;padding:24px;border-bottom:1px solid var(--line,rgba(148,163,184,.2))}.mat-student-profile-avatar{display:grid;place-items:center;flex:0 0 76px;width:76px;height:76px;border-radius:50%;overflow:hidden;background:var(--surface-2,rgba(148,163,184,.12));font-size:26px;font-weight:900}.mat-student-profile-avatar img{width:100%;height:100%;object-fit:cover}.mat-student-profile-title{font-size:clamp(23px,4vw,31px);font-weight:950;line-height:1.2;overflow-wrap:anywhere}.mat-student-profile-meta{font-size:13px;color:var(--muted,#64748b);line-height:1.7}.mat-student-profile-stat{padding:16px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:17px;background:var(--surface,#fff)}.mat-student-profile-stat small{display:block;font-size:11px;color:var(--muted,#64748b);font-weight:750}.mat-student-profile-stat strong{display:block;margin-top:5px;font-size:23px;font-weight:950;overflow-wrap:anywhere}.mat-student-vault-trophy{display:flex;align-items:center;gap:13px;padding:18px 0}.mat-student-vault-trophy svg{width:66px;height:74px;filter:drop-shadow(0 6px 4px #0002)}.mat-student-vault-trophy strong{display:block;font-size:17px;font-weight:950}.mat-student-vault-trophy small{display:block;color:var(--muted,#64748b);font-size:12px;margin-top:3px}.mat-profile-actions{display:flex;gap:8px;flex-wrap:wrap}.mat-profile-actions button{min-height:40px;padding:9px 13px;border:1px solid var(--line,rgba(148,163,184,.25));border-radius:11px;font-size:12px;font-weight:850;background:var(--surface,#fff);color:var(--text,#0f172a)}.mat-profile-actions button.primary{border-color:#059669;background:#059669;color:#fff}.mat-profile-actions button.danger{border-color:rgba(220,38,38,.35);color:#dc2626}.mat-friends-request{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:13px;margin-top:8px}.mat-friends-request strong{font-size:13px}.mat-friends-request small{display:block;color:var(--muted,#64748b);font-size:11px}.mat-profile-empty{padding:22px;border:1px dashed var(--line,rgba(148,163,184,.25));border-radius:14px;color:var(--muted,#64748b);font-size:13px;line-height:1.7}.mat-profile-gate-notice{display:flex;align-items:flex-start;gap:11px;margin:0 0 16px;padding:14px 15px;border:1px solid rgba(217,119,6,.28);border-radius:14px;background:linear-gradient(135deg,rgba(245,158,11,.10),rgba(16,185,129,.05));color:var(--text,#0f172a)}.mat-profile-gate-notice>i{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;border-radius:11px;background:rgba(217,119,6,.13);color:#d97706}.mat-profile-gate-notice span{display:flex;flex-direction:column;gap:4px}.mat-profile-gate-notice strong{font-size:13px;font-weight:900}.mat-profile-gate-notice small{font-size:12px;line-height:1.6;color:var(--muted,#64748b)}.mat-profile-gate-notice[hidden]{display:none!important}@media(max-width:650px){#med-rank-controls{top:9px;right:8px;gap:4px;padding:4px}.mat-streak-control{min-width:92px;height:35px;padding:0 7px;gap:5px}.mat-top-streak-count{font-size:15px}.mat-streak-copy{font-size:7px}.mat-rank-banner{margin:4px 0 10px}.mat-rank-rail{width:100%;max-width:none;gap:9px;padding:9px 0 10px}.mat-rank-tier{flex-basis:54px;min-width:54px;min-height:74px}.mat-rank-tier.is-active{flex-basis:65px;min-width:65px;min-height:88px}.mat-rank-tier .vault-rank-trophy-svg{width:37px;height:42px}.mat-rank-tier.is-active .vault-rank-trophy-svg{width:54px;height:61px}.mat-rank-progress-line{align-items:flex-start}.mat-student-profile-hero{padding:18px 14px;align-items:flex-start}.mat-student-profile-avatar{flex-basis:60px;width:60px;height:60px}.mat-student-profile-stat{padding:12px}.mat-student-profile-stat strong{font-size:20px}.mat-rule-list details>div{padding-left:14px}.mat-rule-list summary{padding:10px}.mat-rule-icon{flex-basis:32px;width:32px;height:32px}}';
    style.textContent += '#leaderboard-list .overflow-x-auto{width:100%;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}#leaderboard-list table{width:100%;min-width:790px;table-layout:fixed;border-collapse:separate;border-spacing:0}#leaderboard-list thead th{width:auto;text-align:right;vertical-align:bottom;white-space:normal;overflow-wrap:anywhere;font-size:12px;font-weight:850}#leaderboard-list thead th:nth-child(1),#leaderboard-body td:nth-child(1){width:25%}#leaderboard-list thead th:nth-child(2),#leaderboard-body td:nth-child(2){width:23%}#leaderboard-list thead th:nth-child(3),#leaderboard-body td:nth-child(3){width:15%}#leaderboard-list thead th:nth-child(4),#leaderboard-body td:nth-child(4){width:13%}#leaderboard-list thead th:nth-child(5),#leaderboard-body td:nth-child(5){width:24%}#leaderboard-body td{vertical-align:middle;overflow-wrap:anywhere}#leaderboard-body td.leader-college,#leaderboard-body td.leader-batch{white-space:normal;word-break:normal;overflow-wrap:anywhere;font-size:12px}#leaderboard-body td.leader-xp{white-space:nowrap;font-size:12px}#leaderboard-body td.leader-rank-points{font-size:13px;min-width:0;text-align:right}#leaderboard-body .leader-person{display:flex;align-items:center;gap:8px;min-width:0}#leaderboard-body .leader-person>span:last-child{min-width:0;overflow-wrap:anywhere}#leaderboard-body .leader-avatar{flex:0 0 34px}#leaderboard-body .leader-rank-trophy{display:inline-flex;align-items:center;justify-content:flex-end;gap:5px;max-width:100%;white-space:normal}#leaderboard-body .leader-rank-trophy-copy{min-width:0}#leaderboard-body .leader-rank-trophy-copy strong{white-space:normal;overflow-wrap:anywhere}@media(max-width:640px){#leaderboard-list table{min-width:790px}#leaderboard-list thead th{padding:10px 7px;font-size:11px}#leaderboard-body td{padding:10px 7px}#leaderboard-body td:nth-child(5){font-size:12px}}';
    style.textContent += '.safe-zone-divider td{width:auto!important;white-space:normal!important;}';
    /* High-density leaderboard: keep every table cell on one line and shorten rows. */
    style.textContent += '#leaderboard-list .overflow-x-auto{max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}#leaderboard-list table{width:100%!important;min-width:700px!important;table-layout:fixed;border-collapse:collapse;border-spacing:0}#leaderboard-list thead th,#leaderboard-body td{box-sizing:border-box;padding:4px 5px!important;line-height:1.12;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#leaderboard-list thead th{padding:5px!important;font-size:10px!important;line-height:1.1;white-space:nowrap!important}#leaderboard-list thead th:nth-child(1),#leaderboard-body td:nth-child(1){width:32%!important;text-align:left}#leaderboard-list thead th:nth-child(2),#leaderboard-body td:nth-child(2){width:20%!important}#leaderboard-list thead th:nth-child(3),#leaderboard-body td:nth-child(3){width:13%!important}#leaderboard-list thead th:nth-child(4),#leaderboard-body td:nth-child(4){width:11%!important}#leaderboard-list thead th:nth-child(5),#leaderboard-body td:nth-child(5){width:24%!important}#leaderboard-body tr.leader-row{height:31px}#leaderboard-body td{font-size:10px!important}#leaderboard-body td.leader-college,#leaderboard-body td.leader-batch,#leaderboard-body td.leader-xp{font-size:10px!important;white-space:nowrap!important;overflow:hidden;text-overflow:ellipsis;word-break:normal;overflow-wrap:normal}#leaderboard-body .leader-person{display:flex;align-items:center;gap:5px;min-width:0;max-width:100%;white-space:nowrap;overflow:hidden}#leaderboard-body .leader-avatar{width:24px!important;height:24px!important;flex:0 0 24px!important;border-radius:50%!important}#leaderboard-body .leader-person>span:last-child{display:flex;align-items:center;gap:4px;min-width:0;flex:1;white-space:nowrap;overflow:hidden}#leaderboard-body .leader-person b{display:block;min-width:0;max-width:100%;font-size:11px!important;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#leaderboard-body .leader-person em{flex:0 0 auto;margin:0!important;font-size:8px!important;padding:1px 4px!important}#leaderboard-body td.leader-rank-points{font-size:10px!important;line-height:1.1;text-align:right;white-space:nowrap!important;overflow:hidden;text-overflow:ellipsis}#leaderboard-body .leader-rank-number{display:inline!important;font-size:11px!important;line-height:1.1;font-weight:950;white-space:nowrap}#leaderboard-body .leader-points-label{display:inline!important;margin:0 0 0 3px!important;font-size:10px!important;line-height:1.1;white-space:nowrap}#leaderboard-body .leader-safe-status,#leaderboard-body .leader-risk-status{display:inline!important;margin:0 0 0 3px!important;font-size:9px!important;line-height:1.1;white-space:nowrap}#leaderboard-body .leader-safe-status{color:#059669}#leaderboard-body .leader-risk-status{color:#d97706}.leaderboard-podium{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:6px!important;margin:0 0 8px!important}.podium-card,.podium-card.podium-1{padding:7px 5px!important;margin:0!important;transform:none!important;border-radius:12px!important;gap:3px!important;box-shadow:none!important}.podium-avatar{width:30px!important;height:30px!important;border-radius:50%!important}.podium-place-label{font-size:10px!important}.podium-card strong{display:block;max-width:100%;font-size:11px!important;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.podium-card span{font-size:10px!important;line-height:1.1}.podium-card small{font-size:9px!important;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}@media(max-width:640px){#leaderboard-list table{min-width:660px!important}#leaderboard-list thead th{padding:4px!important;font-size:9px!important}#leaderboard-body td{padding:3px 4px!important}#leaderboard-body .leader-avatar{width:22px!important;height:22px!important;flex-basis:22px!important}#leaderboard-body .leader-person{gap:4px}#leaderboard-body .leader-person b{font-size:10px!important}#leaderboard-body .leader-points-label{font-size:9px!important}#leaderboard-body .leader-safe-status,#leaderboard-body .leader-risk-status{font-size:8px!important}}';
    /* Final leaderboard table polish: concise rows, centered headers, no trophy-driven height. */
    style.textContent += '#leaderboard-list table{border-collapse:collapse!important;border-spacing:0!important;table-layout:fixed!important}#leaderboard-list thead th{height:24px!important;padding:3px 4px!important;text-align:center!important;vertical-align:middle!important;line-height:1!important;font-size:10px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:clip!important}#leaderboard-body tr.leader-row{height:26px!important;min-height:0!important}#leaderboard-body td{height:26px!important;padding:2px 4px!important;line-height:1.05!important;vertical-align:middle!important}#leaderboard-body .leader-avatar{width:20px!important;height:20px!important;flex-basis:20px!important}#leaderboard-body .leader-person{gap:4px!important}#leaderboard-body .leader-person b{font-size:10px!important;line-height:1!important}#leaderboard-body .leader-person em{font-size:7px!important;line-height:1!important;padding:1px 3px!important}#leaderboard-body td.leader-college,#leaderboard-body td.leader-batch,#leaderboard-body td.leader-xp{font-size:10px!important;line-height:1.05!important}#leaderboard-body td.leader-rank-points{font-size:10px!important;line-height:1!important;text-align:center!important;white-space:nowrap!important}#leaderboard-body .leader-rank-number,#leaderboard-body .leader-points-label,#leaderboard-body .leader-safe-status,#leaderboard-body .leader-risk-status{line-height:1!important;white-space:nowrap!important}#leaderboard-body .leader-safe-status,#leaderboard-body .leader-risk-status{font-size:8px!important;margin-left:2px!important}@media(max-width:640px){#leaderboard-list thead th{height:22px!important;padding:2px 3px!important;font-size:9px!important}#leaderboard-body tr.leader-row,#leaderboard-body td{height:24px!important}#leaderboard-body td{padding:2px 3px!important}#leaderboard-body .leader-avatar{width:18px!important;height:18px!important;flex-basis:18px!important}#leaderboard-body .leader-person b{font-size:9px!important}}';
    style.textContent += '.mat-rank-zones{overflow:visible!important;margin-top:28px!important;margin-bottom:30px!important}.mat-rank-zones .mat-rank-fill{position:relative;z-index:1;display:block;height:100%;border-radius:99px;transition:width .35s ease,background .25s ease}.mat-rank-zones .mat-safe-zone-marker,.mat-rank-zones .mat-promotion-zone-marker{position:absolute;top:-8px;bottom:-8px;z-index:3;width:3px;height:auto;transform:translateX(-50%);border:0;border-radius:99px;box-shadow:0 0 0 2px rgba(255,255,255,.78)}.mat-rank-zones .mat-safe-zone-marker{background:#10b981}.mat-rank-zones .mat-safe-zone-marker:before{content:"SAFE";position:absolute;left:50%;bottom:calc(100% + 7px);transform:translateX(-50%);padding:3px 5px;border-radius:5px;background:#059669;color:#fff;font-size:8px;font-weight:950;letter-spacing:.04em;line-height:1}.mat-rank-zones .mat-promotion-zone-marker{background:#a78bfa}.mat-rank-zones .mat-promotion-zone-marker:before{content:"PROMOTION";position:absolute;left:50%;top:calc(100% + 7px);transform:translateX(-50%);padding:3px 5px;border-radius:5px;background:linear-gradient(100deg,#7c3aed,#c026d3);color:#fff;font-size:8px;font-weight:950;letter-spacing:.02em;line-height:1}.mat-rank-zones .mat-progress-star{z-index:4}.mat-rank-zones.is-safe .mat-progress-star{color:#10b981}.mat-rank-zones.is-promotion .mat-progress-star{color:#e879f9;filter:drop-shadow(0 0 5px rgba(192,38,211,.65))}.mat-rank-zone-legend{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;margin-top:9px;font-size:10px;font-weight:850}.mat-rank-zone-legend>span{display:inline-flex;align-items:center;gap:5px}.mat-rank-zone-legend i{display:inline-block;width:8px;height:8px;border-radius:50%}.mat-zone-legend-safe{color:#059669}.mat-zone-legend-safe i{background:#10b981}.mat-zone-legend-promotion{color:#a855f7}.mat-zone-legend-promotion i{background:#c084fc}.mat-safe-zone-caption{display:flex;align-items:flex-start;gap:8px}.mat-safe-zone-caption>span{display:flex;flex-direction:column;gap:3px}.mat-safe-zone-caption strong{font-size:11px}.mat-safe-zone-caption small{font-size:10px;font-weight:650;line-height:1.5}.mat-safe-zone-caption.is-promotion{border-color:rgba(192,38,211,.35);background:linear-gradient(100deg,rgba(124,58,237,.10),rgba(217,70,239,.12));color:#a21caf}@media(max-width:650px){.mat-rank-zones{margin-top:29px!important}.mat-rank-zone-legend{font-size:9px}.mat-rank-zones .mat-promotion-zone-marker:before{font-size:7px;padding:3px 4px}.mat-rank-zones .mat-safe-zone-marker:before{font-size:7px}}';
/* Final 4-column leaderboard layout: Student, College, Batch, RP. Keep the student identity left-aligned and center all data columns. */
    style.textContent += '#leaderboard-list .overflow-x-auto{width:100%;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}#leaderboard-list table{width:100%!important;min-width:660px!important;table-layout:fixed!important;border-collapse:collapse!important;border-spacing:0!important}#leaderboard-list thead th{width:auto!important;text-align:center!important;vertical-align:middle!important;white-space:nowrap!important}#leaderboard-list thead th:nth-child(1),#leaderboard-body td:nth-child(1){width:34%!important;text-align:left!important}#leaderboard-list thead th:nth-child(2),#leaderboard-body td:nth-child(2){width:22%!important;text-align:center!important}#leaderboard-list thead th:nth-child(3),#leaderboard-body td:nth-child(3){width:18%!important;text-align:center!important}#leaderboard-list thead th:nth-child(4),#leaderboard-body td:nth-child(4){width:26%!important;text-align:center!important}#leaderboard-body td.leader-college,#leaderboard-body td.leader-batch{white-space:normal!important;overflow-wrap:anywhere;text-align:center!important}#leaderboard-body td.leader-rank-points{white-space:normal!important;text-align:center!important}#leaderboard-body .leader-rank-number,#leaderboard-body .leader-points-label,#leaderboard-body .leader-safe-status,#leaderboard-body .leader-risk-status{display:block!important;text-align:center!important;white-space:normal!important;overflow-wrap:anywhere!important}#leaderboard-body .leader-points-label{margin-top:3px!important}#leaderboard-body .leader-safe-status,#leaderboard-body .leader-risk-status{margin:4px 0 0!important;font-size:9px!important;line-height:1.15!important}@media(max-width:640px){#leaderboard-list table{min-width:660px!important}#leaderboard-list thead th{padding:4px 3px!important;font-size:9px!important}#leaderboard-body td{padding:4px 3px!important}#leaderboard-body .leader-safe-status,#leaderboard-body .leader-risk-status{font-size:8px!important}}';
/* Compact three-column leaderboard: prevent status truncation and remove unnecessary whitespace. */
style.textContent += '#leaderboard-list .overflow-x-auto{width:100%;max-width:100%;overflow-x:visible!important}#leaderboard-list table{width:100%!important;min-width:0!important;table-layout:fixed!important;border-collapse:collapse!important;border-spacing:0!important}#leaderboard-list thead th{padding:5px 4px!important;text-align:center!important;vertical-align:middle!important;white-space:normal!important;line-height:1.15!important;font-size:11px!important}#leaderboard-list thead th:nth-child(1),#leaderboard-body td:nth-child(1){width:38%!important;text-align:left!important}#leaderboard-list thead th:nth-child(2),#leaderboard-body td:nth-child(2){width:25%!important;text-align:center!important}#leaderboard-list thead th:nth-child(3),#leaderboard-body td:nth-child(3){width:37%!important;text-align:center!important}#leaderboard-body tr.leader-row{height:auto!important;min-height:0!important}#leaderboard-body td{height:auto!important;padding:5px 4px!important;line-height:1.2!important;vertical-align:middle!important;overflow:visible!important}#leaderboard-body .leader-person{display:flex;align-items:center;gap:6px!important;min-width:0}#leaderboard-body .leader-person b{white-space:normal!important;overflow-wrap:anywhere!important;font-size:11px!important;line-height:1.15!important}#leaderboard-body .leader-avatar{width:24px!important;height:24px!important;flex:0 0 24px!important}#leaderboard-body td.leader-college{white-space:normal!important;overflow-wrap:anywhere!important;text-align:center!important;font-size:10px!important}#leaderboard-body td.leader-rank-points{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;text-align:center!important;font-size:11px!important;line-height:1.15!important}#leaderboard-body .leader-rank-number,#leaderboard-body .leader-points-label,#leaderboard-body .leader-safe-status,#leaderboard-body .leader-risk-status{display:block!important;text-align:center!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:normal!important;line-height:1.2!important}#leaderboard-body .leader-points-label{margin-top:2px!important;font-size:10px!important}#leaderboard-body .leader-safe-status,#leaderboard-body .leader-risk-status{margin:3px 0 0!important;font-size:10px!important}#leaderboard-body .leader-safe-status i,#leaderboard-body .leader-risk-status i{display:inline-block!important;margin-right:2px!important}#leaderboard-podium:empty{display:none!important}.leaderboard-podium{margin-bottom:8px!important;gap:8px!important}.podium-card,.podium-card.podium-1{padding:8px!important;gap:3px!important}#leaderboard-body .leader-row .fa-trophy,#leaderboard-body .leader-row .fa-medal{display:none!important}@media(max-width:520px){#leaderboard-list thead th{padding:4px 2px!important;font-size:10px!important}#leaderboard-body td{padding:4px 2px!important}#leaderboard-body .leader-avatar{width:20px!important;height:20px!important;flex-basis:20px!important}#leaderboard-body .leader-person{gap:4px!important}#leaderboard-body .leader-person b{font-size:10px!important}#leaderboard-body td.leader-college{font-size:9px!important}#leaderboard-body .leader-safe-status,#leaderboard-body .leader-risk-status{font-size:9px!important}}';
    style.textContent += '#leaderboard-list thead th,#leaderboard-body td{text-align:center!important}#leaderboard-body .leader-person{justify-content:center!important;text-align:center!important;gap:5px!important;min-width:0!important}#leaderboard-body .leader-rank-number-inline{flex:0 0 auto!important;font-size:10px!important;line-height:1!important;font-weight:900!important;color:var(--muted,#64748b)!important;white-space:nowrap!important}#leaderboard-body .leader-person>span:last-child{text-align:center!important}#leaderboard-body .leader-person b{text-align:center!important}#leaderboard-body td.leader-college,#leaderboard-body td.leader-rank-points{text-align:center!important}#leaderboard-body tr.leader-row>td{padding-top:3px!important;padding-bottom:3px!important;line-height:1.05!important}#leaderboard-body .leader-points-label{margin-top:0!important;line-height:1.05!important}#leaderboard-body .leader-safe-status,#leaderboard-body .leader-risk-status{margin-top:2px!important;line-height:1.05!important}';
     style.textContent += '.promotion-zone-divider td,.safe-zone-divider td{display:table-cell!important;width:auto!important;text-align:center!important;vertical-align:middle!important;padding-left:8px!important;padding-right:8px!important;white-space:normal!important}.promotion-zone-divider td:before,.promotion-zone-divider td:after,.safe-zone-divider td:before,.safe-zone-divider td:after{display:inline-block!important;vertical-align:middle!important}';
     style.textContent += '#leaderboard-body tr.promotion-zone-divider>td,#leaderboard-body tr.safe-zone-divider>td{text-align:center!important}#leaderboard-body .leader-zone-divider-content{display:flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important;text-align:center!important;white-space:normal!important;overflow-wrap:anywhere!important;line-height:1.3!important}#leaderboard-body .leader-zone-divider-content>i{flex:0 0 auto!important;margin:0!important}#leaderboard-body .leader-zone-divider-content>.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}';
     style.textContent += '#leaderboard-body tr.promotion-zone-divider>td:before,#leaderboard-body tr.promotion-zone-divider>td:after,#leaderboard-body tr.safe-zone-divider>td:before,#leaderboard-body tr.safe-zone-divider>td:after{content:none!important;display:none!important}#leaderboard-body .leader-zone-divider-content:before,#leaderboard-body .leader-zone-divider-content:after{content:"";display:block;flex:0 0 18px;width:18px;min-width:18px;max-width:18px;height:1px;background:currentColor;opacity:.65}#leaderboard-body .leader-zone-divider-content>span:not(.sr-only){flex:0 1 auto;min-width:0;text-align:center;overflow-wrap:anywhere}';
    /* Fresh leaderboard layout: two columns only, generous row padding, no row borders. */
    style.textContent += '#leaderboard-list{width:100%!important;background:#111827!important;border-radius:12px!important;overflow:hidden!important}#leaderboard-list .overflow-x-auto{max-height:560px!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior-y:contain!important;scrollbar-width:none!important;-ms-overflow-style:none!important}#leaderboard-list .overflow-x-auto::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}#leaderboard-list table{width:100%!important;min-width:0!important;table-layout:fixed!important;border-collapse:separate!important;border-spacing:0!important}#leaderboard-list thead{display:none!important}#leaderboard-body tr.leader-row{height:auto!important;border:0!important;transition:background-color .16s ease!important}#leaderboard-body tr.leader-row>td.leader-row-cell{width:100%!important;padding:16px 24px!important;border:0!important;background:transparent!important;vertical-align:middle!important;line-height:normal!important}#leaderboard-body tr.leader-row:hover{background:rgba(148,163,184,.10)!important;border-radius:8px!important}#leaderboard-body .leader-row-layout{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:16px!important;width:100%!important;min-width:0!important;box-sizing:border-box!important}#leaderboard-body .leader-person{display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:16px!important;flex:1 1 auto!important;min-width:0!important;max-width:100%!important;white-space:normal!important;overflow:visible!important;text-align:left!important}#leaderboard-body .leader-avatar{display:flex!important;align-items:center!important;justify-content:center!important;width:48px!important;height:48px!important;min-width:48px!important;flex:0 0 48px!important;border-radius:50%!important;overflow:hidden!important;background:#2A2A40!important}#leaderboard-body .leader-avatar img,#leaderboard-body .leader-avatar svg{width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;object-fit:cover!important;border-radius:50%!important}#leaderboard-body .leader-name-wrap{display:flex!important;flex-direction:column!important;align-items:flex-start!important;justify-content:center!important;gap:3px!important;min-width:0!important;overflow-wrap:anywhere!important}#leaderboard-body .leader-person b{display:block!important;color:#fff!important;font-size:16px!important;font-weight:600!important;line-height:1.3!important;white-space:normal!important;overflow-wrap:anywhere!important;text-align:left!important}#leaderboard-body .leader-person em{font-size:10px!important;line-height:1.2!important}#leaderboard-body .leader-rank-stack{display:flex!important;flex:0 0 auto!important;flex-direction:column!important;align-items:flex-end!important;justify-content:center!important;gap:2px!important;min-width:64px!important;max-width:42%!important;text-align:right!important;line-height:1!important}#leaderboard-body .leader-rank-number{display:block!important;margin:0!important;color:#fff!important;font-size:22px!important;font-weight:800!important;line-height:1.1!important;white-space:nowrap!important}#leaderboard-body .leader-points-label{display:block!important;margin:0!important;color:#9CA3AF!important;font-size:14px!important;font-weight:400!important;line-height:1.2!important;white-space:nowrap!important}#leaderboard-body .leader-safe-status,#leaderboard-body .leader-risk-status{display:block!important;margin-top:5px!important;font-size:10px!important;line-height:1.2!important;white-space:normal!important;text-align:right!important}#leaderboard-body tr.promotion-zone-divider>td{padding:12px 8px!important;border-top:2px solid #a855f7!important;border-bottom:2px solid #a855f7!important;border-left:0!important;border-right:0!important;text-align:center!important;background:linear-gradient(90deg,rgba(139,92,246,.07),rgba(217,70,239,.08))!important;color:#a855f7!important;font-weight:950!important;letter-spacing:.12em!important}#leaderboard-body tr.safe-zone-divider>td{padding:12px 8px!important;border-top:2px solid #10b981!important;border-bottom:2px solid #10b981!important;border-left:0!important;border-right:0!important;text-align:center!important;background:rgba(16,185,129,.05)!important;color:#059669!important;font-weight:950!important;letter-spacing:.12em!important}#leaderboard-body .leader-zone-divider-content{justify-content:center!important;gap:10px!important}#leaderboard-body .leader-zone-divider-content:before,#leaderboard-body .leader-zone-divider-content:after{flex:0 0 24px!important;width:24px!important;min-width:24px!important;max-width:24px!important;height:1px!important;opacity:.85!important}#leaderboard-body tr.promotion-zone-divider .leader-zone-divider-content:before,#leaderboard-body tr.promotion-zone-divider .leader-zone-divider-content:after{background:#c084fc!important}#leaderboard-body tr.safe-zone-divider .leader-zone-divider-content:before,#leaderboard-body tr.safe-zone-divider .leader-zone-divider-content:after{background:#10b981!important}@media(max-width:520px){#leaderboard-body tr.leader-row>td.leader-row-cell{padding:14px 12px!important}#leaderboard-body .leader-row-layout{gap:10px!important}#leaderboard-body .leader-person{gap:12px!important}#leaderboard-body .leader-avatar{width:42px!important;height:42px!important;min-width:42px!important;flex-basis:42px!important}#leaderboard-body .leader-person b{font-size:14px!important}#leaderboard-body .leader-rank-stack{min-width:58px!important}#leaderboard-body .leader-rank-number{font-size:18px!important}#leaderboard-body .leader-points-label{font-size:12px!important}}html:not(.dark) #leaderboard-list{background:#fff!important;border:1px solid #E5E7EB!important;border-radius:12px!important;box-shadow:0 1px 3px rgba(15,23,42,.05)!important}html:not(.dark) #leaderboard-body tr.leader-row>td.leader-row-cell{background:#fff!important;border:0!important}html:not(.dark) #leaderboard-body tr.leader-row:hover{background:#F9FAFB!important}html:not(.dark) #leaderboard-body .leader-avatar{background:#E0F2FE!important}html:not(.dark) #leaderboard-body .leader-person b{color:#1F2937!important}html:not(.dark) #leaderboard-body .leader-rank-number{color:#111827!important}html:not(.dark) #leaderboard-body .leader-points-label{color:#6B7280!important}html:not(.dark) #leaderboard-body .leader-safe-status{color:#059669!important}html:not(.dark) #leaderboard-body .leader-risk-status{color:#dc2626!important}';
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
        '<details><summary><span class="mat-rule-icon reward"><i class="fa-solid fa-gift"></i></span><span><strong>২. সব Exam-এর Rewards ও ৩০+ প্রশ্নের Special Rule</strong><small>সব exam reward পায়; ৩০ বা তার বেশি প্রশ্নে percentage-based special PB bonus</small></span><i class="fa-solid fa-chevron-down mat-rule-chevron"></i></summary><div>যে কোনো exam type (Model Test, Previous Year বা অন্য exam) একবার সফলভাবে submit করলে server-confirmed XP ও RP reward পাওয়া যায়—এটি শুধু Quiz leaderboard-এর জন্য নয়। ৩০ বা তার বেশি প্রশ্নের যেকোনো পরীক্ষায় negative marking-এর পর final score-এর শতাংশ অনুযায়ী performance-based PB bonus প্রযোজ্য; ৩০টির কম প্রশ্নে weighted bonus নেই। প্রতি ভুল উত্তরে ০.২৫ নম্বর কাটা হয়। হিসাবের range: ১–৪০% correct-answer position-এর প্রতিটি ×১, ৪১–৫০%-এর প্রতিটি ×২, ৫১–৬০%-এর প্রতিটি ×৪, ৬১–৭০%-এর প্রতিটি ×৫, ৭১–৭৯%-এর প্রতিটি ×৭ এবং ৮০–১০০%-এর প্রতিটি ×১০। প্রথমে final score হিসাব হবে (প্রতি ভুল উত্তরে ০.২৫ নম্বর কাটা হবে, score ০-এর নিচে যাবে না); তারপর final score-এর percentage range অনুযায়ী weighted PB হিসাব হবে। যে range যতটুকু final score-এ পূরণ হয়, শুধু সেই অংশে ওই range-এর weight লাগবে; আগের range-এর weight বদলাবে না। এই weighted হিসাব × ১৫ করে অতিরিক্ত PB যোগ হয়—PB RP নয়, আলাদা server-side wallet-এ জমা হবে; আগের base RP ও XP reward বহাল থাকবে, weighted score আলাদা করে interface-এ দেখানো হবে না। PB পাওয়ার ২ ঘণ্টার মধ্যে ১ PB → ২ XP বা ১ PB → ১ RP convert করা যাবে; সময় পেরোলে PB server-side স্বয়ংক্রিয়ভাবে RP হবে। Reward pending থাকলে sync status দেখুন এবং confirmed XP/RP/PB result আসা পর্যন্ত amount চূড়ান্ত ধরে নেবেন না। একই attempt বারবার submit করার প্রয়োজন নেই.</div></details>' +
        '<details><summary><span class="mat-rule-icon reward"><i class="fa-solid fa-bolt"></i></span><span><strong>৩. Practice Mode-এর RP Rule</strong><small>প্রশ্নসংখ্যা অনুযায়ী RP reward</small></span><i class="fa-solid fa-chevron-down mat-rule-chevron"></i></summary><div>Practice Mode-এ ৩০টির কম প্রশ্নের exam হলে হিসাব করা standard RP-এর ৭০% দেওয়া হয়—অর্থাৎ RP reward ৩০% কম। Practice Mode-এ ৩০ বা তার বেশি প্রশ্ন থাকলে পুরো calculated RP পাওয়া যাবে। অন্য exam mode-এ প্রশ্নসংখ্যা যাই হোক, এই Practice Mode reduction প্রযোজ্য নয়; সেগুলো full calculated RP পাবে। মনে রাখুন: Practice Mode-এ XP-এর আলাদা নিয়ম রয়েছে; এই অংশটি শুধু RP reward ব্যাখ্যা করে।</div></details>' +
        '<details><summary><span class="mat-rule-icon trophy"><i class="fa-solid fa-trophy"></i></span><span><strong>৪. Rank, RP Cost & Trophy Design</strong><small>promotion requirement, RP carry-over ও সব rank</small></span><i class="fa-solid fa-chevron-down mat-rule-chevron"></i></summary><div>Rank order: Bronze V → IV → III → II → I, এরপর Silver V; একইভাবে Silver, Gold, Platinum, Emerald, Diamond, Master, Grandmaster, Legend, Mythic পেরিয়ে সর্বোচ্চ Immortal I পর্যন্ত। কোনো ধাপ skip হয় না। প্রথম promotion-এর requirement 500 current RP। পরের প্রতিটি promotion-এর requirement = 500 + আগের promotion cost-এর 20%; cost নিকটতম 5 RP-তে round হয়। তাই requirement ধীরে বাড়ে (যেমন 500 → 600 → 620 → 625 RP)। প্রয়োজনীয় RP পূর্ণ হলে promotion হয় এবং অতিরিক্ত RP পরের rank-এ carry over হয়। Immortal V, IV, III, II ও I-এর trophy/emblem-এর আলাদা colour palette ও visual identity আছে।</div></details>' +
        '<details><summary><span class="mat-rule-icon weekly"><i class="fa-solid fa-shield-halved"></i></span><span><strong>৫. Weekly Safe Zone & Demotion</strong><small>সাপ্তাহিক activity, rank protection ও RP reset</small></span><i class="fa-solid fa-chevron-down mat-rule-chevron"></i></summary><div>Safe Zone হলো বর্তমান rank ধরে রাখার সাপ্তাহিক activity threshold—এটি promotion নয়। Safe Zone-এ থাকলে rank demotion হবে না; পরের subrank-এ উঠতে promotion requirement অনুযায়ী পুরো প্রয়োজনীয় current RP অর্জন করতে হবে। সপ্তাহের RP threshold-এর নিচে থাকলে এক ধাপ demotion হবে। Demotion হলে নতুন rank-এর Safe Zone minimum RP দেওয়া হবে; Bronze V-তে নামলে Bronze V-এর 5% Safe Zone minimum প্রযোজ্য। Bronze V সর্বনিম্ন rank: সেখানে আগে থেকেই থাকা user পরের weekly review-তেও Bronze V Safe Zone-এর নিচে থাকলে current RP 0 হবে, তবে rank আর কমবে না। Immortal সর্বোচ্চ rank হওয়ায় demotion হয় না। Weekly cycle শনিবার থেকে শুক্রবার; review শনিবার প্রায় রাত ১টায় (Bangladesh time) হওয়ার জন্য সেট করা। Lifetime TotalRP কমানো হয় না।</div></details>' +
        '<details><summary><span class="mat-rule-icon board"><i class="fa-solid fa-ranking-star"></i></span><span><strong>৬. All Time, Friends & Weekly</strong><small>তিনটি আলাদা ranking</small></span><i class="fa-solid fa-chevron-down mat-rule-chevron"></i></summary><div>All Time মোট lifetime RP অনুযায়ী; Friends শুধু accepted friends-দের মধ্যে; Weekly চলতি সপ্তাহের RP অনুযায়ী। এই তিনটি tab-এর ranking আলাদা, তবে student profile ও rank-এর তথ্য একই account-এর সঙ্গে sync হবে।</div></details>' +
        '<details><summary><span class="mat-rule-icon account"><i class="fa-solid fa-user-check"></i></span><span><strong>৭. Profile & Reward Sync</strong><small>তথ্য সম্পূর্ণ রাখুন</small></span><i class="fa-solid fa-chevron-down mat-rule-chevron"></i></summary><div>Leaderboard ব্যবহারের আগে নিজের নাম, কলেজ ও ব্যাচ পূরণ করে Save করুন। Network সমস্যা হলে status দেখে আবার sync করুন; নিশ্চিত না হওয়া reward-কে সফল ধরে নেবেন না।</div></details>' +
        '</div><p class="mat-rules-foot"><i class="fa-solid fa-circle-info"></i> পরীক্ষার পর sync হওয়া confirmed XP ও RP-ই এই version-এর final reward।</p></div>';
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
      host.innerHTML = '<div class="mat-rank-head"><strong>ACHIEVEMENT VAULT</strong><small>প্রথম trophy মাঝখানে থাকবে; swipe করে বাকি rank দেখুন</small></div><div class="mat-rank-rail" id="med-rank-rail" role="tablist" aria-label="Achievement Vault trophies"></div><div id="med-rank-progress" class="mat-rank-progress"></div>';
      if (podium && podium.parentNode) podium.parentNode.insertBefore(host, podium);
      else view.appendChild(host);
    }
  }
  function getMyRankEntry(rows) { return getMe(rows || []); }
  function bindRankRailSwipe(rail) {
    if (!rail || rail.dataset.rankSwipeBound === 'true') return;
    rail.dataset.rankSwipeBound = 'true';
    var dragging = false, didDrag = false, startX = 0, startScrollLeft = 0, activePointerId = null;
    rail.addEventListener('pointerdown', function (event) {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      dragging = true;
      didDrag = false;
      startX = event.clientX;
      startScrollLeft = rail.scrollLeft;
      activePointerId = event.pointerId;
      rail.classList.add('is-mouse-dragging');
    });
    document.addEventListener('pointermove', function (event) {
      if (!dragging || event.pointerId !== activePointerId) return;
      var delta = event.clientX - startX;
      if (Math.abs(delta) > 4) didDrag = true;
      if (didDrag) rail.scrollLeft = startScrollLeft - delta;
    }, true);
    document.addEventListener('pointerup', finish, true);
    document.addEventListener('pointercancel', finish, true);
    function finish(event) {
      if (!dragging || (event && event.pointerId !== activePointerId)) return;
      dragging = false;
      rail.classList.remove('is-mouse-dragging');
      if (didDrag) suppressRankClickUntil = Date.now() + 300;
      activePointerId = null;
    }
  }
  function centerFirstTrophy(rail, resetScroll) {
    if (!rail) return;
    var first = rail.querySelector('[data-med-rank]');
    if (!first) return;
    var railWidth = rail.clientWidth;
    var trophyWidth = first.getBoundingClientRect().width;
    var sideSpace = Math.max(0, Math.round((railWidth - trophyWidth) / 2));
    rail.style.paddingLeft = sideSpace + 'px';
    rail.style.paddingRight = sideSpace + 'px';
    if (resetScroll) rail.scrollLeft = 0;
  }
  function renderRankRail(rows) {
    var rail = document.getElementById('med-rank-rail');
    if (!rail) return;
    bindRankRailSwipe(rail);
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
        : '<span class="vault-trophy-pending" aria-hidden="true"></span>';
      return '<button type="button" role="tab" aria-selected="' + (active ? 'true' : 'false') + '" class="mat-rank-tier ' + rankClass(rank) + (active ? ' is-active' : '') + '" data-med-rank="' + escapeHtml(rank) + '" aria-label="' + escapeHtml(rank) + ' trophy">' +
        svg + '<span>' + escapeHtml(rank) + '</span></button>';
    }).join('');
    // Center the first trophy in the full-width rail. Symmetric side space
    // leaves room to scroll so the first trophy can move off to the left.
    var initialPosition = rail.dataset.initialRankPositioned !== 'true';
    centerFirstTrophy(rail, initialPosition);
    if (initialPosition) rail.dataset.initialRankPositioned = 'true';
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
    var serverProgress = me.rankProgress && typeof me.rankProgress === 'object' ? me.rankProgress : {};
    var threshold = Math.max(0, Number(serverProgress.safeZoneRP) || Math.ceil(required * 0.30));
    var promotionThreshold = Math.max(0, Number(serverProgress.promotionZoneRP) || Math.ceil(required * 0.70));
    var weeklyMode = selectedPeriod === 'weekly';
    var earnedThisPeriod = Math.max(0, Number(weeklyMode ? me.weeklyRankPoints : me.rankPoints) || 0);
    var atMax = !!(info && info.atMax) || String(me.rank || '').toLowerCase() === 'immortal';
    if (atMax || !required) {
      area.innerHTML = '<div class="mat-rank-progress-line"><span><strong>' + escapeHtml(me.rank || 'Immortal') + ' · সর্বোচ্চ Trophy</strong><small>আপনি সর্বোচ্চ rank-এ পৌঁছেছেন।</small></span><span class="mat-rank-rp"><i class="fa-solid fa-star"></i> ' + Math.floor(Number(me.totalRP || me.rankPoints) || 0).toLocaleString() + ' RP</span></div><div class="mat-safe-zone-caption"><i class="fa-solid fa-shield-check"></i> সর্বোচ্চ rank · আর promotion zone নেই</div>';
      return;
    }
    var pct = Math.max(0, Math.min(100, earnedThisPeriod / required * 100));
    if (weeklyMode && earnedThisPeriod > 0) pct = Math.max(1, pct);
    if (!weeklyMode) {
      area.innerHTML = '<div class="mat-rank-progress-line"><span><strong>বর্তমান: ' + escapeHtml(me.rank) + ' · পরের Trophy: ' + escapeHtml(info.nextName || 'পরবর্তী Trophy') + '</strong><small>' + earnedThisPeriod.toLocaleString() + ' / ' + required.toLocaleString() + ' Current RP</small></span><span class="mat-rank-rp"><i class="fa-solid fa-star"></i> ' + earnedThisPeriod.toLocaleString() + ' RP</span></div>' +
        '<div class="mat-rank-track" role="progressbar" aria-label="Trophy rank progress" aria-valuemin="0" aria-valuemax="' + required + '" aria-valuenow="' + Math.min(earnedThisPeriod, required) + '"><span style="width:' + pct + '%;background:linear-gradient(90deg,#a78bfa,#10b981)"></span><span class="mat-progress-star" style="left:' + pct + '%" aria-hidden="true"><i class="fa-solid fa-star"></i></span><small class="mat-progress-star-label" style="left:' + pct + '%" aria-hidden="true">RP</small></div>' +
        '<div class="mat-rank-foot"><span>' + earnedThisPeriod.toLocaleString() + ' RP</span><span>' + required.toLocaleString() + ' RP</span></div>';
      return;
    }
    var safePct = Math.max(0, Math.min(100, threshold / required * 100));
    var promotionPct = Math.max(safePct, Math.min(100, promotionThreshold / required * 100));
    var safe = earnedThisPeriod >= threshold;
    var promotion = earnedThisPeriod >= promotionThreshold;
    var safeRemaining = Math.max(0, threshold - earnedThisPeriod);
    var promotionRemaining = Math.max(0, promotionThreshold - earnedThisPeriod);
    var zoneTitle = promotion ? 'Promotion Zone অর্জন করেছেন' : (safe ? 'Safe Zone পার করেছেন · Promotion Zone-এর পথে' : 'Safe Zone-এ যেতে আরও ' + safeRemaining.toLocaleString() + ' RP প্রয়োজন');
    var zoneDetail = promotion ? 'পরবর্তী weekly review-তে ১ rank promotion-এর জন্য eligible' : (safe ? 'Promotion Zone-এ যেতে আরও ' + promotionRemaining.toLocaleString() + ' RP প্রয়োজন' : 'Safe Zone: ' + threshold.toLocaleString() + ' RP · Promotion Zone: ' + promotionThreshold.toLocaleString() + ' RP');
    var fillGradient = promotion ? 'linear-gradient(90deg,#10b981,#14b8a6,#a78bfa,#f0abfc)' : (safe ? 'linear-gradient(90deg,#059669,#34d399)' : 'linear-gradient(90deg,#f59e0b,#fb923c)');
    area.innerHTML = '<div class="mat-rank-progress-line"><span><strong>' + escapeHtml(me.rank) + ' → ' + escapeHtml(info.nextName || 'পরবর্তী Trophy') + '</strong><small>' + earnedThisPeriod.toLocaleString() + ' / ' + required.toLocaleString() + ' Weekly RP</small></span><span class="mat-rank-rp"><i class="fa-solid fa-star"></i> ' + earnedThisPeriod.toLocaleString() + ' RP</span></div>' +
      '<div class="mat-rank-track mat-rank-zones ' + (safe ? 'is-safe' : 'is-at-risk') + (promotion ? ' is-promotion' : '') + '" role="progressbar" aria-label="Safe Zone and Promotion Zone progress" aria-valuemin="0" aria-valuemax="' + required + '" aria-valuenow="' + Math.min(earnedThisPeriod, required) + '">' +
      '<span class="mat-rank-fill" style="width:' + pct + '%;background:' + fillGradient + '"></span><i class="mat-safe-zone-marker" style="left:' + safePct + '%" aria-label="Safe Zone threshold"></i><i class="mat-promotion-zone-marker" style="left:' + promotionPct + '%" aria-label="Promotion Zone threshold"></i><span class="mat-progress-star" style="left:' + pct + '%" aria-hidden="true"><i class="fa-solid fa-star"></i></span></div>' +
      '<div class="mat-rank-zone-legend"><span class="mat-zone-legend-safe"><i></i> Safe Zone · ' + threshold.toLocaleString() + ' RP</span><span class="mat-zone-legend-promotion"><i></i> Promotion Zone · ' + promotionThreshold.toLocaleString() + ' RP</span></div>' +
      '<div class="mat-rank-foot"><span>' + earnedThisPeriod.toLocaleString() + ' RP earned</span><span>' + required.toLocaleString() + ' RP to upgrade</span></div>' +
      '<div class="mat-safe-zone-caption ' + (promotion ? 'is-promotion' : (safe ? '' : 'at-risk')) + '"><i class="fa-solid ' + (promotion ? 'fa-trophy' : (safe ? 'fa-shield-check' : 'fa-triangle-exclamation')) + '"></i><span><strong>' + zoneTitle + '</strong><small>' + zoneDetail + '</small></span></div>';
  }
  function updateTopControls(me) {
    var rp = document.getElementById('med-top-rp');
    if (rp) rp.textContent = String(Math.max(0, Number(me && me.rankPoints) || Number(currentProfile && currentProfile.rankPoints) || 0)) + ' RP';
    var progress = {};
    try { progress = typeof app.getAccountProgress === 'function' ? app.getAccountProgress() : {}; } catch (_) {}
    var streakButton = document.querySelector('[data-med-action="streak"]');
    if (streakButton) {
      // Prefer the highest known value across the server snapshot and the
      // persistent local account record; stale/offline API responses must not
      // make the dashboard streak flash back to zero.
      var streak = Math.max(
        0,
        Number(me && me.streak) || 0,
        Number(currentProfile && currentProfile.streak) || 0,
        Number(progress.streak) || 0
      );
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
  function promotionZoneThresholdFor(row) {
    var vault = window.MedAchievementVaultTrophies;
    var info = vault && typeof vault.getRankInfoForName === 'function' ? vault.getRankInfoForName(row && row.rank) : null;
    if (!info && vault && typeof vault.getRankInfoForPoints === 'function') info = vault.getRankInfoForPoints(row && (row.totalRP || row.rankPoints) || 0);
    if (info && info.atMax) return 0;
    // Match the backend weekly-review rule: Promotion Zone starts at 70% of the next-rank RP requirement.
    return Math.max(0, Math.ceil((Number(info && info.required) || 0) * 0.70));
  }
  function isInWeeklyPromotionZone(row) {
    if (String(row && row.rank || '').toLowerCase() === 'immortal') return false;
    return Math.max(0, Number(row && row.weeklyRankPoints) || 0) >= promotionZoneThresholdFor(row);
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
    if (me && !rankSelectionTouched) selectedRank = me.rank;
    else if (!selectedRank) selectedRank = (me && me.rank) || (currentProfile && currentProfile.rank) || (app.profile && app.profile.rank) || RANKS[0];
    // The selected trophy is a real rank filter. Without this, the same student
    // appeared in every selected subrank even though their authoritative rank was unchanged.
    var displayRows = selectedPeriod === 'friends' ? all.slice() : all.filter(function (row) { return String(row.rank || '') === String(selectedRank || ''); });
    var promotionRows = [], safeRows = [], riskRows = [];
    if (selectedPeriod === 'weekly') {
      promotionRows = displayRows.filter(isInWeeklyPromotionZone);
      safeRows = displayRows.filter(function (row) { return !isInWeeklyPromotionZone(row) && isInWeeklySafeZone(row); });
      riskRows = displayRows.filter(function (row) { return !isInWeeklySafeZone(row); });
      displayRows = promotionRows.concat(safeRows, riskRows);
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
      var promotionDividerInserted = false;
      displayRows.forEach(function (row, index) {
        if (selectedPeriod === 'weekly' && !promotionDividerInserted && index === promotionRows.length && (safeRows.length || riskRows.length)) {
          var promotionDivider = document.createElement('tr');
          promotionDivider.className = 'promotion-zone-divider';
          promotionDivider.innerHTML = '<td colspan="2"><div class="leader-zone-divider-content"><i class="fa-solid fa-trophy"></i><span>PROMOTION ZONE BOUNDARY</span><span class="sr-only">Students above this line have reached the weekly promotion threshold.</span></div></td>';
          body.appendChild(promotionDivider);
          promotionDividerInserted = true;
        }
        if (selectedPeriod === 'weekly' && !safeDividerInserted && index === promotionRows.length + safeRows.length && riskRows.length) {
          var divider = document.createElement('tr');
          divider.className = 'safe-zone-divider';
          divider.innerHTML = '<td colspan="2"><div class="leader-zone-divider-content"><i class="fa-solid fa-shield-halved"></i><span>SAFE ZONE BOUNDARY</span><span class="sr-only">Students below this line have not reached the required weekly RP threshold.</span></div></td>';
          body.appendChild(divider);
          safeDividerInserted = true;
        }
        // Keep the top three in the regular leaderboard list as well as the podium.
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
        var promotionThreshold = promotionZoneThresholdFor(row);
        var weeklyRP = Math.max(0, Number(row.weeklyRankPoints) || 0);
        var isMaxRank = String(row.rank || '').toLowerCase() === 'immortal';
        var safeStatus = selectedPeriod !== 'weekly' ? '' : isMaxRank
          ? '<small class="leader-safe-status" title="আপনি সর্বোচ্চ rank-এ আছেন"><i class="fa-solid fa-arrow-trend-up"></i> Max Rank</small>'
          : isInWeeklyPromotionZone(row)
            ? '<small class="leader-safe-status" title="Promotion Zone অর্জিত"><i class="fa-solid fa-arrow-trend-up"></i> Promotion Zone Reached</small>'
            : isInWeeklySafeZone(row)
              ? '<small class="leader-safe-status" title="Promotion Zone-এ যেতে আরও ' + Math.max(0, promotionThreshold - weeklyRP).toLocaleString() + ' RP প্রয়োজন"><i class="fa-solid fa-arrow-trend-up"></i> +' + Math.max(0, promotionThreshold - weeklyRP).toLocaleString() + ' RP to promote</small>'
              : '<small class="leader-risk-status" title="Safe Zone-এ যেতে আরও ' + Math.max(0, safeThreshold - weeklyRP).toLocaleString() + ' RP প্রয়োজন"><i class="fa-solid fa-arrow-trend-down"></i> +' + Math.max(0, safeThreshold - weeklyRP).toLocaleString() + ' RP to safe</small>';
        tr.innerHTML = '<td class="leader-row-cell" colspan="2"><div class="leader-row-layout"><div class="leader-person"><span class="leader-avatar">' + avatarMarkup(row) + '</span><span class="leader-name-wrap"><b>' + escapeHtml(row.name || 'Medical Student') + '</b>' + (row.isMine ? '<em>YOU</em>' : '') + '</span></div><div class="leader-rank-stack"><strong class="leader-rank-number">' + (index + 1) + '</strong><small class="leader-points-label">' + Number(row.boardPoints || 0).toLocaleString() + ' RP</small>' + safeStatus + '</div></div></td>';
        body.appendChild(tr);
      });
      if (selectedPeriod === 'weekly' && !promotionDividerInserted && promotionRows.length && !safeRows.length && !riskRows.length) {
        var finalPromotionDivider = document.createElement('tr');
        finalPromotionDivider.className = 'promotion-zone-divider';
        finalPromotionDivider.innerHTML = '<td colspan="2"><div class="leader-zone-divider-content"><i class="fa-solid fa-trophy"></i><span>PROMOTION ZONE BOUNDARY</span><span class="sr-only">All listed students have reached the weekly promotion threshold.</span></div></td>';
        body.appendChild(finalPromotionDivider);
      }
      if (selectedPeriod === 'weekly' && !safeDividerInserted && safeRows.length && !riskRows.length) {
        var finalDivider = document.createElement('tr');
        finalDivider.className = 'safe-zone-divider';
        finalDivider.innerHTML = '<td colspan="2"><div class="leader-zone-divider-content"><i class="fa-solid fa-shield-halved"></i><span>SAFE ZONE BOUNDARY</span><span class="sr-only">All listed students are above this line.</span></div></td>';
        body.appendChild(finalDivider);
      }
      if (mePanel && me && displayRows.some(function (row) { return row.isMine || String(row.userId) === String(me.userId); })) {
        var ownIndex = displayRows.findIndex(function (row) { return row.isMine || String(row.userId) === String(me.userId); });
        mePanel.classList.remove('hidden');
        mePanel.innerHTML = '<div><span>Your Position · ' + escapeHtml(selectedRank) + '</span><strong>#' + (ownIndex + 1) + '</strong></div><div><b>' + escapeHtml(me.name) + '</b><small>' + Number(me.boardPoints || 0).toLocaleString() + ' ' + (selectedPeriod === 'weekly' ? 'Weekly RP' : 'Lifetime RP') + ' · ' + escapeHtml(me.rank) + '</small></div>';
      }
    } else {
      var emptyText = selectedPeriod === 'friends'
        ? 'আপনার Friends leaderboard এখন খালি। অন্য student-এর profile খুলে Friend Request পাঠান।'
        : selectedPeriod === 'weekly'
          ? 'Weekly leaderboard লোড হচ্ছে। এই সপ্তাহের RP sync হলে ranking এখানে দেখাবে।'
          : 'এই leaderboard-এ এখনো দেখানোর মতো student নেই।';
      body.innerHTML = '<tr><td colspan="2" class="py-10 text-center text-sm text-gray-500">' + emptyText + '</td></tr>';
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
      level: me.level, rank: me.rank, accountType: me.accountType, streak: me.streak
    }));
  }
  function avatarMarkup(row) {
    var rawAvatar = safeText(row && (row.avatar || row.Avatar) || '', 20000);
    var avatar = stripAvatarDefaultMarker(rawAvatar);
    var rowId = avatarIdForRow(row);
    var isMine = String(currentUserId() || '') === rowId;
    var manualAvatar = false;
    if (isMine) {
      try { manualAvatar = localStorage.getItem('med_profile_avatar_manual_v1_' + rowId) === '1'; } catch (_) {}
    }
    if (avatar === DEFAULT_STUDENT_AVATAR && !avatarHasDefaultMarker(rawAvatar) && !avatarHasCustomMarker(rawAvatar) && !manualAvatar) {
      avatar = defaultStudentAvatarForUser(rowId);
    }
    if (/^https:\/\//i.test(avatar) || /^data:image\/(?:webp|png);base64,[A-Za-z0-9+/=]+$/i.test(avatar) || /^data:image\/svg\+xml;charset=utf-8,%3Csvg/i.test(avatar)) {
      return '<img src="' + escapeHtml(avatar) + '" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
    }
    if (avatar && avatar.length <= 12 && !/[<>]/.test(avatar)) return escapeHtml(avatar);
    return '<img src="' + escapeHtml(defaultStudentAvatarForUser(rowId)) + '" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
  }

  function ensurePeriodTabs() {
    var tabs = document.getElementById('leaderboard-period-tabs');
    if (!tabs) {
      var view = document.getElementById('view-leaderboard');
      if (!view) return null;
      tabs = document.createElement('div');
      tabs.id = 'leaderboard-period-tabs';
      tabs.className = 'flex flex-wrap gap-2 mb-5';
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', 'Leaderboard period');
      var anchor = document.getElementById('leaderboard-period-note') ||
        document.getElementById('leaderboard-podium') ||
        document.getElementById('leaderboard-list');
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(tabs, anchor);
      else view.appendChild(tabs);
    }
    // Rebuild the period controls once per script version to remove stale/duplicate markup.
    if (tabs.dataset.medicalTabBuildVersion !== '31') {
      tabs.replaceChildren();
      tabs.dataset.medicalTabBuildVersion = '31';
    }
    var definitions = [
      { key: 'all-time', label: '🏆 All Time' },
      { key: 'weekly', label: '📅 Weekly' },
      { key: 'friends', label: '👥 Friends' }
    ];
    definitions.forEach(function (item) {
      var button = tabs.querySelector('[data-leaderboard-period="' + item.key + '"]');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', 'false');
        button.setAttribute('data-leaderboard-period', item.key);
        button.className = 'leaderboard-period-tab px-4 py-2 rounded-xl text-sm font-bold border flex-shrink-0 whitespace-nowrap';
        button.textContent = item.label;
      }
      button.style.setProperty('display', 'inline-flex', 'important');
      button.style.setProperty('visibility', 'visible', 'important');
      button.style.setProperty('opacity', '1', 'important');
      button.style.setProperty('flex', '0 0 auto', 'important');
      button.style.setProperty('min-height', '40px', 'important');
      button.style.setProperty('padding', '10px 16px', 'important');
      button.style.setProperty('border-radius', '12px', 'important');
      button.style.setProperty('font-weight', '800', 'important');
      button.style.setProperty('cursor', 'pointer', 'important');
      button.classList.add('flex-shrink-0', 'whitespace-nowrap');
      // Always append in the canonical All Time → Weekly → Friends order.
      tabs.appendChild(button);
    });
    tabs.classList.remove('hidden');
    tabs.removeAttribute('hidden');
    tabs.style.setProperty('display', 'flex', 'important');
    tabs.style.setProperty('visibility', 'visible', 'important');
    tabs.style.setProperty('opacity', '1', 'important');
    tabs.style.setProperty('flex-wrap', 'wrap', 'important');
    tabs.style.setProperty('gap', '8px', 'important');
    tabs.style.setProperty('width', '100%', 'important');
    tabs.style.setProperty('min-height', '40px', 'important');
    tabs.style.setProperty('position', 'relative', 'important');
    tabs.style.setProperty('z-index', '5', 'important');
    return tabs;
  }
  function ensureWeeklyTab() {
    var tabs = ensurePeriodTabs();
    return tabs ? tabs.querySelector('[data-leaderboard-period="weekly"]') : null;
  }

  function updatePeriodTabs() {
    ensureWeeklyTab();
    document.querySelectorAll('#leaderboard-period-tabs [data-leaderboard-period]').forEach(function (button) {
      var active = button.dataset.leaderboardPeriod === selectedPeriod;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.style.setProperty('background', active ? 'linear-gradient(135deg,#059669,#0284c7)' : 'rgba(148,163,184,.10)', 'important');
      button.style.setProperty('color', active ? '#ffffff' : 'var(--text, #334155)', 'important');
      button.style.setProperty('border-color', active ? '#059669' : 'rgba(148,163,184,.38)', 'important');
      button.style.setProperty('box-shadow', active ? '0 5px 14px rgba(5,150,105,.20)' : 'none', 'important');
    });
    renderLeaderboardPeriodNote();
    var friendsPanel = document.getElementById('leaderboard-friends-panel');
    if (friendsPanel) friendsPanel.classList.remove('hidden');
  }
  var leaderboardNoteClockStarted = false;
  function dhakaDateParts(date) {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date || new Date());
    var out = {};
    parts.forEach(function (part) { if (part.type !== 'literal') out[part.type] = part.value; });
    return { year: Number(out.year), month: Number(out.month), day: Number(out.day) };
  }
  function dateKeyFromParts(parts) {
    return String(parts.year) + '-' + String(parts.month).padStart(2, '0') + '-' + String(parts.day).padStart(2, '0');
  }
  function displayDateKey(key) {
    var parts = String(key || '').split('-').map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return key || '';
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric', month: 'short', timeZone: 'UTC'
    }).format(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])));
  }
  function renderLeaderboardPeriodNote() {
    startLeaderboardNoteClock();
    var note = document.getElementById('leaderboard-period-note');
    if (!note) return;
    note.classList.toggle('hidden', selectedPeriod === 'all-time');
    if (selectedPeriod === 'friends') {
      note.className = 'mb-4 rounded-2xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/20 p-3 text-sm text-sky-800 dark:text-sky-200';
      note.setAttribute('role', 'status');
      note.textContent = 'শুধু accepted friends-দের ranking। Friend request আপনার student profile থেকেই পরিচালনা করুন।';
      return;
    }
    if (selectedPeriod !== 'weekly') return;
    note.className = 'mb-4 rounded-2xl border border-blue-200 dark:border-blue-900/70 bg-blue-50 dark:bg-blue-950/30 p-4 text-sm text-blue-950 dark:text-blue-100';
    note.setAttribute('role', 'status');
    var now = new Date();
    var today = dhakaDateParts(now);
    var todayUtc = new Date(Date.UTC(today.year, today.month - 1, today.day));
    var weekday = todayUtc.getUTCDay(); // Sunday=0
    var daysSinceSaturday = (weekday + 1) % 7;
    var weekStartDate = new Date(todayUtc);
    weekStartDate.setUTCDate(weekStartDate.getUTCDate() - daysSinceSaturday);
    var weekEndDate = new Date(weekStartDate);
    weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
    var weekStartKey = dateKeyFromParts({ year: weekStartDate.getUTCFullYear(), month: weekStartDate.getUTCMonth() + 1, day: weekStartDate.getUTCDate() });
    var weekEndKey = dateKeyFromParts({ year: weekEndDate.getUTCFullYear(), month: weekEndDate.getUTCMonth() + 1, day: weekEndDate.getUTCDate() });
    var daysUntilSaturday = (6 - weekday + 7) % 7;
    if (daysUntilSaturday === 0) daysUntilSaturday = 7;
    // Bangladesh is UTC+6; next Saturday at 00:00 Dhaka is Friday 18:00 UTC.
    var nextSaturdayUtc = Date.UTC(today.year, today.month - 1, today.day + daysUntilSaturday, -6, 0, 0);
    var remainingMs = Math.max(0, nextSaturdayUtc - now.getTime());
    var totalMinutes = Math.floor(remainingMs / 60000);
    var days = Math.floor(totalMinutes / 1440);
    var hours = Math.floor((totalMinutes % 1440) / 60);
    var minutes = totalMinutes % 60;
    var countdown = days + ' দিন ' + hours + ' ঘণ্টা ' + minutes + ' মিনিট';
    note.innerHTML =
      '<div class="flex items-start gap-3">' +
        '<span class="mt-0.5 text-xl" aria-hidden="true">📅</span>' +
        '<div class="min-w-0 flex-1">' +
          '<p class="font-extrabold">এই সপ্তাহের Weekly Leaderboard</p>' +
          '<p class="mt-1 text-xs leading-relaxed text-blue-800 dark:text-blue-200">সময়কাল: <strong>' + displayDateKey(weekStartKey) + ' – ' + displayDateKey(weekEndKey) + '</strong> (বাংলাদেশ সময়)</p>' +
          '<p class="mt-2 text-sm font-bold"><span aria-hidden="true">⏳ </span>নতুন সপ্তাহ শুরু হতে বাকি: <span data-weekly-countdown>' + countdown + '</span></p>' +
          '<p class="mt-1 text-xs leading-relaxed text-blue-800 dark:text-blue-200">শনিবার রাত ১২টায় নতুন সপ্তাহ শুরু হবে। তখন Weekly RP-এর হিসাব নতুন সময়সীমা থেকে গণনা হবে; All Time RP অপরিবর্তিত থাকবে।</p>' +
        '</div>' +
      '</div>';
  }
  function startLeaderboardNoteClock() {
    if (leaderboardNoteClockStarted) return;
    leaderboardNoteClockStarted = true;
    window.setInterval(function () {
      if (selectedPeriod === 'weekly') renderLeaderboardPeriodNote();
    }, 30000);
  }
  function cachedRowsForDisplay() {
    // All Time, Friends and Weekly each get their own cache so one tab never
    // flashes another tab's result while its own request is syncing.
    var cached = getCache(selectedPeriod);
    return cached.length ? cached : [];
  }
  var leaderboardRefreshTimer = null;
  var leaderboardRefreshOriginalHtml = '';
  var leaderboardManualRefreshActive = false;
  function setLeaderboardRefreshBusy(busy, success) {
    var view = document.getElementById('view-leaderboard');
    var button = view && view.querySelector('button[onclick*="loadLeaderboard"]');
    if (!button) return;
    if (busy) {
      if (leaderboardRefreshTimer) { clearTimeout(leaderboardRefreshTimer); leaderboardRefreshTimer = null; }
      if (!leaderboardRefreshOriginalHtml) leaderboardRefreshOriginalHtml = button.innerHTML;
      leaderboardManualRefreshActive = true;
      button.disabled = true;
      button.classList.add('is-refreshing');
      button.setAttribute('aria-busy', 'true');
      button.innerHTML = '<i class="fa-solid fa-rotate mat-refresh-spin" aria-hidden="true"></i> Refreshing…';
      return;
    }
    if (!leaderboardManualRefreshActive) {
      button.classList.remove('is-refreshing');
      button.setAttribute('aria-busy', 'false');
      var idleIcon = button.querySelector('i');
      if (idleIcon) idleIcon.classList.remove('mat-refresh-spin');
      return;
    }
    button.classList.remove('is-refreshing');
    button.setAttribute('aria-busy', 'false');
    button.disabled = false;
    leaderboardManualRefreshActive = false;
    if (success !== true) {
      button.innerHTML = leaderboardRefreshOriginalHtml || '<i class="fa-solid fa-rotate" aria-hidden="true"></i> Refresh';
      leaderboardRefreshOriginalHtml = '';
      return;
    }
    button.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Refreshed';
    leaderboardRefreshTimer = setTimeout(function () {
      var currentView = document.getElementById('view-leaderboard');
      var currentButton = currentView && currentView.querySelector('button[onclick*="loadLeaderboard"]');
      if (currentButton) {
        currentButton.innerHTML = leaderboardRefreshOriginalHtml || '<i class="fa-solid fa-rotate" aria-hidden="true"></i> Refresh';
        currentButton.disabled = false;
        currentButton.classList.remove('is-refreshing');
        currentButton.setAttribute('aria-busy', 'false');
      }
      leaderboardRefreshOriginalHtml = '';
      leaderboardRefreshTimer = null;
    }, 1800);
  }
  function renderLeaderboardLoadingSkeleton() {
    var podium = document.getElementById('leaderboard-podium');
    var body = document.getElementById('leaderboard-body');
    var mePanel = document.getElementById('leaderboard-me');
    if (podium) {
      podium.innerHTML = Array.from({ length: 3 }, function () {
        return '<article class="podium-card animate-pulse" aria-hidden="true">' +
          '<div class="h-3 w-10 mx-auto rounded bg-gray-200 dark:bg-gray-700"></div>' +
          '<div class="h-14 w-14 mx-auto my-3 rounded-full bg-gray-200 dark:bg-gray-700"></div>' +
          '<div class="h-3 w-24 mx-auto rounded bg-gray-200 dark:bg-gray-700"></div>' +
          '<div class="h-3 w-16 mx-auto mt-2 rounded bg-gray-200 dark:bg-gray-700"></div>' +
          '</article>';
      }).join('');
    }
    if (body) {
      body.innerHTML = Array.from({ length: 5 }, function () {
        var cell = '<div class="h-3 w-20 mx-auto rounded bg-gray-200 dark:bg-gray-700"></div>';
        return '<tr class="animate-pulse" aria-hidden="true">' +
          '<td class="py-4 px-3"><div class="flex items-center gap-3"><div class="h-9 w-9 shrink-0 rounded-full bg-gray-200 dark:bg-gray-700"></div><div class="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700"></div></div></td>' +
          '<td class="py-4 px-3">' + cell + '</td><td class="py-4 px-3">' + cell + '</td>' +
          '<td class="py-4 px-3">' + cell + '</td><td class="py-4 px-3">' + cell + '</td></tr>';
      }).join('');
    }
    if (mePanel) {
      mePanel.innerHTML = '';
      mePanel.classList.add('hidden');
    }
  }

  async function loadLeaderboard(silent) {
    // Only an explicit refresh-button click should animate; tab changes and background syncs are silent.
    if (!silent) setLeaderboardRefreshBusy(true);
    ensureUI();
    var periodForRequest = selectedPeriod;
    // Invalidate the previous tab request immediately, before any asynchronous Friends sync.
    // Otherwise a slow friendConnections call leaves the old All-Time request valid long enough
    // to repaint the table after the user has already switched to Friends.
    var requestId = ++loadSequence;
    var leaderboardView = document.getElementById('view-leaderboard');
    if (leaderboardView && !leaderboardView.classList.contains('hidden') && !hasRequiredLeaderboardProfile()) {
      showLeaderboardProfileGate();
      setLeaderboardRefreshBusy(false);
      return;
    }

    // Paint this tab's own local snapshot before waiting on the API.
    var cache = getCache(periodForRequest);
    if (cache.length) {
      rawRows = cache.map(function (row) { return row && row.raw ? row.raw : row; });
      renderRows(cache);
    } else {
      rawRows = [];
      renderRows([]);
      if (periodForRequest === 'friends') renderLeaderboardLoadingSkeleton();
    }

    if (periodForRequest === 'friends' && window.MedStudentFriends && typeof window.MedStudentFriends.loadConnections === 'function') {
      try { await window.MedStudentFriends.loadConnections(true); }
      catch (friendError) {
        if (requestId === loadSequence) {
          var friendsErrorText = window.MedStudentFriends && typeof window.MedStudentFriends.getLastConnectionError === 'function'
            ? window.MedStudentFriends.getLastConnectionError() : '';
          setStatus(friendsErrorText || 'Friends list load হয়নি। Existing Google Sheets API/deployment পরীক্ষা করুন।', true);
        }
      }
      if (requestId !== loadSequence) return;
      // Re-filter the cached Friends snapshot using the freshly loaded friend IDs.
      cache = getCache(periodForRequest);
      if (cache.length) {
        rawRows = cache.map(function (row) { return row && row.raw ? row.raw : row; });
        renderRows(cache);
      } else {
        rawRows = [];
        renderRows([]);
        renderLeaderboardLoadingSkeleton();
      }
    }
    if (requestId !== loadSequence) return;
    if (!API_URL()) { setStatus('Medical Sheets API URL সেট করা নেই।', true); setLeaderboardRefreshBusy(false); return; }
    if (!app.authStateResolved && !app.authUser) {
      setStatus('Account session যাচাই হচ্ছে…', false);
      setLeaderboardRefreshBusy(false);
      return;
    }
    if (app.__medicalRegistrationInProgress) {
      setStatus('Account তৈরি হচ্ছে…', false);
      if (!silent) setLeaderboardRefreshBusy(false);
      return;
    }
    var refreshSucceeded = false;
    try {
      await syncIdentity();
      if (requestId !== loadSequence) return;
      var apiPeriod = periodForRequest === 'weekly' ? 'weekly' : 'all-time';
      var leaderboardPayload = { action: 'leaderboard', period: apiPeriod };
      if (periodForRequest !== 'friends' && currentUserId()) {
        // The notification center can request exact global positions for accepted friends,
        // including those outside the public Top-100 list. Normal navigation stays unchanged.
        var activityFriendIds = periodForRequest === 'weekly'
          ? (Array.isArray(window.__medActivityFriendIdsForWeeklyRefresh) ? window.__medActivityFriendIdsForWeeklyRefresh : [])
          : (Array.isArray(window.__medActivityFriendIdsForAllTimeRefresh) ? window.__medActivityFriendIdsForAllTimeRefresh : []);
        leaderboardPayload.includeUserIds = Array.from(new Set([currentUserId()].concat(activityFriendIds.map(String).filter(Boolean)))).slice(0, 500);
      }
      if (periodForRequest === 'friends') {
        var friendIds = window.MedStudentFriends && typeof window.MedStudentFriends.getFriendIds === 'function'
          ? window.MedStudentFriends.getFriendIds().map(String) : [];
        var myId = currentUserId();
        if (myId) friendIds.push(String(myId));
        leaderboardPayload.userIds = Array.from(new Set(friendIds)).slice(0, 500);
      }
      var response = await request(leaderboardPayload, { method: periodForRequest === 'friends' ? 'POST' : 'GET' });
      if (requestId !== loadSequence) return;
      var entries = extractEntries(response);
      var responsePeriod = String(response && (response.period || response.scope) || '').toLowerCase();
      var hasWeeklyScores = entries.length > 0 && entries.every(function (entry) {
        return entry && (Object.prototype.hasOwnProperty.call(entry, 'weeklyRP') ||
          Object.prototype.hasOwnProperty.call(entry, 'weeklyRankPoints'));
      });
      if (periodForRequest === 'weekly' && response &&
          response.weekly !== true && responsePeriod !== 'weekly' && !hasWeeklyScores) {
        throw new Error('Apps Script Web App থেকে Weekly RP data আসেনি। Latest Medical_Admission_Tracker_Backend.gs version deploy করতে হবে।');
      }
      rawRows = entries.slice();
      var rows = normalizeRows(entries);
      saveCache(rows, periodForRequest);
      if (periodForRequest === 'all-time') {
        var directoryQuery = String((document.getElementById('leaderboard-friend-search') || {}).value || '').trim();
        // Search results come from the full server-side directory; never replace
        // them with only the public Top-100 leaderboard cache.
        if (directoryQuery.length < 2) renderFriendDirectory(directoryQuery);
      }
      renderRows(rows);
      var weekLabel = response && response.weekStart ? ' · week of ' + response.weekStart : '';
      setStatus('Medical leaderboard synced' + weekLabel + '.', false);
      refreshSucceeded = true;
    } catch (error) {
      if (requestId !== loadSequence) return;
      setStatus('Medical leaderboard sync হয়নি; available cached data দেখানো হচ্ছে। ' + apiErrorMessage(error), true);
    } finally {
      // A newer silent/background/tab refresh must also stop an animation started by a manual refresh.
      if (requestId === loadSequence) setLeaderboardRefreshBusy(false, refreshSucceeded);
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
      score: Math.max(0, Number(item.score != null ? item.score : item.quizPoints) || 0),
      subject: safeText(item.subject || '', 80),
      year: safeText(item.year || '', 40),
      timeUsed: safeText(item.timeUsed || '', 20),
      // Include the latest browser-persisted streak snapshot so a backend
      // deployment that stores streak metadata can keep the server in sync.
      streak: Math.max(0, Number((app.getAccountProgress && app.getAccountProgress() || {}).streak) || 0),
      lastExamDate: String((app.getAccountProgress && app.getAccountProgress() || {}).lastExamDate || ''),
      highestStreak: Math.max(0, Number((app.getAccountProgress && app.getAccountProgress() || {}).highestStreak) || 0)
    }));
    var user = response.user || response.profile || null;
    if (user) applyProfile(user);
    var reward = {
      success: true, synced: true, pending: false,
      attemptId: String(item.attemptId || response.attemptId || ''),
      xpGained: Number(response.xpGained || 0),
      rankPointsDelta: Number(response.rankPointsDelta || 0),
      pbGained: Number(response.pbGained || 0),
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
      examMode: safeText(meta.examMode || (app.examState && app.examState.mode) || 'Exam', 60),
      subject: safeText(meta.subject || (app.examState && app.examState.subject) || '', 80),
      year: safeText(meta.year || (app.examState && app.examState.year) || '', 40),
      timeUsed: safeText(meta.timeUsed || '', 20)
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
    var targetId = String(userId || '');
    var row = normalizeRows(rawRows).find(function (entry) { return String(entry.userId) === targetId; }) ||
      normalizeRows(friendDirectoryRows).find(function (entry) { return String(entry.userId) === targetId; }) ||
      normalizeRows(getCache('all-time')).find(function (entry) { return String(entry.userId) === targetId; });
    if (!row && window.MedStudentFriends && typeof window.MedStudentFriends.getConnectionData === 'function') {
      var connectionData = window.MedStudentFriends.getConnectionData();
      var person = (connectionData.friends || []).find(function (item) { return String(item.userId || item.uid || item.playerId || '') === targetId; });
      if (!person) {
        var request = (connectionData.incoming || []).find(function (item) { return String(item.fromUid) === targetId; }) ||
          (connectionData.outgoing || []).find(function (item) { return String(item.toUid) === targetId; });
        if (request) person = {
          userId: targetId, name: request.fromUid === targetId ? request.fromName : request.toName,
          college: request.fromUid === targetId ? request.fromCollege : '', batch: request.fromUid === targetId ? request.fromBatch : ''
        };
      }
      if (person) row = normalizeRows([person])[0] || null;
    }
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
  function profileCompletionStorageKey() {
    var id = currentUserId();
    return id ? 'med_leaderboard_profile_complete_v1_' + id : '';
  }
  function markLeaderboardProfileComplete(profile) {
    profile = profile || leaderboardProfileFields();
    if (profile.name.length < 2 || !profile.college || !profile.batch) return false;
    var key = profileCompletionStorageKey();
    if (!key) return false;
    try { localStorage.setItem(key, '1'); return true; } catch (_) { return false; }
  }
  function hasRequiredLeaderboardProfile() {
    var profile = leaderboardProfileFields();
    if (profile.name.length >= 2 && !!profile.college && !!profile.batch) {
      markLeaderboardProfileComplete(profile);
      return true;
    }
    var key = profileCompletionStorageKey();
    if (key) {
      try { if (localStorage.getItem(key) === '1') return true; } catch (_) {}
    }
    return false;
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
    if (nameInput && !nameInput.value) nameInput.value = fields.name;
    if (collegeInput && !collegeInput.value) collegeInput.value = fields.college;
    if (batchInput && !batchInput.value) batchInput.value = fields.batch;
    setTimeout(function () {
      editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var firstMissing = !fields.name || fields.name.length < 2 ? nameInput : !fields.college ? collegeInput : batchInput;
      if (firstMissing) firstMissing.focus({ preventScroll: true });
    }, 50);
    return false;
  }
  function ensureFriendManageButton() {
    var view = document.getElementById('view-leaderboard');
    if (!view) return null;
    var button = document.getElementById('leaderboard-manage-friends');
    if (!button) {
      var refresh = view.querySelector('button[onclick*="loadLeaderboard"]');
      if (!refresh || !refresh.parentNode) return null;
      button = document.createElement('button');
      button.id = 'leaderboard-manage-friends';
      button.type = 'button';
      button.className = 'mat-manage-friends-button';
      button.setAttribute('data-med-action', 'manage-friends');
      button.innerHTML = '<i class="fa-solid fa-user-group" aria-hidden="true"></i> Friends &amp; Requests';
      refresh.parentNode.insertBefore(button, refresh);
    }
    button.style.setProperty('display', 'inline-flex', 'important');
    button.style.setProperty('visibility', 'visible', 'important');
    button.style.setProperty('opacity', '1', 'important');
    return button;
  }

  function ensureFriendDirectory() {
    var panel = document.getElementById('leaderboard-friends-panel');
    var list = document.getElementById('leaderboard-friend-request-list');
    if (!panel) return null;
    var region = document.getElementById('leaderboard-friend-directory');
    if (!region) {
      region = document.createElement('section');
      region.id = 'leaderboard-friend-directory';
      region.className = 'mat-friend-directory';
      region.innerHTML = '<label for="leaderboard-friend-search">Find students to add</label>' +
        '<input id="leaderboard-friend-search" type="search" autocomplete="off" maxlength="80" placeholder="Search by name, college or batch…" aria-describedby="leaderboard-friend-search-help">' +
        '<p id="leaderboard-friend-search-help">Search the global student list, not just the currently selected rank.</p>' +
        '<div id="leaderboard-friend-search-results" role="list" aria-live="polite"><p>Student list load হলে নাম দিয়ে খুঁজতে পারবেন।</p></div>';
      if (list && list.parentNode === panel) panel.insertBefore(region, list);
      else panel.appendChild(region);
      var input = region.querySelector('#leaderboard-friend-search');
      if (input) input.addEventListener('input', function () {
        if (friendDirectorySearchTimer) clearTimeout(friendDirectorySearchTimer);
        friendDirectoryRows = [];
        renderFriendDirectory(input.value);
        var searchTerm = String(input.value || '').trim();
        if (searchTerm.length < 2) return;
        friendDirectorySearchTimer = setTimeout(function () {
          loadFriendDirectoryRows(searchTerm).catch(function () {});
        }, 350);
      });
    }
    return region;
  }

  function formatStudentBatch(value) {
    return String(value || '').trim()
      .replace(/\bhsc\b/gi, 'HSC')
      .replace(/\bssc\b/gi, 'SSC');
  }

  function renderFriendDirectory(query) {
    var region = ensureFriendDirectory();
    if (!region) return;
    var results = region.querySelector('#leaderboard-friend-search-results');
    if (!results) return;
    var term = String(query || '').trim().toLowerCase();
    if (term.length < 2) {
      results.innerHTML = '<p class="mat-profile-empty">কাউকে খুঁজতে নাম, কলেজ বা batch-এর অন্তত ২টি অক্ষর লিখুন।</p>';
      return;
    }
    if (!friendDirectoryRows.length) {
      results.innerHTML = '<p class="mat-profile-empty">Student directory-তে খোঁজা হচ্ছে…</p>';
      return;
    }
    var matches = friendDirectoryRows.filter(function (row) {
      if (!row || row.isMine || String(row.userId) === String(currentUserId())) return false;
      return [row.name, row.college, row.batch].some(function (value) {
        return String(value || '').toLowerCase().indexOf(term) >= 0;
      });
    }).slice(0, 10);
    if (!matches.length) {
      results.innerHTML = '<p class="mat-profile-empty">কোনো student মেলেনি। বানান বা college/batch দিয়ে আবার খুঁজুন।</p>';
      return;
    }
    var connections = window.MedStudentFriends && typeof window.MedStudentFriends.getConnectionData === 'function'
      ? window.MedStudentFriends.getConnectionData() : { incoming: [], outgoing: [] };
    var outgoing = Array.isArray(connections.outgoing) ? connections.outgoing : [];
    var incoming = Array.isArray(connections.incoming) ? connections.incoming : [];
    results.innerHTML = matches.map(function (row) {
      var uid = String(row.userId || '');
      var relation = window.MedStudentFriends && typeof window.MedStudentFriends.getRelationship === 'function'
        ? window.MedStudentFriends.getRelationship(uid) : 'unknown';
      var serverRelation = relation;
      var sentStateKey = 'med_friend_request_sent_v1_' + accountKey() + '_' + uid;
      var locallyConfirmedSent = false;
      try { locallyConfirmedSent = localStorage.getItem(sentStateKey) === 'sent'; } catch (_) {}
      // Keep the success state visible if the connection refresh briefly returns stale data.
      // Do not clear the local confirmation just because this render temporarily used it
      // to present "outgoing"; clear it only when the connection API itself confirms a state.
      if (locallyConfirmedSent && relation !== 'friends' && relation !== 'incoming' && relation !== 'outgoing') relation = 'outgoing';
      if (serverRelation === 'friends' || serverRelation === 'incoming' || serverRelation === 'outgoing') {
        try { localStorage.removeItem(sentStateKey); } catch (_) {}
      }
      var outRequest = outgoing.find(function (item) { return String(item.toUid) === uid; });
      var inRequest = incoming.find(function (item) { return String(item.fromUid) === uid; });
      var relationLabel = '';
      if (relation === 'friends') {
        relationLabel = '<span class="mat-friend-state">Friends</span><button type="button" class="mat-row-friend-button danger" data-med-friend-remove="' + escapeHtml(uid) + '"><i class="fa-solid fa-user-minus" aria-hidden="true"></i> Remove Friend</button>';
      } else if (relation === 'outgoing') {
        var outgoingRequestId = String(outRequest && outRequest.id || '');
        relationLabel = '<span class="mat-friend-state pending"><i class="fa-solid fa-clock" aria-hidden="true"></i> ' +
          (outgoingRequestId ? 'Request Sent · Pending' : outRequest && outRequest.idSyncFailed ? 'Request Sent · ID unavailable' : 'Request Sent · Syncing') +
          '</span><button type="button" class="mat-row-friend-button" data-med-friend-cancel-request="' + escapeHtml(outgoingRequestId) + '"' +
          (!outgoingRequestId ? ' disabled title="' + (outRequest && outRequest.idSyncFailed ? 'Backend request ID পাওয়া যায়নি; API deployment পরীক্ষা করুন' : 'Request ID sync হচ্ছে; একটু পরে আবার দেখুন') + '"' : '') +
          '><i class="fa-solid fa-xmark" aria-hidden="true"></i> Cancel Request</button>';
      } else if (relation === 'incoming') {
        relationLabel = '<span class="mat-friend-state incoming">Incoming Request</span><button type="button" class="mat-row-friend-button" data-med-friend-accept-request="' + escapeHtml(inRequest && inRequest.id || '') + '"><i class="fa-solid fa-user-check" aria-hidden="true"></i> Accept</button><button type="button" class="mat-row-friend-button danger" data-med-friend-reject-request="' + escapeHtml(inRequest && inRequest.id || '') + '">Reject</button>';
      } else {
        relationLabel = (window.MedStudentFriends && typeof window.MedStudentFriends.canManageFriends === 'function' && window.MedStudentFriends.canManageFriends())
          ? '<button type="button" class="mat-row-friend-button" data-med-friend-send="' + escapeHtml(uid) + '" data-med-friend-name="' + escapeHtml(row.name || 'Student') + '"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> Add Friend</button>'
          : '<span class="mat-friend-state">Open Profile</span>';
      }
      var details = [
        row.college ? 'College: ' + row.college : '',
        formatStudentBatch(row.batch) ? 'Class/Batch: ' + formatStudentBatch(row.batch) : '',
        row.rank ? 'Rank: ' + row.rank + ' · Level ' + Math.max(1, Number(row.level) || 1) : ''
      ].filter(Boolean);
      return '<article class="mat-friend-search-result" data-med-friend-open-profile="' + escapeHtml(uid) + '" role="button" tabindex="0" aria-label="Open ' + escapeHtml(row.name || 'Student') + ' profile">' +
        '<span class="mat-friend-search-avatar">' + avatarMarkup(row) + '</span>' +
        '<div class="mat-friend-search-copy"><strong>' + escapeHtml(row.name || 'Student') + '</strong><small>' +
        escapeHtml(details.join(' | ') || 'Medical student') +
        '</small></div><div class="mat-friend-search-action">' + relationLabel + '</div></article>';
    }).join('');
  }

  async function loadFriendDirectoryRows(query) {
    ensureFriendDirectory();
    var input = document.getElementById('leaderboard-friend-search');
    var searchTerm = safeText(query != null ? query : (input ? input.value : ''), 80);
    if (searchTerm.length < 2) {
      friendDirectoryRows = [];
      renderFriendDirectory(searchTerm);
      return [];
    }
    var sequence = ++friendDirectorySearchSequence;
    friendDirectoryRows = [];
    renderFriendDirectory(searchTerm);
    var results = document.getElementById('leaderboard-friend-search-results');
    var load = (async function () {
      try {
        await syncIdentity();
        var credentials = await credentialsForCurrentUser();
        const response = await request(Object.assign({
          action: 'searchStudents', query: searchTerm, limit: 20
        }, credentials), { method: 'POST' });
        const entries = extractEntries(response);
        if (sequence !== friendDirectorySearchSequence) return [];
        const currentQuery = String((document.getElementById('leaderboard-friend-search') || {}).value || '').trim();
        if (currentQuery.toLowerCase() !== searchTerm.toLowerCase()) return [];
        friendDirectoryRows = normalizeRows(entries);
        renderFriendDirectory(searchTerm);
        return friendDirectoryRows;
      } catch (error) {
        if (sequence === friendDirectorySearchSequence && results) {
          results.innerHTML = '<p class="mat-profile-empty">Student directory load হয়নি: ' + escapeHtml(apiErrorMessage(error)) + '</p>';
        }
        throw error;
      } finally {
        if (friendDirectoryLoadPromise === load) friendDirectoryLoadPromise = null;
      }
    })();
    friendDirectoryLoadPromise = load;
    return load;
  }

  function setFriendActionStatus(message, isError) {
    var el = document.getElementById('leaderboard-friend-status');
    if (!el) return;
    el.textContent = String(message || '');
    el.classList.remove('hidden', 'text-red-600', 'text-emerald-700');
    el.classList.add(isError ? 'text-red-600' : 'text-emerald-700');
  }

  function markFriendRequestSentButton(button, friendsApi, targetId) {
    if (!button) return '';
    var connections = friendsApi && typeof friendsApi.getConnectionData === 'function'
      ? friendsApi.getConnectionData() : { outgoing: [] };
    var pending = (Array.isArray(connections.outgoing) ? connections.outgoing : [])
      .find(function (request) { return String(request.toUid || '') === String(targetId || ''); });
    var requestId = String(pending && pending.id || '');
    button.classList.remove('is-loading');
    button.classList.add('is-success');
    button.removeAttribute('data-med-friend-send');
    button.removeAttribute('data-med-friend-name');
    button.setAttribute('aria-label', requestId
      ? 'Friend request sent. Activate to cancel.'
      : 'Friend request sent. Waiting for cancellation details to sync.');
    if (requestId) {
      button.setAttribute('data-med-friend-cancel-request', requestId);
      button.innerHTML = '<i class="fa-solid fa-clock" aria-hidden="true"></i> Request Sent · Cancel';
      button.disabled = false;
    } else {
      button.removeAttribute('data-med-friend-cancel-request');
      var syncFailed = !!(pending && pending.idSyncFailed);
      button.innerHTML = '<i class="fa-solid fa-' + (syncFailed ? 'triangle-exclamation' : 'clock') + '" aria-hidden="true"></i> Request Sent · ' + (syncFailed ? 'ID unavailable' : 'Syncing');
      button.title = syncFailed ? 'Backend request ID পাওয়া যায়নি; API deployment পরীক্ষা করুন' : 'Request ID sync হচ্ছে';
      button.disabled = true;
    }
    return requestId;
  }

  function ensureUI() {
    injectStyles();
    ensureTopControls();
    ensureFriendManageButton();
    ensureFriendDirectory();
    ensureOverlays();
    ensureRankBanner();
    // selectedPeriod is the live UI state. Do not overwrite it here during
    // refreshes or background syncs; only boot/storage/tab events may change it.
    updatePeriodTabs();
  }
  window.addEventListener('resize', function () {
    var rail = document.getElementById('med-rank-rail');
    if (rail) centerFirstTrophy(rail, false);
  });
  function bindEvents() {
    document.addEventListener('click', async function (event) {
      if (suppressRankClickUntil > Date.now() && event.target.closest && event.target.closest('#med-rank-rail')) {
        suppressRankClickUntil = 0;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      var periodButton = event.target.closest && event.target.closest('[data-leaderboard-period]');
      if (periodButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        var requestedPeriod = periodButton.dataset.leaderboardPeriod;
        var nextPeriod = requestedPeriod === 'weekly' || requestedPeriod === 'friends' ? requestedPeriod : 'all-time';
        // Do not carry a stale manually selected trophy into another tab. Default to
        // the signed-in student's authoritative rank so Weekly never opens on an empty league.
        if (nextPeriod !== selectedPeriod) {
          rankSelectionTouched = false;
          var identityRows = rawRows.length ? normalizeRows(rawRows) : getCache(selectedPeriod);
          var identityRow = getMe(identityRows);
          selectedRank = (identityRow && identityRow.rank) || (currentProfile && currentProfile.rank) || (app.profile && app.profile.rank) || '';
          if (selectedRank) {
            try { localStorage.setItem(SELECTED_RANK_KEY + accountKey(), selectedRank); } catch (_) {}
          }
        }
        selectedPeriod = savePeriod(nextPeriod);
        updatePeriodTabs();
        await loadLeaderboard();
        if (selectedPeriod === 'friends') {
          loadFriendDirectoryRows().catch(function () {});
          var friendPanel = document.getElementById('leaderboard-friends-panel');
          if (friendPanel) friendPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }
      var rankButton = event.target.closest && event.target.closest('[data-med-rank]');
      if (rankButton) {
        selectedRank = rankButton.dataset.medRank;
        rankSelectionTouched = true;
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
      var friendActionButton = event.target.closest && event.target.closest(
        '[data-med-friend-send],[data-med-friend-cancel-request],[data-med-friend-remove],[data-med-friend-accept-request],[data-med-friend-reject-request]'
      );
      if (friendActionButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        var friendsApi = window.MedStudentFriends;
        if (!friendsApi) {
          setFriendActionStatus('Friends system এখনও load হয়নি। পেজ refresh করে আবার চেষ্টা করুন।', true);
          return;
        }
        var friendAction = friendActionButton.hasAttribute('data-med-friend-send') ? 'send'
          : friendActionButton.hasAttribute('data-med-friend-cancel-request') ? 'cancel'
          : friendActionButton.hasAttribute('data-med-friend-remove') ? 'remove'
          : friendActionButton.hasAttribute('data-med-friend-accept-request') ? 'accept' : 'reject';
        var targetId = String(friendActionButton.dataset.medFriendSend || friendActionButton.dataset.medFriendRemove || '');
        var requestId = String(friendActionButton.dataset.medFriendCancelRequest || friendActionButton.dataset.medFriendAcceptRequest || friendActionButton.dataset.medFriendRejectRequest || '');
        var friendName = String(friendActionButton.dataset.medFriendName || 'Student');
        if (friendAction === 'remove' && !window.confirm('এই student-কে Friends list থেকে remove করবেন?')) return;
        var busyText = friendAction === 'send' ? 'Friend request পাঠানো হচ্ছে…'
          : friendAction === 'cancel' ? 'Friend request cancel হচ্ছে…'
          : friendAction === 'remove' ? 'Friend remove হচ্ছে…'
          : friendAction === 'accept' ? 'Friend request accept হচ্ছে…' : 'Friend request reject হচ্ছে…';
        var successText = friendAction === 'send' ? 'Friend request successfully sent. এখন SENT REQUESTS-এ pending দেখাবে; চাইলে Cancel করতে পারবেন।'
          : friendAction === 'cancel' ? 'Friend request cancelled successfully. এখন চাইলে আবার Add Friend করতে পারবেন।'
          : friendAction === 'remove' ? 'Friend removed successfully. চাইলে আবার Friend Request পাঠাতে পারবেন।'
          : friendAction === 'accept' ? 'Friend request accepted successfully. এখন Friends list-এ দেখা যাবে।'
          : 'Friend request rejected successfully.';
        setFriendActionStatus(busyText, false);
        friendActionButton.disabled = true;
        var friendRequestSendSucceeded = false;
        if (friendAction === 'send') {
          // Show progress on the actual search-result button immediately, not only
          // in the shared status line below the directory.
          friendActionButton.classList.remove('is-success');
          friendActionButton.classList.add('is-loading');
          friendActionButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Sending Request…';
          friendActionButton.setAttribute('aria-label', 'Sending friend request');
        } else {
          friendActionButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ' + busyText;
        }
        try {
          if (friendAction === 'send') {
            // Keep this button loading until sendRequest's API/duplicate reconciliation
            // has finished; only then change the same button into Cancel.
            await friendsApi.sendRequest({ userId: targetId, uid: targetId, name: friendName });
            friendRequestSendSucceeded = true;
            try { localStorage.setItem('med_friend_request_sent_v1_' + accountKey() + '_' + targetId, 'sent'); } catch (_) {}
            markFriendRequestSentButton(friendActionButton, friendsApi, targetId);
            setFriendActionStatus('✓ Friend request sent to ' + friendName + '. Requestটি pending; চাইলে Cancel করতে পারবেন।', false);
          } else if (friendAction === 'cancel') {
            var cancelRow = friendActionButton.closest('.mat-friend-search-result');
            var cancelTargetId = cancelRow ? String(cancelRow.dataset.medFriendOpenProfile || '') : '';
            await friendsApi.cancelRequest(requestId);
            if (cancelTargetId) { try { localStorage.removeItem('med_friend_request_sent_v1_' + accountKey() + '_' + cancelTargetId); } catch (_) {} }
          }
          else if (friendAction === 'remove') await friendsApi.removeFriend(targetId);
          else if (friendAction === 'accept') await friendsApi.acceptRequest(requestId);
          else await friendsApi.rejectRequest(requestId);
          if (friendAction === 'cancel') {
            friendActionButton.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Cancelled';
            friendActionButton.classList.add('is-success');
            friendActionButton.setAttribute('aria-label', 'Friend request cancelled successfully');
            setFriendActionStatus(successText, false);
            await new Promise(function (resolve) { setTimeout(resolve, 1800); });
          }
          // Friend mutations already apply the backend's authoritative connection snapshot.
          // Reuse it instead of forcing a second read that can race and revert the new state.
          await friendsApi.loadConnections();
          renderFriendDirectory((document.getElementById('leaderboard-friend-search') || {}).value || '');
          setFriendActionStatus(successText, false);
          await loadLeaderboard(true);
        } catch (error) {
          if (friendAction === 'send' && !friendRequestSendSucceeded) {
            var sendErrorMessage = String(error && error.message || error || 'Friend request পাঠানো যায়নি। আবার চেষ্টা করুন।');
            // Reconcile first: a request can succeed server-side even when the client
            // doesn't receive a valid response, and a duplicate error means it exists.
            try { await friendsApi.loadConnections(true); } catch (_) {}
            var connectionSnapshot = friendsApi.getConnectionData && friendsApi.getConnectionData();
            var isPendingAfterError = !!(connectionSnapshot &&
              Array.isArray(connectionSnapshot.outgoing) &&
              connectionSnapshot.outgoing.some(function (request) { return String(request.toUid || '') === targetId; }));
            if (isPendingAfterError || (friendsApi.getRelationship && friendsApi.getRelationship(targetId) === 'outgoing')) {
              try { localStorage.setItem('med_friend_request_sent_v1_' + accountKey() + '_' + targetId, 'sent'); } catch (_) {}
              // Preserve the pending UI, but never hide the actual API error.
              markFriendRequestSentButton(friendActionButton, friendsApi, targetId);
            } else {
              try { localStorage.removeItem('med_friend_request_sent_v1_' + accountKey() + '_' + targetId); } catch (_) {}
              friendActionButton.innerHTML = '<i class="fa-solid fa-user-plus" aria-hidden="true"></i> Add Friend';
              friendActionButton.classList.remove('is-success', 'is-loading');
              friendActionButton.removeAttribute('aria-label');
              friendActionButton.disabled = false;
            }
            renderFriendDirectory((document.getElementById('leaderboard-friend-search') || {}).value || '');
            try { await loadLeaderboard(true); } catch (_) {}
            setFriendActionStatus(sendErrorMessage, true);
          } else if (friendAction === 'send' && friendRequestSendSucceeded) {
            // Sending succeeded even if a later background refresh failed. Preserve Cancel.
            markFriendRequestSentButton(friendActionButton, friendsApi, targetId);
            setFriendActionStatus('✓ Friend request sent to ' + friendName + '. Requestটি pending আছে।', false);
          } else {
            setFriendActionStatus(String(error && error.message || error || 'Friend action সম্পন্ন হয়নি।'), true);
            friendActionButton.disabled = false;
          }
        }
        return;
      }
      var friendOpenProfile = event.target.closest && event.target.closest('[data-med-friend-open-profile]');
      if (friendOpenProfile) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showPublicProfile(friendOpenProfile.dataset.medFriendOpenProfile);
        return;
      }
      var action = event.target.closest && event.target.closest('[data-med-action]');
      if (action) {
        if (action.dataset.medAction === 'manage-friends') {
          selectedPeriod = 'friends';
          try { localStorage.setItem(PERIOD_KEY, selectedPeriod); } catch (_) {}
          rankSelectionTouched = false;
          updatePeriodTabs();
          var leaderboardView = document.getElementById('view-leaderboard');
          if (leaderboardView && leaderboardView.classList.contains('hidden') && typeof app.showView === 'function') app.showView('leaderboard');
          ensureFriendDirectory();
          await loadLeaderboard(true);
          loadFriendDirectoryRows().catch(function () {});
          var friendsPanel = document.getElementById('leaderboard-friends-panel');
          if (friendsPanel) friendsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
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
      var friendProfileButton = event.target.closest && event.target.closest('[data-leaderboard-open-profile]');
      if (friendProfileButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showPublicProfile(friendProfileButton.dataset.leaderboardOpenProfile);
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
      var searchResult = event.target.closest && event.target.closest('.mat-friend-search-result[data-med-friend-open-profile]');
      if (searchResult && !(event.target.closest && event.target.closest('button'))) {
        event.preventDefault(); event.stopImmediatePropagation(); showPublicProfile(searchResult.dataset.medFriendOpenProfile); return;
      }
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
          });
          if (app.authUser && typeof app.syncFirebaseStudentProfile === 'function') {
            await app.syncFirebaseStudentProfile({
              name: updated.name, college: updated.college, batch: updated.batch, avatar: updated.avatar
            });
          }
          // Remember successful personal-info completion per account, so a temporary
          // profile-loading delay after exam/session completion cannot reopen the gate.
          markLeaderboardProfileComplete({
            name: safeText(updated.name || submittedName, 80),
            college: safeText(updated.college || submittedCollege, 120),
            batch: safeText(updated.batch || submittedBatch, 40)
          });
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

  async function verifyPublicAvatar(userId) {
    var targetId = String(userId || currentUserId() || '');
    if (!targetId) return null;
    var response = await request({ action: 'leaderboard', period: 'all-time', includeUserIds: [targetId] }, { method: 'GET' });
    var entries = extractEntries(response);
    return entries.find(function (entry) {
      return String(entry.userId || entry.uid || entry.playerId || entry.UserID || '') === targetId;
    }) || null;
  }

  app.getDemoLeaderboardRows = function () { return []; };
  app.getLocalLeaderboardRows = function () { return getCache('all-time'); };
  app.setLocalLeaderboardRows = function (rows) { return saveCache(rows, 'all-time'); };
  app.mergeLeaderboardRows = function (rows) { return normalizeRows(rows); };
  app.recordLeaderboardResult = recordLeaderboardResult;
  app.getServerProgress = getServerProgress;
  app.loadLeaderboard = loadLeaderboard;
  app.syncPendingLeaderboard = flushQueue;
  app.syncLeaderboardUser = syncIdentity;
  app.renderLeaderboardRows = renderRows;
  app.updateMedicalProfile = updateProfile;

  window.MedGlobalLeague = Object.freeze({
    loadLeaderboard: loadLeaderboard,
    recordLeaderboardResult: recordLeaderboardResult,
    getProgress: getServerProgress,
    convertPB: convertPB,
    syncIdentity: syncIdentity,
    registerUser: registerUser,
    updateProfile: updateProfile,
    getCachedRows: getCache,
    verifyPublicAvatar: verifyPublicAvatar,
    refreshFriendDirectory: function () {
      var input = document.getElementById('leaderboard-friend-search');
      renderFriendDirectory(input ? input.value : '');
    },
    getRanks: function () { return RANKS.slice(); },
    flushPending: flushQueue,
    reload: function () { return loadLeaderboard(true); }
  });

  var originalShowViewWithLeaderboardGate = app.showView.bind(app);
  app.showView = function (viewName, force) {
    // Opening the leaderboard must not be blocked by optional profile fields.
    var result = originalShowViewWithLeaderboardGate(viewName, force);
    var controls = document.getElementById('med-rank-controls');
    if (controls) controls.style.display = viewName === 'home' ? 'flex' : 'none';
    if (viewName === 'leaderboard') loadLeaderboard();
    return result;
  };
  app.openLeaderboard = function () {
    app.showView('leaderboard');
    return true;
  };
  ensureUI();
  updateTopControls(currentProfile || app.profile || {});
  document.addEventListener('student-progress-updated', function () {
    updateTopControls(currentProfile || app.profile || {});
    if (navigator.onLine) syncDailyStreak();
  });
  bindEvents();
  window.addEventListener('online', function () { syncDailyStreak(); flushQueue(); loadLeaderboard(true); });
  window.addEventListener('student-auth-state-resolved', function () { syncDailyStreak(); });
  window.addEventListener('student-profile-loaded', function () { syncDailyStreak(); });
  window.addEventListener('student-auth-state-resolved', function () {
    selectedRank = '';
    syncIdentity().then(function () { return loadLeaderboard(true); }).catch(function (error) { setStatus(apiErrorMessage(error), true); });
  });
  window.addEventListener('student-profile-loaded', function () {
    syncIdentity().then(function () { return loadLeaderboard(true); }).catch(function (error) { setStatus(apiErrorMessage(error), true); });
  });
  window.addEventListener('storage', function (event) {
    if (event.key === PERIOD_KEY) {
      // An explicit selection made in another tab is allowed to sync here; a
      // same-tab refresh never re-reads stale localStorage over the active choice.
      selectedPeriod = normalizePeriod(event.newValue) || readPeriod();
      try { sessionStorage.setItem(PERIOD_KEY, selectedPeriod); } catch (_) {}
      loadLeaderboard(true);
    } else if (event.key === GUEST_TOKEN_KEY) {
      loadLeaderboard(true);
    }
  });
  if (app.authStateResolved) {
    syncIdentity().then(function () { return loadLeaderboard(true); }).catch(function (error) { setStatus(apiErrorMessage(error), true); });
  }
  var lastForegroundRefreshAt = 0;
  function refreshLeaderboardWhenVisible() {
    if (document.hidden || Date.now() - lastForegroundRefreshAt < 12000) return;
    lastForegroundRefreshAt = Date.now();
    var view = document.getElementById('view-leaderboard');
    if (view && !view.classList.contains('hidden')) loadLeaderboard(true);
  }
  window.addEventListener('focus', refreshLeaderboardWhenVisible);
  document.addEventListener('visibilitychange', refreshLeaderboardWhenVisible);
  window.setInterval(function () { syncDailyStreak(); flushQueue(); }, 30000);
})();