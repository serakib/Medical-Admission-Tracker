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
    'Immortal V','Immortal IV','Immortal III','Immortal II','Immortal I'
  ];

  let activeAccountKey = '';
  let state = makeEmptyState();
  let activeFilter = 'all';
  let selectedIds = new Set();
  let lastRefreshAt = 0;
  let refreshPromise = null;
  let lastTrigger = null;
  let cloudLoadedForUid = '';
  let cloudRestorePromise = null;
  let cloudRestorePromiseUid = '';
  let cloudRestoreSequence = 0;
  let cloudWriteTimer = null;

  function makeEmptyState() {
    return { notifications: [], trash: [], deletedIds: [], restoredIds: [], purgedIds: [], lastSnapshot: null, dayKey: '', dayBaseline: null, trophyEvents: {} };
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
    return Math.max(numeric(item && (item.updatedAt || item.createdAt)), numeric(item && item.readAt), numeric(item && item.statusUpdatedAt), numeric(item && item.archivedAt), numeric(item && item.starredAt), numeric(item && item.deletedAt));
  }
  function mergeStateObjects(localState, remoteState) {
    const local = Object.assign(makeEmptyState(), localState || {});
    const remote = Object.assign(makeEmptyState(), remoteState || {});
    const deletedIds = Array.from(new Set((remote.deletedIds || []).concat(local.deletedIds || []).map(String).filter(Boolean))).slice(-1000);
    const restoredIds = Array.from(new Set((remote.restoredIds || []).concat(local.restoredIds || []).map(String).filter(Boolean))).slice(-1000);
    const restoredSet = new Set(restoredIds);
    const purgedIds = Array.from(new Set((remote.purgedIds || []).concat(local.purgedIds || []).map(String).filter(Boolean))).slice(-1000);
    const purgedSet = new Set(purgedIds);
    const deletedSet = new Set(deletedIds.filter(id => !restoredSet.has(id)));
    const trashMap = new Map();
    [remote.trash || [], local.trash || []].forEach(items => items.forEach(item => {
      if (!item || !item.id || restoredSet.has(String(item.id)) || purgedSet.has(String(item.id))) return;
      const previous = trashMap.get(String(item.id));
      if (!previous || numeric(item.deletedAt) >= numeric(previous.deletedAt)) trashMap.set(String(item.id), item);
    }));
    const itemMap = new Map();
    [remote.notifications || [], local.notifications || []].forEach(items => items.forEach(item => {
      if (!item || !item.id || deletedSet.has(String(item.id))) return;
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
      notifications: Array.from(itemMap.values()).filter(item => !numeric(item.archivedAt) || numeric(item.archivedAt) > localTimestamp() - 10 * 86400000).sort((a, b) => numeric(b.updatedAt || b.createdAt) - numeric(a.updatedAt || a.createdAt)).slice(0, 250),
      trash: Array.from(trashMap.values()).filter(item => numeric(item.deletedAt) > localTimestamp() - 10 * 86400000).sort((a, b) => numeric(b.deletedAt) - numeric(a.deletedAt)),
      deletedIds: deletedIds,
      restoredIds: restoredIds,
      purgedIds: purgedIds,
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
    if (cloudRestorePromise && cloudRestorePromiseUid === uid) return cloudRestorePromise;
    // Ignore a slower response from a previously signed-in account after account switching.
    const sequence = ++cloudRestoreSequence;
    cloudRestorePromiseUid = uid;
    cloudRestorePromise = (async function () {
      try {
        const store = window.MedActivityNotificationStore;
        const payload = await store.get(uid);
        if (sequence !== cloudRestoreSequence || accountId() !== uid || signedInUid() !== uid) return;
        if (payload && payload.userId === uid && payload.state && typeof payload.state === 'object') {
          state = mergeStateObjects(state, payload.state);
        }
        cloudLoadedForUid = uid;
        saveState();
      } catch (error) {
        // Fail safely to local browser storage; never fabricate a successful cloud sync.
        if (sequence === cloudRestoreSequence && accountId() === uid && signedInUid() === uid) {
          cloudLoadedForUid = uid;
          console.warn('[Activity notifications] Could not load cloud state; using this browser:', error);
        }
      } finally {
        if (sequence === cloudRestoreSequence) {
          cloudRestorePromise = null;
          cloudRestorePromiseUid = '';
        }
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
    if (!Array.isArray(state.trash)) state.trash = [];
    if (!Array.isArray(state.deletedIds)) state.deletedIds = [];
    if (!Array.isArray(state.restoredIds)) state.restoredIds = [];
    if (!Array.isArray(state.purgedIds)) state.purgedIds = [];
    pruneTrash();
    if (!state.trophyEvents || typeof state.trophyEvents !== 'object') state.trophyEvents = {};
    renderBadge();
  }
  function readStorage(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }
  function saveState() {
    pruneTrash();
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
  function pruneTrash() {
    if (!Array.isArray(state.trash)) state.trash = [];
    if (!Array.isArray(state.notifications)) state.notifications = [];
    const cutoff = localTimestamp() - 10 * 86400000;
    const beforeTrash = state.trash.length;
    const beforeNotifications = state.notifications.length;
    state.trash = state.trash.filter(item => item && item.id && numeric(item.deletedAt) > cutoff);
    state.notifications = state.notifications.filter(item => item && item.id && (!numeric(item.archivedAt) || numeric(item.archivedAt) > cutoff));
    return state.trash.length !== beforeTrash || state.notifications.length !== beforeNotifications;
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
  function rowPoints(row, period) {
    if (period === 'all-time') {
      return Math.max(0, numeric(row && (
        row.totalRP != null ? row.totalRP :
        row.raw && row.raw.totalRP != null ? row.raw.totalRP :
        row.raw && row.raw.TotalRP != null ? row.raw.TotalRP :
        row.rankPoints != null ? row.rankPoints :
        row.raw && row.raw.rankPoints != null ? row.raw.rankPoints : 0
      )));
    }
    return rowRP(row);
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
  function rankRows(period) {
    const league = window.MedGlobalLeague;
    if (!league || typeof league.getCachedRows !== 'function') return [];
    const selected = period === 'all-time' ? 'all-time' : 'weekly';
    let rows = [];
    try { rows = league.getCachedRows(selected) || []; } catch (_) {}
    const byId = new Map();
    rows.filter(row => row && !row.isDemo && rowId(row)).forEach(row => {
      const id = rowId(row);
      const actualPosition = numeric(row.position || (row.raw && row.raw.position) || (row.raw && row.raw.rankPosition));
      const previous = byId.get(id);
      const candidate = Object.assign({}, row, { userId: id, position: actualPosition });
      if (!previous || rowPoints(candidate, selected) > rowPoints(previous, selected)) byId.set(id, candidate);
    });
    const ranked = Array.from(byId.values()).sort((a, b) =>
      numeric(a.position) - numeric(b.position) ||
      rowPoints(b, selected) - rowPoints(a, selected) ||
      rowXP(b) - rowXP(a) ||
      rowName(a).localeCompare(rowName(b))
    );
    ranked.forEach((row, index) => { if (!(numeric(row.position) > 0)) row.position = index + 1; });
    return ranked.map(row => Object.assign({}, row, {
      userId: rowId(row), name: rowName(row), position: Math.max(0, numeric(row.position))
    }));
  }
  async function refreshPeriodData(period, friendIds) {
    const league = window.MedGlobalLeague;
    if (!league || typeof league.loadLeaderboard !== 'function') return;
    const before = readStorage(PERIOD_KEY);
    const isWeekly = period === 'weekly';
    const variableName = isWeekly ? '__medActivityFriendIdsForWeeklyRefresh' : '__medActivityFriendIdsForAllTimeRefresh';
    const previousFriendIds = window[variableName];
    try {
      window[variableName] = Array.from(new Set((friendIds || []).map(String).filter(Boolean))).slice(0, 499);
      localStorage.setItem(PERIOD_KEY, isWeekly ? 'weekly' : 'all-time');
      await league.loadLeaderboard(true);
    } catch (error) {
      console.warn('[Activity notifications] ' + period + ' leaderboard refresh failed:', error);
    } finally {
      try {
        if (before == null) localStorage.removeItem(PERIOD_KEY);
        else localStorage.setItem(PERIOD_KEY, before);
      } catch (_) {}
      if (previousFriendIds == null) {
        try { delete window[variableName]; } catch (_) {}
      } else window[variableName] = previousFriendIds;
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
  function snapshotRow(row, period, positionOverride) {
    return {
      id: rowId(row),
      name: rowName(row),
      rp: rowPoints(row, period),
      weeklyRP: rowRP(row),
      totalRP: rowPoints(row, 'all-time'),
      xp: rowXP(row),
      position: Math.max(0, numeric(positionOverride != null ? positionOverride : row.position)),
      rank: rowRank(row),
      avatar: safeText(row && (row.avatar || row.Avatar) || '', 1000)
    };
  }
  function mapPlayers(rows, period, friendIds, ownId) {
    const players = {};
    (rows || []).forEach(function (row) {
      const id = rowId(row);
      if (!id || !numeric(row.position)) return;
      const item = snapshotRow(row, period);
      if (numeric(item.position) <= 100 || id === ownId || friendIds.has(id)) players[id] = item;
    });
    return players;
  }
  function topMap(players, maxPosition, excludedIds) {
    const result = {};
    Object.keys(players || {}).forEach(function (id) {
      const row = players[id];
      if (excludedIds.has(id) || numeric(row.position) < 1 || numeric(row.position) > maxPosition) return;
      result[id] = row;
    });
    return result;
  }
  function buildSnapshot(weeklyRows, allTimeRows, friendsData, periodWeek) {
    const app = window.app || {};
    const ownId = accountId();
    const friendIds = new Set((friendsData.ids || []).map(String).filter(id => id && id !== ownId));
    const weeklyById = new Map((weeklyRows || []).map(row => [rowId(row), row]).filter(entry => entry[0]));
    const allTimeById = new Map((allTimeRows || []).map(row => [rowId(row), row]).filter(entry => entry[0]));
    (friendsData.rows || []).forEach(function (row) {
      const id = rowId(row);
      if (!id || id === ownId) return;
      friendIds.add(id);
      if (!weeklyById.has(id)) weeklyById.set(id, Object.assign({}, row, { userId: id, position: 0 }));
      if (!allTimeById.has(id)) allTimeById.set(id, Object.assign({}, row, { userId: id, position: 0 }));
    });
    const profile = app.profile || {};
    const weeklyOwnRow = weeklyById.get(ownId) || null;
    const allTimeOwnRow = allTimeById.get(ownId) || null;
    const ownWeekly = snapshotRow(weeklyOwnRow || profile, 'weekly', weeklyOwnRow ? weeklyOwnRow.position : 0);
    ownWeekly.id = ownId;
    const ownAllTime = snapshotRow(allTimeOwnRow || profile, 'all-time', allTimeOwnRow ? allTimeOwnRow.position : 0);
    ownAllTime.id = ownId;
    const weeklyPlayers = mapPlayers(Array.from(weeklyById.values()), 'weekly', friendIds, ownId);
    const allTimePlayers = mapPlayers(Array.from(allTimeById.values()), 'all-time', friendIds, ownId);
    const nonFriendIds = new Set([ownId].concat(Array.from(friendIds)));
    const weeklyTop100 = topMap(weeklyPlayers, 100, nonFriendIds);
    const allTimeTop100 = topMap(allTimePlayers, 100, nonFriendIds);
    const weeklyTop10 = topMap(weeklyPlayers, 10, nonFriendIds);
    const allTimeTop10 = topMap(allTimePlayers, 10, nonFriendIds);

    const sameRankRows = Object.keys(allTimeTop100).map(id => allTimeTop100[id])
      .filter(row => ownAllTime.rank && row.rank === ownAllTime.rank)
      .sort((a, b) => numeric(a.position) - numeric(b.position) || numeric(b.totalRP) - numeric(a.totalRP));
    const sameRankTop10 = {};
    sameRankRows.slice(0, 10).forEach(function (row, index) {
      sameRankTop10[row.id] = Object.assign({}, row, { tierPosition: index + 1 });
    });

    const friends = {};
    friendIds.forEach(function (id) {
      const weeklyRow = weeklyById.get(id) || friendsData.rows.find(row => rowId(row) === id) || null;
      const allTimeRow = allTimeById.get(id) || weeklyRow;
      if (!weeklyRow && !allTimeRow) return;
      const weeklySnapshot = snapshotRow(weeklyRow || allTimeRow, 'weekly', weeklyRow ? weeklyRow.position : 0);
      const allTimeSnapshot = snapshotRow(allTimeRow || weeklyRow, 'all-time', allTimeRow ? allTimeRow.position : 0);
      friends[id] = {
        id: id,
        name: rowName(weeklyRow || allTimeRow),
        rp: weeklySnapshot.rp,
        xp: weeklySnapshot.xp,
        position: weeklySnapshot.position,
        rank: rowRank(allTimeRow || weeklyRow),
        avatar: weeklySnapshot.avatar || allTimeSnapshot.avatar || '',
        allTimeRP: allTimeSnapshot.rp,
        allTimeXP: allTimeSnapshot.xp,
        allTimePosition: allTimeSnapshot.position
      };
    });
    return {
      capturedAt: localTimestamp(),
      date: dayKey(),
      weekKey: periodWeek,
      own: ownWeekly,
      allTimeOwn: ownAllTime,
      friends: friends,
      weeklyPlayers: weeklyPlayers,
      allTimePlayers: allTimePlayers,
      weeklyTop100: weeklyTop100,
      allTimeTop100: allTimeTop100,
      weeklyTop10: weeklyTop10,
      allTimeTop10: allTimeTop10,
      sameRankTop10: sameRankTop10
    };
  }
  function deltaText(value) {
    const n = numeric(value);
    return (n > 0 ? '+' : '') + n.toLocaleString();
  }
  function rankLabel(row) {
    return row && row.position ? '#' + Number(row.position).toLocaleString() : '—';
  }
  function upsertNotification(item) {
    if (Array.isArray(state.deletedIds) && state.deletedIds.includes(String(item && item.id || ''))) return;
    const now = localTimestamp();
    const index = state.notifications.findIndex(entry => entry.id === item.id);
    if (index >= 0) {
      const previous = state.notifications[index];
      const changed = previous.title !== item.title || previous.message !== item.message;
      state.notifications[index] = Object.assign({}, previous, item, {
        createdAt: previous.createdAt || now,
        updatedAt: changed ? now : (previous.updatedAt || previous.createdAt || now),
        readAt: changed ? 0 : numeric(previous.readAt),
        statusUpdatedAt: changed ? now : numeric(previous.statusUpdatedAt),
        unread: changed ? true : !!previous.unread
      });
    } else {
      state.notifications.push(Object.assign({
        createdAt: now, updatedAt: now, unread: true
      }, item));
    }
    state.notifications.sort((a, b) => numeric(b.updatedAt || b.createdAt) - numeric(a.updatedAt || a.createdAt));
    state.notifications = state.notifications.slice(0, 250);
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
      const friendCrossed = oldOwnPosition > 0 && newOwnPosition > 0 && oldFriendPosition > oldOwnPosition && newFriendPosition < newOwnPosition;
      const userCrossed = oldOwnPosition > 0 && newOwnPosition > 0 && oldOwnPosition > oldFriendPosition && newOwnPosition < newFriendPosition;
      // A crossing counts only if the player who passed actually gained RP.
      // If RP is tied, XP is the tiebreaker: the player with higher XP ranks better.
      const friendPassed = friendCrossed && numeric(friend.rp) > numeric(old.rp) &&
        (numeric(friend.rp) > numeric(nowOwn.rp) || (numeric(friend.rp) === numeric(nowOwn.rp) && numeric(friend.xp) > numeric(nowOwn.xp)));
      const userPassed = userCrossed && numeric(nowOwn.rp) > numeric(oldOwn.rp) &&
        (numeric(nowOwn.rp) > numeric(friend.rp) || (numeric(nowOwn.rp) === numeric(friend.rp) && numeric(nowOwn.xp) > numeric(friend.xp)));
      if ((friendCrossed && !friendPassed) || (userCrossed && !userPassed)) return;
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
  function rankLine(previousPosition, nextPosition) {
    const oldPos = Math.max(0, numeric(previousPosition));
    const newPos = Math.max(0, numeric(nextPosition));
    if (!oldPos && newPos) return 'Entered at #' + newPos.toLocaleString();
    if (oldPos && !newPos) return 'No longer in the Top 100 (was #' + oldPos.toLocaleString() + ')';
    if (oldPos !== newPos) return '#' + oldPos.toLocaleString() + ' → #' + newPos.toLocaleString();
    return oldPos || newPos ? '#' + (newPos || oldPos).toLocaleString() : 'position unavailable';
  }
  function addOwnPositionNotifications(current, baseline, currentDay, period) {
    const weekly = period === 'weekly';
    const oldOwn = weekly ? baseline.own : baseline.allTimeOwn;
    const newOwn = weekly ? current.own : current.allTimeOwn;
    if (!oldOwn || !newOwn) return;
    const oldPosition = numeric(oldOwn.position);
    const newPosition = numeric(newOwn.position);
    const oldRP = numeric(oldOwn.rp);
    const newRP = numeric(newOwn.rp);
    if (oldPosition === newPosition && oldRP === newRP) return;
    const label = weekly ? 'Weekly' : 'All Time';
    upsertNotification({
      id: 'my-leaderboard-position:' + period + ':' + current.weekKey + ':' + currentDay,
      type: 'leaderboard',
      title: 'Your ' + label + ' leaderboard update',
      message: 'Your position: ' + rankLine(oldPosition, newPosition) + '. ' +
        label + ' RP: ' + oldRP.toLocaleString() + ' → ' + newRP.toLocaleString() +
        ' (' + deltaText(newRP - oldRP) + ' RP); XP: ' +
        numeric(oldOwn.xp).toLocaleString() + ' → ' + numeric(newOwn.xp).toLocaleString() + '.',
      period: period,
      unread: true
    });
  }
  function crossingBetween(oldOwn, newOwn, oldPeer, newPeer) {
    const direction = crossingDirection(oldOwn, newOwn, oldPeer, newPeer);
    if (!direction) return '';
    // The player who passed must have genuinely gained RP since the prior snapshot.
    // Equal RP is ordered by XP; higher XP wins the tie.
    if (direction === 'you-passed') {
      if (!(numeric(newOwn && newOwn.rp) > numeric(oldOwn && oldOwn.rp))) return '';
      if (numeric(newOwn && newOwn.rp) === numeric(newPeer && newPeer.rp) &&
          !(numeric(newOwn && newOwn.xp) > numeric(newPeer && newPeer.xp))) return '';
    } else {
      if (!(numeric(newPeer && newPeer.rp) > numeric(oldPeer && oldPeer.rp))) return '';
      if (numeric(newPeer && newPeer.rp) === numeric(newOwn && newOwn.rp) &&
          !(numeric(newPeer && newPeer.xp) > numeric(newOwn && newOwn.xp))) return '';
    }
    return direction;
  }
  function crossingDirection(oldOwn, newOwn, oldPeer, newPeer) {
    const oldOwnPosition = numeric(oldOwn && oldOwn.position);
    const newOwnPosition = numeric(newOwn && newOwn.position);
    const oldPeerPosition = numeric(oldPeer && oldPeer.position);
    const newPeerPosition = numeric(newPeer && newPeer.position);
    if (!(oldOwnPosition > 0 && newOwnPosition > 0 && oldPeerPosition > 0 && newPeerPosition > 0)) return '';
    if (oldPeerPosition > oldOwnPosition && newPeerPosition < newOwnPosition) return 'peer-passed';
    if (oldOwnPosition > oldPeerPosition && newOwnPosition < newPeerPosition) return 'you-passed';
    return '';
  }
  function addGlobalLeaderboardNotifications(current, baseline, currentDay, period) {
    const weekly = period === 'weekly';
    const playerKey = weekly ? 'weeklyPlayers' : 'allTimePlayers';
    const topKey = weekly ? 'weeklyTop100' : 'allTimeTop100';
    const top10Key = weekly ? 'weeklyTop10' : 'allTimeTop10';
    const oldPlayers = baseline[playerKey] || {};
    const newPlayers = current[playerKey] || {};
    const oldTop = baseline[topKey] || {};
    const newTop = current[topKey] || {};
    const oldTop10 = baseline[top10Key] || {};
    const newTop10 = current[top10Key] || {};
    const oldOwn = baseline[weekly ? 'own' : 'allTimeOwn'] || {};
    const newOwn = current[weekly ? 'own' : 'allTimeOwn'] || {};
    const oldTier = baseline.sameRankTop10 || {};
    const newTier = current.sameRankTop10 || {};
    const friendIds = new Set(Object.keys(current.friends || {}).concat(Object.keys(baseline.friends || {})));
    const ids = new Set(Object.keys(oldTop).concat(Object.keys(newTop)));
    const label = weekly ? 'Weekly' : 'All Time';

    addOwnPositionNotifications(current, baseline, currentDay, period);
    ids.forEach(function (id) {
      if (!id || id === accountId() || friendIds.has(id)) return;
      const old = oldTop[id] || null;
      const row = newTop[id] || null;
      const oldAny = oldPlayers[id] || old;
      const newAny = newPlayers[id] || row ||
        (oldAny && old && !row ? Object.assign({}, oldAny, { position: 101 }) : null);
      const oldPosition = numeric(old && old.position);
      const newPosition = numeric(row && row.position);
      const oldRP = old ? numeric(old.rp) : 0;
      const newRP = row ? numeric(row.rp) : oldRP;
      const oldXP = old ? numeric(old.xp) : 0;
      const newXP = row ? numeric(row.xp) : oldXP;
      const oldTierPosition = numeric(oldTier[id] && oldTier[id].tierPosition);
      const newTierPosition = numeric(newTier[id] && newTier[id].tierPosition);
      const crossed = crossingBetween(oldOwn, newOwn, oldAny, newAny);
      const rawCrossing = crossingDirection(oldOwn, newOwn, oldAny, newAny);
      if (rawCrossing && !crossed) return;
      const changedPosition = oldPosition !== newPosition;
      const changedRP = oldRP !== newRP;
      const changedXP = oldXP !== newXP;
      const changedTier = period === 'all-time' && oldTierPosition !== newTierPosition &&
        (oldTierPosition > 0 || newTierPosition > 0);
      const inTop10 = !!(oldTop10[id] || newTop10[id]);
      const inSameRankTop10 = period === 'all-time' && (oldTierPosition > 0 || newTierPosition > 0);

      // Do not monitor non-friends across the whole Top 100.
      // Only the Global Top 10 and the user's same-rank Top 10 are followed.
      // Friends are handled by their dedicated activity feed.
      if (!inTop10 && !inSameRankTop10) return;
      if (!changedPosition && !changedRP && !changedXP && !changedTier && !crossed) return;

      let title;
      if (crossed === 'peer-passed') title = rowName(row || old) + ' passed you';
      else if (crossed === 'you-passed') title = 'You passed ' + rowName(row || old);
      else if (inSameRankTop10) title = 'Same-rank Top 10 update';
      else if (inTop10) title = label + ' Top 10 movement';
      else title = label + ' leaderboard pass';

      let movementText;
      if (!old && row) movementText = 'Entered the relevant leaderboard group at #' + newPosition.toLocaleString() + '.';
      else if (old && !row) movementText = 'Moved outside the tracked leaderboard group (was #' + oldPosition.toLocaleString() + ').';
      else movementText = 'Global position: ' + rankLine(oldPosition, newPosition) + '.';
      const rpText = (weekly ? 'Weekly RP: ' : 'All Time RP: ') + oldRP.toLocaleString() + ' → ' +
        newRP.toLocaleString() + ' (' + deltaText(newRP - oldRP) + ' RP).';
      const xpText = 'XP: ' + oldXP.toLocaleString() + ' → ' + newXP.toLocaleString() + '.';
      let passText = '';
      if (crossed === 'peer-passed') {
        passText = rowName(row || old) + ' passed you. Their RP lead is ' +
          Math.max(0, newRP - numeric(newOwn.rp)).toLocaleString() + ' RP.';
      } else if (crossed === 'you-passed') {
        passText = 'You passed ' + rowName(row || old) + '. Your RP lead is ' +
          Math.max(0, numeric(newOwn.rp) - newRP).toLocaleString() + ' RP.';
      }
      upsertNotification({
        id: 'global-leaderboard:' + period + ':' + current.weekKey + ':' + currentDay + ':' + id,
        type: 'leaderboard',
        title: title,
        message: [movementText, rpText, xpText, passText].filter(Boolean).join(' '),
        competitorId: id,
        competitorName: rowName(row || old),
        period: period,
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
    if (!signedInUid()) {
      lastRefreshAt = localTimestamp();
      renderFeed();
      return;
    }
    if (refreshPromise) return refreshPromise;
    if (!force && localTimestamp() - lastRefreshAt < 30000) return;
    refreshPromise = (async function () {
      try {
        await restoreCloudState(true);
        const friendsData = await acceptedFriendData();
        // Keep global competitors separate from accepted friends while tracking each
        // public All Time/Weekly ranking with its authoritative backend position.
        await refreshPeriodData('all-time', friendsData.ids);
        await refreshPeriodData('weekly', friendsData.ids);
        const weeklyRows = rankRows('weekly');
        const allTimeRows = rankRows('all-time');
        if (!weeklyRows.length && !allTimeRows.length) {
          lastRefreshAt = localTimestamp();
          renderBadge();
          return;
        }
        const today = dayKey();
        const week = weekKey(today);
        const current = buildSnapshot(weeklyRows, allTimeRows, friendsData, week);
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
          const supportsGlobalSnapshots = !!(baseline.weeklyPlayers && baseline.allTimePlayers &&
            baseline.weeklyTop100 && baseline.allTimeTop100);
          if (supportsGlobalSnapshots) {
            // Public Top 100/Top 10 alerts use the All Time board; Weekly alerts focus
            // on the student's own position while friend-by-friend weekly RP stays separate.
            addGlobalLeaderboardNotifications(current, baseline, today, 'all-time');
            addOwnPositionNotifications(current, baseline, today, 'weekly');
          } else {
            // First visit after this snapshot schema upgrade: establish the new baseline
            // without announcing every existing Top-100 player as a fresh entrant.
            state.dayBaseline = current;
          }
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
    const value = numeric(timestamp);
    if (!value || !Number.isFinite(value)) return 'Time unavailable';
    const diff = Math.max(0, localTimestamp() - value);
    const totalMinutes = Math.floor(diff / 60000);
    if (totalMinutes < 1) return 'Less than 1 min ago';
    if (totalMinutes < 60) return totalMinutes + ' min ago';

    const totalHours = Math.floor(totalMinutes / 60);
    if (totalHours < 24) {
      const minutes = totalMinutes % 60;
      return minutes ? totalHours + ' hr ' + minutes + ' min ago' : totalHours + ' hr ago';
    }

    const totalDays = Math.floor(totalHours / 24);
    if (totalDays < 30) return totalDays + (totalDays === 1 ? ' day ago' : ' days ago');

    const years = Math.floor(totalDays / 365);
    const monthsAfterYears = Math.floor((totalDays % 365) / 30);
    const daysAfterMonths = totalDays % 30;

    if (years > 0) {
      const parts = [years + (years === 1 ? ' year' : ' years')];
      parts.push(monthsAfterYears + (monthsAfterYears === 1 ? ' month' : ' months'));
      parts.push(daysAfterMonths + (daysAfterMonths === 1 ? ' day' : ' days'));
      return parts.join(' ') + ' ago';
    }

    const months = Math.floor(totalDays / 30);
    const parts = [months + (months === 1 ? ' month' : ' months')];
    if (daysAfterMonths > 0) parts.push(daysAfterMonths + (daysAfterMonths === 1 ? ' day' : ' days'));
    return parts.join(' ') + ' ago';
  }
  function updateRelativeTimes() {
    document.querySelectorAll('#mat-notification-list time[data-mat-notification-time]').forEach(function (time) {
      const timestamp = numeric(time.getAttribute('data-mat-notification-time'));
      if (!timestamp) {
        time.textContent = 'Time unavailable';
        time.removeAttribute('title');
        return;
      }
      const detectedAt = new Date(timestamp);
      // Exact event time (including milliseconds) keeps distinct timestamps visibly distinct,
      // while the relative age advances live.
      time.textContent = relativeTime(timestamp);
      time.title = 'Detected by this site at ' + new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium', hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23', timeZone: 'Asia/Dhaka'
      }).format(detectedAt) + '.' + String(detectedAt.getMilliseconds()).padStart(3, '0') + ' (Bangladesh time)';
    });
  }
  function notificationIcon(type) {
    if (type === 'trophy') return '<i class="fa-solid fa-trophy" aria-hidden="true"></i>';
    if (type === 'friend') return '<i class="fa-solid fa-chart-line" aria-hidden="true"></i>';
    if (type === 'leaderboard') return '<i class="fa-solid fa-ranking-star" aria-hidden="true"></i>';
    return '<i class="fa-solid fa-bell" aria-hidden="true"></i>';
  }
  function unreadCount() { return state.notifications.filter(item => item.unread).length; }
  function renderBadge() {
    const signedIn = !!signedInUid();
    // Guests always have one mandatory, non-dismissible policy announcement.
    const count = signedIn ? unreadCount() : 1;
    const total = signedIn ? state.notifications.length : 1;
    document.querySelectorAll('[data-mat-notification-badge]').forEach(function (badge) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.hidden = count === 0;
      badge.setAttribute('aria-label', signedIn
        ? (count + ' unread notifications')
        : '1 important Guest account policy announcement');
    });
    document.querySelectorAll('[data-mat-notification-count]').forEach(function (label) {
      label.textContent = signedIn
        ? (total.toLocaleString() + ' total · ' + count.toLocaleString() + ' unread')
        : '1 important Guest announcement · Sign-in required for personal notifications';
    });
  }
  function emptyState() {
    return '<div class="mat-notification-empty"><div class="mat-notification-empty-icon"><i class="fa-regular fa-bell-slash" aria-hidden="true"></i></div>' +
      '<h3>You are all caught up</h3><p>Updates appear here when a friend changes weekly RP, passes you, unlocks a trophy, or someone moves in the Global Top 10 or your same-rank Top 10.</p>' +
      '<small>Activity is checked when you open the website or return to this tab.</small></div>';
  }
  function guestNotificationState() {
    return '<section class="mat-notification-announcement-view" role="region" aria-labelledby="mat-guest-deletion-title">' +
      '<article class="mat-guest-deletion-announcement" role="note" aria-labelledby="mat-guest-deletion-title">' +
      '<div class="mat-guest-deletion-label"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> IMPORTANT GUEST ANNOUNCEMENT · স্থায়ী ঘোষণা</div>' +
      '<h3 id="mat-guest-deletion-title">গেস্ট অ্যাকাউন্ট মুছে ফেলার নিয়ম</h3>' +
      '<p><strong>১. টানা ৩ মাস (৯০ দিন) ওয়েবসাইটে না এলে:</strong> আপনার Guest account এবং সার্ভারে সংরক্ষিত সংশ্লিষ্ট ডেটা স্থায়ীভাবে মুছে ফেলা হবে। পরে ফিরে এলে পুরোনো Guest ID আর কাজ করবে না; আপনাকে নতুন Guest account তৈরি করতে হবে এবং একটি নতুন Guest ID পাবেন।</p>' +
      '<p><strong>২. Weekly demotion-এর পর RP শূন্য হলে:</strong> আপনার Guest account-এর RP ০ হয়ে গেলে এবং পরবর্তী ৭ দিন আপনি ওয়েবসাইটে না এলে—এই সময় RP ০ থাকলে—Guest account ও সংশ্লিষ্ট সার্ভার ডেটা স্থায়ীভাবে মুছে ফেলা হবে।</p>' +
      '<p><strong>৩. সময় কীভাবে গণনা হবে:</strong> ওই ৭ দিনের মধ্যে ওয়েবসাইটে ফিরে এলে inactivity timer আপনার সর্বশেষ visit থেকে আবার গণনা হবে। মুছে ফেলার আগে RP আবার ০-এর বেশি হলে zero-RP নিয়মে account মুছে ফেলা হবে না। তবে ৯০ দিনের inactivity নিয়ম আলাদাভাবে প্রযোজ্য থাকবে।</p>' +
      '<p><strong>৪. Registered account:</strong> এই Guest deletion policy কোনো registered account-এর জন্য প্রযোজ্য নয়।</p>' +

      '</article>' +
      '<section class="mat-notification-guest-state mat-notification-guest-signin-recovered" role="region" aria-label="Sign in for personalised notifications">' +
      '<div class="mat-notification-guest-icon"><i class="fa-solid fa-user-lock" aria-hidden="true"></i></div>' +
      '<h3>You have to sign in to see personalised notifications</h3>' +
      '<p>Sign in or create an account to see updates about your friends, your leaderboard progress and trophy unlocks.</p>' +
      '<button type="button" data-mat-notification-login><i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i> Log in / Sign up</button>' +
      '<small>Personal notifications are available inside the website. No phone push alerts.</small>' +
      '</section></section>';
  }
  function visibleNotifications() {
    if (activeFilter === 'trash') return state.trash.slice().sort((a, b) => numeric(b.deletedAt) - numeric(a.deletedAt));
    if (activeFilter === 'archived') return state.notifications.filter(item => !!item.archivedAt);
    if (activeFilter === 'starred') return state.notifications.filter(item => !!item.starredAt);
    return state.notifications.filter(item => !item.archivedAt && (activeFilter === 'unread' ? item.unread : true));
  }
  function pruneSelection() {
    const available = new Set(state.notifications.concat(state.trash || []).map(item => String(item.id)));
    selectedIds = new Set(Array.from(selectedIds).filter(id => available.has(id)));
    return Array.from(selectedIds);
  }
  function renderSelectionToolbar(items) {
    const overlay = document.getElementById('mat-notification-center');
    if (!overlay) return;
    const visible = items || visibleNotifications();
    const selected = pruneSelection();
    const selectedSet = new Set(selected);
    const selectAll = overlay.querySelector('[data-mat-select-all]');
    const clearSelection = overlay.querySelector('[data-mat-clear-selection]');
    const selectedCount = overlay.querySelector('[data-mat-selected-count]');
    const deleteSelected = overlay.querySelector('[data-mat-delete-selected]');
    const archiveSelected = overlay.querySelector('[data-mat-archive-selected]');
    const starSelected = overlay.querySelector('[data-mat-star-selected]');
    const restoreSelected = overlay.querySelector('[data-mat-restore-selected]');
    const readSelected = overlay.querySelector('[data-mat-selected-read]');
    const unreadSelected = overlay.querySelector('[data-mat-selected-unread]');
    const allVisibleSelected = visible.length > 0 && visible.every(item => selectedSet.has(String(item.id)));
    if (selectAll) {
      selectAll.textContent = allVisibleSelected ? 'Unselect all' : 'Select all';
      selectAll.setAttribute('aria-pressed', String(allVisibleSelected));
      selectAll.disabled = visible.length === 0;
    }
    if (selectedCount) selectedCount.textContent = selected.length + ' selected';
    if (starSelected) starSelected.textContent = (activeFilter === 'starred' ? 'Unstar selected' : 'Star selected') + (selected.length ? ' (' + selected.length + ')' : '');
    if (readSelected) readSelected.textContent = 'Mark selected' + (selected.length ? ' (' + selected.length + ')' : '');
    if (deleteSelected) deleteSelected.textContent = (activeFilter === 'trash' ? 'Delete permanently' : 'Move to Trash') + (selected.length ? ' (' + selected.length + ')' : '');
    if (clearSelection) clearSelection.disabled = selected.length === 0;
    if (deleteSelected) {
      deleteSelected.textContent = selected.length ? 'Delete (' + selected.length + ' selected)' : 'Delete selected';
      deleteSelected.disabled = selected.length === 0;
    }
    if (readSelected) readSelected.disabled = selected.length === 0 || activeFilter === 'trash';
    if (unreadSelected) unreadSelected.disabled = selected.length === 0 || activeFilter === 'trash';
    if (archiveSelected) { archiveSelected.disabled = selected.length === 0 || activeFilter === 'trash'; archiveSelected.hidden = activeFilter === 'trash'; }
    if (starSelected) { starSelected.disabled = selected.length === 0 || activeFilter === 'trash'; starSelected.hidden = activeFilter === 'trash'; starSelected.textContent = (activeFilter === 'starred' ? 'Unstar selected' : 'Star selected') + (selected.length ? ' (' + selected.length + ')' : ''); }
    if (restoreSelected) { restoreSelected.disabled = selected.length === 0; restoreSelected.hidden = activeFilter !== 'trash'; }
    if (deleteSelected) deleteSelected.textContent = (activeFilter === 'trash' ? 'Delete permanently' : 'Move to Trash') + (selected.length ? ' (' + selected.length + ')' : '');
    if (archiveSelected) archiveSelected.textContent = activeFilter === 'archived' ? 'Unarchive selected' : 'Archive selected';
  }
  function renderFeed() {
    ensureAccountState();
    const list = document.getElementById('mat-notification-list');
    if (!list) { renderBadge(); return; }
    const toolbar = document.querySelector('#mat-notification-center .mat-notification-toolbar');
    const signedIn = !!signedInUid();
    if (toolbar) toolbar.style.display = '';
    if (signedIn && activeFilter === 'announcement') activeFilter = 'all';
    if (!signedIn) activeFilter = 'announcement';
    renderFilterState();
    if (!signedIn) {
      selectedIds.clear();
      list.innerHTML = guestNotificationState();
      list.scrollTop = 0;
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function () {
          const currentList = document.getElementById('mat-notification-list');
          if (currentList && currentList.querySelector('.mat-notification-announcement-view')) currentList.scrollTop = 0;
        });
      }
      renderBadge();
      return;
    }
    const items = visibleNotifications();
    const selected = new Set(pruneSelection());
    const allOrdered = state.notifications.slice().sort((a, b) => numeric(b.updatedAt || b.createdAt) - numeric(a.updatedAt || a.createdAt));
    list.innerHTML = items.length ? items.map(function (item, index) {
      const icon = notificationIcon(item.type);
      const typeLabel = item.type === 'trophy' ? 'TROPHY UNLOCKED' : item.type === 'friend' ? 'FRIEND ACTIVITY' : item.type === 'leaderboard' ? (item.period === 'weekly' ? 'WEEKLY LEADERBOARD' : 'GLOBAL LEADERBOARD') : 'ACTIVITY';
      const id = escapeHTML(item.id);
      const label = escapeHTML(item.title || 'Notification');
      const datetime = new Date(numeric(item.updatedAt || item.createdAt));
      const serial = activeFilter === 'trash' ? 'T' + (index + 1) : '#' + (allOrdered.findIndex(entry => String(entry.id) === String(item.id)) + 1);
      const isTrash = activeFilter === 'trash';
      const isArchived = !!item.archivedAt && !isTrash;
      const isStarred = !!item.starredAt && !isTrash;
      const validDatetime = Number.isNaN(datetime.getTime()) ? new Date(0).toISOString() : datetime.toISOString();
      return '<article class="mat-notification-item is-collapsed ' + (item.unread ? 'is-unread' : '') + (selected.has(String(item.id)) ? ' is-selected' : '') + '" role="listitem" aria-expanded="false" data-mat-notification-row="' + id + '">' +
        '<span class="mat-notification-serial" aria-label="Notification number">' + serial + '</span>' +
        '<label class="mat-notification-select-wrap"><input type="checkbox" class="mat-notification-select" data-mat-select-item="' + id + '"' +
        (selected.has(String(item.id)) ? ' checked' : '') + ' aria-label="Select notification: ' + label + '"></label>' +
        '<div class="mat-notification-item-icon type-' + escapeHTML(item.type || 'activity') + '">' + icon + '</div>' +
        '<div class="mat-notification-item-copy"><div class="mat-notification-item-head"><strong>' + label + '</strong><time datetime="' +
        escapeHTML(validDatetime) + '" data-mat-notification-time="' + numeric(item.updatedAt || item.createdAt) + '">' +
        escapeHTML(relativeTime(item.updatedAt || item.createdAt)) + '</time></div>' +
        '<p>' + escapeHTML(item.message) + '</p><div class="mat-notification-item-meta"><span>' + (isTrash ? 'RECENTLY DELETED' : isArchived ? 'ARCHIVED' : typeLabel) + '</span>' +
        (item.unread ? '<b>NEW</b>' : '<span>Read</span>') + (isTrash ? '<span class="mat-notification-expiry">Recover within 10 days</span>' : isArchived ? '<span class="mat-notification-expiry">Auto-delete in 10 days</span>' : '') + (isStarred ? '<span>STARRED</span>' : '') + '</div></div>' +
        '<div class="mat-notification-item-actions">' +
        (isTrash ? '<button class="mat-notification-action" type="button" data-mat-restore-one="' + id + '" aria-label="Restore notification" title="Restore notification"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i></button>' +
        '<button class="mat-notification-action is-danger" type="button" data-mat-purge-one="' + id + '" aria-label="Delete permanently" title="Delete permanently"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>' :
        '<button class="mat-notification-action" type="button" data-mat-toggle-read="' + id + '" data-mat-next-unread="' + (item.unread ? 'false' : 'true') + '" aria-label="' +
        (item.unread ? 'Mark as read' : 'Mark as unread') + '" title="' + (item.unread ? 'Mark as read' : 'Mark as unread') + '">' +
        (item.unread ? '<i class="fa-solid fa-check" aria-hidden="true"></i>' : '<i class="fa-solid fa-envelope" aria-hidden="true"></i>') + '</button>' +
        '<button class="mat-notification-action" type="button" data-mat-star-one="' + id + '" aria-label="' + (isStarred ? 'Unstar notification' : 'Star notification') + '" title="' + (isStarred ? 'Unstar' : 'Star') + '"><i class="fa-' + (isStarred ? 'solid fa-star' : 'regular fa-star') + '" aria-hidden="true"></i></button>' +
        '<button class="mat-notification-action" type="button" data-mat-archive-one="' + id + '" aria-label="' + (isArchived ? 'Unarchive notification' : 'Archive notification') + '" title="' + (isArchived ? 'Unarchive' : 'Archive') + '"><i class="fa-solid ' + (isArchived ? 'fa-box-open' : 'fa-box-archive') + '" aria-hidden="true"></i></button>' +
        '<button class="mat-notification-action is-danger" type="button" data-mat-delete-one="' + id + '" aria-label="Move to recently deleted" title="Move to recently deleted"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>') +
        '</div></article>';
    }).join('') : emptyState();
    renderSelectionToolbar(items);
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
      '<button class="mat-notification-expand" type="button" data-mat-notification-expand aria-label="Open fullscreen notifications" title="Open fullscreen"><i class="fa-solid fa-expand" aria-hidden="true"></i></button>' +
      '<button class="mat-notification-fullscreen-leaderboard" type="button" data-mat-open-leaderboard><i class="fa-solid fa-ranking-star" aria-hidden="true"></i> Open leaderboard <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>' +
      '<div class="mat-notification-header-selection-actions" role="group" aria-label="Selected notification actions" data-mat-header-selection-actions></div><span class="mat-notification-fullscreen-note"><i class="fa-solid fa-lock" aria-hidden="true"></i> In-site updates only · No phone push alerts</span>' +
      '<button class="mat-notification-close" type="button" data-mat-notification-close aria-label="Close notifications"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></header>' +
      '<div class="mat-notification-toolbar"><div class="mat-notification-toolbar-main"><div class="mat-notification-filters" role="group" aria-label="Filter notifications">' +
      '<button type="button" data-mat-filter="announcement" class="mat-notification-announcement-filter" aria-pressed="false"><i class="fa-solid fa-bullhorn" aria-hidden="true"></i> Announcement</button>' +
      '<button type="button" data-mat-filter="all" class="is-active" aria-pressed="true">All</button><button type="button" data-mat-filter="unread" aria-pressed="false">Unread</button><button type="button" data-mat-filter="starred" aria-pressed="false">Starred</button><button type="button" data-mat-filter="archived" aria-pressed="false">Archive</button><button type="button" data-mat-filter="trash" aria-pressed="false">Trash</button></div>' +
      '<button type="button" class="mat-notification-mark-all" data-mat-mark-all>Read all</button></div>' +
      '<div class="mat-notification-selection-toolbar" role="group" aria-label="Select and manage notifications">' +
      '<button type="button" data-mat-select-all>Select all</button><button type="button" data-mat-clear-selection disabled>Clear selection</button>' +
      '<span data-mat-selected-count aria-live="polite">0 selected</span>' +
      '<div class="mat-notification-bulk-actions"><button type="button" data-mat-selected-read disabled>Mark selected read</button>' +
      '<button type="button" data-mat-selected-unread disabled>Mark selected unread</button>' +
      '<button type="button" data-mat-star-selected disabled>Star selected</button>' +
      '<button type="button" data-mat-archive-selected disabled>Archive selected</button>' +
      '<button type="button" data-mat-restore-selected hidden>Restore selected</button>' +
      '<button type="button" class="is-danger" data-mat-delete-selected disabled>Delete selected</button></div></div></div>' +
      '<div id="mat-notification-list" class="mat-notification-list" role="list" aria-live="polite"></div>' +
      '<footer class="mat-notification-footer">' +
      '<button type="button" data-mat-open-leaderboard>Open leaderboard <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></footer></section>';
    document.body.appendChild(overlay);
    // Keep the three primary actions at the far end of the selection row.
    // The secondary unread/archive controls stay immediately before them.
    const headerActions = overlay.querySelector('[data-mat-header-selection-actions]');
    const selectionToolbar = overlay.querySelector('.mat-notification-selection-toolbar');
    const bulkActions = overlay.querySelector('.mat-notification-bulk-actions');
    if (headerActions && selectionToolbar && bulkActions) {
      ['[data-mat-star-selected]', '[data-mat-selected-read]', '[data-mat-delete-selected]'].forEach(function (selector) {
        const action = bulkActions.querySelector(selector);
        if (action) headerActions.appendChild(action);
      });
      selectionToolbar.appendChild(headerActions);
    }
  }
  function openCenter(trigger) {
    ensureAccountState();
    ensureCenter();
    lastTrigger = trigger || document.activeElement;
    const overlay = document.getElementById('mat-notification-center');
    overlay.hidden = false;
    // Default to the regular popup/drawer. Fullscreen remains available
    // through the explicit expand button.
    overlay.classList.remove('is-fullscreen');
    const expandButton = overlay.querySelector('[data-mat-notification-expand]');
    if (expandButton) {
      expandButton.innerHTML = '<i class="fa-solid fa-expand" aria-hidden="true"></i>';
      expandButton.setAttribute('aria-label', 'Open fullscreen notifications');
      expandButton.title = 'Open fullscreen';
    }
    document.body.classList.add('mat-notification-open');
    activeFilter = signedInUid() ? 'all' : 'announcement';
    renderFilterState();
    renderFeed();
    const panel = overlay.querySelector('.mat-notification-panel');
    if (panel) panel.focus({ preventScroll: true });
    // A deliberate open should always check the latest leaderboard and friend states.
    refreshActivity(true);
  }
  function closeCenter() {
    const overlay = document.getElementById('mat-notification-center');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.classList.remove('is-fullscreen');
    const expandButton = overlay.querySelector('[data-mat-notification-expand]');
    if (expandButton) {
      expandButton.innerHTML = '<i class="fa-solid fa-expand" aria-hidden="true"></i>';
      expandButton.setAttribute('aria-label', 'Open fullscreen notifications');
      expandButton.title = 'Open fullscreen';
    }
    document.body.classList.remove('mat-notification-open');
    if (lastTrigger && typeof lastTrigger.focus === 'function') lastTrigger.focus({ preventScroll: true });
  }
  function toggleFullscreen() {
    const overlay = document.getElementById('mat-notification-center');
    if (!overlay || overlay.hidden) return;
    const fullscreen = !overlay.classList.contains('is-fullscreen');
    overlay.classList.toggle('is-fullscreen', fullscreen);
    const button = overlay.querySelector('[data-mat-notification-expand]');
    if (button) {
      button.innerHTML = fullscreen
        ? '<i class="fa-solid fa-compress" aria-hidden="true"></i>'
        : '<i class="fa-solid fa-expand" aria-hidden="true"></i>';
      button.setAttribute('aria-label', fullscreen ? 'Exit fullscreen notifications' : 'Open fullscreen notifications');
      button.title = fullscreen ? 'Exit fullscreen' : 'Open fullscreen';
    }
  }
  function renderFilterState() {
    const signedIn = !!signedInUid();
    document.querySelectorAll('[data-mat-filter]').forEach(function (button) {
      const filter = button.getAttribute('data-mat-filter');
      const active = filter === activeFilter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
      button.hidden = signedIn ? filter === 'announcement' : filter !== 'announcement';
    });
    const toolbar = document.querySelector('#mat-notification-center .mat-notification-toolbar');
    const markAll = toolbar && toolbar.querySelector('[data-mat-mark-all]');
    const selectionToolbar = toolbar && toolbar.querySelector('.mat-notification-selection-toolbar');
    if (markAll) markAll.hidden = !signedIn;
    if (selectionToolbar) selectionToolbar.hidden = !signedIn;
  }
  function markAllRead() {
    const readAt = localTimestamp();
    state.notifications.forEach(item => { item.unread = false; item.readAt = readAt; item.statusUpdatedAt = readAt; });
    saveState();
    renderFeed();
  }
  function markNotifications(ids, unread) {
    const wanted = new Set((ids || []).map(String));
    if (!wanted.size) return;
    const timestamp = localTimestamp();
    state.notifications.forEach(item => {
      if (!wanted.has(String(item.id))) return;
      item.unread = !!unread;
      item.readAt = unread ? 0 : timestamp;
      item.statusUpdatedAt = timestamp;
    });
    saveState();
    renderFeed();
  }
  function markOneStatus(id, unread) { markNotifications([id], unread); }
  function deleteNotifications(ids) {
    const wanted = Array.from(new Set((ids || []).map(String).filter(Boolean)));
    if (!wanted.length) return;
    const wantedSet = new Set(wanted);
    const now = localTimestamp();
    const moving = state.notifications.filter(item => wantedSet.has(String(item.id)));
    moving.forEach(item => state.trash.push(Object.assign({}, item, { deletedAt: now })));
    state.notifications = state.notifications.filter(item => !wantedSet.has(String(item.id)));
    state.deletedIds = Array.from(new Set((state.deletedIds || []).concat(wanted))).slice(-1000);
    state.restoredIds = (state.restoredIds || []).filter(id => !wantedSet.has(String(id)));
    wanted.forEach(id => selectedIds.delete(id));
    saveState();
    renderFeed();
  }
  function starNotifications(ids, starred) {
    const wanted = new Set((ids || []).map(String));
    if (!wanted.size) return;
    const now = localTimestamp();
    state.notifications.forEach(item => {
      if (!wanted.has(String(item.id))) return;
      item.starredAt = starred ? now : 0;
      item.statusUpdatedAt = now;
    });
    saveState();
    renderFeed();
  }
  function archiveNotifications(ids, archived) {
    const wanted = new Set((ids || []).map(String));
    if (!wanted.size) return;
    const now = localTimestamp();
    state.notifications.forEach(item => {
      if (!wanted.has(String(item.id))) return;
      item.archivedAt = archived ? now : 0;
      item.statusUpdatedAt = now;
      item.updatedAt = item.updatedAt || item.createdAt || now;
    });
    saveState();
    renderFeed();
  }
  function restoreNotifications(ids) {
    const wanted = new Set((ids || []).map(String));
    if (!wanted.size) return;
    const restoring = state.trash.filter(item => wanted.has(String(item.id)) && numeric(item.deletedAt) > localTimestamp() - 10 * 86400000);
    const restoredIds = new Set(restoring.map(item => String(item.id)));
    state.notifications = state.notifications.filter(item => !restoredIds.has(String(item.id)));
    restoring.forEach(item => { const copy = Object.assign({}, item); delete copy.deletedAt; state.notifications.push(copy); });
    state.trash = state.trash.filter(item => !restoredIds.has(String(item.id)));
    state.deletedIds = (state.deletedIds || []).filter(id => !restoredIds.has(String(id)));
    state.restoredIds = Array.from(new Set((state.restoredIds || []).concat(Array.from(restoredIds)))).slice(-1000);
    state.notifications.sort((a, b) => numeric(b.updatedAt || b.createdAt) - numeric(a.updatedAt || a.createdAt));
    saveState();
    renderFeed();
  }
  function permanentlyDelete(ids) {
    const wanted = new Set((ids || []).map(String));
    if (!wanted.size) return;
    state.trash = state.trash.filter(item => !wanted.has(String(item.id)));
    state.purgedIds = Array.from(new Set((state.purgedIds || []).concat(Array.from(wanted)))).slice(-1000);
    wanted.forEach(id => selectedIds.delete(id));
    saveState();
    renderFeed();
  }
  function deleteSelectedNotifications() { deleteNotifications(pruneSelection()); }
  function toggleSelectAllVisible() {
    const items = visibleNotifications();
    if (!items.length) return;
    const allSelected = items.every(item => selectedIds.has(String(item.id)));
    items.forEach(item => { if (allSelected) selectedIds.delete(String(item.id)); else selectedIds.add(String(item.id)); });
    renderFeed();
  }
  function clearSelection() { selectedIds.clear(); renderFeed(); }
  function markSelected(unread) { markNotifications(pruneSelection(), unread); }
  function handleClick(event) {
    const target = event.target && event.target.closest ? event.target : null;
    if (!target) return;
    const openButton = target.closest('#mat-notification-open-dashboard, #mat-notifications-nav');
    if (openButton) { event.preventDefault(); openCenter(openButton); return; }
    const expandButton = target.closest('[data-mat-notification-expand]');
    if (expandButton) { toggleFullscreen(); return; }
    const closeButton = target.closest('[data-mat-notification-close]');
    if (closeButton) { closeCenter(); return; }
    const filter = target.closest('[data-mat-filter]');
    if (filter) { activeFilter = filter.getAttribute('data-mat-filter') || 'all'; renderFilterState(); renderFeed(); return; }
    const selectedCheckbox = target.closest('[data-mat-select-item]');
    if (selectedCheckbox) {
      const id = String(selectedCheckbox.getAttribute('data-mat-select-item') || '');
      if (id) { if (selectedCheckbox.checked) selectedIds.add(id); else selectedIds.delete(id); renderFeed(); }
      return;
    }
    const selectAll = target.closest('[data-mat-select-all]');
    if (selectAll) { toggleSelectAllVisible(); return; }
    const clearSelected = target.closest('[data-mat-clear-selection]');
    if (clearSelected) { clearSelection(); return; }
    const markAll = target.closest('[data-mat-mark-all]');
    if (markAll) { markAllRead(); return; }
    const markSelectedRead = target.closest('[data-mat-selected-read]');
    if (markSelectedRead) { markSelected(false); return; }
    const markSelectedUnread = target.closest('[data-mat-selected-unread]');
    if (markSelectedUnread) { markSelected(true); return; }
    const deleteSelected = target.closest('[data-mat-delete-selected]');
    if (deleteSelected) { if (activeFilter === 'trash') permanentlyDelete(pruneSelection()); else deleteSelectedNotifications(); return; }
    const starSelected = target.closest('[data-mat-star-selected]');
    if (starSelected) { starNotifications(pruneSelection(), activeFilter !== 'starred'); return; }
    const starOne = target.closest('[data-mat-star-one]');
    if (starOne) { const id = starOne.getAttribute('data-mat-star-one'); const item = state.notifications.find(entry => String(entry.id) === String(id)); starNotifications([id], !(item && item.starredAt)); return; }
    const archiveSelected = target.closest('[data-mat-archive-selected]');
    if (archiveSelected) { archiveNotifications(pruneSelection(), activeFilter !== 'archived'); return; }
    const restoreSelected = target.closest('[data-mat-restore-selected]');
    if (restoreSelected) { restoreNotifications(pruneSelection()); return; }
    const archiveOne = target.closest('[data-mat-archive-one]');
    if (archiveOne) { const id = archiveOne.getAttribute('data-mat-archive-one'); const item = state.notifications.find(entry => String(entry.id) === String(id)); archiveNotifications([id], !(item && item.archivedAt)); return; }
    const restoreOne = target.closest('[data-mat-restore-one]');
    if (restoreOne) { restoreNotifications([restoreOne.getAttribute('data-mat-restore-one')]); return; }
    const purgeOne = target.closest('[data-mat-purge-one]');
    if (purgeOne) { permanentlyDelete([purgeOne.getAttribute('data-mat-purge-one')]); return; }
    const toggleRead = target.closest('[data-mat-toggle-read]');
    if (toggleRead) { markOneStatus(toggleRead.getAttribute('data-mat-toggle-read'), toggleRead.getAttribute('data-mat-next-unread') === 'true'); return; }
    const deleteOne = target.closest('[data-mat-delete-one]');
    if (deleteOne) { deleteNotifications([deleteOne.getAttribute('data-mat-delete-one')]); return; }
    const loginButton = target.closest('[data-mat-notification-login]');
    if (loginButton) {
      if (typeof window.redirectToLogin === 'function') window.redirectToLogin();
      else if (window.app && typeof window.app.openAccountAuth === 'function') window.app.openAccountAuth('login');
      return;
    }
    const openLeaderboard = target.closest('[data-mat-open-leaderboard]');
    if (openLeaderboard) {
      closeCenter();
      const app = window.app;
      if (app && typeof app.openLeaderboard === 'function') app.openLeaderboard();
      else if (app && typeof app.showView === 'function') app.showView('leaderboard');
      return;
    }
    const notificationRow = target.closest('[data-mat-notification-row]');
    if (notificationRow && !target.closest('button, input, label, time, a')) {
      notificationRow.classList.toggle('is-collapsed');
      notificationRow.setAttribute('aria-expanded', String(!notificationRow.classList.contains('is-collapsed')));
    }
  }
  function bindEvents() {
    document.addEventListener('click', handleClick);
    window.addEventListener('student-auth-state-resolved', function () {
      ensureAccountState();
      lastRefreshAt = 0;
      renderFeed();
      refreshActivity(true);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !document.getElementById('mat-notification-center')?.hidden) closeCenter();
    });
    // Relative labels tick forward independently of leaderboard refreshes.
    window.setInterval(function () { updateRelativeTimes(); if (pruneTrash()) saveState(); }, 60000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        updateRelativeTimes();
        if (localTimestamp() - lastRefreshAt > 30000) refreshActivity(true);
      }
    });
    window.addEventListener('focus', function () {
      updateRelativeTimes();
      if (localTimestamp() - lastRefreshAt > 30000) refreshActivity(true);
    });
    window.addEventListener('storage', function (event) {
      if (event.key && event.key === stateKey()) {
        const shared = parseJSON(event.newValue, null);
        state = Object.assign(makeEmptyState(), shared || {});
        if (!Array.isArray(state.notifications)) state.notifications = [];
        if (!Array.isArray(state.trash)) state.trash = [];
        if (!Array.isArray(state.deletedIds)) state.deletedIds = [];
        if (!Array.isArray(state.restoredIds)) state.restoredIds = [];
        if (!Array.isArray(state.purgedIds)) state.purgedIds = [];
        pruneTrash();
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
    markAllRead: markAllRead,
    markSelectedRead: function () { markSelected(false); },
    markSelectedUnread: function () { markSelected(true); },
    deleteSelected: deleteSelectedNotifications,
    clearSelection: clearSelection
  });
})();
