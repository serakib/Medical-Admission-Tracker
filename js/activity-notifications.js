/* In-site activity notifications for Medical Admission Tracker.
   Uses the live Weekly leaderboard and accepted-friend list. No OS/browser push notifications. */
(function () {
  'use strict';
  if (window.__matActivityNotificationsLoaded) return;
  window.__matActivityNotificationsLoaded = true;

  const PERIOD_KEY = 'med_sheet_leaderboard_period_v1';
  const STORAGE_PREFIX = 'med_activity_notifications_v2_';
  const RANKS = [
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
    'Immortal'
  ];

  let activeAccountKey = '';
  let state = makeEmptyState();
  let activeFilter = 'all';
  let lastRefreshAt = 0;
  let refreshPromise = null;
  let lastTrigger = null;
  let cloudLoadedForUid = '';
  let cloudRestorePromise = null;
  let cloudWriteTimer = null;

  function makeEmptyState() {
    return { notifications: [], lastSnapshot: null, dayKey: '', dayBaseline: null, trophyEvents: {} };
  }
  function safeText(value, max) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max || 180);
  }
  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }
  function parseJSON(value, fallback) {
    try { const result = JSON.parse(value); return result == null ? fallback : result; }
    catch (_) { return fallback; }
  }
  function accountId() {
    const app = window.app || {};
    if (app.authUser && app.authUser.uid) return String(app.authUser.uid);
    try {
      const guestId = String(localStorage.getItem('med_sheet_guest_id_v1') || '').trim();
      if (guestId) return guestId;
    } catch (_) {}
    return String(app.profile && (app.profile.userId || app.profile.uid) || 'guest');
  }
  function stateKey() { return STORAGE_PREFIX + accountId(); }
  function signedInUid() {
    const app = window.app || {};
    if (app.authUser && app.authUser.uid) return String(app.authUser.uid);
    try {
      const user = window.firebase && typeof window.firebase.auth === 'function' && window.firebase.auth().currentUser;
      return user && user.uid ? String(user.uid) : '';
    } catch (_) { return ''; }
  }
  function cloudStateAvailable(uid) {
    return !!(uid && window.MedActivityNotificationStore &&
      typeof window.MedActivityNotificationStore.get === 'function' &&
      typeof window.MedActivityNotificationStore.set === 'function');
  }
  function stateVersion(item) {
    return Math.max(numeric(item && (item.updatedAt || item.createdAt)), numeric(item && item.readAt));
  }
  function mergeStateObjects(localState, remoteState) {
    const local = Object.assign(makeEmptyState(), localState || {});
    const remote = Object.assign(makeEmptyState(), remoteState || {});
    const itemMap = new Map();
    [remote.notifications || [], local.notifications || []].forEach(items => items.forEach(item => {
      if (!item || !item.id) return;
      const existing = itemMap.get(item.id);
      if (!existing || stateVersion(item) >= stateVersion(existing)) itemMap.set(item.id, item);
    }));
    const dayKey = String(local.dayKey || '') > String(remote.dayKey || '') ? local.dayKey : remote.dayKey;
    const baselineOptions = [local, remote].filter(item => item.dayKey === dayKey && item.dayBaseline);
    baselineOptions.sort((a, b) => numeric(a.dayBaseline && a.dayBaseline.capturedAt) - numeric(b.dayBaseline && b.dayBaseline.capturedAt));
    const lastSnapshot = numeric(local.lastSnapshot && local.lastSnapshot.capturedAt) >= numeric(remote.lastSnapshot && remote.lastSnapshot.capturedAt)
      ? (local.lastSnapshot || remote.lastSnapshot) : (remote.lastSnapshot || local.lastSnapshot);
    const trophies = Object.assign({}, remote.trophyEvents || {}, local.trophyEvents || {});
    return {
      notifications: Array.from(itemMap.values()).sort((a, b) => numeric(b.updatedAt || b.createdAt) - numeric(a.updatedAt || a.createdAt)).slice(0, 100),
      lastSnapshot: lastSnapshot || null,
      dayKey: dayKey || '',
      dayBaseline: (baselineOptions[0] && baselineOptions[0].dayBaseline) || (dayKey === local.dayKey ? local.dayBaseline : remote.dayBaseline) || null,
      trophyEvents: trophies,
      stateUpdatedAt: Math.max(numeric(local.stateUpdatedAt), numeric(remote.stateUpdatedAt))
    };
  }
  async function writeCloudState(uid) {
    const userId = String(uid || signedInUid());
    const store = window.MedActivityNotificationStore;
    if (!cloudStateAvailable(userId) || !store) return;
    try {
      await store.set(userId, {
        userId: userId,
        version: 1,
        state: state,
        updatedAt: localTimestamp()
      });
    } catch (error) {
      // Local notifications continue working if the Firestore security rule is not deployed yet.
      console.warn('[Activity notifications] Cloud sync unavailable; using this browser:', error);
    }
  }
  function queueCloudWrite() {
    const uid = signedInUid();
    if (!cloudStateAvailable(uid)) return;
    if (cloudWriteTimer) clearTimeout(cloudWriteTimer);
    cloudWriteTimer = setTimeout(function () {
      cloudWriteTimer = null;
      writeCloudState(uid);
    }, 350);
  }
  async function restoreCloudState(force) {
    const uid = signedInUid();
    if (!uid || !cloudStateAvailable(uid)) return;
    if (!force && cloudLoadedForUid === uid) return;
    if (cloudRestorePromise) return cloudRestorePromise;
    cloudRestorePromise = (async function () {
      try {
        const store = window.MedActivityNotificationStore;
        const payload = await store.get(uid);
        if (payload && payload.userId === uid && payload.state && typeof payload.state === 'object') {
          state = mergeStateObjects(state, payload.state);
        }
        cloudLoadedForUid = uid;
        saveState();
      } catch (error) {
        // Fail safely to local browser storage; never fabricate a successful cloud sync.
        cloudLoadedForUid = uid;
        console.warn('[Activity notifications] Could not load cloud state; using this browser:', error);
      } finally {
        cloudRestorePromise = null;
      }
    })();
    return cloudRestorePromise;
  }
  function ensureAccountState() {
    const key = stateKey();
    if (key === activeAccountKey) return;
    activeAccountKey = key;
    const saved = parseJSON(readStorage(key), null);
    state = Object.assign(makeEmptyState(), saved || {});
    if (!Array.isArray(state.notifications)) state.notifications = [];
    if (!state.trophyEvents || typeof state.trophyEvents !== 'object') state.trophyEvents = {};
    renderBadge();
  }
  function readStorage(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }
  function saveState() {
    state.stateUpdatedAt = localTimestamp();
    try { localStorage.setItem(activeAccountKey || stateKey(), JSON.stringify(state)); } catch (_) {}
    renderBadge();
    queueCloudWrite();
  }
  function dayKey() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return value.year + '-' + value.month + '-' + value.day;
  }
  function weekKey(dateValue) {
    const parts = String(dateValue || dayKey()).split('-').map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    const daysSinceMonday = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - daysSinceMonday);
    return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0') + '-' + String(date.getUTCDate()).padStart(2, '0');
  }
  function localTimestamp() { return Date.now(); }
  function numeric(value) {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
  }
  function rowId(row) {
    return String(row && (row.userId || row.uid || row.playerId || row.id || row.raw && row.raw.userId) || '');
  }
  function rowName(row) {
    return safeText(row && (row.name || row.username || row.displayName || row.Name) || 'Student', 80);
  }
  function rowRP(row) {
    return Math.max(0, numeric(row && (
      row.weeklyRankPoints != null ? row.weeklyRankPoints :
      row.weeklyRP != null ? row.weeklyRP :
      row.WeeklyRP != null ? row.WeeklyRP :
      row.boardPoints != null ? row.boardPoints :
      row.rankScore != null ? row.rankScore : 0
    )));
  }
  function rowXP(row) {
    return Math.max(0, numeric(row && (row.xp != null ? row.xp : row.XP)));
  }
  function rowRank(row) {
    const value = safeText(row && (row.rank || row.currentRank || row.Rank) || '', 60);
    return RANKS.indexOf(value) >= 0 ? value : value;
  }
  function rowRankIndex(row) {
    const rank = rowRank(row);
    return RANKS.indexOf(rank);
  }
  function rankRows() {
    const league = window.MedGlobalLeague;
    if (!league || typeof league.getCachedRows !== 'function') return [];
    const byId = new Map();
    let weeklyRows = [];
    try { weeklyRows = league.getCachedRows('weekly') || []; } catch (_) {}
    weeklyRows.filter(row => row && !row.isDemo && rowId(row)).forEach(row => {
      const id = rowId(row);
      if (!byId.has(id)) {
        const actualPosition = numeric(row.position || (row.raw && row.raw.position) || (row.raw && row.raw.rankPosition));
        byId.set(id, Object.assign({}, row, { userId: id, position: actualPosition }));
      }
    });
    // Backend positions are global ranks, even when an accepted friend is outside the Top 100.
    // Only use a local ordinal as a fallback for older cache rows that have no position field.
    const sortedWeekly = Array.from(byId.values())
      .sort((a, b) => rowRP(b) - rowRP(a) || rowXP(b) - rowXP(a) || rowName(a).localeCompare(rowName(b)));
    sortedWeekly.forEach((row, index) => {
      if (!(numeric(row.position) > 0)) row.position = index + 1;
      byId.set(rowId(row), row);
    });
    ['friends', 'all-time'].forEach(function (period) {
      let rows = [];
      try { rows = league.getCachedRows(period) || []; } catch (_) {}
      rows.forEach(function (row) {
        const id = rowId(row);
        if (!id || row.isDemo || byId.has(id)) return;
        byId.set(id, Object.assign({}, row, { userId: id, name: rowName(row), position: 0 }));
      });
    });
    return Array.from(byId.values()).map(row => Object.assign({}, row, {
      userId: rowId(row), name: rowName(row), position: Math.max(0, numeric(row.position))
    }));
  }
  async function refreshWeeklyData(friendIds) {
    const league = window.MedGlobalLeague;
    if (!league || typeof league.loadLeaderboard !== 'function') return;
    const before = readStorage(PERIOD_KEY);
    const priorFriendIds = window.__medActivityFriendIdsForWeeklyRefresh;
    try {
      window.__medActivityFriendIdsForWeeklyRefresh = Array.from(new Set((friendIds || []).map(String).filter(Boolean))).slice(0, 499);
      localStorage.setItem(PERIOD_KEY, 'weekly');
      await league.loadLeaderboard(true);
    } catch (error) {
      console.warn('[Activity notifications] Weekly leaderboard refresh failed:', error);
    } finally {
      try {
        if (before == null) localStorage.removeItem(PERIOD_KEY);
        else localStorage.setItem(PERIOD_KEY, before);
      } catch (_) {}
      if (priorFriendIds == null) {
        try { delete window.__medActivityFriendIdsForWeeklyRefresh; } catch (_) {}
      } else {
        window.__medActivityFriendIdsForWeeklyRefresh = priorFriendIds;
      }
    }
  }
  async function acceptedFriendData() {
    const api = window.MedStudentFriends;
    if (!api) return { ids: [], rows: [] };
    try {
      if (typeof api.loadConnections === 'function') await api.loadConnections(false);
      const connection = typeof api.getConnectionData === 'function' ? api.getConnectionData() : {};
      const ids = Array.from(new Set((connection.friendIds || []).map(String).filter(Boolean)));
      const rows = Array.isArray(connection.friends) ? connection.friends : [];
      return { ids, rows };
    } catch (error) {
      console.warn('[Activity notifications] Friend list refresh failed:', error);
      return { ids: [], rows: [] };
    }
  }
  function buildSnapshot(rows, friendsData, periodWeek) {
    const app = window.app || {};
    const ownId = accountId();
    const allRows = rows.slice();
    const rowMap = new Map(allRows.map(row => [rowId(row), row]));
    const friendIds = new Set(friendsData.ids);
    (friendsData.rows || []).forEach(function (row) {
      const id = rowId(row);
      if (!id || id === ownId) return;
      friendIds.add(id);
      if (!rowMap.has(id)) rowMap.set(id, Object.assign({}, row, { userId: id, name: rowName(row) }));
    });
    const allRanked = Array.from(rowMap.values())
      .map(row => Object.assign({}, row, { userId: rowId(row), position: Math.max(0, numeric(row.position)) }));
    const ownRow = allRanked.find(row => rowId(row) === ownId) || null;
    const profile = app.profile || {};
    const own = {
      id: ownId,
      name: rowName(ownRow || profile),
      rp: ownRow ? rowRP(ownRow) : Math.max(0, numeric(profile.weeklyRP != null ? profile.weeklyRP : profile.weeklyRankPoints)),
      xp: ownRow ? rowXP(ownRow) : rowXP(profile),
      position: ownRow ? Number(ownRow.position) || 0 : 0,
      rank: rowRank(ownRow || profile)
    };
    const friends = {};
    allRanked.forEach(function (row) {
      const id = rowId(row);
      if (!id || id === ownId || !friendIds.has(id)) return;
      friends[id] = {
        id: id,
        name: rowName(row),
        rp: rowRP(row),
        xp: rowXP(row),
        position: Number(row.position) || 0,
        rank: rowRank(row),
        avatar: safeText(row.avatar || row.Avatar || '', 1000)
      };
    });
    return { capturedAt: localTimestamp(), date: dayKey(), weekKey: periodWeek, own: own, friends: friends };
  }
  function deltaText(value) {
    const n = numeric(value);
    return (n > 0 ? '+' : '') + n.toLocaleString();
  }
  function rankLabel(row) {
    return row && row.position ? '#' + Number(row.position).toLocaleString() : '—';
  }
  function upsertNotification(item) {
    const now = localTimestamp();
    const index = state.notifications.findIndex(entry => entry.id === item.id);
    if (index >= 0) {
      const previous = state.notifications[index];
      const changed = previous.title !== item.title || previous.message !== item.message;
      state.notifications[index] = Object.assign({}, previous, item, {
        createdAt: previous.createdAt || now,
        updatedAt: changed ? now : (previous.updatedAt || previous.createdAt || now),
        readAt: changed ? 0 : numeric(previous.readAt),
        unread: changed ? true : !!previous.unread
      });
    } else {
      state.notifications.push(Object.assign({
        createdAt: now, updatedAt: now, unread: true
      }, item));
    }
    state.notifications.sort((a, b) => numeric(b.updatedAt || b.createdAt) - numeric(a.updatedAt || a.createdAt));
    state.notifications = state.notifications.slice(0, 100);
  }
  function addFriendStatusNotifications(current, baseline, currentDay) {
    if (!baseline || !baseline.own) return;
    const oldOwn = baseline.own || {};
    const nowOwn = current.own || {};
    Object.keys(current.friends || {}).forEach(function (friendId) {
      const friend = current.friends[friendId];
      const old = baseline.friends && baseline.friends[friendId];
      if (!old) return;
      const friendDelta = friend.rp - old.rp;
      const ownDelta = nowOwn.rp - numeric(oldOwn.rp);
      const friendPositionChanged = numeric(friend.position) !== numeric(old.position);
      const friendProgressChanged = friendDelta !== 0;
      const oldOwnPosition = numeric(oldOwn.position);
      const newOwnPosition = numeric(nowOwn.position);
      const oldFriendPosition = numeric(old.position);
      const newFriendPosition = numeric(friend.position);
      const friendPassed = oldOwnPosition > 0 && newOwnPosition > 0 &&
        oldFriendPosition > oldOwnPosition && newFriendPosition < newOwnPosition;
      const userPassed = oldOwnPosition > 0 && newOwnPosition > 0 &&
        oldOwnPosition > oldFriendPosition && newOwnPosition < newFriendPosition;
      const rankIncreased = rowRankIndex(friend) > rowRankIndex(old);
      if (!friendProgressChanged && !friendPassed && !userPassed && !rankIncreased) return;

      let message = friend.name + ' · Weekly RP ' + numeric(old.rp).toLocaleString() + ' → ' +
        numeric(friend.rp).toLocaleString() + ' (' + deltaText(friendDelta) + ' RP). ' +
        'Your weekly RP: ' + numeric(oldOwn.rp).toLocaleString() + ' → ' +
        numeric(nowOwn.rp).toLocaleString() + ' (' + deltaText(ownDelta) + ' RP). ';
      if (friendPassed) {
        const gap = Math.max(0, numeric(friend.rp) - numeric(nowOwn.rp));
        message += 'Passed you: your position ' + rankLabel(oldOwn) + ' → ' + rankLabel(nowOwn) +
          '; ' + friend.name + ' ' + rankLabel(old) + ' → ' + rankLabel(friend) +
          '. Now ahead by ' + gap.toLocaleString() + ' weekly RP.';
      } else if (userPassed) {
        const gap = Math.max(0, numeric(nowOwn.rp) - numeric(friend.rp));
        message += 'You passed ' + friend.name + ': your position ' + rankLabel(oldOwn) + ' → ' +
          rankLabel(nowOwn) + '; their position ' + rankLabel(old) + ' → ' + rankLabel(friend) +
          '. You are ahead by ' + gap.toLocaleString() + ' weekly RP.';
      } else if (numeric(friend.rp) > numeric(nowOwn.rp)) {
        message += friend.name + ' is currently ahead by ' +
          (numeric(friend.rp) - numeric(nowOwn.rp)).toLocaleString() + ' weekly RP.';
      } else if (numeric(friend.rp) < numeric(nowOwn.rp)) {
        message += 'You are currently ahead by ' +
          (numeric(nowOwn.rp) - numeric(friend.rp)).toLocaleString() + ' weekly RP.';
      } else {
        message += 'You are tied on weekly RP.';
      }
      upsertNotification({
        id: 'friend-status:' + currentDay + ':' + friendId,
        type: 'friend',
        title: friendPassed ? friend.name + ' passed you' : userPassed ? 'You passed ' + friend.name : 'Friend activity update',
        message: message,
        friendId: friendId,
        friendName: friend.name,
        avatar: friend.avatar || '',
        weekKey: current.weekKey,
        unread: true
      });
    });
  }
  function addTrophyNotifications(current, baseline, currentDay) {
    if (!baseline) return;
    Object.keys(current.friends || {}).forEach(function (friendId) {
      const friend = current.friends[friendId];
      const old = baseline.friends && baseline.friends[friendId];
      if (!old) return;
      const oldIndex = rowRankIndex(old);
      const newIndex = rowRankIndex(friend);
      if (oldIndex < 0 || newIndex <= oldIndex) return;
      for (let index = oldIndex + 1; index <= newIndex; index += 1) {
        const rankName = RANKS[index];
        const eventId = 'trophy-unlocked:' + current.weekKey + ':' + friendId + ':' + index;
        if (state.trophyEvents[eventId]) continue;
        state.trophyEvents[eventId] = true;
        upsertNotification({
          id: eventId,
          type: 'trophy',
          title: friend.name + ' unlocked a new trophy',
          message: friend.name + ' advanced to ' + rankName + ' on the weekly leaderboard. Current weekly RP: ' +
            numeric(friend.rp).toLocaleString() + '.',
          friendId: friendId,
          friendName: friend.name,
          avatar: friend.avatar || '',
          rank: rankName,
          weekKey: current.weekKey,
          unread: true
        });
      }
    });
  }
  async function refreshActivity(force) {
    ensureAccountState();
    if (refreshPromise) return refreshPromise;
    if (!force && localTimestamp() - lastRefreshAt < 30000) return;
    refreshPromise = (async function () {
      try {
        await restoreCloudState(true);
        const friendsData = await acceptedFriendData();
        await refreshWeeklyData(friendsData.ids);
        const rows = rankRows();
        if (!rows.length) {
          lastRefreshAt = localTimestamp();
          renderBadge();
          return;
        }
        const today = dayKey();
        const week = weekKey(today);
        const current = buildSnapshot(rows, friendsData, week);
        let baseline;
        if (state.dayKey !== today) {
          baseline = state.lastSnapshot && state.lastSnapshot.weekKey === week ? state.lastSnapshot : current;
          state.dayKey = today;
          state.dayBaseline = baseline;
        } else {
          baseline = state.dayBaseline || state.lastSnapshot || current;
        }
        if (baseline && baseline.capturedAt !== current.capturedAt) {
          addFriendStatusNotifications(current, baseline, today);
          addTrophyNotifications(current, baseline, today);
        }
        state.lastSnapshot = current;
        if (!state.dayBaseline) state.dayBaseline = current;
        saveState();
        lastRefreshAt = localTimestamp();
        renderFeed();
      } catch (error) {
        console.warn('[Activity notifications] Could not refresh feed:', error);
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }
  function relativeTime(timestamp) {
    const diff = Math.max(0, localTimestamp() - numeric(timestamp));
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    const date = new Date(numeric(timestamp));
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Dhaka' }).format(date);
  }
  function notificationIcon(type) {
    if (type === 'trophy') return '<i class="fa-solid fa-trophy" aria-hidden="true"></i>';
    if (type === 'friend') return '<i class="fa-solid fa-chart-line" aria-hidden="true"></i>';
    return '<i class="fa-solid fa-bell" aria-hidden="true"></i>';
  }
  function unreadCount() { return state.notifications.filter(item => item.unread).length; }
  function renderBadge() {
    const count = unreadCount();
    document.querySelectorAll('[data-mat-notification-badge]').forEach(function (badge) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.hidden = count === 0;
      badge.setAttribute('aria-label', count + ' unread notifications');
    });
    document.querySelectorAll('[data-mat-notification-count]').forEach(function (label) {
      label.textContent = count ? count.toLocaleString() + ' unread' : 'All caught up';
    });
  }
  function emptyState() {
    return '<div class="mat-notification-empty"><div class="mat-notification-empty-icon"><i class="fa-regular fa-bell-slash" aria-hidden="true"></i></div>' +
      '<h3>You are all caught up</h3><p>When a friend changes weekly RP, passes you on the leaderboard, or unlocks a new trophy rank, the update will appear here.</p>' +
      '<small>Activity is checked when you open the website or return to this tab.</small></div>';
  }
  function renderFeed() {
    ensureAccountState();
    const list = document.getElementById('mat-notification-list');
    if (!list) { renderBadge(); return; }
    const items = state.notifications.filter(item => activeFilter === 'unread' ? item.unread : true);
    list.innerHTML = items.length ? items.map(function (item) {
      const icon = notificationIcon(item.type);
      const typeLabel = item.type === 'trophy' ? 'TROPHY UNLOCKED' : item.type === 'friend' ? 'WEEKLY LEADERBOARD' : 'ACTIVITY';
      return '<article class="mat-notification-item ' + (item.unread ? 'is-unread' : '') + '" role="listitem">' +
        '<div class="mat-notification-item-icon type-' + escapeHTML(item.type || 'activity') + '">' + icon + '</div>' +
        '<div class="mat-notification-item-copy"><div class="mat-notification-item-head"><strong>' + escapeHTML(item.title) + '</strong><time datetime="' +
        escapeHTML(new Date(numeric(item.updatedAt || item.createdAt)).toISOString()) + '">' + escapeHTML(relativeTime(item.updatedAt || item.createdAt)) + '</time></div>' +
        '<p>' + escapeHTML(item.message) + '</p><div class="mat-notification-item-meta"><span>' + typeLabel + '</span>' +
        (item.unread ? '<b>NEW</b>' : '<span>Read</span>') + '</div></div>' +
        (item.unread ? '<button class="mat-notification-mark-one" type="button" data-mat-mark-read="' + escapeHTML(item.id) + '" aria-label="Mark as read"><i class="fa-solid fa-check" aria-hidden="true"></i></button>' : '') +
        '</article>';
    }).join('') : emptyState();
    renderBadge();
  }
  function ensureCenter() {
    if (document.getElementById('mat-notification-center')) return;
    const overlay = document.createElement('div');
    overlay.id = 'mat-notification-center';
    overlay.className = 'mat-notification-overlay';
    overlay.hidden = true;
    overlay.innerHTML = '<div class="mat-notification-backdrop" data-mat-notification-close></div>' +
      '<section class="mat-notification-panel" role="dialog" aria-modal="true" aria-labelledby="mat-notification-title" tabindex="-1">' +
      '<header class="mat-notification-header"><div class="mat-notification-heading">' +
      '<span class="mat-notification-eyebrow"><i class="fa-solid fa-signal" aria-hidden="true"></i> YOUR STUDY CIRCLE</span>' +
      '<h2 id="mat-notification-title">Notifications <span data-mat-notification-count>All caught up</span></h2>' +
      '<p>Friend progress, leaderboard moves and trophy unlocks.</p></div>' +
      '<button class="mat-notification-close" type="button" data-mat-notification-close aria-label="Close notifications"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></header>' +
      '<div class="mat-notification-toolbar"><div class="mat-notification-filters" role="group" aria-label="Filter notifications">' +
      '<button type="button" data-mat-filter="all" class="is-active" aria-pressed="true">All</button><button type="button" data-mat-filter="unread" aria-pressed="false">Unread</button></div>' +
      '<button type="button" class="mat-notification-mark-all" data-mat-mark-all>Mark all as read</button></div>' +
      '<div id="mat-notification-list" class="mat-notification-list" role="list" aria-live="polite"></div>' +
      '<footer class="mat-notification-footer"><span><i class="fa-solid fa-lock" aria-hidden="true"></i> In-site updates only · No phone push alerts</span>' +
      '<button type="button" data-mat-open-leaderboard>Open leaderboard <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></footer></section>';
    document.body.appendChild(overlay);
  }
  function openCenter(trigger) {
    ensureAccountState();
    ensureCenter();
    lastTrigger = trigger || document.activeElement;
    const overlay = document.getElementById('mat-notification-center');
    overlay.hidden = false;
    document.body.classList.add('mat-notification-open');
    activeFilter = 'all';
    renderFilterState();
    renderFeed();
    const panel = overlay.querySelector('.mat-notification-panel');
    if (panel) panel.focus({ preventScroll: true });
    refreshActivity(false);
  }
  function closeCenter() {
    const overlay = document.getElementById('mat-notification-center');
    if (!overlay) return;
    overlay.hidden = true;
    document.body.classList.remove('mat-notification-open');
    if (lastTrigger && typeof lastTrigger.focus === 'function') lastTrigger.focus({ preventScroll: true });
  }
  function renderFilterState() {
    document.querySelectorAll('[data-mat-filter]').forEach(function (button) {
      const active = button.getAttribute('data-mat-filter') === activeFilter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  function markAllRead() {
    const readAt = localTimestamp();
    state.notifications.forEach(item => { item.unread = false; item.readAt = readAt; });
    saveState();
    renderFeed();
  }
  function markOneRead(id) {
    const item = state.notifications.find(entry => entry.id === id);
    if (!item) return;
    item.unread = false;
    item.readAt = localTimestamp();
    saveState();
    renderFeed();
  }
  function handleClick(event) {
    const target = event.target && event.target.closest ? event.target : null;
    if (!target) return;
    const openButton = target.closest('#mat-notification-open-dashboard, #mat-notifications-nav');
    if (openButton) { event.preventDefault(); openCenter(openButton); return; }
    const closeButton = target.closest('[data-mat-notification-close]');
    if (closeButton) { closeCenter(); return; }
    const filter = target.closest('[data-mat-filter]');
    if (filter) { activeFilter = filter.getAttribute('data-mat-filter') || 'all'; renderFilterState(); renderFeed(); return; }
    const markAll = target.closest('[data-mat-mark-all]');
    if (markAll) { markAllRead(); return; }
    const markRead = target.closest('[data-mat-mark-read]');
    if (markRead) { markOneRead(markRead.getAttribute('data-mat-mark-read')); return; }
    const openLeaderboard = target.closest('[data-mat-open-leaderboard]');
    if (openLeaderboard) {
      closeCenter();
      const app = window.app;
      if (app && typeof app.openLeaderboard === 'function') app.openLeaderboard();
      else if (app && typeof app.showView === 'function') app.showView('leaderboard');
    }
  }
  function bindEvents() {
    document.addEventListener('click', handleClick);
    window.addEventListener('student-auth-state-resolved', function () {
      ensureAccountState();
      lastRefreshAt = 0;
      refreshActivity(true);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !document.getElementById('mat-notification-center')?.hidden) closeCenter();
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && localTimestamp() - lastRefreshAt > 30000) refreshActivity(true);
    });
    window.addEventListener('focus', function () {
      if (localTimestamp() - lastRefreshAt > 30000) refreshActivity(true);
    });
    window.addEventListener('storage', function (event) {
      if (event.key && event.key === stateKey()) {
        const shared = parseJSON(event.newValue, null);
        state = Object.assign(makeEmptyState(), shared || {});
        if (!Array.isArray(state.notifications)) state.notifications = [];
        if (!state.trophyEvents || typeof state.trophyEvents !== 'object') state.trophyEvents = {};
        renderFeed();
      }
    });
  }

  function init() {
    if (!window.app) return;
    ensureAccountState();
    ensureCenter();
    bindEvents();
    renderBadge();
    refreshActivity(true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.MedActivityNotifications = Object.freeze({
    open: openCenter,
    close: closeCenter,
    refresh: function () { return refreshActivity(true); },
    getNotifications: function () { ensureAccountState(); return state.notifications.slice(); },
    markAllRead: markAllRead
  });
})();
