/* Medical Admission Tracker — Fallrush-inspired global League experience.
 * The UI uses Google Apps Script/Sheets for shared leaderboard data.
 * Firebase Authentication remains the identity provider, not the leaderboard database.
 */
(function () {
  'use strict';
  var app = window.app;
  if (!app || app.__globalLeagueInstalled) return;
  app.__globalLeagueInstalled = true;

  var LEAGUES = ['Bronze', 'Silver', 'Gold', 'Diamond'];
  var LEAGUE_TARGET_RP = 100;
  var LEAGUE_KEY = 'med_global_league_selected_v1';
  var PERIOD_KEY = 'med_leaderboard_period_v1';
  var SORT_KEY = 'med_friend_sort_v1';
  var CACHE_KEY = 'med_global_leaderboard_cache_v1';
  var LOCAL_KEY = 'med_global_leaderboard_local_v1';
  var QUEUE_KEY = 'med_global_leaderboard_pending_v1';
  var ATTEMPTS_KEY = 'med_global_leaderboard_rewarded_v1';
  var currentMe = null;
  var activeRows = [];
  var selectedPeriod = readPeriod();
  var selectedLeague = localStorage.getItem(LEAGUE_KEY) || '';
  var configUrl = function () {
    return String(window.MED_LEADERBOARD_API_URL || '').trim();
  };

  function readPeriod() {
    var p = localStorage.getItem(PERIOD_KEY) || 'weekly';
    return ['weekly', 'all-time', 'friends'].indexOf(p) >= 0 ? p : 'weekly';
  }
  function text(value, max) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max || 120);
  }
  function escape(value) {
    if (app && typeof app.escapeHtml === 'function') return app.escapeHtml(String(value == null ? '' : value));
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function parse(raw, fallback) {
    try { var v = JSON.parse(raw); return v == null ? fallback : v; } catch (_) { return fallback; }
  }
  function profileName() {
    return text(app.profile && app.profile.name || app.authUser && app.authUser.displayName || app.authUser && app.authUser.email && app.authUser.email.split('@')[0] || 'Student', 80);
  }
  function profileCollege() { return text(app.profile && app.profile.college || '', 120); }
  function profileAvatar() {
    var key = 'med_profile_avatar_v1_' + (app.authUser && app.authUser.uid || 'guest');
    return text(localStorage.getItem(key) || '🩺', 16);
  }
  function localRows() {
    var rows = parse(localStorage.getItem(LOCAL_KEY), []);
    return Array.isArray(rows) ? rows.filter(function (r) { return r && r.uid && !r.isDemo; }) : [];
  }
  function saveLocalRows(rows) {
    var safe = (Array.isArray(rows) ? rows : []).filter(function (r) { return r && r.uid && !r.isDemo; });
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(safe));
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), rows: safe }));
    } catch (_) {}
    return safe;
  }
  function readQueue() {
    var q = parse(localStorage.getItem(QUEUE_KEY), []);
    return Array.isArray(q) ? q : [];
  }
  function saveQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify((Array.isArray(q) ? q : []).slice(-100))); } catch (_) {}
  }
  function attemptIds() {
    var ids = parse(localStorage.getItem(ATTEMPTS_KEY), []);
    return Array.isArray(ids) ? ids : [];
  }
  function markAttempt(id) {
    var ids = attemptIds().filter(function (x) { return x !== id; });
    ids.push(id);
    try { localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(ids.slice(-500))); } catch (_) {}
  }
  function setStatus(message, error) {
    var el = document.getElementById('leaderboard-status');
    if (!el) return;
    el.textContent = message || '';
    el.classList.remove('hidden');
    el.className = 'mb-4 rounded-xl p-3 text-sm ' + (error
      ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300');
  }
  async function api(action, payload) {
    var url = configUrl();
    if (!url) throw new Error('Global leaderboard backend is not connected yet. Deploy backend/medical-admission-leaderboard.gs, then set its Web App URL in js/leaderboard-config.js.');
    var body = Object.assign({}, payload || {}, { action: action });
    var tokenUser = app.authUser || (app.auth && app.auth.currentUser);
    if (tokenUser && typeof tokenUser.getIdToken === 'function' && body.idToken == null) {
      body.idToken = await tokenUser.getIdToken();
    }
    var response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=utf-8', 'Accept': 'application/json,text/plain,*/*' },
      body: JSON.stringify(body)
    });
    var raw = await response.text();
    var data;
    try { data = JSON.parse(String(raw || '').trim()); }
    catch (_) { throw new Error('Leaderboard backend returned an unreadable response. Check the Apps Script deployment and Web App access settings.'); }
    if (!response.ok || !data || data.success === false) throw new Error(data && (data.error || data.message) || ('Leaderboard request failed (' + response.status + ').'));
    return data;
  }
  function currentSort() { return localStorage.getItem(SORT_KEY) === 'all-time' ? 'all-time' : 'weekly'; }
  function selectedMetric() { return selectedPeriod === 'all-time' || (selectedPeriod === 'friends' && currentSort() === 'all-time') ? 'allTimePoints' : 'weeklyPoints'; }
  function getLeagueRows(rows) {
    var safe = (Array.isArray(rows) ? rows : []).filter(function (r) { return r && !r.isDemo; });
    var metric = selectedMetric();
    return safe.slice().sort(function (a, b) {
      var av = Number(a.points != null ? a.points : a[metric]) || 0;
      var bv = Number(b.points != null ? b.points : b[metric]) || 0;
      return bv - av || String(a.name || '').localeCompare(String(b.name || ''));
    });
  }
  function ensureLeagueUI() {
    var banner = document.querySelector('.league-banner');
    if (!banner) return;
    banner.setAttribute('aria-label', 'Global league selection and RP progress');
    banner.innerHTML =
      '<div class="mat-league-heading"><span>GLOBAL LEAGUES</span><small>Tap a trophy to view its leaderboard</small></div>' +
      '<div class="mat-league-rail" id="mat-league-rail" role="tablist" aria-label="Choose league"></div>' +
      '<div class="mat-league-progress-area" id="mat-league-progress-area"></div>';
    document.querySelectorAll('.student-profile-top-shortcut').forEach(function (b) { b.remove(); });
    ensureTopControls();
    ensurePlayerModal();
    ensureRulesModal();
    injectStyles();
  }
  function leagueIcon(league) {
    return league === 'Bronze' ? 'fa-medal' : league === 'Silver' ? 'fa-trophy' : league === 'Gold' ? 'fa-crown' : 'fa-gem';
  }
  function leagueColor(league) {
    return league === 'Bronze' ? 'bronze' : league === 'Silver' ? 'silver' : league === 'Gold' ? 'gold' : 'diamond';
  }
  function renderLeagueSelector() {
    var rail = document.getElementById('mat-league-rail');
    if (!rail) return;
    var active = LEAGUES.indexOf(selectedLeague) >= 0 ? selectedLeague : (currentMe && LEAGUES.indexOf(currentMe.league) >= 0 ? currentMe.league : 'Bronze');
    selectedLeague = active;
    rail.innerHTML = LEAGUES.map(function (league) {
      var isActive = league === active;
      return '<button type="button" role="tab" aria-selected="' + (isActive ? 'true' : 'false') +
        '" class="mat-league-card ' + leagueColor(league) + (isActive ? ' is-active' : '') +
        '" data-mat-league="' + league + '">' +
        '<span class="mat-league-icon"><i class="fa-solid ' + leagueIcon(league) + '"></i></span>' +
        '<span class="mat-league-name">' + league + '</span>' +
        (currentMe && currentMe.league === league ? '<small>YOUR LEAGUE</small>' : '<small>LEAGUE</small>') +
        '</button>';
    }).join('');
    try {
      var activeButton = rail.querySelector('[data-mat-league="' + active + '"]');
      if (activeButton && active !== 'Bronze') activeButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } catch (_) {}
    renderLeagueProgress();
  }
  function renderLeagueProgress() {
    var area = document.getElementById('mat-league-progress-area');
    if (!area) return;
    var me = currentMe || {};
    var isMine = !me.league || selectedLeague === me.league;
    var rp = Math.max(0, Number(me.rankRP) || 0);
    var target = Math.max(1, Number(me.rpTarget) || LEAGUE_TARGET_RP);
    var pct = Math.max(0, Math.min(100, Math.round(rp / target * 100)));
    if (!isMine) {
      area.innerHTML = '<div class="mat-league-locked"><i class="fa-solid fa-lock"></i><span><strong>Unlock this League</strong><small>Earn the required RP in your current League to advance. League promotion applies as soon as the RP target is reached.</small></span></div>';
      return;
    }
    area.innerHTML =
      '<div class="mat-rp-line"><span><strong>League Progress</strong><small>' + rp + ' / ' + target + ' RP</small></span><span class="mat-rp-value"><i class="fa-solid fa-star"></i> ' + rp + ' RP</span></div>' +
      '<div class="mat-rp-track" role="progressbar" aria-valuemin="0" aria-valuemax="' + target + '" aria-valuenow="' + Math.min(rp, target) + '">' +
      '<span style="width:' + pct + '%"></span><i class="fa-solid fa-star" style="left:clamp(9px,' + pct + '%,calc(100% - 9px))"></i></div>' +
      '<div class="mat-rp-foot"><span>0 RP</span><span>' + (selectedLeague === 'Diamond' ? 'Top League' : 'Next League: ' + LEAGUES[LEAGUES.indexOf(selectedLeague) + 1]) + '</span><span>' + target + ' RP</span></div>';
  }
  function ensureTopControls() {
    var old = document.getElementById('mat-global-controls');
    if (old) return;
    var root = document.createElement('div');
    root.id = 'mat-global-controls';
    root.innerHTML =
      '<button type="button" class="mat-top-icon" data-mat-action="streak" title="Daily streak" aria-label="Daily streak"><i class="fa-solid fa-fire"></i></button>' +
      '<button type="button" class="mat-top-icon" data-mat-action="notifications" title="Notifications and rules" aria-label="Notifications and rules"><i class="fa-solid fa-bell"></i><span class="mat-notice-dot" id="mat-notice-dot"></span></button>' +
      '<button type="button" class="mat-top-rp" title="Rank Points"><i class="fa-solid fa-star"></i><span id="mat-top-rp">0 RP</span></button>';
    document.body.appendChild(root);
  }
  function ensurePlayerModal() {
    if (document.getElementById('mat-player-modal')) return;
    var el = document.createElement('div');
    el.id = 'mat-player-modal';
    el.className = 'mat-overlay hidden';
    el.innerHTML = '<div class="mat-dialog" role="dialog" aria-modal="true" aria-labelledby="mat-player-title"><button class="mat-close" type="button" data-mat-close aria-label="Close">×</button><div id="mat-player-content"></div></div>';
    document.body.appendChild(el);
  }
  function ensureRulesModal() {
    if (document.getElementById('mat-rules-modal')) return;
    var el = document.createElement('div');
    el.id = 'mat-rules-modal';
    el.className = 'mat-overlay hidden';
    el.innerHTML =
      '<div class="mat-dialog" role="dialog" aria-modal="true" aria-labelledby="mat-rules-title">' +
      '<button class="mat-close" type="button" data-mat-close aria-label="Close">×</button>' +
      '<h2 id="mat-rules-title">Notifications & Rules</h2><p class="mat-dialog-note">Choose a section to read its rules. Nothing expands until you open it.</p>' +
      '<div id="mat-friend-requests" class="mat-friend-requests"></div>' +
      '<div class="mat-rule-list">' +
      '<details><summary><i class="fa-solid fa-trophy"></i> League & RP Rules</summary><div>Four Leagues: Bronze, Silver, Gold and Diamond. Each promotion requires 100 RP. Promotion happens immediately when the required RP is reached; extra RP carries over to the next League.</div></details>' +
      '<details><summary><i class="fa-solid fa-calendar-week"></i> Weekly Reset & Safe Zone</summary><div>Weekly points reset every Monday in Bangladesh time. All-time points remain. The top 75% of active players in a League stay safe; when a League has at least four active players, the bottom 25% may drop one League at reset and lose up to 100 RP.</div></details>' +
      '<details><summary><i class="fa-solid fa-user-group"></i> Friends & Privacy</summary><div>Friend requests require a signed-in account. Only public leaderboard fields (display name, college, avatar, League and score totals) are shown. Email, password and sign-in tokens are never displayed.</div></details>' +
      '</div></div>';
    document.body.appendChild(el);
  }
  function injectStyles() {
    if (document.getElementById('mat-global-league-style')) return;
    var style = document.createElement('style');
    style.id = 'mat-global-league-style';
    style.textContent =
      '.league-banner{padding:20px 14px 18px!important;text-align:left!important}' +
      '.mat-league-heading{text-align:center;display:flex;flex-direction:column;gap:5px;margin-bottom:14px}.mat-league-heading>span{font-weight:950;font-size:11px;letter-spacing:.18em;color:#c4b5fd}.mat-league-heading small{font-size:12px;color:#cbd5e1}' +
      '.mat-league-rail{display:flex;align-items:center;gap:10px;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;-ms-overflow-style:none;padding:8px 8px 12px;scroll-snap-type:x mandatory}.mat-league-rail::-webkit-scrollbar{display:none}' +
      '.mat-league-card{flex:0 0 86px;min-width:86px;min-height:92px;border:1px solid rgba(148,163,184,.23);border-radius:18px;padding:10px 7px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;opacity:.72;transform:scale(.92);transition:transform .18s ease,opacity .18s ease,box-shadow .18s ease,border-color .18s ease;scroll-snap-align:center;color:#f8fafc;background:rgba(15,23,42,.72);cursor:pointer}' +
      '.mat-league-card.is-active{flex-basis:118px;min-width:118px;min-height:116px;opacity:1;transform:scale(1);border-color:rgba(255,255,255,.55);box-shadow:0 0 0 2px rgba(255,255,255,.08),0 12px 26px rgba(0,0,0,.2)}.mat-league-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;font-size:22px}.mat-league-card.is-active .mat-league-icon{width:49px;height:49px;font-size:25px}.mat-league-name{font-weight:950;font-size:13px}.mat-league-card small{font-size:8px;font-weight:900;letter-spacing:.08em;opacity:.8}' +
      '.mat-league-card.bronze .mat-league-icon{color:#f1b47b;background:linear-gradient(145deg,#6e442c,#bd804f)}.mat-league-card.silver .mat-league-icon{color:#e2e8f0;background:linear-gradient(145deg,#475569,#94a3b8)}.mat-league-card.gold .mat-league-icon{color:#fff1aa;background:linear-gradient(145deg,#8b5e0b,#eab308)}.mat-league-card.diamond .mat-league-icon{color:#cffafe;background:linear-gradient(145deg,#0e7490,#67e8f9)}' +
      '.mat-league-progress-area{padding:8px 10px 0;color:#f8fafc}.mat-rp-line{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.mat-rp-line>span:first-child{display:flex;flex-direction:column;gap:3px}.mat-rp-line strong{font-size:13px}.mat-rp-line small,.mat-rp-foot{font-size:11px;color:#cbd5e1}.mat-rp-value{font-weight:900;white-space:nowrap;color:#fde68a}.mat-rp-value i{margin-right:4px}.mat-rp-track{position:relative;height:12px;border-radius:99px;background:rgba(148,163,184,.25);margin:15px 10px 8px}.mat-rp-track>span{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,#a78bfa,#fbbf24);transition:width .35s ease}.mat-rp-track>i{position:absolute;top:50%;transform:translate(-50%,-50%);display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#fef3c7;color:#a16207;border:2px solid #fff7ed;box-shadow:0 2px 8px rgba(0,0,0,.3)}.mat-rp-foot{display:flex;justify-content:space-between;gap:8px}.mat-league-locked{display:flex;gap:12px;align-items:center;border:1px solid rgba(148,163,184,.25);border-radius:14px;padding:13px;background:rgba(15,23,42,.46)}.mat-league-locked>i{font-size:21px;color:#c4b5fd}.mat-league-locked span{display:flex;flex-direction:column;gap:4px}.mat-league-locked strong{font-size:13px}.mat-league-locked small{font-size:11px;line-height:1.5;color:#cbd5e1}' +
      '#mat-global-controls{position:fixed;z-index:9998;top:14px;right:18px;display:flex;align-items:center;gap:8px;padding:5px;border-radius:16px;background:rgba(10,18,32,.94);border:1px solid rgba(148,163,184,.23);box-shadow:0 10px 28px rgba(0,0,0,.18);backdrop-filter:blur(14px);color:#f8fafc}body.exam-active #mat-global-controls{display:none}.mat-top-icon{position:relative;display:grid;place-items:center;width:40px;height:40px;border-radius:12px;border:1px solid rgba(148,163,184,.18);background:rgba(255,255,255,.05);color:#e2e8f0;font-size:16px;cursor:pointer}.mat-top-icon:first-child{color:#fb923c}.mat-top-icon:hover,.mat-top-rp:hover{background:rgba(255,255,255,.12)}.mat-notice-dot{display:none;position:absolute;right:6px;top:6px;width:7px;height:7px;background:#f87171;border-radius:50%}.mat-notice-dot.is-visible{display:block}.mat-top-rp{display:flex;align-items:center;gap:7px;height:40px;padding:0 11px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(148,163,184,.18);color:#f8fafc;font-weight:950;white-space:nowrap;cursor:pointer}.mat-top-rp i{color:#facc15}' +
      '.mat-overlay{position:fixed;inset:0;z-index:10020;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(2,6,23,.68);backdrop-filter:blur(9px)}.mat-overlay.hidden{display:none}.mat-dialog{position:relative;width:min(100%,520px);max-height:min(86vh,760px);overflow:auto;border:1px solid rgba(148,163,184,.24);border-radius:24px;padding:25px;background:var(--surface,#fff);color:var(--text,#0f172a);box-shadow:0 28px 80px rgba(0,0,0,.36)}.dark .mat-dialog{background:#101827;color:#f8fafc}.mat-dialog h2{font-size:22px;font-weight:950;margin:0 34px 8px 0}.mat-dialog-note{font-size:13px;color:var(--muted,#64748b);margin:0 0 16px;line-height:1.6}.mat-close{position:absolute;right:14px;top:12px;width:36px;height:36px;border-radius:12px;background:rgba(148,163,184,.14);font-size:25px;line-height:1}.mat-rule-list{display:flex;flex-direction:column;gap:9px}.mat-rule-list details{border:1px solid rgba(148,163,184,.25);border-radius:14px;overflow:hidden}.mat-rule-list summary{list-style:none;display:flex;align-items:center;gap:10px;padding:14px;font-weight:850;cursor:pointer}.mat-rule-list summary::-webkit-details-marker{display:none}.mat-rule-list summary i{color:#8b5cf6}.mat-rule-list details>div{padding:0 14px 15px;font-size:13px;line-height:1.7;color:var(--muted,#64748b)}.dark .mat-rule-list details>div{color:#cbd5e1}.mat-friend-requests{margin-bottom:13px}.mat-friend-request{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid rgba(148,163,184,.2)}.mat-friend-request button,.mat-primary-btn{border:0;border-radius:10px;padding:8px 11px;background:#0d9488;color:white;font-size:12px;font-weight:850}.mat-friend-request .mat-decline{background:#64748b}.mat-player-avatar{font-size:38px}.mat-player-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:16px 0}.mat-player-stat{padding:12px;border-radius:14px;background:rgba(148,163,184,.12)}.mat-player-stat small{display:block;font-size:11px;color:var(--muted,#64748b)}.mat-player-stat strong{display:block;margin-top:4px;font-size:16px;overflow-wrap:anywhere}.mat-player-actions{display:flex;gap:8px;flex-wrap:wrap}.mat-player-actions button{padding:10px 12px;border-radius:11px;font-weight:850;border:1px solid rgba(148,163,184,.28)}.mat-player-actions .mat-primary-btn{background:#0d9488;color:#fff;border:0}' +
      '#leaderboard-body tr[data-mat-player]{cursor:pointer}#leaderboard-body tr[data-mat-player]:hover{background:rgba(13,148,136,.07)}.leaderboard-period-tab.is-active{border-color:#0d9488!important;background:rgba(13,148,136,.1)!important;color:#0d9488!important}' +
      '@media(max-width:600px){#mat-global-controls{top:10px;right:9px;gap:5px;padding:4px}.mat-top-icon{width:36px;height:36px}.mat-top-rp{height:36px;padding:0 8px;font-size:12px}main{padding-top:68px!important}.mat-dialog{padding:21px 16px}.mat-league-rail{gap:7px;padding-left:5px;padding-right:5px}.mat-league-card{flex-basis:74px;min-width:74px;min-height:84px}.mat-league-card.is-active{flex-basis:106px;min-width:106px;min-height:105px}}';
    document.head.appendChild(style);
  }
  function renderTopControls() {
    var rpNode = document.getElementById('mat-top-rp');
    if (rpNode) rpNode.textContent = String(Math.max(0, Number(currentMe && currentMe.rankRP) || 0)) + ' RP';
    var progress = parse(localStorage.getItem('med_account_progress_v1_' + (app.authUser && app.authUser.uid || 'guest')), {});
    var streak = Math.max(0, Number(progress.streak) || 0);
    var streakBtn = document.querySelector('[data-mat-action="streak"]');
    if (streakBtn) {
      streakBtn.title = 'Daily streak: ' + streak + ' day' + (streak === 1 ? '' : 's');
      streakBtn.setAttribute('aria-label', 'Daily streak: ' + streak + ' days');
    }
    var dot = document.getElementById('mat-notice-dot');
    if (dot) {
      var q = parse(localStorage.getItem('med_global_pending_friend_requests_v1'), []);
      dot.classList.toggle('is-visible', Array.isArray(q) && q.length > 0);
    }
  }
  function openModal(id) { var el = document.getElementById(id); if (el) el.classList.remove('hidden'); }
  function closeModal(el) { if (el) el.classList.add('hidden'); }
  function activePublicProfile(uid) {
    return activeRows.find(function (r) { return String(r.uid) === String(uid); }) ||
      (currentMe && String(currentMe.uid) === String(uid) ? currentMe : null);
  }
  function openPlayerProfile(uid) {
    var player = activePublicProfile(uid);
    if (!player) return;
    var content = document.getElementById('mat-player-content');
    if (!content) return;
    var mine = app.authUser && app.authUser.uid === player.uid;
    var rank = LEAGUES.indexOf(player.league) >= 0 ? player.league : 'Bronze';
    content.innerHTML =
      '<div class="mat-player-avatar">' + escape(player.avatar || '🩺') + '</div>' +
      '<h2 id="mat-player-title">' + escape(player.name || 'Student') + '</h2>' +
      '<p class="mat-dialog-note">' + escape(player.college || 'College not provided') + '</p>' +
      '<div class="mat-player-meta">' +
      '<div class="mat-player-stat"><small>League</small><strong>' + escape(rank) + '</strong></div>' +
      '<div class="mat-player-stat"><small>Rank Points</small><strong>' + Number(player.rankRP || 0) + ' RP</strong></div>' +
      '<div class="mat-player-stat"><small>All-time points</small><strong>' + Number(player.allTimePoints != null ? player.allTimePoints : player.points || 0) + '</strong></div>' +
      '<div class="mat-player-stat"><small>Quizzes</small><strong>' + Number(player.quizzes || 0) + '</strong></div>' +
      '<div class="mat-player-stat"><small>Accuracy</small><strong>' + Number(player.accuracy || 0).toFixed(1) + '%</strong></div>' +
      '</div>' +
      '<div class="mat-player-actions">' +
      (mine ? '<span class="mat-dialog-note">This is your public leaderboard profile.</span>' :
        (app.authUser ? '<button type="button" class="mat-primary-btn" data-mat-add-friend="' + escape(player.uid) + '"><i class="fa-solid fa-user-plus"></i> Add Friend</button>' :
          '<button type="button" data-mat-login>Sign in to add friends</button>')) +
      '<button type="button" data-mat-close>Close</button></div>' +
      '<p class="mat-dialog-note" id="mat-player-action-status"></p>';
    openModal('mat-player-modal');
  }
  async function showFriendRequests() {
    var box = document.getElementById('mat-friend-requests');
    if (!box) return;
    if (!app.authUser) {
      box.innerHTML = '<p class="mat-dialog-note">Sign in to receive friend requests and use the Friends leaderboard.</p>';
      renderTopControls();
      return;
    }
    box.innerHTML = '<p class="mat-dialog-note">Loading friend requests…</p>';
    try {
      var res = await api('getFriendRequests', {});
      var requests = Array.isArray(res.requests) ? res.requests : [];
      try { localStorage.setItem('med_global_pending_friend_requests_v1', JSON.stringify(requests)); } catch (_) {}
      if (!requests.length) box.innerHTML = '<p class="mat-dialog-note">No pending friend requests.</p>';
      else box.innerHTML = '<strong>Friend Requests</strong>' + requests.map(function (r) {
        return '<div class="mat-friend-request"><span><b>' + escape(r.name || 'Student') + '</b><small>' + escape(r.college || '') + '</small></span><span><button data-mat-friend-answer="accept" data-mat-from-uid="' + escape(r.uid) + '">Accept</button> <button class="mat-decline" data-mat-friend-answer="decline" data-mat-from-uid="' + escape(r.uid) + '">Decline</button></span></div>';
      }).join('');
    } catch (err) {
      box.innerHTML = '<p class="mat-dialog-note">' + escape(err.message || 'Could not load friend requests.') + '</p>';
    }
    renderTopControls();
  }
  function renderLeaderboardRows(rows) {
    activeRows = getLeagueRows(rows);
    var body = document.getElementById('leaderboard-body');
    var podium = document.getElementById('leaderboard-podium');
    var mePanel = document.getElementById('leaderboard-me');
    if (!body) return;
    if (podium) podium.innerHTML = '';
    body.innerHTML = '';
    if (mePanel) { mePanel.innerHTML = ''; mePanel.classList.add('hidden'); }
    if (!activeRows.length) {
      body.innerHTML = '<tr><td colspan="5" class="py-12 text-center text-sm text-gray-500">এই League-এ এখনো কোনো leaderboard entry নেই। Challenge Quiz সম্পন্ন করলে ranking তৈরি হবে।</td></tr>';
      renderLeagueSelector();
      renderTopControls();
      return;
    }
    if (podium) {
      podium.innerHTML = activeRows.slice(0, 3).map(function (x, i) {
        return '<article class="podium-card podium-' + (i + 1) + '" data-mat-player="' + escape(x.uid) + '">' +
          '<div class="podium-medal">' + ['🥇', '🥈', '🥉'][i] + '</div>' +
          '<div class="podium-avatar">' + escape(x.avatar || String(x.name || 'S').charAt(0).toUpperCase()) + '</div>' +
          '<strong>' + escape(x.name || 'Student') + '</strong><span>' + Number(x.points != null ? x.points : selectedMetric() === 'allTimePoints' ? x.allTimePoints : x.weeklyPoints || 0) + ' Points</span>' +
          '<small>' + Number(x.accuracy || 0).toFixed(1) + '% Accuracy</small></article>';
      }).join('');
    }
    activeRows.forEach(function (x, i) {
      var tr = document.createElement('tr');
      tr.className = 'leader-row ' + (app.authUser && app.authUser.uid === x.uid ? 'is-me' : '');
      tr.dataset.matPlayer = String(x.uid || '');
      var points = Number(x.points != null ? x.points : selectedMetric() === 'allTimePoints' ? x.allTimePoints : x.weeklyPoints || 0);
      tr.innerHTML =
        '<td class="py-4 px-3"><div class="leader-person"><span class="leader-avatar">' + escape(x.avatar || String(x.name || 'S').charAt(0).toUpperCase()) + '</span><span><b>' + escape(x.name || 'Student') + '</b>' +
        (app.authUser && app.authUser.uid === x.uid ? '<em>YOU</em>' : '') + '<small class="block text-xs opacity-70">' + escape(x.league || selectedLeague || 'Bronze') + '</small></span></div></td>' +
        '<td class="py-4 px-3">' + escape(x.college || '—') + '</td>' +
        '<td class="py-4 px-3">' + Number(x.quizzes || 0) + '</td>' +
        '<td class="py-4 px-3">' + Number(x.accuracy || 0).toFixed(1) + '%</td>' +
        '<td class="leader-rank-points py-4 px-3"><strong class="leader-rank-number">' + (i + 1) + '</strong><small class="leader-points-label">' + points + ' Points</small></td>';
      body.appendChild(tr);
    });
    var mine = currentMe && activeRows.find(function (x) { return x.uid === currentMe.uid; });
    if (mePanel && mine) {
      mePanel.classList.remove('hidden');
      mePanel.innerHTML = '<div><span>Your Position</span><strong>#' + (activeRows.indexOf(mine) + 1) + '</strong></div><div><b>' + escape(mine.name || 'Student') + '</b><small>' + Number(mine.accuracy || 0).toFixed(1) + '% accuracy • ' + Number(mine.points || 0) + ' points</small></div>';
    }
    renderLeagueSelector();
    renderTopControls();
  }
  function cachedView(league, period) {
    var cache = parse(localStorage.getItem(CACHE_KEY), {});
    var key = period + ':' + league;
    return cache && Array.isArray(cache[key]) ? cache[key] : [];
  }
  function saveCachedView(league, period, rows) {
    var cache = parse(localStorage.getItem(CACHE_KEY), {});
    cache = cache && typeof cache === 'object' && !Array.isArray(cache) ? cache : {};
    cache[period + ':' + league] = Array.isArray(rows) ? rows : [];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (_) {}
  }
  async function loadLeaderboard(silent) {
    ensureLeagueUI();
    var period = readPeriod();
    selectedPeriod = period;
    var guess = selectedLeague || (currentMe && currentMe.league) || 'Bronze';
    selectedLeague = LEAGUES.indexOf(guess) >= 0 ? guess : 'Bronze';
    var cached = cachedView(selectedLeague, selectedPeriod);
    if (cached.length) {
      activeRows = cached;
      renderLeaderboardRows(cached);
    } else {
      renderLeaderboardRows(localRows().filter(function (r) { return r.league === selectedLeague; }));
    }
    if (!configUrl()) {
      setStatus('Global leaderboard backend এখনো connect করা হয়নি। Apps Script deploy করে URL configure করতে হবে।', true);
      return;
    }
    try {
      if (app.authUser) {
        var profileResponse = await api('profileSync', { name: profileName(), college: profileCollege(), avatar: profileAvatar() });
        currentMe = profileResponse.user || currentMe;
        if (!localStorage.getItem(LEAGUE_KEY) && currentMe && currentMe.league) {
          selectedLeague = currentMe.league;
          localStorage.setItem(LEAGUE_KEY, selectedLeague);
        }
      }
      var res = await api('leaderboard', {
        period: selectedPeriod,
        league: selectedLeague,
        sortBy: currentSort()
      });
      if (res.me) currentMe = res.me;
      if (currentMe) currentMe.rpTarget = Number(res.rpTarget || LEAGUE_TARGET_RP);
      var entries = Array.isArray(res.entries) ? res.entries : [];
      activeRows = entries;
      saveCachedView(selectedLeague, selectedPeriod, entries);
      saveLocalRows(entries);
      renderLeaderboardRows(entries);
      setStatus('Global leaderboard synced • ' + (res.currentWeekKey || '') + ' • ' + (app.authUser ? 'signed-in account' : 'public view'), false);
      if (selectedPeriod === 'friends') {
        var incoming = await api('getFriendRequests', {}).catch(function () { return { requests: [] }; });
        try { localStorage.setItem('med_global_pending_friend_requests_v1', JSON.stringify(incoming.requests || [])); } catch (_) {}
        renderTopControls();
      }
    } catch (err) {
      setStatus('Global sync হয়নি। সর্বশেষ verified cache দেখানো হচ্ছে। ' + (err.message || ''), true);
    }
  }
  function queueResult(payload) {
    var q = readQueue();
    if (!q.some(function (x) { return x && x.uid === payload.uid && x.attemptId === payload.attemptId; })) q.push(payload);
    saveQueue(q);
  }
  async function flushQueue() {
    if (!app.authUser || !configUrl() || !navigator.onLine) return;
    var q = readQueue();
    if (!q.length) return;
    var keep = [];
    var synced = false;
    for (var i = 0; i < q.length; i++) {
      var item = q[i];
      if (!item || item.uid !== app.authUser.uid) { keep.push(item); continue; }
      try {
        var result = await api('recordResult', {
          attemptId: item.attemptId, quizPoints: item.quizPoints, correctCount: item.correctCount,
          wrongCount: item.wrongCount, totalQuestions: item.totalQuestions,
          name: profileName(), college: profileCollege(), avatar: profileAvatar()
        });
        if (result && result.success) { synced = true; markAttempt(item.attemptId); }
        else keep.push(item);
      } catch (_) { keep.push(item); }
    }
    saveQueue(keep);
    if (synced) await loadLeaderboard(true);
  }
  async function recordLeaderboardResult(meta) {
    meta = meta || {};
    var correct = Math.max(0, Math.floor(Number(meta.correctCount) || 0));
    var wrong = Math.max(0, Math.floor(Number(meta.wrongCount) || 0));
    var total = Math.max(0, Math.floor(Number(meta.totalQuestions) || 0));
    var points = Math.max(0, Math.floor(Number(meta.quizPoints) || 0));
    var attemptId = String(this.examState && this.examState.startedAt || Date.now());
    if (attemptIds().indexOf(attemptId) >= 0) return;
    if (!this.authUser) {
      setStatus('Global leaderboard points sync করতে sign in করুন। Guest results global rank-এ যোগ হবে না।', true);
      return;
    }
    if (!total || correct + wrong > total || points !== Math.max(0, correct * 4 - wrong)) {
      setStatus('এই quiz result leaderboard-এর scoring rules-এর সঙ্গে মেলেনি।', true);
      return;
    }
    var payload = {
      uid: this.authUser.uid, attemptId: attemptId, quizPoints: points,
      correctCount: correct, wrongCount: wrong, totalQuestions: total
    };
    try {
      var res = await api('recordResult', {
        attemptId: attemptId, quizPoints: points, correctCount: correct, wrongCount: wrong, totalQuestions: total,
        name: profileName(), college: profileCollege(), avatar: profileAvatar(),
        previousLeague: currentMe && currentMe.league || ''
      });
      if (res.user) currentMe = Object.assign({}, res.user, { rpTarget: LEAGUE_TARGET_RP });
      markAttempt(attemptId);
      setStatus('Quiz result global leaderboard-এ sync হয়েছে। +' + points + ' points.', false);
      await loadLeaderboard(true);
    } catch (err) {
      queueResult(payload);
      setStatus('Global sync সাময়িকভাবে unavailable। Result pending queue-তে রাখা হয়েছে; online হলে আবার sync হবে। ' + (err.message || ''), true);
    }
  }
  async function syncProfile(profile) {
    if (!(app.authUser || (app.auth && app.auth.currentUser))) throw new Error('Sign in to sync the student profile.');
    profile = profile || app.profile || {};
    var response = await api('profileSync', {
      name: text(profile.name || profile.displayName || profileName(), 80),
      college: text(profile.college || '', 120),
      avatar: text(profile.avatar || profileAvatar(), 16)
    });
    if (response.user) currentMe = Object.assign({}, response.user, { rpTarget: LEAGUE_TARGET_RP });
    return response;
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
      note.textContent = selectedPeriod === 'friends' ? 'Friends leaderboard shows accepted friends in the selected League. Add friends from a student profile.' : '';
    }
  }
  function bindEvents() {
    document.addEventListener('click', async function (event) {
      var periodBtn = event.target.closest && event.target.closest('[data-leaderboard-period]');
      if (periodBtn) {
        event.preventDefault();
        event.stopImmediatePropagation();
        selectedPeriod = periodBtn.dataset.leaderboardPeriod;
        if (['weekly', 'all-time', 'friends'].indexOf(selectedPeriod) < 0) selectedPeriod = 'weekly';
        localStorage.setItem(PERIOD_KEY, selectedPeriod);
        updatePeriodTabs();
        await loadLeaderboard(true);
        return;
      }
      var leagueBtn = event.target.closest && event.target.closest('[data-mat-league]');
      if (leagueBtn) {
        selectedLeague = leagueBtn.dataset.matLeague;
        if (LEAGUES.indexOf(selectedLeague) < 0) return;
        localStorage.setItem(LEAGUE_KEY, selectedLeague);
        renderLeagueSelector();
        await loadLeaderboard(true);
        return;
      }
      var topAction = event.target.closest && event.target.closest('[data-mat-action]');
      if (topAction) {
        if (topAction.dataset.matAction === 'streak') {
          var progress = parse(localStorage.getItem('med_account_progress_v1_' + (app.authUser && app.authUser.uid || 'guest')), {});
          var streak = Math.max(0, Number(progress.streak) || 0);
          setStatus('🔥 Current daily streak: ' + streak + ' day' + (streak === 1 ? '' : 's') + '.', false);
        } else {
          openModal('mat-rules-modal');
          await showFriendRequests();
        }
        return;
      }
      var playerRow = event.target.closest && event.target.closest('[data-mat-player]');
      if (playerRow && playerRow.dataset.matPlayer) {
        openPlayerProfile(playerRow.dataset.matPlayer);
        return;
      }
      var addFriend = event.target.closest && event.target.closest('[data-mat-add-friend]');
      if (addFriend) {
        if (!app.authUser) { app.openAuthModal('login'); return; }
        var stat = document.getElementById('mat-player-action-status');
        addFriend.disabled = true;
        try {
          var send = await api('sendFriendRequest', { toUid: addFriend.dataset.matAddFriend });
          if (stat) stat.textContent = send.status === 'accepted' ? 'You are already friends.' : 'Friend request sent.';
        } catch (err) { if (stat) stat.textContent = err.message || 'Friend request failed.'; }
        addFriend.disabled = false;
        return;
      }
      var answerFriend = event.target.closest && event.target.closest('[data-mat-friend-answer]');
      if (answerFriend) {
        try {
          await api('respondFriendRequest', { fromUid: answerFriend.dataset.matFromUid, decision: answerFriend.dataset.matFriendAnswer });
          await showFriendRequests();
          if (selectedPeriod === 'friends') await loadLeaderboard(true);
        } catch (err) {
          var requestBox = document.getElementById('mat-friend-requests');
          if (requestBox) requestBox.innerHTML = '<p class="mat-dialog-note">' + escape(err.message || 'Could not process friend request.') + '</p>';
        }
        return;
      }
      if (event.target.closest && event.target.closest('[data-mat-login]')) {
        app.openAuthModal('login');
        return;
      }
      var close = event.target.closest && event.target.closest('[data-mat-close]');
      if (close) {
        closeModal(close.closest('.mat-overlay'));
        return;
      }
      if (event.target.classList && event.target.classList.contains('mat-overlay')) closeModal(event.target);
    }, true);
  }

  // The previous client kept demo rows and wrote leaderboard data into Firestore.
  // Replace those leaderboard paths so Firebase remains auth/profile-only.
  app.getDemoLeaderboardRows = function () { return []; };
  app.getLocalLeaderboardRows = function () { return localRows(); };
  app.setLocalLeaderboardRows = function (rows) { return saveLocalRows(rows); };
  app.mergeLeaderboardRows = function (rows) { return getLeagueRows(rows); };
  app.renderLeaderboardRows = renderLeaderboardRows;
  app.loadLeaderboard = loadLeaderboard;
  app.recordLeaderboardResult = recordLeaderboardResult;
  app.syncPendingLeaderboard = flushQueue;
  app.syncLeaderboardUser = function () { return Promise.resolve(false); };

  window.MedGlobalLeague = Object.freeze({ syncProfile: syncProfile, reload: loadLeaderboard, flushPending: flushQueue });

  app.loadUserProfile = async function () {
    if (!this.authUser) return;
    var uid = this.authUser.uid;
    var localProfile = parse(localStorage.getItem('med_student_profile_v1_' + uid), {});
    this.profile = Object.assign({ uid: uid, name: this.authUser.displayName || '', email: this.authUser.email || '' }, localProfile || {});
    if (configUrl()) {
      try {
        var synced = await syncProfile(this.profile);
        if (synced && synced.user) this.profile = Object.assign({}, this.profile, synced.user);
        localStorage.setItem('med_student_profile_v1_' + uid, JSON.stringify(this.profile));
      } catch (err) { console.warn('Profile sync deferred:', err); }
    }
    this.loadProgressStats();
  };

  ensureLeagueUI();
  updatePeriodTabs();
  renderLeagueSelector();
  renderTopControls();
  bindEvents();
  window.addEventListener('student-auth-state-changed', function () {
    currentMe = null;
    selectedPeriod = readPeriod();
    updatePeriodTabs();
    loadLeaderboard(true);
  });
  window.addEventListener('online', function () { flushQueue(); loadLeaderboard(true); });
  window.addEventListener('storage', function (event) {
    if (event.key === PERIOD_KEY) { selectedPeriod = readPeriod(); updatePeriodTabs(); loadLeaderboard(true); }
  });
  setInterval(flushQueue, 15000);
  // Do not wait for the question bank or initial profile request to complete.
  window.setTimeout(function () { loadLeaderboard(true); }, 0);
})();
