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
  let activePublicProfile = null;
  let lastFriendError = '';

  const safeText = (value, max = 180) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt = value => Math.max(0, Number(value) || 0).toLocaleString();
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
    if (/pending|already your friend|request already|request পাওয়া/i.test(message)) return message;
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
    if (!force && connectionLoadPromise) return connectionLoadPromise;
    if (!force && Date.now() - lastConnectionLoad < 4000) {
      return getConnectionData();
    }
    connectionLoadPromise = (async () => {
      try {
        const data = await friendApi('friendConnections');
        acceptedFriendIds = new Set((data.friendIds || []).map(String).filter(id => id && id !== userId()));
        acceptedFriends = Array.isArray(data.friends) ? data.friends : [];
        incomingRequests = Array.isArray(data.incoming) ? data.incoming : [];
        outgoingRequests = Array.isArray(data.outgoing) ? data.outgoing : [];
        if (!acceptedFriends.length && acceptedFriendIds.size && window.MedGlobalLeague?.getCachedRows) {
          const cachedProfiles = ['all-time', 'weekly', 'friends'].flatMap(period => window.MedGlobalLeague.getCachedRows(period) || []);
          acceptedFriends = Array.from(acceptedFriendIds).map(id => cachedProfiles.find(row =>
            String(row?.userId || row?.uid || row?.playerId || row?.raw?.userId || '') === id
          )).filter(Boolean);
        }
        lastConnectionLoad = Date.now();
        lastFriendError = '';
        renderRequestPanel(document.querySelector('[data-leaderboard-period="friends"]')?.getAttribute('aria-selected') === 'true');
        if (activePublicProfile) renderRelationshipActions(activePublicProfile);
        return { friendIds: Array.from(acceptedFriendIds), incoming: incomingRequests, outgoing: outgoingRequests };
      } catch (error) {
        lastFriendError = errorMessage(error);
        console.warn('[Friends] Google Sheets connection data could not be loaded:', error);
        renderRequestPanel(document.querySelector('[data-leaderboard-period="friends"]')?.getAttribute('aria-selected') === 'true');
        if (activePublicProfile) renderRelationshipActions(activePublicProfile);
        throw error;
      } finally {
        connectionLoadPromise = null;
      }
    })();
    return connectionLoadPromise;
  }

  function getFriendIds() { return Array.from(acceptedFriendIds); }
  function getConnectionData() {
    return {
      friendIds: Array.from(acceptedFriendIds),
      friends: acceptedFriends.slice(),
      incoming: incomingRequests.slice(),
      outgoing: outgoingRequests.slice()
    };
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
    await loadConnections(true);
    const relation = getRelationship(targetId);
    if (relation === 'friends') throw new Error('এই student ইতিমধ্যে আপনার friend।');
    if (relation === 'incoming') throw new Error('এই student-এর request আগে থেকেই এসেছে। Accept বা Reject করুন।');
    if (relation === 'outgoing') throw new Error('Friend request ইতিমধ্যে পাঠানো হয়েছে।');
    await friendApi('sendFriendRequest', { targetUserId: targetId });
    await loadConnections(true);
    return true;
  }
  async function acceptRequest(requestId) {
    if (!canManageFriends()) throw new Error('Guest session প্রস্তুত নয়। পেজ refresh করে আবার চেষ্টা করুন।');
    await friendApi('acceptFriendRequest', { requestId: String(requestId || '') });
    await loadConnections(true);
    return true;
  }
  async function rejectRequest(requestId) {
    if (!canManageFriends()) throw new Error('Guest session প্রস্তুত নয়। পেজ refresh করে আবার চেষ্টা করুন।');
    await friendApi('rejectFriendRequest', { requestId: String(requestId || '') });
    await loadConnections(true);
    return true;
  }
  async function cancelRequest(requestId) {
    if (!canManageFriends()) throw new Error('Guest session প্রস্তুত নয়। পেজ refresh করে আবার চেষ্টা করুন।');
    await friendApi('cancelFriendRequest', { requestId: String(requestId || '') });
    await loadConnections(true);
    return true;
  }
  async function removeFriend(targetId) {
    if (!canManageFriends()) throw new Error('Guest session প্রস্তুত নয়। পেজ refresh করে আবার চেষ্টা করুন।');
    const other = String(targetId || '');
    if (!other || !acceptedFriendIds.has(other)) throw new Error('এই student এখন আপনার friend নয়।');
    await friendApi('removeFriend', { targetUserId: other });
    await loadConnections(true);
    return true;
  }

  function renderRequestPanel(isFriendsTab = false) {
    const panel = document.getElementById('leaderboard-friends-panel');
    const list = document.getElementById('leaderboard-friend-request-list');
    if (!panel || !list) return;
    panel.classList.toggle('hidden', !isFriendsTab);
    if (!isFriendsTab) return;
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
      '</span><div class="mat-friend-request-copy"><button type="button" class="mat-friend-profile-link" data-med-friend-open-profile="' + escapeHTML(request.toUid) + '">' + escapeHTML(request.toName || 'Student') + '</button><small>Request sent · pending</small></div><div class="mat-profile-actions"><button type="button" data-friend-action="cancel" data-request-id="' + escapeHTML(request.id) + '">Cancel</button></div></div>'
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
    const relation = getRelationship(targetId);
    const requestFromThisUser = outgoingRequests.find(item => String(item.toUid) === targetId);
    const requestToThisUser = incomingRequests.find(item => String(item.fromUid) === targetId);
    if (relation === 'friends') {
      host.innerHTML = '<button type="button" data-student-friend-action="remove" data-target-id="' + escapeHTML(targetId) + '" class="danger"><i class="fa-solid fa-user-minus ml-1" aria-hidden="true"></i> Remove Friend</button><span class="inline-flex items-center text-xs font-bold text-emerald-700 dark:text-emerald-300"><i class="fa-solid fa-check ml-1"></i> Friends</span>';
    } else if (relation === 'outgoing') {
      host.innerHTML = '<button type="button" data-student-friend-action="cancel" data-request-id="' + escapeHTML(requestFromThisUser?.id || '') + '"><i class="fa-solid fa-clock ml-1" aria-hidden="true"></i> Request Sent · Cancel</button>';
    } else if (relation === 'incoming') {
      host.innerHTML = '<button type="button" class="primary" data-student-friend-action="accept" data-request-id="' + escapeHTML(requestToThisUser?.id || '') + '"><i class="fa-solid fa-user-check ml-1" aria-hidden="true"></i> Accept Request</button><button type="button" data-student-friend-action="reject" data-request-id="' + escapeHTML(requestToThisUser?.id || '') + '">Reject</button>';
    } else {
      host.innerHTML = '<button type="button" class="primary" data-student-friend-action="add"><i class="fa-solid fa-user-plus ml-1" aria-hidden="true"></i> Send Friend Request</button>';
    }
  }

  async function openStudentProfile(row) {
    if (!row) return;
    activePublicProfile = row;
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
    write('student-profile-xp', fmt(row.xp) + ' XP');
    write('student-profile-total-rp', fmt(row.totalRP) + ' RP');
    write('student-profile-weekly-rp', fmt(row.weeklyRankPoints) + ' RP');
    write('student-profile-current-rp', fmt(row.rankPoints) + ' RP');
    write('student-profile-level', 'Lv. ' + Math.max(1, Number(row.level) || 1));
    write('student-profile-exams', Number.isFinite(Number(row.quizzes)) && Number(row.quizzes) > 0 ? fmt(row.quizzes) : '—');
    write('student-profile-streak', fmt(row.streak) + ' days');
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
    if (canManageFriends()) {
      try { await loadConnections(true); }
      catch (error) { setStatus(errorMessage(error), true); }
      renderRelationshipActions(row);
    }
    if (window.MedGlobalLeague && typeof window.MedGlobalLeague.reload === 'function') {
      // Do not refetch the board just to render the profile; current row data is already authoritative.
    }
  }

  async function handleFriendAction(action, targetId, requestId) {
    let successMessage = '';
    try {
      if (action === 'add') {
        await sendRequest(activePublicProfile || { userId: targetId, name: 'Student' });
        successMessage = 'Friend request successfully sent. এখন request pending আছে; চাইলে Cancel করতে পারবেন।';
      } else if (action === 'remove') {
        if (!window.confirm('এই student-কে Friends থেকে remove করবেন?')) return;
        await removeFriend(targetId);
        successMessage = 'Friend removed successfully. চাইলে আবার Friend Request পাঠাতে পারবেন।';
      } else if (action === 'accept') {
        await acceptRequest(requestId);
        successMessage = 'Friend request accepted successfully. এখন student আপনার Friends list-এ আছে।';
      } else if (action === 'reject') {
        await rejectRequest(requestId);
        successMessage = 'Friend request rejected.';
      } else if (action === 'cancel') {
        await cancelRequest(requestId);
        successMessage = 'Friend request cancelled successfully. এখন চাইলে আবার পাঠাতে পারবেন।';
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
      await loadConnections(true);
      if (activePublicProfile) renderRelationshipActions(activePublicProfile);
      if (window.MedGlobalLeague && typeof window.MedGlobalLeague.refreshFriendDirectory === 'function') window.MedGlobalLeague.refreshFriendDirectory();
      if (window.MedGlobalLeague && typeof window.MedGlobalLeague.reload === 'function') await window.MedGlobalLeague.reload();
      renderRequestPanel(document.querySelector('[data-leaderboard-period="friends"]')?.getAttribute('aria-selected') === 'true');
      if (successMessage) {
        setStatus(successMessage, false);
        setFriendPanelStatus(successMessage, false);
      }
    } catch (error) {
      setStatus(errorMessage(error), true);
      setFriendPanelStatus(errorMessage(error), true);
    }
  }

  document.addEventListener('click', async event => {
    const profileAction = event.target.closest?.('[data-student-friend-action]');
    if (profileAction) {
      event.preventDefault();
      event.stopPropagation();
      await handleFriendAction(profileAction.dataset.studentFriendAction, activePublicProfile?.userId, profileAction.dataset.requestId);
      return;
    }
    const requestAction = event.target.closest?.('[data-friend-action]');
    if (requestAction) {
      event.preventDefault();
      event.stopPropagation();
      await handleFriendAction(requestAction.dataset.friendAction, requestAction.dataset.targetId || '', requestAction.dataset.requestId);
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

  window.MedStudentFriends = Object.freeze({
    loadConnections,
    getLastConnectionError: () => lastFriendError,
    getFriendIds,
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
  window.MedStudentProfile = Object.freeze({ open: openStudentProfile });

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
