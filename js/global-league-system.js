/* Medical Admission Tracker — shared Fallrush rank/leaderboard adapter.
 * Uses only the existing Fallrush Apps Script actions. Replace its endpoint in
 * js/leaderboard-config.js when the Medical Admission Tracker has its own API.
 */
(function () {
  'use strict';
  var app = window.app;
  if (!app || app.__fallrushLeaderboardAdapter) return;
  app.__fallrushLeaderboardAdapter = true;

  var MATCH_RANKS = ['Bronze I','Bronze II','Bronze III','Silver I','Silver II','Silver III','Gold I','Gold II','Gold III','Platinum I','Platinum II','Platinum III','Diamond I','Diamond II','Diamond III','Master','Grandmaster','Legend'];
  var RP_TARGET = 300;
  var PERIOD_KEY = 'med_leaderboard_period_v1';
  var CACHE_KEY = 'med_fallrush_leaderboard_cache_v1';
  var QUEUE_KEY = 'med_fallrush_leaderboard_pending_v1';
  var SENT_KEY = 'med_fallrush_leaderboard_sent_v1';
  var RANK_KEY_PREFIX = 'med_fallrush_selected_rank_v1_';
  var FRIENDS_CACHE_KEY = 'med_fallrush_friends_cache_v1';
  var API_URL = function () { return String(window.MED_LEADERBOARD_API_URL || '').trim(); };
  var selectedPeriod = readPeriod();
  var selectedRank = readSelectedRank();
  var rawRows = [];
  var currentProfile = null;
  var lastLoadId = 0;

  function readPeriod() {
    var value = localStorage.getItem(PERIOD_KEY) || 'all-time';
    return value === 'friends' ? 'friends' : 'all-time';
  }
  function accountKey() {
    return (app.authUser && app.authUser.uid) || 'guest';
  }
  function rankStorageKey() {
    return RANK_KEY_PREFIX + accountKey();
  }
  function readSelectedRank() {
    var value = '';
    try { value = localStorage.getItem(RANK_KEY_PREFIX + accountKey()) || ''; } catch (_) {}
    return MATCH_RANKS.indexOf(value) >= 0 ? value : '';
  }
  function getToken() {
    try { return String(localStorage.getItem('elem_session_token') || '').trim(); } catch (_) { return ''; }
  }
  function safeText(value, max) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max || 120);
  }
  function escapeHtml(value) {
    var text = String(value == null ? '' : value);
    if (typeof app.escapeHtml === 'function') return app.escapeHtml(text);
    return text.replace(/[&<>"']/g, function (char) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]);
    });
  }
  function parseJson(value, fallback) {
    try { var parsed = JSON.parse(value); return parsed == null ? fallback : parsed; } catch (_) { return fallback; }
  }
  function profileName() {
    var profile = app.profile || {};
    var name = profile.name || profile.displayName || (app.authUser && app.authUser.displayName) || '';
    if (!name && app.authUser && app.authUser.email) name = app.authUser.email.split('@')[0];
    return safeText(name || 'Medical Student', 80);
  }
  function profileCollege() {
    return safeText((app.profile && app.profile.college) || '', 120);
  }
  function medPlayerId() {
    if (getToken()) {
      var gameId = '';
      try { gameId = localStorage.getItem('elem_player_id') || ''; } catch (_) {}
      if (gameId) return safeText(gameId, 100);
    }
    var uid = (app.authUser && app.authUser.uid) || '';
    if (uid) return 'MED-' + uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    var guest = '';
    try { guest = localStorage.getItem('med_fallrush_guest_player_id') || ''; } catch (_) {}
    if (!guest) {
      guest = 'MED-G-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase();
      try { localStorage.setItem('med_fallrush_guest_player_id', guest); } catch (_) {}
    }
    return guest;
  }
  function isAuthenticated() {
    return !!(app.authUser && app.authUser.uid);
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
  async function request(payload) {
    var url = API_URL();
    if (!url) throw new Error('Leaderboard API URL is not configured.');
    var controller = window.AbortController ? new AbortController() : null;
    var timer = controller ? window.setTimeout(function () {
      try { controller.abort(); } catch (_) {}
    }, 15000) : null;
    try {
      var response = await fetch(url, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
          'Accept': 'application/json,text/plain,*/*'
        },
        body: JSON.stringify(payload || {}),
        signal: controller ? controller.signal : undefined
      });
      var body = await response.text();
      if (!response.ok) throw new Error('Leaderboard API HTTP ' + response.status + '.');
      if (!String(body || '').trim()) throw new Error('Leaderboard API returned an empty response.');
      var data;
      try { data = JSON.parse(String(body).trim()); } catch (_) { throw new Error('Leaderboard API returned invalid JSON.'); }
      if (data && data.success === false) throw new Error(data.message || data.error || 'Leaderboard request was rejected.');
      return data || {};
    } catch (error) {
      if (error && error.name === 'AbortError') throw new Error('Leaderboard API timed out. Please retry.');
      throw error;
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }
  function extractEntries(response) {
    if (Array.isArray(response)) return response;
    if (!response) return [];
    if (Array.isArray(response.entries)) return response.entries;
    if (Array.isArray(response.leaderboard)) return response.leaderboard;
    if (Array.isArray(response.results)) return response.results;
    if (Array.isArray(response.friends)) return response.friends;
    if (Array.isArray(response.users)) return response.users;
    return [];
  }
  function sortEntries(entries) {
    return (Array.isArray(entries) ? entries : []).slice().sort(function (a, b) {
      var rankA = MATCH_RANKS.indexOf(a.rank || 'Bronze I');
      var rankB = MATCH_RANKS.indexOf(b.rank || 'Bronze I');
      if (rankA !== rankB) return rankB - rankA;
      var rp = (Number(b.rankPoints || b.rp || 0) - Number(a.rankPoints || a.rp || 0));
      if (rp) return rp;
      var score = Number(b.rankScore || b.score || b.points || 0) - Number(a.rankScore || a.score || a.points || 0);
      if (score) return score;
      return String(a.username || a.name || '').localeCompare(String(b.username || b.name || ''));
    });
  }
  function myApiProfileId() {
    if (currentProfile) return String(currentProfile.playerId || currentProfile.userId || currentProfile.uid || '');
    return '';
  }
  function isMine(raw) {
    var id = String(raw && (raw.playerId || raw.userId || raw.uid || raw.id) || '');
    var ids = [medPlayerId(), myApiProfileId()];
    try { ids.push(String(localStorage.getItem('elem_player_id') || '')); } catch (_) {}
    if (id && ids.some(function (candidate) { return candidate && id.toLowerCase() === candidate.toLowerCase(); })) return true;
    var rawName = String(raw && (raw.username || raw.name) || '').trim().toLowerCase();
    var expected = String((currentProfile && currentProfile.username) || profileName()).trim().toLowerCase();
    return !!(rawName && expected && rawName === expected);
  }
  function normalizeEntry(raw) {
    raw = raw || {};
    var id = safeText(raw.playerId || raw.userId || raw.uid || raw.id || raw.username || raw.name || 'unknown-player', 120);
    var mine = isMine(raw);
    var username = raw.username || raw.name || raw.player || raw.displayName || (raw.playerId ? String(raw.playerId) : 'Student');
    var correct = Number(raw.correctCatches != null ? raw.correctCatches : raw.correct || 0);
    var wrong = Number(raw.wrongCatches != null ? raw.wrongCatches : raw.wrong || 0);
    var answered = Math.max(0, correct) + Math.max(0, wrong);
    var rank = MATCH_RANKS.indexOf(raw.rank) >= 0 ? raw.rank : 'Bronze I';
    var rp = Math.max(0, Number(raw.rankPoints != null ? raw.rankPoints : raw.rp || 0));
    var score = Math.max(0, Number(raw.rankScore != null ? raw.rankScore : raw.score != null ? raw.score : raw.points || 0));
    return {
      uid: mine && app.authUser ? app.authUser.uid : id,
      playerId: id,
      userId: safeText(raw.userId || raw.playerId || id, 120),
      name: safeText(username, 80),
      college: safeText(raw.college || (mine ? profileCollege() : ''), 120),
      avatar: safeText(raw.avatar || '', 100),
      rank: rank,
      rankPoints: rp,
      rankScore: score,
      points: rp,
      quizzes: Math.max(0, Number(raw.matches != null ? raw.matches : raw.quizzes || 0)),
      accuracy: answered > 0 ? Number((correct / answered * 100).toFixed(1)) : Number(raw.accuracy || 0),
      xp: Math.max(0, Number(raw.xp || 0)),
      level: Math.max(1, Number(raw.level || 1)),
      highScore: Math.max(0, Number(raw.highScore || raw.score || 0)),
      isGuest: !!(raw.isGuest || raw.guest),
      raw: raw
    };
  }
  function normalizeRows(rows) {
    var seen = {};
    return sortEntries(rows.map(normalizeEntry)).filter(function (row) {
      var key = (row.playerId || row.name).toLowerCase();
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }
  function getCachedRows() {
    var rows = parseJson(localStorage.getItem(CACHE_KEY), []);
    return Array.isArray(rows) ? rows.filter(function (x) { return x && !x.isDemo; }) : [];
  }
  function saveCache(rows) {
    var safe = Array.isArray(rows) ? rows.filter(function (x) { return x && !x.isDemo; }) : [];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(safe)); } catch (_) {}
    return safe;
  }
  function getQueue() {
    var queue = parseJson(localStorage.getItem(QUEUE_KEY), []);
    return Array.isArray(queue) ? queue : [];
  }
  function saveQueue(queue) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify((Array.isArray(queue) ? queue : []).slice(-100))); } catch (_) {}
  }
  function sentIds() {
    var ids = parseJson(localStorage.getItem(SENT_KEY), []);
    return Array.isArray(ids) ? ids : [];
  }
  function markSent(id) {
    var ids = sentIds().filter(function (x) { return x !== id; });
    ids.push(id);
    try { localStorage.setItem(SENT_KEY, JSON.stringify(ids.slice(-500))); } catch (_) {}
  }
  function getCurrentUserRow() {
    var id = medPlayerId();
    var rows = rawRows.map(normalizeEntry);
    var found = rows.find(function (row) { return row.playerId === id || isMine(row.raw); });
    if (found) return found;
    if (currentProfile && (currentProfile.rank || currentProfile.rankPoints != null)) return normalizeEntry(Object.assign({}, currentProfile, { playerId: currentProfile.playerId || currentProfile.userId || id, username: currentProfile.username || profileName() }));
    return null;
  }
  function currentRank() {
    var me = getCurrentUserRow();
    if (me && MATCH_RANKS.indexOf(me.rank) >= 0) return me.rank;
    return (currentProfile && MATCH_RANKS.indexOf(currentProfile.rank) >= 0) ? currentProfile.rank : 'Bronze I';
  }
  function injectStyles() {
    if (document.getElementById('med-fallrush-style')) return;
    var style = document.createElement('style');
    style.id = 'med-fallrush-style';
    style.textContent =
      '.student-profile-top-shortcut{display:none!important}' +
      '.mat-rank-banner{margin:0 0 20px;padding:20px 14px 18px;border-radius:22px;background:radial-gradient(circle at 50% 0,rgba(129,140,248,.3),transparent 45%),linear-gradient(145deg,#101a31,#172744 55%,#101827);border:1px solid rgba(148,163,184,.2);color:#f8fafc;overflow:hidden}' +
      '.mat-rank-head{text-align:center;display:flex;flex-direction:column;gap:4px;margin-bottom:12px}.mat-rank-head strong{font-size:11px;letter-spacing:.18em;color:#c4b5fd}.mat-rank-head small{font-size:12px;color:#cbd5e1}' +
      '.mat-rank-rail{display:flex;align-items:center;gap:8px;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;-ms-overflow-style:none;padding:9px 3px 12px;scroll-snap-type:x mandatory}.mat-rank-rail::-webkit-scrollbar{display:none}' +
      '.mat-rank-tier{flex:0 0 76px;min-width:76px;min-height:88px;border:1px solid rgba(148,163,184,.22);border-radius:15px;padding:8px 5px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;opacity:.67;transform:scale(.92);transition:transform .18s ease,opacity .18s ease,box-shadow .18s ease,border-color .18s ease;scroll-snap-align:center;color:#f8fafc;background:rgba(15,23,42,.72);cursor:pointer;font-size:11px;font-weight:850;text-align:center}.mat-rank-tier.is-active{flex-basis:118px;min-width:118px;min-height:108px;opacity:1;transform:scale(1);border-color:rgba(255,255,255,.6);box-shadow:0 0 0 2px rgba(255,255,255,.08),0 12px 26px rgba(0,0,0,.22)}.mat-rank-tier i{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;font-size:18px;background:rgba(255,255,255,.1)}.mat-rank-tier.is-active i{width:43px;height:43px;font-size:22px}.mat-rank-tier small{font-size:8px;letter-spacing:.07em;opacity:.8}.mat-rank-tier.bronze i{color:#f1b47b;background:linear-gradient(145deg,#6e442c,#bd804f)}.mat-rank-tier.silver i{color:#e2e8f0;background:linear-gradient(145deg,#475569,#94a3b8)}.mat-rank-tier.gold i{color:#fff1aa;background:linear-gradient(145deg,#8b5e0b,#eab308)}.mat-rank-tier.platinum i{color:#ddd6fe;background:linear-gradient(145deg,#6d28d9,#a78bfa)}.mat-rank-tier.diamond i{color:#cffafe;background:linear-gradient(145deg,#0e7490,#67e8f9)}.mat-rank-tier.master i,.mat-rank-tier.grandmaster i,.mat-rank-tier.legend i{color:#fde68a;background:linear-gradient(145deg,#7f1d1d,#f59e0b)}' +
      '.mat-rank-progress{padding:8px 9px 0}.mat-rank-progress-line{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.mat-rank-progress-line>span:first-child{display:flex;flex-direction:column;gap:3px}.mat-rank-progress-line strong{font-size:13px}.mat-rank-progress-line small,.mat-rank-foot{font-size:11px;color:#cbd5e1}.mat-rank-rp{font-weight:950;color:#fde68a;white-space:nowrap}.mat-rank-track{position:relative;height:11px;border-radius:99px;background:rgba(148,163,184,.25);margin:14px 10px 8px}.mat-rank-track>span{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,#a78bfa,#fbbf24);transition:width .35s ease}.mat-rank-track>i{position:absolute;top:50%;transform:translate(-50%,-50%);display:grid;place-items:center;width:23px;height:23px;border-radius:50%;background:#fef3c7;color:#a16207;border:2px solid #fff7ed;box-shadow:0 2px 8px rgba(0,0,0,.3)}.mat-rank-foot{display:flex;justify-content:space-between;gap:8px}.mat-rank-locked{display:flex;gap:10px;align-items:center;border:1px solid rgba(148,163,184,.25);border-radius:14px;padding:12px;background:rgba(15,23,42,.46);font-size:12px;line-height:1.6}' +
      '#med-rank-controls{position:fixed;z-index:9998;top:13px;right:16px;display:flex;align-items:center;gap:7px;padding:5px;border-radius:15px;background:rgba(10,18,32,.95);border:1px solid rgba(148,163,184,.23);box-shadow:0 10px 28px rgba(0,0,0,.18);backdrop-filter:blur(14px);color:#f8fafc}body.exam-active #med-rank-controls{display:none}.mat-top-icon{position:relative;display:grid;place-items:center;width:39px;height:39px;border-radius:11px;border:1px solid rgba(148,163,184,.18);background:rgba(255,255,255,.05);color:#e2e8f0;font-size:16px;cursor:pointer}.mat-top-icon:first-child{color:#fb923c}.mat-top-rp{display:flex;align-items:center;gap:7px;height:39px;padding:0 11px;border-radius:11px;background:rgba(255,255,255,.05);border:1px solid rgba(148,163,184,.18);color:#f8fafc;font-weight:950;white-space:nowrap;cursor:pointer}.mat-top-rp i{color:#facc15}.mat-notice-dot{display:none;position:absolute;right:6px;top:6px;width:7px;height:7px;background:#f87171;border-radius:50%}.mat-notice-dot.is-visible{display:block}' +
      '.mat-overlay{position:fixed;inset:0;z-index:10020;display:flex;align-items:center;justify-content:center;padding:17px;background:rgba(2,6,23,.7);backdrop-filter:blur(8px)}.mat-overlay.hidden{display:none}.mat-dialog{position:relative;width:min(100%,520px);max-height:min(86vh,760px);overflow:auto;border:1px solid rgba(148,163,184,.24);border-radius:23px;padding:24px;background:var(--surface,#fff);color:var(--text,#0f172a);box-shadow:0 28px 80px rgba(0,0,0,.36)}.dark .mat-dialog{background:#101827;color:#f8fafc}.mat-dialog h2{font-size:21px;font-weight:950;margin:0 34px 8px 0}.mat-dialog-note{font-size:13px;color:var(--muted,#64748b);margin:0 0 15px;line-height:1.6}.mat-close{position:absolute;right:13px;top:11px;width:35px;height:35px;border-radius:11px;background:rgba(148,163,184,.14);font-size:24px}.mat-rule-list{display:flex;flex-direction:column;gap:8px}.mat-rule-list details{border:1px solid rgba(148,163,184,.25);border-radius:13px;overflow:hidden}.mat-rule-list summary{list-style:none;display:flex;align-items:center;gap:10px;padding:13px;font-weight:850;cursor:pointer}.mat-rule-list summary::-webkit-details-marker{display:none}.mat-rule-list summary i{color:#8b5cf6}.mat-rule-list details>div{padding:0 13px 14px;font-size:13px;line-height:1.7;color:var(--muted,#64748b)}.dark .mat-rule-list details>div{color:#cbd5e1}.mat-friend-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid rgba(148,163,184,.2)}.mat-friend-row button,.mat-primary{border:0;border-radius:10px;padding:8px 10px;background:#0d9488;color:white;font-size:12px;font-weight:850}.mat-friend-row .mat-muted-button{background:#64748b}.mat-player-avatar{font-size:36px;margin-bottom:8px}.mat-player-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:15px 0}.mat-player-stat{padding:11px;border-radius:13px;background:rgba(148,163,184,.12)}.mat-player-stat small{display:block;font-size:11px;color:var(--muted,#64748b)}.mat-player-stat strong{display:block;margin-top:4px;font-size:15px;overflow-wrap:anywhere}.mat-player-actions{display:flex;gap:8px;flex-wrap:wrap}.mat-player-actions button{padding:9px 12px;border-radius:10px;font-weight:850;border:1px solid rgba(148,163,184,.28)}#leaderboard-body tr[data-med-player],#leaderboard-podium [data-med-player]{cursor:pointer}#leaderboard-body tr[data-med-player]:hover{background:rgba(13,148,136,.07)}.leaderboard-period-tab.is-active{border-color:#0d9488!important;background:rgba(13,148,136,.1)!important;color:#0d9488!important}' +
      '@media(max-width:650px){#med-rank-controls{top:9px;right:8px;gap:4px;padding:4px}.mat-top-icon{width:35px;height:35px}.mat-top-rp{height:35px;padding:0 8px;font-size:12px}main{padding-top:68px!important}.mat-dialog{padding:20px 15px}.mat-rank-rail{gap:6px}.mat-rank-tier{flex-basis:69px;min-width:69px;min-height:82px}.mat-rank-tier.is-active{flex-basis:105px;min-width:105px;min-height:100px}}';
    document.head.appendChild(style);
  }
  function ensureTopControls() {
    if (document.getElementById('med-rank-controls')) return;
    var root = document.createElement('div');
    root.id = 'med-rank-controls';
    root.innerHTML = '<button type="button" class="mat-top-icon" data-med-action="streak" title="Daily streak" aria-label="Daily streak"><i class="fa-solid fa-fire"></i></button>' +
      '<button type="button" class="mat-top-icon" data-med-action="notifications" title="Notifications and rules" aria-label="Notifications and rules"><i class="fa-solid fa-bell"></i><span class="mat-notice-dot" id="med-notice-dot"></span></button>' +
      '<button type="button" class="mat-top-rp" data-med-action="rank-points" title="Rank Points" aria-label="Rank Points"><i class="fa-solid fa-star"></i><span id="med-top-rp">0 RP</span></button>';
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
        '<h2 id="med-rules-title">Notifications & Rules</h2><p class="mat-dialog-note">একটি বিষয় খুলে তার নিয়ম দেখুন।</p><div id="med-friend-requests"></div>' +
        '<div class="mat-rule-list">' +
        '<details><summary><i class="fa-solid fa-trophy"></i> Rank & RP</summary><div>Fallrush-এর বর্তমান Rank tier-গুলো একই ক্রমে দেখানো হয়। প্রতিটি tier-এর promotion threshold 300 RP; server response-ই rank ও RP-এর চূড়ান্ত মান নির্ধারণ করে।</div></details>' +
        '<details><summary><i class="fa-solid fa-calendar-week"></i> Weekly Rank Rules</summary><div>Weekly rank reset/demotion-এর নিয়ম shared API যেভাবে প্রয়োগ করে সেটিই এখানে অনুসরণ করা হবে। এই client নিজে আলাদা rank database তৈরি করে না।</div></details>' +
        '<details><summary><i class="fa-solid fa-user-group"></i> Friends & Privacy</summary><div>Friends ও friend request-এর জন্য একই API-এর session token প্রয়োজন। Firebase password বা login token leaderboard row-তে দেখানো হয় না।</div></details>' +
        '<details><summary><i class="fa-solid fa-cloud-arrow-up"></i> Sync</summary><div>Global leaderboard-এর authoritative data shared API থেকে আসে। LocalStorage শুধু cache ও pending result queue রাখে।</div></details>' +
        '</div></div>';
      document.body.appendChild(rules);
    }
  }
  function ensureRankBanner() {
    var view = document.getElementById('view-leaderboard');
    if (!view) return;
    var podium = document.getElementById('leaderboard-podium');
    var host = document.getElementById('med-fallrush-rank-banner');
    if (!host) {
      host = document.createElement('section');
      host.id = 'med-fallrush-rank-banner';
      host.className = 'mat-rank-banner';
      host.setAttribute('aria-label', 'Global Rank tier and RP progress');
      host.innerHTML = '<div class="mat-rank-head"><strong>GLOBAL RANK</strong><small>Current rank বড়; অন্য tier দেখতে পাশে swipe করুন</small></div><div class="mat-rank-rail" id="med-rank-rail" role="tablist" aria-label="Select Rank tier"></div><div id="med-rank-progress" class="mat-rank-progress"></div>';
      if (podium && podium.parentNode) podium.parentNode.insertBefore(host, podium);
      else {
        var status = document.getElementById('leaderboard-status');
        if (status && status.parentNode) status.parentNode.insertBefore(host, status.nextSibling);
        else view.appendChild(host);
      }
    }
  }
  function rankClass(rank) {
    var text = String(rank || 'Bronze I').toLowerCase();
    if (text.indexOf('bronze') === 0) return 'bronze';
    if (text.indexOf('silver') === 0) return 'silver';
    if (text.indexOf('gold') === 0) return 'gold';
    if (text.indexOf('platinum') === 0) return 'platinum';
    if (text.indexOf('diamond') === 0) return 'diamond';
    if (text.indexOf('master') === 0) return 'master';
    if (text.indexOf('grandmaster') === 0) return 'grandmaster';
    return 'legend';
  }
  function rankIcon(rank, index) {
    if (index >= 15) return 'fa-crown';
    if (index >= 12) return 'fa-gem';
    if (index >= 9) return 'fa-star';
    if (index >= 6) return 'fa-trophy';
    if (index >= 3) return 'fa-shield-halved';
    return 'fa-medal';
  }
  function getMyRankEntry(rows) {
    return (Array.isArray(rows) ? rows : []).find(function (entry) { return isMine(entry.raw || entry); }) || null;
  }
  function renderRankRail(rows) {
    var rail = document.getElementById('med-rank-rail');
    if (!rail) return;
    var me = getMyRankEntry(rows);
    if (!selectedRank || MATCH_RANKS.indexOf(selectedRank) < 0) selectedRank = (me && me.rank) || 'Bronze I';
    rail.innerHTML = MATCH_RANKS.map(function (rank, index) {
      var active = rank === selectedRank;
      var ownRank = me && me.rank === rank;
      var name = rank;
      return '<button type="button" role="tab" aria-selected="' + (active ? 'true' : 'false') + '" class="mat-rank-tier ' + rankClass(rank) + (active ? ' is-active' : '') + '" data-med-rank="' + escapeHtml(rank) + '">' +
        '<i class="fa-solid ' + rankIcon(rank, index) + '"></i><span>' + escapeHtml(name) + '</span><small>' + (ownRank ? 'YOUR RANK' : 'MATCH RANK') + '</small></button>';
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
      area.innerHTML = '<div class="mat-rank-locked"><i class="fa-solid fa-lock"></i><span>আপনার rank progress দেখতে Medical Admission Tracker-এ sign in করে প্রথম eligible quiz সম্পন্ন করুন।</span></div>';
      return;
    }
    if (selectedRank !== me.rank) {
      area.innerHTML = '<div class="mat-rank-locked"><i class="fa-solid fa-lock"></i><span><strong>Unlock ' + escapeHtml(selectedRank) + '</strong><br>আপনার বর্তমান rank হলো ' + escapeHtml(me.rank) + '. Global entry দেখতে rank badge-এ click করুন।</span></div>';
      return;
    }
    var rp = Math.max(0, Number(me.rankPoints || 0));
    var pct = Math.max(0, Math.min(100, Math.round(rp / RP_TARGET * 100)));
    area.innerHTML = '<div class="mat-rank-progress-line"><span><strong>' + escapeHtml(me.rank) + ' Progress</strong><small>' + rp + ' / ' + RP_TARGET + ' RP</small></span><span class="mat-rank-rp"><i class="fa-solid fa-star"></i> ' + rp + ' RP</span></div>' +
      '<div class="mat-rank-track" role="progressbar" aria-valuemin="0" aria-valuemax="' + RP_TARGET + '" aria-valuenow="' + Math.min(rp, RP_TARGET) + '"><span style="width:' + pct + '%"></span><i class="fa-solid fa-star" style="left:clamp(10px,' + pct + '%,calc(100% - 10px))"></i></div>' +
      '<div class="mat-rank-foot"><span>0 RP</span><span>' + (MATCH_RANKS.indexOf(me.rank) === MATCH_RANKS.length - 1 ? 'Top Rank' : 'Next: ' + escapeHtml(MATCH_RANKS[MATCH_RANKS.indexOf(me.rank) + 1])) + '</span><span>' + RP_TARGET + ' RP</span></div>';
  }
  function updateTopControls(me) {
    var rp = document.getElementById('med-top-rp');
    if (rp) rp.textContent = String(Math.max(0, Number(me && me.rankPoints) || 0)) + ' RP';
    var progress = parseJson(localStorage.getItem('med_account_progress_v1_' + accountKey()), {});
    var streak = Math.max(0, Number(progress.streak) || 0);
    var streakButton = document.querySelector('[data-med-action="streak"]');
    if (streakButton) {
      streakButton.title = 'Daily streak: ' + streak + ' day' + (streak === 1 ? '' : 's');
      streakButton.setAttribute('aria-label', 'Daily streak: ' + streak + ' days');
    }
    var dot = document.getElementById('med-notice-dot');
    if (dot) dot.classList.toggle('is-visible', !!getToken());
  }
  function showOverlay(id) {
    var overlay = document.getElementById(id);
    if (overlay) overlay.classList.remove('hidden');
  }
  function closeOverlay(el) {
    if (el) el.classList.add('hidden');
  }
  function normaliseRawRows(entries) {
    rawRows = sortEntries(Array.isArray(entries) ? entries : []);
    var rows = normalizeRows(rawRows);
    saveCache(rows);
    return rows;
  }
  function renderRows(rows) {
    var all = normalizeRows(rows || []);
    var me = getMyRankEntry(all);
    if (me && !readSelectedRank()) {
      selectedRank = me.rank;
      try { localStorage.setItem(rankStorageKey(), selectedRank); } catch (_) {}
    }
    if (MATCH_RANKS.indexOf(selectedRank) < 0) selectedRank = (me && me.rank) || 'Bronze I';
    var rankRows = all.filter(function (row) { return row.rank === selectedRank; });
    rankRows.sort(function (a, b) {
      return Number(b.rankPoints || 0) - Number(a.rankPoints || 0) || Number(b.rankScore || 0) - Number(a.rankScore || 0);
    });
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
          return '<article class="podium-card podium-' + (index + 1) + '" data-med-player="' + escapeHtml(row.playerId) + '" tabindex="0" role="button" aria-label="Open ' + escapeHtml(row.name) + ' profile">' +
            '<div class="podium-medal">' + ['🥇','🥈','🥉'][index] + '</div>' +
            '<div class="podium-avatar">' + (row.avatar ? '<img src="' + escapeHtml(row.avatar) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">' : escapeHtml(String(row.name || 'S').slice(0,1).toUpperCase())) + '</div>' +
            '<strong>' + escapeHtml(row.name || 'Student') + '</strong><span>' + Number(row.rankPoints || 0) + ' RP</span><small>' + escapeHtml(row.rank) + ' · Lv.' + Number(row.level || 1) + '</small></article>';
        }).join('');
      }
      rankRows.forEach(function (row, index) {
        var tr = document.createElement('tr');
        tr.className = 'leader-row' + (isMine(row.raw || row) ? ' is-me' : '');
        tr.dataset.medPlayer = String(row.playerId || '');
        tr.dataset.uid = String(row.uid || '');
        tr.tabIndex = 0;
        tr.setAttribute('role', 'button');
        tr.setAttribute('aria-label', 'Open ' + row.name + ' profile');
        tr.innerHTML = '<td class="py-4 px-3"><div class="leader-person"><span class="leader-avatar">' +
          (row.avatar ? '<img src="' + escapeHtml(row.avatar) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">' : escapeHtml(String(row.name || 'S').slice(0,1).toUpperCase())) +
          '</span><span><b>' + escapeHtml(row.name || 'Student') + '</b>' + (isMine(row.raw || row) ? '<em>YOU</em>' : '') +
          '<small class="block text-xs opacity-70">' + escapeHtml(row.rank || 'Bronze I') + ' · Lv.' + Number(row.level || 1) + '</small></span></div></td>' +
          '<td class="py-4 px-3">' + escapeHtml(row.college || '—') + '</td>' +
          '<td class="py-4 px-3">' + Number(row.quizzes || 0) + '</td>' +
          '<td class="py-4 px-3">' + Number(row.accuracy || 0).toFixed(1) + '%</td>' +
          '<td class="leader-rank-points py-4 px-3"><strong class="leader-rank-number">' + (index + 1) + '</strong><small class="leader-points-label">' + Number(row.rankPoints || 0) + ' RP</small></td>';
        body.appendChild(tr);
      });
      var own = rankRows.find(function (row) { return isMine(row.raw || row); });
      if (mePanel && own) {
        mePanel.classList.remove('hidden');
        mePanel.innerHTML = '<div><span>Your Position</span><strong>#' + (rankRows.indexOf(own) + 1) + '</strong></div><div><b>' + escapeHtml(own.name) + '</b><small>' + Number(own.rankPoints || 0) + ' RP · ' + escapeHtml(own.rank) + '</small></div>';
      }
    } else {
      body.innerHTML = '<tr><td colspan="5" class="py-10 text-center text-sm text-gray-500">এই Rank-এ এখনো কোনো player পাওয়া যায়নি। অন্য Rank নির্বাচন করুন।</td></tr>';
    }
    renderRankRail(all);
    updateTopControls(me);
    updateProfileRankLabels(me);
  }
  function updateProfileRankLabels(me) {
    if (!me) return;
    var live = document.getElementById('profile-live-rank');
    var best = document.getElementById('profile-best-rank');
    if (live) live.textContent = me.rank;
    if (best) best.textContent = me.rank;
  }
  function cachedRowsForDisplay() {
    var cached = getCachedRows();
    if (cached.length) return cached;
    return [];
  }
  async function loadMyApiProfile() {
    var token = getToken();
    if (!token) { currentProfile = null; return null; }
    try {
      var response = await request({ action: 'profile', token: token });
      currentProfile = response.user || response.profile || response;
      return currentProfile;
    } catch (_) { return null; }
  }
  async function loadLeaderboard(silent) {
    ensureUI();
    selectedRank = readSelectedRank();
    var requestId = ++lastLoadId;
    var cache = cachedRowsForDisplay();
    if (cache.length) renderRows(cache);
    if (!API_URL()) {
      setStatus('Global leaderboard API URL সেট করা নেই।', true);
      return;
    }
    try {
      await loadMyApiProfile();
      var response;
      if (selectedPeriod === 'friends') {
        var token = getToken();
        if (!token) {
          renderRows([]);
          setStatus('Friends leaderboard ব্যবহার করতে একই browser-এ Fallrush API account session প্রয়োজন। Medical Firebase login আলাদা থাকে।', true);
          return;
        }
        response = await request({ action: 'friends', token: token, username: (currentProfile && currentProfile.username) || profileName() });
      } else {
        response = await request({ action: 'leaderboard', mode: 'Rank', username: (currentProfile && currentProfile.username) || profileName() });
      }
      if (requestId !== lastLoadId) return;
      var entries = extractEntries(response);
      if (!entries.length && response && response.user) entries = [response.user];
      rawRows = entries.slice();
      var rows = normalizeRows(entries);
      if (currentProfile && !rows.some(function (row) { return isMine(row.raw || row); })) {
        var profileEntry = Object.assign({}, currentProfile, {
          playerId: currentProfile.playerId || currentProfile.userId || medPlayerId(),
          username: currentProfile.username || profileName(),
          college: currentProfile.college || profileCollege(),
          rank: currentProfile.rank || 'Bronze I',
          rankPoints: Number(currentProfile.rankPoints || 0)
        });
        rows.push(normalizeEntry(profileEntry));
        rows = sortEntries(rows);
      }
      saveCache(rows);
      renderRows(rows);
      setStatus('Global Rank synced from the shared API' + (response && response.currentWeekKey ? ' · ' + response.currentWeekKey : '') + '.', false);
    } catch (error) {
      if (requestId !== lastLoadId) return;
      setStatus('Global sync হয়নি; cached leaderboard দেখানো হচ্ছে। ' + (error.message || ''), true);
    }
  }
  function queueResult(payload) {
    var queue = getQueue();
    if (!queue.some(function (item) { return item && item.attemptId === payload.attemptId && item.uid === payload.uid; })) queue.push(payload);
    saveQueue(queue);
  }
  async function flushQueue() {
    if (!isAuthenticated() || !navigator.onLine) return;
    var queue = getQueue();
    if (!queue.length) return;
    var keep = [];
    var sentAny = false;
    for (var i = 0; i < queue.length; i++) {
      var item = queue[i];
      if (!item || item.uid !== app.authUser.uid) { keep.push(item); continue; }
      try {
        await submitResult(item, true);
        sentAny = true;
      } catch (_) { keep.push(item); }
    }
    saveQueue(keep);
    if (sentAny) await loadLeaderboard(true);
  }
  async function submitResult(item, fromQueue) {
    var id = String(item.attemptId || '');
    if (!id) throw new Error('Missing quiz attempt ID.');
    if (sentIds().indexOf(id) >= 0) return true;
    var token = getToken();
    var payload = {
      action: 'gameEnd',
      gameId: 'MAT-' + safeText(item.uid || 'USER', 55) + '-' + safeText(id, 70),
      score: Math.max(0, Number(item.quizPoints) || 0),
      mode: 'Rank',
      maxCombo: Math.max(0, Number(item.correctCount) || 0),
      catches: Math.max(0, Number(item.correctCount) || 0) + Math.max(0, Number(item.wrongCount) || 0),
      correctCatches: Math.max(0, Number(item.correctCount) || 0),
      wrongCatches: Math.max(0, Number(item.wrongCount) || 0),
      feverActivations: 0,
      survivalSeconds: 0,
      username: safeText(item.name || profileName(), 80),
      playerId: token ? safeText(localStorage.getItem('elem_player_id') || medPlayerId(), 100) : medPlayerId(),
      isGuest: !token,
      college: safeText(item.college || profileCollege(), 120)
    };
    if (token) payload.token = token;
    var response = await request(payload);
    var resultUser = response.user || response.profile || response;
    currentProfile = Object.assign({}, currentProfile || {}, resultUser || {});
    if (resultUser && (resultUser.rank || resultUser.rankPoints != null)) {
      if (app.profile) {
        app.profile.rank = resultUser.rank || app.profile.rank;
        app.profile.rankPoints = Number(resultUser.rankPoints || 0);
      }
    }
    markSent(id);
    if (!fromQueue) setStatus('Quiz result shared with the Global Rank API. +' + Math.max(0, Number(item.quizPoints) || 0) + ' quiz points submitted.', false);
    return true;
  }
  async function recordLeaderboardResult(meta) {
    meta = meta || {};
    if (!isAuthenticated()) {
      setStatus('Global rank-এ score যোগ করতে Medical Admission Tracker-এ sign in করুন।', true);
      return false;
    }
    var state = app.examState || {};
    var attemptId = String(state.startedAt || Date.now());
    if (sentIds().indexOf(attemptId) >= 0) return false;
    var item = {
      uid: app.authUser.uid,
      attemptId: attemptId,
      quizPoints: Math.max(0, Math.floor(Number(meta.quizPoints) || 0)),
      correctCount: Math.max(0, Math.floor(Number(meta.correctCount) || 0)),
      wrongCount: Math.max(0, Math.floor(Number(meta.wrongCount) || 0)),
      totalQuestions: Math.max(0, Math.floor(Number(meta.totalQuestions) || 0)),
      name: profileName(),
      college: profileCollege()
    };
    if (!item.totalQuestions) { setStatus('Quiz result-এ question count পাওয়া যায়নি; result sync করা হয়নি।', true); return false; }
    try {
      await submitResult(item, false);
      await loadLeaderboard(true);
      return true;
    } catch (error) {
      queueResult(item);
      setStatus('Leaderboard API এখন unavailable; result pending queue-তে রাখা হয়েছে। Online হলে আবার sync হবে। ' + (error.message || ''), true);
      return false;
    }
  }
  async function showPublicProfile(playerId) {
    var row = rawRows.find(function (r) {
      return String(r.playerId || r.userId || r.uid || '') === String(playerId || '');
    });
    if (!row) return;
    var profile = Object.assign({}, row);
    try {
      var publicData = await request({ action: 'publicProfile', playerId: playerId, username: row.username || row.name || '' });
      if (publicData && publicData.success !== false) profile = Object.assign(profile, publicData.user || publicData.profile || publicData);
    } catch (_) {}
    var content = document.getElementById('med-player-content');
    if (!content) return;
    var isMe = isMine(profile);
    content.innerHTML = '<div class="mat-player-avatar">' + (profile.avatar ? '<img src="' + escapeHtml(profile.avatar) + '" alt="" style="width:52px;height:52px;border-radius:50%;object-fit:cover">' : '🩺') + '</div>' +
      '<h2 id="med-player-title">' + escapeHtml(profile.username || profile.name || 'Student') + '</h2>' +
      '<p class="mat-dialog-note">' + escapeHtml(profile.college || (isMe ? profileCollege() : 'College not provided')) + '</p>' +
      '<div class="mat-player-stats">' +
      '<div class="mat-player-stat"><small>Match Rank</small><strong>' + escapeHtml(profile.rank || 'Bronze I') + '</strong></div>' +
      '<div class="mat-player-stat"><small>Rank Points</small><strong>' + Number(profile.rankPoints || 0) + ' RP</strong></div>' +
      '<div class="mat-player-stat"><small>Level</small><strong>' + Number(profile.level || 1) + '</strong></div>' +
      '<div class="mat-player-stat"><small>XP</small><strong>' + Number(profile.xp || 0) + '</strong></div>' +
      '<div class="mat-player-stat"><small>Rank Score</small><strong>' + Number(profile.rankScore || profile.score || 0) + '</strong></div>' +
      '</div><div class="mat-player-actions">' +
      (isMe ? '<span class="mat-dialog-note">Your public rank profile</span>' : (getToken() ? '<button type="button" class="mat-primary" data-med-add-friend="' + escapeHtml(playerId) + '" data-med-player-name="' + escapeHtml(profile.username || profile.name || '') + '">Add Friend</button>' : '<span class="mat-dialog-note">Friend request-এর জন্য Fallrush API session দরকার।</span>')) +
      '<button type="button" data-med-close>Close</button></div><p id="med-player-status" class="mat-dialog-note"></p>';
    showOverlay('med-player-modal');
  }
  async function showFriendRequests() {
    var root = document.getElementById('med-friend-requests');
    if (!root) return;
    var token = getToken();
    if (!token) {
      root.innerHTML = '<p class="mat-dialog-note">Friend request sync করার জন্য এই browser-এ Fallrush API session নেই। Global Rank দেখা যাবে, তবে Friends feature API session ছাড়া ব্যবহার করা যাবে না।</p>';
      return;
    }
    root.innerHTML = '<p class="mat-dialog-note">Friend requests লোড হচ্ছে…</p>';
    try {
      var response = await request({ action: 'friendRequests', token: token });
      var incoming = Array.isArray(response.requests) ? response.requests : (Array.isArray(response.incoming) ? response.incoming : []);
      if (!incoming.length) root.innerHTML = '<p class="mat-dialog-note">কোনো pending friend request নেই।</p>';
      else root.innerHTML = '<strong>Friend Requests</strong>' + incoming.map(function (item) {
        return '<div class="mat-friend-row"><span><b>' + escapeHtml(item.username || item.name || 'Player') + '</b></span><span><button data-med-friend-response="accept" data-med-request-id="' + escapeHtml(item.requestId || item.id || '') + '">Accept</button> <button class="mat-muted-button" data-med-friend-response="decline" data-med-request-id="' + escapeHtml(item.requestId || item.id || '') + '">Decline</button></span></div>';
      }).join('');
    } catch (error) {
      root.innerHTML = '<p class="mat-dialog-note">' + escapeHtml(error.message || 'Friend requests লোড করা যায়নি।') + '</p>';
    }
  }
  function updatePeriodTabs() {
    document.querySelectorAll('[data-leaderboard-period]').forEach(function (button) {
      var active = button.dataset.leaderboardPeriod === selectedPeriod;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    var note = document.getElementById('leaderboard-period-note');
    if (note) {
      note.classList.toggle('hidden', selectedPeriod !== 'friends');
      if (selectedPeriod === 'friends') note.textContent = 'Friends তালিকা shared Fallrush API থেকে আসে; এর জন্য API session token প্রয়োজন।';
      else note.textContent = '';
    }
  }
  function ensureUI() {
    injectStyles();
    ensureTopControls();
    ensureOverlays();
    ensureRankBanner();
    selectedPeriod = readPeriod();
    if (MATCH_RANKS.indexOf(selectedRank) < 0) selectedRank = readSelectedRank();
    updatePeriodTabs();
  }
  function bindEvents() {
    document.addEventListener('click', async function (event) {
      var period = event.target.closest && event.target.closest('[data-leaderboard-period]');
      if (period) {
        event.preventDefault();
        event.stopImmediatePropagation();
        selectedPeriod = period.dataset.leaderboardPeriod === 'friends' ? 'friends' : 'all-time';
        try { localStorage.setItem(PERIOD_KEY, selectedPeriod); } catch (_) {}
        updatePeriodTabs();
        await loadLeaderboard(true);
        return;
      }
      var rankButton = event.target.closest && event.target.closest('[data-med-rank]');
      if (rankButton) {
        selectedRank = rankButton.dataset.medRank;
        if (MATCH_RANKS.indexOf(selectedRank) < 0) return;
        try { localStorage.setItem(rankStorageKey(), selectedRank); } catch (_) {}
        renderRows(rawRows);
        var rail = document.getElementById('med-rank-rail');
        var active = rail && rail.querySelector('[data-med-rank="' + selectedRank + '"]');
        if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        return;
      }
      var action = event.target.closest && event.target.closest('[data-med-action]');
      if (action) {
        if (action.dataset.medAction === 'notifications') {
          showOverlay('med-rules-modal');
          await showFriendRequests();
        } else if (action.dataset.medAction === 'streak') {
          var progress = parseJson(localStorage.getItem('med_account_progress_v1_' + accountKey()), {});
          setStatus('🔥 Current daily streak: ' + Math.max(0, Number(progress.streak) || 0) + ' day(s).', false);
        } else {
          var mine = getCurrentUserRow();
          setStatus(mine ? mine.rank + ' · ' + mine.rankPoints + ' RP · next rank at ' + RP_TARGET + ' RP' : 'প্রথম eligible quiz সম্পন্ন করলে আপনার RP এখানে sync হবে।', false);
        }
        return;
      }
      var player = event.target.closest && event.target.closest('[data-med-player]');
      if (player && player.dataset.medPlayer) {
        await showPublicProfile(player.dataset.medPlayer);
        return;
      }
      var addFriend = event.target.closest && event.target.closest('[data-med-add-friend]');
      if (addFriend) {
        var token = getToken();
        if (!token) {
          var msg = document.getElementById('med-player-status');
          if (msg) msg.textContent = 'Friend request পাঠাতে Fallrush API session দরকার।';
          return;
        }
        addFriend.disabled = true;
        try {
          var res = await request({ action: 'friendInvite', token: token, username: addFriend.dataset.medPlayerName || '', playerId: addFriend.dataset.medAddFriend || '' });
          var status = document.getElementById('med-player-status');
          if (status) status.textContent = (res && res.success === false) ? (res.message || 'Request failed.') : 'Friend request পাঠানো হয়েছে।';
        } catch (error) {
          var statusNode = document.getElementById('med-player-status');
          if (statusNode) statusNode.textContent = error.message || 'Friend request পাঠানো যায়নি।';
        } finally { addFriend.disabled = false; }
        return;
      }
      var friendAnswer = event.target.closest && event.target.closest('[data-med-friend-response]');
      if (friendAnswer) {
        try {
          await request({ action: 'friendRespond', token: getToken(), requestId: friendAnswer.dataset.medRequestId || '', decision: friendAnswer.dataset.medFriendResponse });
          await showFriendRequests();
          if (selectedPeriod === 'friends') await loadLeaderboard(true);
        } catch (error) {
          var root = document.getElementById('med-friend-requests');
          if (root) root.innerHTML = '<p class="mat-dialog-note">' + escapeHtml(error.message || 'Friend request update failed.') + '</p>';
        }
        return;
      }
      var close = event.target.closest && event.target.closest('[data-med-close]');
      if (close) { closeOverlay(close.closest('.mat-overlay')); return; }
      if (event.target.classList && event.target.classList.contains('mat-overlay')) closeOverlay(event.target);
    }, true);
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      var player = event.target.closest && event.target.closest('[data-med-player]');
      if (player && (event.target === player || event.target.closest('.podium-card'))) {
        event.preventDefault();
        showPublicProfile(player.dataset.medPlayer);
      }
    });
  }
  app.getDemoLeaderboardRows = function () { return []; };
  app.getLocalLeaderboardRows = function () { return getCachedRows(); };
  app.setLocalLeaderboardRows = function (rows) { return saveCache(rows); };
  app.mergeLeaderboardRows = function (rows) { return normalizeRows(Array.isArray(rows) ? rows : []); };
  app.recordLeaderboardResult = recordLeaderboardResult;
  app.loadLeaderboard = loadLeaderboard;
  app.syncPendingLeaderboard = flushQueue;
  app.syncLeaderboardUser = function () { return Promise.resolve(false); };
  app.renderLeaderboardRows = renderRows;

  window.MedGlobalLeague = Object.freeze({
    loadLeaderboard: loadLeaderboard,
    recordLeaderboardResult: recordLeaderboardResult,
    getCachedRows: getCachedRows,
    saveCache: saveCache,
    getRanks: function () { return MATCH_RANKS.slice(); },
    flushPending: flushQueue,
    reload: function () { return loadLeaderboard(true); }
  });
  var originalSetAuthState = app.setAuthState.bind(app);
  app.setAuthState = function (user, notice) {
    var result = originalSetAuthState(user, notice);
    try { window.dispatchEvent(new CustomEvent('student-auth-state-changed', { detail: { user: user || null } })); } catch (_) {}
    return result;
  };
  ensureUI();
  bindEvents();
  window.addEventListener('online', function () { flushQueue(); loadLeaderboard(true); });
  window.addEventListener('storage', function (event) {
    if (event.key === PERIOD_KEY || event.key === 'elem_session_token') { selectedPeriod = readPeriod(); loadLeaderboard(true); }
  });
  window.addEventListener('student-auth-state-changed', function () {
    selectedRank = readSelectedRank();
    updateTopControls(getCurrentUserRow());
  });
  window.setTimeout(function () { loadLeaderboard(true); }, 0);
})();