(() => {
  'use strict';
  const app = window.app;
  if (!app || app.__leaderboardExperienceInstalled) return;
  app.__leaderboardExperienceInstalled = true;

  let acceptedFriendIds = new Set();
  let acceptedFriends = [];
  let incomingRequests = [];
  let outgoingRequests = [];
  let lastConnectionLoad = 0;
  let connectionLoadPromise = null;
  let connectionLoadSequence = 0;
  let cancelledFeedback = new Map();
  const pendingFriendActions = new Map();
  const requestIdSyncStates = new Map();
  const requestIdSyncFailedTargets = new Set();
  const REQUEST_ID_SYNC_DELAY_MS = 2500;
  const REQUEST_ID_SYNC_MAX_ATTEMPTS = 4;
  let activePublicProfile = null;
  let guestAutoDeletionCountdownTimer = null;
  let lastFriendError = '';

  const safeText = (value, max = 180) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt = value => Math.max(0, Number(value) || 0).toLocaleString();
  function normalizeFriendRequest(request, defaultDirection) {
    const item = request && typeof request === 'object' ? request : {};
    const first = (...values) => values.find(value => value !== undefined && value !== null && String(value).trim() !== '');
    return Object.assign({}, item, {
      id: String(first(item.id, item.requestId, item.requestID, item.request_id, item.RequestID, item.recordId, item.recordID, item.record_id, item.RecordID, item.ID) || ''),
      fromUid: String(first(item.fromUid, item.fromUserId, item.FromUserID, item.from_user_id) || ''),
      toUid: String(first(item.toUid, item.toUserId, item.ToUserID, item.to_user_id) || ''),
      fromName: String(first(item.fromName, item.FromName, item.senderName) || 'Student'),
      toName: String(first(item.toName, item.ToName, item.recipientName) || 'Student'),
      status: String(first(item.status, item.Status) || 'pending'),
      direction: String(first(item.direction, defaultDirection) || '')
    });
  }
  function normalizeFriendRequestList(requests, direction) {
    return (Array.isArray(requests) ? requests : []).map(request => normalizeFriendRequest(request, direction));
  }
  const guestToken = () => {
    try { return String(localStorage.getItem('med_sheet_guest_token_v1') || '').trim(); }
    catch (_) { return ''; }
  };
  const userId = () => {
    if (app.authUser?.uid) return String(app.authUser.uid);
    try {
      const guestId = String(localStorage.getItem('med_sheet_guest_id_v1') || '').trim();
      if (guestId) return guestId;
    } catch (_) {}
    return String(app.profile?.userId || app.profile?.uid || '');
  };
  // Per-account local snapshot keeps Friends & Requests immediately usable while a refresh runs.
  const CONNECTION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const connectionCacheKey = () => {
    const uid = userId();
    return uid ? 'med_friend_connections_cache_v1_' + uid : '';
  };
  function saveConnectionCache() {
    const key = connectionCacheKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify({
        savedAt: Date.now(),
        friendIds: Array.from(acceptedFriendIds),
        friends: acceptedFriends,
        incoming: incomingRequests,
        outgoing: outgoingRequests
      }));
    } catch (_) {}
  }
  function hydrateConnectionCache() {
    if (acceptedFriends.length || incomingRequests.length || outgoingRequests.length || acceptedFriendIds.size) return false;
    const key = connectionCacheKey();
    if (!key) return false;
    try {
      const cached = JSON.parse(localStorage.getItem(key) || 'null');
      if (!cached || !Number(cached.savedAt) || Date.now() - Number(cached.savedAt) > CONNECTION_CACHE_TTL_MS) return false;
      acceptedFriendIds = new Set((Array.isArray(cached.friendIds) ? cached.friendIds : []).map(String).filter(Boolean));
      acceptedFriends = Array.isArray(cached.friends) ? cached.friends : [];
      incomingRequests = normalizeFriendRequestList(cached.incoming, 'incoming');
      outgoingRequests = normalizeFriendRequestList(cached.outgoing, 'outgoing');
      return true;
    } catch (_) { return false; }
  }
  const OUTGOING_REQUEST_CACHE_TTL_MS = 2 * 60 * 1000;
  const outgoingCacheKey = () => {
    const uid = userId();
    return uid ? 'med_friend_outgoing_cache_v1_' + uid : '';
  };
  function readOutgoingRequestCache() {
    const key = outgoingCacheKey();
    if (!key) return [];
    try {
      const cached = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(cached) ? cached.filter(item =>
        item && item.request && String(item.request.toUid || '') && Number(item.seenAt) > 0
      ) : [];
    } catch (_) { return []; }
  }
  function writeOutgoingRequestCache(entries) {
    const key = outgoingCacheKey();
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify(entries)); } catch (_) {}
  }
  function rememberOutgoingRequestSnapshot(requests) {
    const now = Date.now();
    writeOutgoingRequestCache((Array.isArray(requests) ? requests : [])
      .filter(request => request && String(request.toUid || ''))
      .map(request => ({ request, seenAt: now })));
  }
  function mergeRecentOutgoingRequests(serverOutgoing) {
    const now = Date.now();
    const serverByTarget = new Map();
    normalizeFriendRequestList(serverOutgoing, 'outgoing').forEach(request => {
      const targetId = String(request.toUid || '');
      if (targetId) serverByTarget.set(targetId, request);
    });
    const cachedByTarget = new Map();
    readOutgoingRequestCache().forEach(entry => {
      const cachedRequest = normalizeFriendRequest(entry.request, 'outgoing');
      const targetId = String(cachedRequest.toUid || '');
      if (targetId && now - Number(entry.seenAt) <= OUTGOING_REQUEST_CACHE_TTL_MS) {
        cachedByTarget.set(targetId, { request: cachedRequest, seenAt: entry.seenAt });
      }
    });
    serverByTarget.forEach((request, targetId) => {
      cachedByTarget.set(targetId, { request, seenAt: now });
    });
    const merged = new Map(serverByTarget);
    const incomingIds = new Set(incomingRequests.map(request => String(request.fromUid || '')));
    cachedByTarget.forEach((entry, targetId) => {
      if (merged.has(targetId) || acceptedFriendIds.has(targetId) || incomingIds.has(targetId)) return;
      // Prevent a stale connection response from erasing a recently confirmed outgoing request.
      merged.set(targetId, entry.request);
    });
    writeOutgoingRequestCache(Array.from(cachedByTarget.entries())
      .filter(([targetId]) => merged.has(targetId) && !acceptedFriendIds.has(targetId) && !incomingIds.has(targetId))
      .map(([, entry]) => entry));
    return Array.from(merged.values());
  }
  function rememberUnresolvedOutgoingRequest(targetId, targetName) {
    const id = String(targetId || '');
    if (!id || acceptedFriendIds.has(id) || incomingRequests.some(request => String(request.fromUid) === id)) return;
    const existing = outgoingRequests.find(request => String(request.toUid) === id);
    const request = existing || { id: '', toUid: id, toName: safeText(targetName || 'Student', 80), status: 'pending', direction: 'outgoing' };
    if (!existing) outgoingRequests = outgoingRequests.concat(request);
    const entries = readOutgoingRequestCache().filter(entry => String(entry.request.toUid || '') !== id);
    entries.push({ request, seenAt: Date.now() });
    writeOutgoingRequestCache(entries);
    lastFriendError = '';
    renderRequestPanel(document.querySelector('[data-leaderboard-period="friends"]')?.getAttribute('aria-selected') === 'true');
    if (activePublicProfile && String(activePublicProfile.userId || activePublicProfile.uid || '') === id) {
      renderRelationshipActions(activePublicProfile);
    }
    syncMissingRequestIds();
  }

  function stopRequestIdSync(targetId) {
    const id = String(targetId || '');
    const state = requestIdSyncStates.get(id);
    if (state && state.timer) clearTimeout(state.timer);
    requestIdSyncStates.delete(id);
  }
  function scheduleRequestIdSync(targetId, attempt = 0) {
    const id = String(targetId || '');
    if (!id || requestIdSyncStates.has(id) || requestIdSyncFailedTargets.has(id)) return;
    const state = { timer: null, attempt: attempt };
    state.timer = setTimeout(async () => {
      if (requestIdSyncStates.get(id) !== state) return;
      state.timer = null;
      const before = outgoingRequests.find(request => String(request.toUid || '') === id);
      if (!before) {
        requestIdSyncStates.delete(id);
        requestIdSyncFailedTargets.delete(id);
        return;
      }
      if (before.id) {
        stopRequestIdSync(id);
        requestIdSyncFailedTargets.delete(id);
        return;
      }
      try { await loadConnections(true); } catch (_) {}
      const current = outgoingRequests.find(request => String(request.toUid || '') === id);
      if (!current) {
        requestIdSyncStates.delete(id);
        requestIdSyncFailedTargets.delete(id);
        return;
      }
      if (current.id) {
        stopRequestIdSync(id);
        requestIdSyncFailedTargets.delete(id);
        if (window.MedGlobalLeague && typeof window.MedGlobalLeague.refreshFriendDirectory === 'function') {
          window.MedGlobalLeague.refreshFriendDirectory();
        }
        return;
      }
      if (attempt + 1 < REQUEST_ID_SYNC_MAX_ATTEMPTS) {
        requestIdSyncStates.delete(id);
        scheduleRequestIdSync(id, attempt + 1);
        return;
      }
      requestIdSyncStates.delete(id);
      requestIdSyncFailedTargets.add(id);
      outgoingRequests = outgoingRequests.map(request => String(request.toUid || '') === id
        ? Object.assign({}, request, { idSyncFailed: true }) : request);
      rememberOutgoingRequestSnapshot(outgoingRequests);
      renderRequestPanel(document.querySelector('[data-leaderboard-period="friends"]')?.getAttribute('aria-selected') === 'true');
      if (activePublicProfile && String(activePublicProfile.userId || activePublicProfile.uid || '') === id) {
        renderRelationshipActions(activePublicProfile);
        setStatus('Friend request আছে, কিন্তু API request ID দিচ্ছে না। Apps Script backend deployment পরীক্ষা করতে হবে।', true);
      }
      setFriendPanelStatus('Friend request pending থাকতে পারে, কিন্তু API request ID দিচ্ছে না। Apps Script backend deployment পরীক্ষা করুন।', true);
      if (window.MedGlobalLeague && typeof window.MedGlobalLeague.refreshFriendDirectory === 'function') {
        window.MedGlobalLeague.refreshFriendDirectory();
      }
    }, REQUEST_ID_SYNC_DELAY_MS);
    requestIdSyncStates.set(id, state);
  }
  function syncMissingRequestIds() {
    const pendingTargets = new Set();
    outgoingRequests = outgoingRequests.map(request => {
      const targetId = String(request.toUid || '');
      if (!targetId) return request;
      pendingTargets.add(targetId);
      if (request.id) {
        stopRequestIdSync(targetId);
        requestIdSyncFailedTargets.delete(targetId);
        return Object.assign({}, request, { idSyncFailed: false });
      }
      const failed = requestIdSyncFailedTargets.has(targetId);
      if (!failed) scheduleRequestIdSync(targetId, 0);
      return Object.assign({}, request, { idSyncFailed: failed });
    });
    Array.from(requestIdSyncStates.keys()).forEach(targetId => {
      if (!pendingTargets.has(targetId)) stopRequestIdSync(targetId);
    });
    Array.from(requestIdSyncFailedTargets).forEach(targetId => {
      if (!pendingTargets.has(targetId)) requestIdSyncFailedTargets.delete(targetId);
    });
  }

  const ownProfile = () => Object.assign({}, app.profile || {}, {
    name: app.profile?.name || app.authUser?.displayName || '',
    college: app.profile?.college || '',
    batch: app.profile?.batch || app.profile?.class || '',
    avatar: app.profile?.avatar || ''
  });
  const setStatus = (message, isError = false) => {
    const el = document.getElementById('student-profile-status');
    if (!el) return;
    el.textContent = String(message || '');
    el.classList.remove('hidden');
    el.classList.toggle('text-red-600', !!isError);
    el.classList.toggle('text-emerald-700', !isError);
  };
  const setFriendPanelStatus = (message, isError = false) => {
    const el = document.getElementById('leaderboard-friend-status');
    if (!el) return;
    el.textContent = String(message || '');
    el.classList.remove('hidden');
    el.classList.toggle('text-red-600', !!isError);
    el.classList.toggle('text-emerald-700', !isError);
  };
  const errorMessage = error => {
    const message = String(error?.message || error || '').trim();
    if (/registered account/i.test(message)) {
      return 'Live Apps Script-এ এখনও registered-only Friends code চলছে। Latest Medical_Admission_Tracker_Backend.gs deploy করুন।';
    }
    if (/authentication required|token|guest session expired|invalid guest/i.test(message)) {
      return 'Friend session verify হয়নি। পেজ refresh করুন; guest session আবার তৈরি না হলে নতুন guest session চালু করুন।';
    }
    if (/pending|already your friend|request already|request পাওয়া|ইতিমধ্যে পাঠানো হয়েছে/i.test(message)) return message;
    if (/failed to fetch|networkerror|load failed|cors|redirect|network/i.test(message)) {
      return 'Friends API request browser থেকে সম্পন্ন হয়নি (network/CORS/redirect সমস্যা)। API deployment access ও Web App response পরীক্ষা করুন।';
    }
    if (/did not return json|not json|unexpected token|html/i.test(message)) {
      return 'Friends API JSON response দেয়নি। দেওয়া URL-এ latest Apps Script Web App version deploy আছে কি না পরীক্ষা করুন।';
    }
    if (/unknown action|unsupported action|not implemented|action .*not found/i.test(message)) {
      return 'এই Apps Script deployment-এ Friends action নেই বা পুরোনো version চলছে: ' + message.slice(0, 180);
    }
    if (message && message !== '[object Object]') {
      return 'Friends sync failed: ' + message.slice(0, 220);
    }
    return 'Friends sync ব্যর্থ হয়েছে। Browser console-এ [Friends] error এবং Apps Script Executions log দেখুন।';
  };
  const canManageFriends = () => {
    if (!userId()) return false;
    if (app.authUser && typeof app.authUser.getIdToken === 'function') return true;
    return !!guestToken();
  };

  async function friendApi(action, fields = {}) {
    if (!canManageFriends()) throw new Error('Guest session প্রস্তুত হচ্ছে। একটু পর আবার চেষ্টা করুন।');
    const endpoint = String(window.MED_LEADERBOARD_API_URL || '').trim();
    if (!endpoint) throw new Error('Google Sheets API URL is not configured.');
    const credentials = {};
    if (app.authUser && typeof app.authUser.getIdToken === 'function') {
      credentials.idToken = await app.authUser.getIdToken();
    } else {
      credentials.guestToken = guestToken();
      if (!credentials.guestToken) throw new Error('Guest session token পাওয়া যায়নি। পেজ refresh করে আবার চেষ্টা করুন।');
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      headers: { 'Accept': 'application/json,text/plain,*/*', 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action }, credentials, fields))
    });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); }
    catch (_) { throw new Error('Google Sheets API did not return JSON. Check the deployed Web App version.'); }
    if (!response.ok || data.success === false) throw new Error(data.error || data.message || 'Google Sheets API request failed.');
    return data;
  }

  async function loadConnections(force = false) {
    if (!canManageFriends()) {
      acceptedFriendIds = new Set(); acceptedFriends = []; incomingRequests = []; outgoingRequests = [];
      lastConnectionLoad = Date.now();
      return getConnectionData();
    }
    // Paint a recent local snapshot first; the API refresh below remains authoritative.
    if (hydrateConnectionCache()) {
      renderRequestPanel(document.querySelector('[data-leaderboard-period="friends"]')?.getAttribute('aria-selected') === 'true');
    }
    if (!force && connectionLoadPromise) return connectionLoadPromise;
    if (!force && Date.now() - lastConnectionLoad < 4000) {
      return getConnectionData();
    }

    // Several profile/navigation handlers can force a refresh at nearly the same time.
    // Only the newest request may replace the shared connection state; otherwise an
    // older, slower response can revert "Request Sent" back to "Send Friend Request".
    const requestSequence = ++connectionLoadSequence;
    const requestPromise = (async () => {
      try {
        const data = await friendApi('friendConnections');
        if (requestSequence !== connectionLoadSequence) return getConnectionData();

        acceptedFriendIds = new Set((data.friendIds || []).map(String).filter(id => id && id !== userId()));
        acceptedFriends = Array.isArray(data.friends) ? data.friends : [];
        incomingRequests = normalizeFriendRequestList(data.incoming, 'incoming');
        outgoingRequests = mergeRecentOutgoingRequests(data.outgoing);
        syncMissingRequestIds();
        saveConnectionCache();
        if (!acceptedFriends.length && acceptedFriendIds.size && window.MedGlobalLeague?.getCachedRows) {
          const cachedProfiles = ['monthly', 'weekly', 'friends'].flatMap(period => window.MedGlobalLeague.getCachedRows(period) || []);
          acceptedFriends = Array.from(acceptedFriendIds).map(id => cachedProfiles.find(row =>
            String(row?.userId || row?.uid || row?.playerId || row?.raw?.userId || '') === id
          )).filter(Boolean);
        }
        lastConnectionLoad = Date.now();
        lastFriendError = '';
        renderRequestPanel(document.querySelector('[data-leaderboard-period="friends"]')?.getAttribute('aria-selected') === 'true');
        if (activePublicProfile) renderRelationshipActions(activePublicProfile);
        return { friendIds: Array.from(acceptedFriendIds), friends: acceptedFriends.slice(), incoming: incomingRequests, outgoing: outgoingRequests };
      } catch (error) {
        if (requestSequence !== connectionLoadSequence) return getConnectionData();
        lastFriendError = errorMessage(error);
        console.warn('[Friends] Google Sheets connection data could not be loaded:', error);
        renderRequestPanel(document.querySelector('[data-leaderboard-period="friends"]')?.getAttribute('aria-selected') === 'true');
        if (activePublicProfile) renderRelationshipActions(activePublicProfile);
        throw error;
      } finally {
        if (requestSequence === connectionLoadSequence) connectionLoadPromise = null;
      }
    })();
    connectionLoadPromise = requestPromise;
    return requestPromise;
  }

  function getFriendIds() { return Array.from(acceptedFriendIds); }
  function getLeaderboardFriendIds() {
    const ids = new Set(acceptedFriendIds);
    const includePending = app.profile?.includePendingFriends === true;
    if (includePending) {
      incomingRequests.forEach(request => { if (request.fromUid) ids.add(String(request.fromUid)); });
      outgoingRequests.forEach(request => { if (request.toUid) ids.add(String(request.toUid)); });
    }
    return Array.from(ids);
  }
  function getConnectionData() {
    return {
      friendIds: Array.from(acceptedFriendIds),
      friends: acceptedFriends.slice(),
      incoming: incomingRequests.slice(),
      outgoing: outgoingRequests.slice()
    };
  }
  function applyConnectionSnapshot(data) {
    if (!data || typeof data !== 'object') return;
    // A mutation response is the newest authoritative snapshot. Invalidate any
    // overlapping friendConnections read so a late stale response cannot revert
    // the relationship button or erase a just-updated Friends leaderboard state.
    connectionLoadSequence += 1;
    connectionLoadPromise = null;
    if (Array.isArray(data.friendIds)) {
      acceptedFriendIds = new Set(data.friendIds.map(String).filter(id => id && id !== userId()));
    }
    if (Array.isArray(data.friends)) acceptedFriends = data.friends;
    if (Array.isArray(data.incoming)) incomingRequests = normalizeFriendRequestList(data.incoming, 'incoming');
    if (Array.isArray(data.outgoing)) {
      outgoingRequests = normalizeFriendRequestList(data.outgoing, 'outgoing');
      rememberOutgoingRequestSnapshot(outgoingRequests);
    }
    syncMissingRequestIds();
    saveConnectionCache();
    lastConnectionLoad = Date.now();
    lastFriendError = '';
    renderRequestPanel(document.querySelector('[data-leaderboard-period="friends"]')?.getAttribute('aria-selected') === 'true');
    if (activePublicProfile) renderRelationshipActions(activePublicProfile);
  }
  function getRelationship(targetId) {
    const uid = userId(), id = String(targetId || '');
    if (!id) return 'unknown';
    if (uid && uid === id) return 'self';
    if (acceptedFriendIds.has(id)) return 'friends';
    if (incomingRequests.some(request => String(request.fromUid) === id)) return 'incoming';
    if (outgoingRequests.some(request => String(request.toUid) === id)) return 'outgoing';
    return 'none';
  }
  async function sendRequest(target) {
    if (!canManageFriends()) throw new Error('Guest session প্রস্তুত নয়। পেজ refresh করে আবার চেষ্টা করুন।');
    const targetId = String(target?.userId || target?.uid || '');
    if (!targetId || userId() === targetId) throw new Error('নিজের account-এ friend request পাঠানো যাবে না।');
    // Keep the profile button loading during both the initial connection check
    // and the send request itself; connection refreshes also repaint profile actions.
    pendingFriendActions.set(targetId, 'add');
    try {
      await loadConnections(true);
      const relation = getRelationship(targetId);
      if (relation === 'friends') throw new Error('এই student ইতিমধ্যে আপনার friend।');
      if (relation === 'incoming') throw new Error('এই student-এর request আগে থেকেই এসেছে। Accept বা Reject করুন।');
      // The connection response itself may confirm a request already sent from another UI.
      if (relation === 'outgoing') {
        if (!outgoingRequests.some(request => String(request.toUid) === targetId)) {
          rememberUnresolvedOutgoingRequest(targetId, target?.name || target?.displayName || 'Student');
        }
        if (window.MedGlobalLeague && typeof window.MedGlobalLeague.refreshFriendDirectory === 'function') {
          window.MedGlobalLeague.refreshFriendDirectory();
        }
        return true;
      }
      let sent;
      try {
        sent = await friendApi('sendFriendRequest', { targetUserId: targetId });
      } catch (error) {
        const message = String(error?.message || error || '');
        if (/request already sent|already sent|ইতিমধ্যে পাঠানো হয়েছে/i.test(message)) {
          try { await loadConnections(true); } catch (_) {}
          if (!outgoingRequests.some(request => String(request.toUid) === targetId)) {
            // The backend confirmed an existing request even if the list has not caught up yet.
            rememberUnresolvedOutgoingRequest(targetId, target?.name || target?.displayName || 'Student');
          }
          if (window.MedGlobalLeague && typeof window.MedGlobalLeague.refreshFriendDirectory === 'function') {
            window.MedGlobalLeague.refreshFriendDirectory();
          }
          // Do not hide the API error as a success. The UI catch will show the actual
          // reason while keeping the confirmed/potential pending state visible.
          throw error;
        }
        throw error;
      }
      applyConnectionSnapshot(sent);
      if (!outgoingRequests.some(request => String(request.toUid) === targetId) &&
          !acceptedFriendIds.has(targetId) &&
          !incomingRequests.some(request => String(request.fromUid) === targetId)) {
        // Preserve the confirmed send state if the mutation snapshot temporarily omits its request row.
        rememberUnresolvedOutgoingRequest(targetId, target?.name || target?.displayName || 'Student');
      }
      return true;
    } finally {
      pendingFriendActions.delete(targetId);
      if (activePublicProfile && String(activePublicProfile.userId || activePublicProfile.uid || '') === targetId) {
        renderRelationshipActions(activePublicProfile);
      }
    }
  }
  async function acceptRequest(requestId) {
    if (!canManageFriends()) throw new Error('Guest session প্রস্তুত নয়। পেজ refresh করে আবার চেষ্টা করুন।');
    const result = await friendApi('acceptFriendRequest', { requestId: String(requestId || '') });
    applyConnectionSnapshot(result);
    return true;
  }
  async function rejectRequest(requestId) {
    if (!canManageFriends()) throw new Error('Guest session প্রস্তুত নয়। পেজ refresh করে আবার চেষ্টা করুন।');
    const result = await friendApi('rejectFriendRequest', { requestId: String(requestId || '') });
    applyConnectionSnapshot(result);
    return true;
  }
  async function cancelRequest(requestId) {
    if (!canManageFriends()) throw new Error('Guest session প্রস্তুত নয়। পেজ refresh করে আবার চেষ্টা করুন।');
    const result = await friendApi('cancelFriendRequest', { requestId: String(requestId || '') });
    applyConnectionSnapshot(result);
    return true;
  }
  async function removeFriend(targetId) {
    if (!canManageFriends()) throw new Error('Guest session প্রস্তুত নয়। পেজ refresh করে আবার চেষ্টা করুন।');
    const other = String(targetId || '');
    if (!other || !acceptedFriendIds.has(other)) throw new Error('এই student এখন আপনার friend নয়।');
    const result = await friendApi('removeFriend', { targetUserId: other });
    applyConnectionSnapshot(result);
    return true;
  }

  function renderRequestPanel(isFriendsTab = false) {
    const panel = document.getElementById('leaderboard-friends-panel');
    const list = document.getElementById('leaderboard-friend-request-list');
    if (!panel || !list) return;
    // Friend list and all request actions belong only in the Friends tab.
    panel.classList.toggle('hidden', !isFriendsTab);
    if (!canManageFriends()) {
      list.innerHTML = '<div class="mat-profile-empty">Guest session এখনও প্রস্তুত হয়নি। পেজ refresh করুন; guest account থেকেও friend request পাঠানো যাবে।</div>';
      return;
    }
    if (lastFriendError) {
      list.innerHTML = '<div class="mat-profile-empty">' + escapeHTML(lastFriendError) + '</div>';
      return;
    }
    const incomingMarkup = incomingRequests.map(request =>
      '<div class="mat-friends-request"><span class="mat-friend-search-avatar">' +
      avatarMarkup({ userId: request.fromUid, name: request.fromName }) +
      '</span><div class="mat-friend-request-copy"><button type="button" class="mat-friend-profile-link" data-med-friend-open-profile="' + escapeHTML(request.fromUid) + '">' + escapeHTML(request.fromName || 'Student') + '</button><small>' +
      escapeHTML([request.fromCollege, request.fromBatch].filter(Boolean).join(' · ') || 'Incoming friend request') +
      '</small></div><div class="mat-profile-actions"><button type="button" class="primary" data-friend-action="accept" data-request-id="' + escapeHTML(request.id) + '">Accept</button><button type="button" data-friend-action="reject" data-request-id="' + escapeHTML(request.id) + '">Reject</button></div></div>'
    ).join('');
    const outgoingMarkup = outgoingRequests.map(request =>
      '<div class="mat-friends-request"><span class="mat-friend-search-avatar">' +
      avatarMarkup({ userId: request.toUid, name: request.toName }) +
      '</span><div class="mat-friend-request-copy"><button type="button" class="mat-friend-profile-link" data-med-friend-open-profile="' + escapeHTML(request.toUid) + '">' + escapeHTML(request.toName || 'Student') + '</button><small>' + (request.id ? 'Request sent · pending' : request.idSyncFailed ? 'Request sent · ID unavailable' : 'Request sent · syncing request ID') + '</small></div><div class="mat-profile-actions"><button type="button" data-friend-action="cancel" data-request-id="' + escapeHTML(request.id || '') + '"' + (!request.id ? ' disabled title="' + (request.idSyncFailed ? 'Backend request ID পাওয়া যায়নি; API deployment পরীক্ষা করুন' : 'Request ID sync হচ্ছে; একটু পরে আবার চেষ্টা করুন') + '"' : '') + '>Cancel</button></div></div>'
    ).join('');
    const friendsMarkup = acceptedFriends.map(friend => {
      const id = String(friend.userId || friend.uid || friend.playerId || '');
      return '<div class="mat-friends-request"><span class="mat-friend-search-avatar">' + avatarMarkup(friend) +
        '</span><div class="mat-friend-request-copy"><button type="button" class="mat-friend-profile-link" data-med-friend-open-profile="' + escapeHTML(id) + '">' +
        escapeHTML(friend.name || friend.username || 'Student') + '</button><small>' +
        escapeHTML([friend.college || friend.College, friend.batch || friend.Batch].filter(Boolean).join(' · ') || 'Accepted friend') +
        '</small></div><div class="mat-profile-actions"><button type="button" class="danger" data-friend-action="remove" data-target-id="' + escapeHTML(id) + '">Remove Friend</button></div></div>';
    }).join('');
    const section = (title, markup, count) => markup
      ? '<section class="mat-friend-section"><h4 class="mat-friend-section-title">' + title + ' (' + count + ')</h4>' + markup + '</section>'
      : '';
    const content = section('INCOMING REQUESTS', incomingMarkup, incomingRequests.length) +
      section('SENT REQUESTS · PENDING', outgoingMarkup, outgoingRequests.length) +
      section('YOUR FRIENDS', friendsMarkup, acceptedFriends.length);
    list.innerHTML = content || '<div class="mat-profile-empty">এখন কোনো pending request বা accepted friend নেই। Student search থেকে Add Friend চাপুন।</div>';
  }

  const defaultProfilePortraits = Array.from({length:24}, (_, i) => 'https://i.pravatar.cc/120?img=' + (i + 1));
  function defaultProfileAvatarForUser(userId) {
    const key = String(userId || 'guest'); let hash = 2166136261;
    for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
    return defaultProfilePortraits[(hash >>> 0) % defaultProfilePortraits.length];
  }
  function avatarMarkup(profile) {
    const rawAvatar = safeText(profile?.avatar || profile?.Avatar || '', 20000);
    let avatar = rawAvatar.replace(/#mat-(?:default|custom)-avatar$/i, '');
    const targetId = String(profile?.userId || profile?.uid || profile?.playerId || profile?.id || profile?.name || 'guest');
    let manualAvatar = false;
    if (targetId === userId()) {
      try { manualAvatar = localStorage.getItem('med_profile_avatar_manual_v1_' + targetId) === '1'; } catch (_) {}
    }
    if (avatar === defaultProfilePortraits[0] && !/#mat-(?:default|custom)-avatar$/i.test(rawAvatar) && !manualAvatar) {
      avatar = defaultProfileAvatarForUser(targetId);
    }
    if (/^https:\/\//i.test(avatar) || /^data:image\/(?:webp|png);base64,[A-Za-z0-9+/=]+$/.test(avatar) || /^data:image\/svg\+xml;charset=utf-8,%3Csvg/i.test(avatar)) return '<img src="' + escapeHTML(avatar) + '" alt="" loading="lazy">';
    if (avatar && avatar.length <= 12 && !/[<>]/.test(avatar)) return escapeHTML(avatar);
    return '<img src="' + escapeHTML(defaultProfileAvatarForUser(targetId)) + '" alt="" loading="lazy">';
  }

  function renderRelationshipActions(profile) {
    const host = document.getElementById('student-profile-actions');
    if (!host || !profile) return;
    const ownId = userId();
    const targetId = String(profile.userId || profile.uid || '');
    const isOwn = !!ownId && ownId === targetId;
    if (isOwn) {
      host.innerHTML = '<button type="button" class="primary" data-student-friend-action="edit-profile"><i class="fa-solid fa-pen-to-square ml-1" aria-hidden="true"></i> Edit My Profile</button>';
      return;
    }
    if (!canManageFriends()) {
      host.innerHTML = '<button type="button" data-student-friend-action="login"><i class="fa-solid fa-user-plus ml-1" aria-hidden="true"></i> Start Guest Session to Add Friend</button>';
      return;
    }
    if (pendingFriendActions.get(targetId) === 'add') {
      host.innerHTML = '<button type="button" class="primary is-refreshing" disabled aria-busy="true"><i class="fa-solid fa-spinner fa-spin ml-1" aria-hidden="true"></i> Sending Request…</button>';
      return;
    }
    const relation = getRelationship(targetId);
    const requestFromThisUser = outgoingRequests.find(item => String(item.toUid) === targetId);
    const requestToThisUser = incomingRequests.find(item => String(item.fromUid) === targetId);
    const cancelledState = cancelledFeedback.get(targetId);
    if (relation !== 'friends' && relation !== 'incoming' && relation !== 'outgoing' &&
        cancelledState && cancelledState.expiresAt > Date.now()) {
      host.innerHTML = '<button type="button" class="is-success" disabled aria-label="Friend request cancelled successfully"><i class="fa-solid fa-check ml-1" aria-hidden="true"></i> Cancelled</button>';
    } else if (relation !== 'friends' && relation !== 'incoming' && relation !== 'outgoing' && cancelledState) {
      if (cancelledState.timer) clearTimeout(cancelledState.timer);
      cancelledFeedback.delete(targetId);
      host.innerHTML = '<button type="button" class="primary" data-student-friend-action="add"><i class="fa-solid fa-user-plus ml-1" aria-hidden="true"></i> Send Friend Request</button>';
    } else if (relation === 'friends') {
      host.innerHTML = '<button type="button" data-student-friend-action="remove" data-target-id="' + escapeHTML(targetId) + '" class="danger"><i class="fa-solid fa-user-minus ml-1" aria-hidden="true"></i> Remove Friend</button><span class="inline-flex items-center text-xs font-bold text-emerald-700 dark:text-emerald-300"><i class="fa-solid fa-check ml-1"></i> Friends</span>';
    } else if (relation === 'outgoing') {
      const outgoingRequestId = String(requestFromThisUser?.id || '');
      host.innerHTML = '<button type="button" data-student-friend-action="cancel" data-request-id="' + escapeHTML(outgoingRequestId) + '"' +
        (!outgoingRequestId ? ' disabled title="' + (requestFromThisUser?.idSyncFailed ? 'Backend request ID পাওয়া যায়নি; API deployment পরীক্ষা করুন' : 'Request ID sync হচ্ছে; একটু পরে আবার চেষ্টা করুন') + '"' : '') +
        '><i class="fa-solid fa-clock ml-1" aria-hidden="true"></i> ' + (outgoingRequestId ? 'Request Sent · Cancel' : requestFromThisUser?.idSyncFailed ? 'Request Sent · ID unavailable' : 'Request Sent · Syncing') + '</button>';
    } else if (relation === 'incoming') {
      host.innerHTML = '<button type="button" class="primary" data-student-friend-action="accept" data-request-id="' + escapeHTML(requestToThisUser?.id || '') + '"><i class="fa-solid fa-user-check ml-1" aria-hidden="true"></i> Accept Request</button><button type="button" data-student-friend-action="reject" data-request-id="' + escapeHTML(requestToThisUser?.id || '') + '">Reject</button>';
    } else {
      host.innerHTML = '<button type="button" class="primary" data-student-friend-action="add"><i class="fa-solid fa-user-plus ml-1" aria-hidden="true"></i> Send Friend Request</button>';
    }
  }

  function renderPBConversionPanel(profile) {
    const host = document.getElementById('student-profile-actions');
    if (!host || !profile) return;
    const targetId = String(profile.userId || profile.uid || '');
    const ownId = userId();
    let panel = document.getElementById('student-profile-pb-conversion');
    if (!ownId || ownId !== targetId) {
      if (panel) panel.remove();
      return;
    }
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'student-profile-pb-conversion';
      panel.className = 'mt-4 rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/20 p-4';
      panel.innerHTML = '<div class="flex items-start justify-between gap-3"><div><h3 class="font-extrabold text-sm">PB Conversion</h3><p class="text-xs text-gray-600 dark:text-gray-300 mt-1">1 PB → 2 XP অথবা 1 PB → 1 RP। যেমন 300 PB → 600 XP বা 300 PB → 300 RP। PB পাওয়ার ২ ঘণ্টার মধ্যে convert করুন; সময় পার হলে PB স্বয়ংক্রিয়ভাবে RP হবে।</p></div><span class="text-xs font-bold text-emerald-700 dark:text-emerald-300">My Account</span></div><div class="mt-3 flex flex-col sm:flex-row gap-2"><label class="flex-1 text-xs font-semibold">PB amount<input id="student-profile-pb-amount" type="number" min="1" step="1" value="1" class="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm" /></label><div class="flex items-end gap-2"><button type="button" data-pb-convert="xp" class="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Convert to XP</button><button type="button" data-pb-convert="rp" class="rounded-xl border border-emerald-600 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">Convert to RP</button></div></div><p id="student-profile-pb-balance" class="mt-2 text-xs font-bold text-gray-700 dark:text-gray-200" aria-live="polite"></p><p id="student-profile-pb-conversion-status" class="mt-2 hidden items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300" role="status" aria-live="polite"></p>';
      host.insertAdjacentElement('afterend', panel);
    }
    const pending = Math.max(0, Number(profile.pb != null ? profile.pb : (profile.pendingPB != null ? profile.pendingPB : 0)) || 0);
    panel.dataset.availablePb = String(pending);
    const balance = panel.querySelector('#student-profile-pb-balance');
    const input = panel.querySelector('#student-profile-pb-amount');
    const xpButton = panel.querySelector('[data-pb-convert="xp"]');
    const rpButton = panel.querySelector('[data-pb-convert="rp"]');
    // XP/RP here are live conversion previews for the entered PB amount,
    // not the user's existing total XP/RP balances.
    const updatePBConversionPreview = () => {
      const entered = Number(input && input.value);
      const amount = Number.isSafeInteger(entered) && entered > 0 ? entered : 0;
      if (balance) {
        const availablePB = Math.max(0, Number(panel.dataset.availablePb) || 0);
        balance.textContent = 'Available PB: ' + fmt(availablePB) +
          ' · XP: ' + fmt(amount * 2) + ' · RP: ' + fmt(amount);
      }
      if (input) input.setAttribute('aria-describedby', 'student-profile-pb-balance');
    };
    if (input && input.dataset.previewBound !== '1') {
      input.dataset.previewBound = '1';
      input.addEventListener('input', updatePBConversionPreview);
    }
    if (input) input.max = String(pending);
    if (xpButton) xpButton.disabled = pending < 1;
    if (rpButton) rpButton.disabled = pending < 1;
    updatePBConversionPreview();
  }

  if (!document.documentElement.dataset.pbConversionHandler) {
    document.documentElement.dataset.pbConversionHandler = '1';
    document.addEventListener('click', async event => {
      const button = event.target.closest?.('[data-pb-convert]');
      if (!button) return;
      const panel = document.getElementById('student-profile-pb-conversion');
      const input = panel?.querySelector('#student-profile-pb-amount');
      if (!panel || panel.dataset.converting === '1') return;
      const amount = Number(input?.value);
      const kind = button.getAttribute('data-pb-convert');
      const converter = window.MedGlobalLeague && window.MedGlobalLeague.convertPB;
      if (typeof converter !== 'function') {
        setStatus('Server-side PB conversion service is unavailable. Refresh the page and try again.', true);
        return;
      }
      const xpButton = panel.querySelector('[data-pb-convert="xp"]');
      const rpButton = panel.querySelector('[data-pb-convert="rp"]');
      const status = panel.querySelector('#student-profile-pb-conversion-status');
      const originalLabel = button.innerHTML;
      panel.dataset.converting = '1';
      [xpButton, rpButton].filter(Boolean).forEach(item => {
        item.disabled = true;
        item.setAttribute('aria-disabled', 'true');
      });
      if (input) input.disabled = true;
      button.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-1" aria-hidden="true"></i> Converting…';
      button.setAttribute('aria-busy', 'true');
      button.classList.add('opacity-80', 'cursor-wait');
      if (status) {
        if (status._pbSuccessTimeout) clearTimeout(status._pbSuccessTimeout);
        if (status._pbHideTimeout) clearTimeout(status._pbHideTimeout);
        status.classList.remove('hidden', 'opacity-0');
        status.classList.add('flex', 'transition-opacity', 'duration-500', 'opacity-100');
        status.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i><span>Converting PB to ' + (kind === 'xp' ? 'XP' : 'RP') + '… Please wait.</span>';
      }
      try {
        const result = await converter(amount, kind);
        if (!result?.ok) throw new Error(result?.message || 'PB conversion failed.');
        if (result.user) activePublicProfile = result.user;
        if (status) {
          status.textContent = kind === 'xp'
            ? fmt(result.convertedPB) + ' PB থেকে ' + fmt(result.earnedXP) + ' XP যোগ হয়েছে।'
            : fmt(result.convertedPB) + ' PB থেকে ' + fmt(result.earnedRP) + ' RP যোগ হয়েছে।';
          status.classList.remove('hidden', 'opacity-0');
          status.classList.add('flex', 'transition-opacity', 'duration-500', 'opacity-100');
          if (status._pbSuccessTimeout) clearTimeout(status._pbSuccessTimeout);
          if (status._pbHideTimeout) clearTimeout(status._pbHideTimeout);
          status._pbSuccessTimeout = setTimeout(() => {
            status.classList.add('opacity-0');
            status._pbHideTimeout = setTimeout(() => {
              status.classList.add('hidden');
              status.classList.remove('flex', 'opacity-0');
              status.textContent = '';
              status._pbSuccessTimeout = null;
              status._pbHideTimeout = null;
            }, 550);
          }, 2500);
        }
        setStatus(kind === 'xp'
          ? fmt(result.convertedPB) + ' PB থেকে ' + fmt(result.earnedXP) + ' XP যোগ হয়েছে।'
          : fmt(result.convertedPB) + ' PB থেকে ' + fmt(result.earnedRP) + ' RP যোগ হয়েছে।');
        renderPBConversionPanel(activePublicProfile);
      } catch (error) {
        if (status) {
          status.classList.remove('hidden');
          status.classList.add('flex');
          status.textContent = error?.message || 'PB conversion failed.';
        }
        setStatus(error?.message || 'PB conversion failed.', true);
        renderPBConversionPanel(activePublicProfile);
      } finally {
        delete panel.dataset.converting;
        if (input) input.disabled = false;
        button.innerHTML = originalLabel;
        button.removeAttribute('aria-busy');
        button.classList.remove('opacity-80', 'cursor-wait');
        if (xpButton) {
          xpButton.disabled = Math.max(0, Number(panel.dataset.availablePb) || 0) < 1;
          xpButton.removeAttribute('aria-disabled');
        }
        if (rpButton) {
          rpButton.disabled = Math.max(0, Number(panel.dataset.availablePb) || 0) < 1;
          rpButton.removeAttribute('aria-disabled');
        }
      }
    });
  }

  function renderAccountLevelProgress(row) {
    const statsGrid = document.querySelector('#view-student-profile #student-profile-xp')?.closest('.grid');
    if (!statsGrid) return;
    let section = document.getElementById('student-profile-level-progression');
    if (!section) {
      section = document.createElement('section');
      section.id = 'student-profile-level-progression';
      section.className = 'rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/20 p-4 sm:p-5';
      section.innerHTML = '<h2 class="font-extrabold text-base flex items-center gap-2"><span aria-hidden="true" class="text-xl">⭐</span><span>Account Level Progression</span></h2><div class="flex items-center justify-between gap-3 mt-3"><div><p class="text-xs text-gray-600 dark:text-gray-300">Current Level</p><p id="student-profile-progression-level" class="text-xl font-black">Level 1</p></div><div class="text-right"><p class="text-xs text-gray-600 dark:text-gray-300">Next Level</p><p id="student-profile-progression-next" class="font-extrabold">Level 2</p></div></div><div class="mt-3 h-3 rounded-full bg-amber-100 dark:bg-gray-700 overflow-hidden" role="progressbar" aria-label="Account level progression" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="student-profile-level-progress-fill" class="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-500 transition-all duration-500" style="width:0%"></div></div><div class="flex items-center justify-between gap-3 mt-2 text-xs text-gray-600 dark:text-gray-300"><span id="student-profile-level-progress-xp">0 / 500 XP</span><strong id="student-profile-level-progress-percent">0%</strong></div>';
      statsGrid.insertAdjacentElement('afterend', section);
    }
    const xp = Math.max(0, Number(row?.xp) || 0);
    const progress = typeof app.getPerformanceLevelProgress === 'function'
      ? app.getPerformanceLevelProgress(xp)
      : { level: Math.max(1, Number(row?.level) || 1), required: 500, remaining: xp, toNext: Math.max(0, 500 - xp), percent: Math.min(100, Math.round(xp / 500 * 100)) };
    const level = Math.max(1, Number(progress.level) || Number(row?.level) || 1);
    const required = Math.max(1, Number(progress.required) || 500);
    const earned = Math.min(required, Math.max(0, Number(progress.remaining) || 0));
    const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
    const write = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    write('student-profile-progression-level', 'Level ' + level);
    write('student-profile-progression-next', 'Level ' + (level + 1));
    write('student-profile-level-progress-xp', fmt(earned) + ' / ' + fmt(required) + ' XP · ' + fmt(Math.max(0, required - earned)) + ' XP to go');
    write('student-profile-level-progress-percent', percent + '%');
    const fill = document.getElementById('student-profile-level-progress-fill');
    if (fill) fill.style.width = percent + '%';
    const bar = fill?.parentElement;
    if (bar) bar.setAttribute('aria-valuenow', String(percent));
  }

  function renderGuestAutoDeletionCountdown(row) {
    const el = document.getElementById('student-profile-guest-deletion-countdown');
    if (guestAutoDeletionCountdownTimer) clearInterval(guestAutoDeletionCountdownTimer);
    guestAutoDeletionCountdownTimer = null;
    if (!el) return;
    const deadline = Date.parse(String(row && row.guestAutoDeletionAt || ''));
    if (String(row && row.accountType || '').toUpperCase() !== 'GUEST' || !Number.isFinite(deadline) || deadline <= 0) {
      el.classList.add('hidden'); el.textContent = ''; return;
    }
    el.classList.remove('hidden');
    const tick = function () {
      const sec = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      if (!sec) { el.textContent = 'Guest account auto-deletion is due.'; clearInterval(guestAutoDeletionCountdownTimer); guestAutoDeletionCountdownTimer = null; return; }
      el.textContent = 'Guest account auto-delete in: ' + Math.floor(sec / 86400) + 'd ' + Math.floor(sec % 86400 / 3600) + 'h ' + Math.floor(sec % 3600 / 60) + 'm ' + sec % 60 + 's';
    };
    tick(); guestAutoDeletionCountdownTimer = setInterval(tick, 1000);
  }

  async function openStudentProfile(row) {
    if (!row) return;
    activePublicProfile = row;
    window.__matActivePublicStudentProfile = row;
    const view = document.getElementById('view-student-profile');
    const name = safeText(row.name || 'Medical Student', 80);
    const college = safeText(row.college || '', 120);
    const batch = safeText(row.batch || '', 40)
      .replace(/\bhsc\b/gi, 'HSC')
      .replace(/\bssc\b/gi, 'SSC');
    const rawRank = safeText(row.rank || '—', 50);
    // Repair the missing initial B seen in older/malformed profile data.
    const currentRank = rawRank.replace(/^ronze(?=\s|$)/i, 'Bronze');
    const rankTierMatch = currentRank.match(/^(Grandmaster|Platinum|Emerald|Diamond|Silver|Bronze|Gold|Master|Legend|Mythic|Immortal)\b/i);
    const currentRankTier = rankTierMatch
      ? rankTierMatch[1].charAt(0).toUpperCase() + rankTierMatch[1].slice(1).toLowerCase()
      : currentRank;
    const avatar = document.getElementById('student-profile-avatar');
    const avatarMarkupHTML = avatarMarkup(row);
    if (avatar) {
      avatar.innerHTML = avatarMarkupHTML;
      avatar.classList.toggle('has-image', /^\s*<img/i.test(avatarMarkupHTML));
    }
    const write = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    write('student-profile-name', name);
    write('student-profile-college-batch', [
      college ? 'College: ' + college : '',
      batch ? 'Class/Batch: ' + batch : ''
    ].filter(Boolean).join('\n') || 'College ও Class/Batch এখনো যোগ করা হয়নি');
    write('student-profile-rank-level', 'Rank: ' + currentRankTier + ' · Level ' + Math.max(1, Number(row.level) || 1));
    renderGuestAutoDeletionCountdown(row);
    write('student-profile-xp', fmt(row.xp) + ' XP');
    write('student-profile-total-rp', fmt(row.totalRP) + ' RP');
    write('student-profile-weekly-rp', fmt(row.weeklyRankPoints) + ' RP');
    write('student-profile-monthly-rp', fmt(row.monthlyRP) + ' RP');
    write('student-profile-highest-monthly-rp', fmt(Math.max(Number(row.highestMonthlyRP) || 0, Number(row.monthlyRP) || 0)) + ' RP');
    write('student-profile-highest-weekly-rp', fmt(Math.max(Number(row.highestWeeklyRP) || 0, Number(row.weeklyRankPoints) || 0)) + ' RP');
    write('student-profile-level', 'Lv. ' + Math.max(1, Number(row.level) || 1));
    renderAccountLevelProgress(row);
    write('student-profile-exams', Number.isFinite(Number(row.quizzes)) && Number(row.quizzes) > 0 ? fmt(row.quizzes) : '—');
    write('student-profile-accuracy', Number(row.accuracy) > 0 ? Number(row.accuracy).toFixed(1) + '%' : '—');
    write('student-profile-rank', currentRankTier);
    const vault = window.MedAchievementVaultTrophies;
    const trophy = document.getElementById('student-profile-trophy');
    if (trophy) {
      const svg = vault && typeof vault.trophySvgForRankName === 'function'
        ? vault.trophySvgForRankName(currentRank, 'student-profile-trophy-svg')
        : '<i class="fa-solid fa-trophy" aria-hidden="true"></i>';
      trophy.innerHTML = svg + '<div><strong>' + escapeHTML(currentRank) + '</strong><small>Achievement Vault · Current Subrank</small></div>';
    }
    if (view && typeof app.showView === 'function') app.showView('student-profile');
    const status = document.getElementById('student-profile-status');
    if (status) status.classList.add('hidden');
    renderRelationshipActions(row);
    renderPBConversionPanel(row);
    if (canManageFriends()) {
      try { await loadConnections(true); }
      catch (error) { setStatus(errorMessage(error), true); }
      renderRelationshipActions(row);
      renderPBConversionPanel(row);
    }
    if (window.MedGlobalLeague && typeof window.MedGlobalLeague.reload === 'function') {
      // Do not refetch the board just to render the profile; current row data is already authoritative.
    }
  }

  function setFriendActionBusy(button, action) {
    if (!button || button.dataset.friendActionBusy === '1') return;
    button.dataset.friendActionBusy = '1';
    button.dataset.friendActionOriginalHtml = button.innerHTML;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.classList.add('is-refreshing');
    const labels = {
      add: 'Sending Request…',
      accept: 'Accepting…',
      reject: 'Rejecting…',
      cancel: 'Cancelling…',
      remove: 'Removing Friend…'
    };
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin ml-1" aria-hidden="true"></i> ' + (labels[action] || 'Processing…');
  }

  function restoreFriendActionButton(button) {
    if (!button || !button.dataset.friendActionBusy) return;
    button.innerHTML = button.dataset.friendActionOriginalHtml || button.innerHTML;
    delete button.dataset.friendActionOriginalHtml;
    delete button.dataset.friendActionBusy;
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.classList.remove('is-refreshing');
  }

  async function handleFriendAction(action, targetId, requestId, sourceButton) {
    let successMessage = '';
    try {
      if (action === 'add') {
        setFriendActionBusy(sourceButton, action);
        const requestTargetId = String(activePublicProfile?.userId || activePublicProfile?.uid || targetId || '');
        await sendRequest(activePublicProfile || { userId: requestTargetId, name: 'Student' });
        // sendRequest already applies or confirms the authoritative pending snapshot.
        // Avoid a redundant forced read here; it could race and repaint the old state.
        if (!outgoingRequests.some(item => String(item.toUid) === requestTargetId)) {
          await loadConnections();
        }
        successMessage = 'Friend request successfully sent. এখন request pending আছে; চাইলে Cancel করতে পারবেন।'
      } else if (action === 'remove') {
        if (!window.confirm('এই student-কে Friends থেকে remove করবেন?')) return;
        setFriendActionBusy(sourceButton, action);
        await removeFriend(targetId);
        successMessage = 'Friend removed successfully. চাইলে আবার Friend Request পাঠাতে পারবেন।';
      } else if (action === 'accept') {
        setFriendActionBusy(sourceButton, action);
        await acceptRequest(requestId);
        successMessage = 'Friend request accepted successfully. এখন student আপনার Friends list-এ আছে।';
      } else if (action === 'reject') {
        setFriendActionBusy(sourceButton, action);
        await rejectRequest(requestId);
        successMessage = 'Friend request rejected.';
      } else if (action === 'cancel') {
        setFriendActionBusy(sourceButton, action);
        // Keep the confirmation state across connection refreshes triggered by cancelRequest().
        const previousCancelledState = cancelledFeedback.get(targetId);
        if (previousCancelledState?.timer) clearTimeout(previousCancelledState.timer);
        cancelledFeedback.set(targetId, { expiresAt: Infinity, timer: null });
        await cancelRequest(requestId);
        // A successful cancellation must never leave this profile in the outgoing
        // state, even if an overlapping/stale response briefly contains the request.
        outgoingRequests = outgoingRequests.filter(item => String(item.toUid) !== String(targetId));
        successMessage = 'Friend request cancelled successfully. এখন চাইলে আবার পাঠাতে পারবেন।';
        const cancelledState = { expiresAt: Date.now() + 1800, timer: null };
        cancelledState.timer = setTimeout(() => {
          cancelledFeedback.delete(targetId);
          if (activePublicProfile && String(activePublicProfile.userId || activePublicProfile.uid || '') === targetId) {
            renderRelationshipActions(activePublicProfile);
          }
        }, 1800);
        cancelledFeedback.set(targetId, cancelledState);
        // Re-render from the persistent feedback state, not from a stale button node.
        if (activePublicProfile && String(activePublicProfile.userId || activePublicProfile.uid || '') === targetId) {
          renderRelationshipActions(activePublicProfile);
        }
        setStatus(successMessage, false);
        setFriendPanelStatus(successMessage, false);
        await new Promise(resolve => setTimeout(resolve, 1800));
      } else if (action === 'edit-profile') {
        app.openAccountProfile();
        return;
      } else if (action === 'login') {
        if (typeof window.MedGlobalLeague?.syncIdentity === 'function') {
          await window.MedGlobalLeague.syncIdentity();
          if (canManageFriends() && activePublicProfile) {
            await loadConnections(true);
            renderRelationshipActions(activePublicProfile);
            setStatus('Guest session ready. Send your friend request now.', false);
          } else if (typeof app.openAccountAuth === 'function') {
            app.openAccountAuth('login');
          }
        } else if (typeof app.openAccountAuth === 'function') app.openAccountAuth('login');
        else if (typeof app.openAuthModal === 'function') app.openAuthModal('login');
        else if (typeof window.redirectToLogin === 'function') window.redirectToLogin();
        return;
      }
      // Each successful friend action applies the authoritative connection snapshot
      // returned by the backend. Avoid a second forced reload: a racing stale response
      // can turn Cancel back into Send, or make a cancelled request look pending again.
      if (activePublicProfile) renderRelationshipActions(activePublicProfile);
      if (window.MedGlobalLeague && typeof window.MedGlobalLeague.refreshFriendDirectory === 'function') window.MedGlobalLeague.refreshFriendDirectory();
      if (window.MedGlobalLeague && typeof window.MedGlobalLeague.reload === 'function') await window.MedGlobalLeague.reload();
      renderRequestPanel(document.querySelector('[data-leaderboard-period="friends"]')?.getAttribute('aria-selected') === 'true');
      if (successMessage) {
        setStatus(successMessage, false);
        setFriendPanelStatus(successMessage, false);
      }
    } catch (error) {
      if (action === 'cancel') {
        const cancelledState = cancelledFeedback.get(targetId);
        if (cancelledState?.timer) clearTimeout(cancelledState.timer);
        cancelledFeedback.delete(targetId);
      }
      restoreFriendActionButton(sourceButton);
      // A stale Cancel button can remain when the backend reports that the request
      // is no longer pending. Always resync relationship data after an action error
      // so the profile reflects the server's current state instead of stale buttons.
      try {
        await loadConnections(true);
        if (activePublicProfile) renderRelationshipActions(activePublicProfile);
        if (window.MedGlobalLeague && typeof window.MedGlobalLeague.refreshFriendDirectory === 'function') {
          window.MedGlobalLeague.refreshFriendDirectory();
        }
        renderRequestPanel(document.querySelector('[data-leaderboard-period="friends"]')?.getAttribute('aria-selected') === 'true');
      } catch (_) {}
      // Keep the Friends request panel/leaderboard aligned even when an API action errors.
      try {
        if (window.MedGlobalLeague && typeof window.MedGlobalLeague.reload === 'function') {
          await window.MedGlobalLeague.reload();
        }
      } catch (_) {}
      setStatus(errorMessage(error), true);
      setFriendPanelStatus(errorMessage(error), true);
    }
  }

  document.addEventListener('click', async event => {
    const profileAction = event.target.closest?.('[data-student-friend-action]');
    if (profileAction) {
      event.preventDefault();
      event.stopPropagation();
      await handleFriendAction(profileAction.dataset.studentFriendAction, String(activePublicProfile?.userId || activePublicProfile?.uid || profileAction.dataset.targetId || ''), profileAction.dataset.requestId, profileAction);
      return;
    }
    const requestAction = event.target.closest?.('[data-friend-action]');
    if (requestAction) {
      event.preventDefault();
      event.stopPropagation();
      await handleFriendAction(requestAction.dataset.friendAction, requestAction.dataset.targetId || '', requestAction.dataset.requestId, requestAction);
    }
  });
  document.addEventListener('student-auth-state-resolved', () => {
    acceptedFriendIds = new Set();
    acceptedFriends = [];
    incomingRequests = [];
    outgoingRequests = [];
    lastConnectionLoad = 0;
    if (canManageFriends()) loadConnections(true).catch(() => {});
  });
  document.addEventListener('student-profile-loaded', () => {
    if (canManageFriends()) loadConnections(true).catch(() => {});
  });

  function renderSidebarStudentProfileExtras(event) {
    const view = document.getElementById('view-profile');
    const rankGrid = view?.querySelector('.profile-rank-grid');
    if (!view || !rankGrid) return;
    let section = document.getElementById('sidebar-student-profile-extras');
    if (!section) {
      section = document.createElement('section');
      section.id = 'sidebar-student-profile-extras';
      section.className = 'space-y-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5 shadow-sm';
      section.innerHTML = '<div><h3 class="font-extrabold text-base flex items-center gap-2">Account Level Progression</h3><div class="flex items-center justify-between gap-3 mt-3"><div><p class="text-xs text-gray-500 dark:text-gray-400">Current Level</p><strong id="sidebar-profile-level" class="text-xl">Level 1</strong></div><div class="text-right"><p class="text-xs text-gray-500 dark:text-gray-400">Next Level</p><strong id="sidebar-profile-next-level">Level 2</strong></div></div><div class="mt-4 relative px-2 pb-1"><div class="h-3 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden" role="progressbar" aria-label="Account level progression" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="sidebar-profile-level-fill" class="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-500 transition-all duration-500" style="width:0%"></div></div><span id="sidebar-profile-progress-star" aria-label="Current progress position" title="Your XP progress" style="position:absolute;left:2px;top:-13px;transform:translateX(-50%);font-size:21px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.25));transition:left .5s ease;pointer-events:none">⭐</span></div><div class="flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-400"><span id="sidebar-profile-xp-progress">0 / 500 XP</span><strong id="sidebar-profile-level-percent">0%</strong></div><p class="mt-2 text-sm text-gray-600 dark:text-gray-300">Total Medical XP: <strong id="sidebar-profile-total-xp">0</strong> · RP: <strong id="sidebar-profile-total-rp">0</strong></p></div><div class="border-t border-gray-200 dark:border-gray-700 pt-4"><h3 class="font-extrabold text-base">PB Conversion</h3><p class="mt-1 text-xs text-gray-500 dark:text-gray-400">1 PB → 2 XP অথবা 1 PB → 1 RP। যেমন 300 PB → 600 XP বা 300 PB → 300 RP। PB পাওয়ার ২ ঘণ্টার মধ্যে convert করুন; সময় পার হলে PB স্বয়ংক্রিয়ভাবে RP হবে।</p><div class="mt-3 flex flex-col sm:flex-row gap-2"><label class="flex-1 text-xs font-semibold">PB amount<input id="sidebar-profile-pb-amount" type="number" min="1" step="1" value="1" class="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"></label><div class="flex items-end gap-2"><button type="button" data-sidebar-pb-convert="xp" class="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Convert to XP</button><button type="button" data-sidebar-pb-convert="rp" class="rounded-xl border border-emerald-600 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">Convert to RP</button></div></div><p id="sidebar-profile-pb-balance" class="mt-2 text-xs font-bold text-gray-700 dark:text-gray-200" aria-live="polite"></p><p id="sidebar-profile-pb-status" class="mt-2 text-sm" role="status" aria-live="polite"></p></div>';
      rankGrid.insertAdjacentElement('afterend', section);
    }
    // The Medical Sheets API profile is the source of truth for XP/RP.
    // Local progress is retained only as a fallback until the first server profile arrives.
    let localProgress = {};
    try { localProgress = typeof app.getAccountProgress === 'function' ? app.getAccountProgress() : {}; } catch (_) {}
    const eventProfile = event?.detail?.source === 'medical-sheets-api' ? event.detail : null;
    const serverProfile = eventProfile || app.profile || {};
    const hasServerBalance = serverProfile.xp != null || serverProfile.rankPoints != null || serverProfile.totalRP != null;
    const xp = Math.max(0, Number(hasServerBalance ? serverProfile.xp : (localProgress.xp ?? localProgress.totalXP)) || 0);
    const lifetimeRP = Math.max(0, Number(hasServerBalance
      ? (serverProfile.totalRP ?? serverProfile.TotalRP ?? 0)
      : (localProgress.totalRP ?? localProgress.lifetimeRP ?? 0)) || 0);
    const levelProgress = typeof app.getPerformanceLevelProgress === 'function'
      ? app.getPerformanceLevelProgress(xp)
      : { level: Math.max(1, Number(localProgress.level) || 1), required: 500, remaining: xp, percent: Math.min(100, Math.round(xp / 500 * 100)) };
    const level = Math.max(1, Number(levelProgress.level) || 1);
    const required = Math.max(1, Number(levelProgress.required) || 500);
    const earned = Math.min(required, Math.max(0, Number(levelProgress.remaining) || 0));
    const percent = Math.max(0, Math.min(100, Number(levelProgress.percent) || 0));
    const write = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    write('sidebar-profile-level', 'Level ' + level);
    write('sidebar-profile-next-level', 'Level ' + (level + 1));
    write('sidebar-profile-xp-progress', fmt(earned) + ' / ' + fmt(required) + ' XP · ' + fmt(Math.max(0, required - earned)) + ' XP to go');
    write('sidebar-profile-level-percent', percent + '%');
    write('sidebar-profile-total-xp', fmt(xp));
    write('sidebar-profile-total-rp', fmt(lifetimeRP));
    const fill = document.getElementById('sidebar-profile-level-fill');
    if (fill) fill.style.width = percent + '%';
    fill?.parentElement?.setAttribute('aria-valuenow', String(percent));
    const star = document.getElementById('sidebar-profile-progress-star');
    if (star) star.style.left = percent + '%';
    const pending = Math.max(0, Number(serverProfile.pb != null ? serverProfile.pb : (serverProfile.pendingPB != null ? serverProfile.pendingPB : localProgress.pendingPB)) || 0);
    write('sidebar-profile-pb-balance', 'Available PB: ' + fmt(pending) + ' · XP: ' + fmt(xp) + ' · Lifetime RP: ' + fmt(lifetimeRP));
    const input = document.getElementById('sidebar-profile-pb-amount');
    if (input) input.max = String(pending);
    section.querySelectorAll('[data-sidebar-pb-convert]').forEach(button => { button.disabled = pending < 1; });
  }

  if (!document.documentElement.dataset.sidebarProfilePBHandler) {
    document.documentElement.dataset.sidebarProfilePBHandler = '1';
    document.addEventListener('click', async event => {
      const button = event.target.closest?.('[data-sidebar-pb-convert]');
      if (!button) return;
      const input = document.getElementById('sidebar-profile-pb-amount');
      const amount = Number(input?.value);
      const kind = button.getAttribute('data-sidebar-pb-convert');
      const converter = window.MedGlobalLeague && window.MedGlobalLeague.convertPB;
      const status = document.getElementById('sidebar-profile-pb-status');
      if (typeof converter !== 'function') {
        if (status) status.textContent = 'Server-side PB conversion service unavailable. Refresh and try again.';
        return;
      }
      button.disabled = true;
      try {
        const result = await converter(amount, kind);
        if (!result?.ok) throw new Error(result?.message || 'PB conversion failed.');
        if (status) status.textContent = kind === 'xp'
          ? fmt(result.convertedPB) + ' PB থেকে ' + fmt(result.earnedXP) + ' XP যোগ হয়েছে।'
          : fmt(result.convertedPB) + ' PB থেকে ' + fmt(result.earnedRP) + ' RP যোগ হয়েছে।';
        renderSidebarStudentProfileExtras();
      } catch (error) {
        if (status) status.textContent = error?.message || 'PB conversion failed.';
        renderSidebarStudentProfileExtras();
      } finally { button.disabled = false; }
    });
    // Local PB actions dispatch on document; the Medical Sheets API profile
    // dispatches on window. Listen to both so this progression matches the leaderboard.
    document.addEventListener('student-progress-updated', renderSidebarStudentProfileExtras);
    window.addEventListener('student-progress-updated', renderSidebarStudentProfileExtras);
  }
  renderSidebarStudentProfileExtras();

  window.MedStudentFriends = Object.freeze({
    loadConnections,
    getLastConnectionError: () => lastFriendError,
    getFriendIds,
    getLeaderboardFriendIds,
    getConnectionData,
    getRelationship,
    renderRequestPanel,
    sendRequest,
    canManageFriends,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    removeFriend
  });
  async function openOwnStudentProfile() {
    const ownId = userId();
    const profile = ownProfile();
    let row = null;
    const league = window.MedGlobalLeague;
    if (league && typeof league.getCachedRows === 'function') {
      const rows = ['all-time', 'weekly', 'friends'].flatMap(period => {
        try { return league.getCachedRows(period) || []; } catch (_) { return []; }
      });
      row = rows.find(item => String(item?.userId || item?.uid || item?.playerId || item?.raw?.userId || '') === ownId) || null;
    }
    if (!row) {
      let progress = {};
      try { progress = typeof app.getAccountProgress === 'function' ? app.getAccountProgress() : {}; } catch (_) {}
      row = {
        userId: ownId,
        uid: ownId,
        name: profile.name || app.authUser?.displayName || 'Student',
        college: profile.college || '',
        batch: profile.batch || profile.class || '',
        avatar: profile.avatar || '',
        xp: Number(progress.xp ?? progress.totalXP ?? 0) || 0,
        totalRP: Number(progress.totalRP ?? progress.lifetimeRP ?? 0) || 0,
        weeklyRankPoints: Number(progress.weeklyRankPoints ?? progress.weeklyRP ?? 0) || 0,
        rankPoints: Number(progress.rankPoints ?? progress.currentRP ?? 0) || 0,
        level: Number(progress.level ?? 1) || 1,
        quizzes: Number(progress.quizzes ?? progress.completedExams ?? 0) || 0,
        streak: Number(progress.streak ?? 0) || 0,
        accuracy: Number(progress.accuracy ?? 0) || 0,
        rank: profile.rank || 'Bronze'
      };
    } else {
      // Never show a cached leaderboard copy over the signed-in user's canonical profile.
      row = Object.assign({}, row, {
        userId: ownId,
        uid: ownId,
        name: profile.name || row.name || app.authUser?.displayName || 'Student',
        college: profile.college || row.college || '',
        batch: profile.batch || profile.class || row.batch || '',
        avatar: profile.avatar || row.avatar || ''
      });
    }
    return openStudentProfile(row);
  }

  window.MedStudentProfile = Object.freeze({ open: openStudentProfile, openOwn: openOwnStudentProfile });

  // The core leaderboard controller owns routing and reloads; do not install another
  // showView wrapper here or a single click can trigger duplicate API calls.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      renderRequestPanel(false);
      if (canManageFriends()) loadConnections().catch(() => {});
    }, { once: true });
  } else {
    renderRequestPanel(false);
    if (canManageFriends()) loadConnections().catch(() => {});
  }
})();
