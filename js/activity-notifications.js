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
  let cloudRestorePromiseUid = '';
  let cloudRestoreSequence = 0;
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
      notifications: Array.from(itemMap.values()).sort((a, b) => numeric(b.updatedAt || b.createdAt) - numeric(a.updatedAt || a.createdAt)).slice(0, 250),
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
      const changedPosition = oldPosition !== newPosition;
      const changedRP = oldRP !== newRP;
      const changedXP = oldXP !== newXP;
      const changedTier = period === 'all-time' && oldTierPosition !== newTierPosition &&
        (oldTierPosition > 0 || newTierPosition > 0);
      const inTop10 = !!(oldTop10[id] || newTop10[id]);
      const inSameRankTop10 = period === 'all-time' && (oldTierPosition > 0 || newTierPosition > 0);

      // Do not create routine activity alerts for non-friends across the entire Top 100.
      // Keep only Top 10, same-rank Top 10, or a direct pass involving the current user.
      if (!inTop10 && !inSameRankTop10 && !crossed) return;
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
    if (type === 'leaderboard') return '<i class="fa-solid fa-ranking-star" aria-hidden="true"></i>';
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
      '<h3>You are all caught up</h3><p>Updates appear here when a friend changes weekly RP, passes you, unlocks a trophy, or someone moves in the Global Top 10 or your same-rank Top 10.</p>' +
      '<small>Activity is checked when you open the website or return to this tab.</small></div>';
  }
  function renderFeed() {
    ensureAccountState();
    const list = document.getElementById('mat-notification-list');
    if (!list) { renderBadge(); return; }
    const items = state.notifications.filter(item => activeFilter === 'unread' ? item.unread : true);
    list.innerHTML = items.length ? items.map(function (item) {
      const icon = notificationIcon(item.type);
      const typeLabel = item.type === 'trophy' ? 'TROPHY UNLOCKED' : item.type === 'friend' ? 'FRIEND ACTIVITY' : item.type === 'leaderboard' ? (item.period === 'weekly' ? 'WEEKLY LEADERBOARD' : 'GLOBAL LEADERBOARD') : 'ACTIVITY';
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
    // A deliberate open should always check the latest leaderboard and friend states.
    refreshActivity(true);
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
