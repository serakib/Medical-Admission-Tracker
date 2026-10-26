import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

(() => {
  'use strict';
  const app = window.app;
  if (!app || app.__leaderboardExperienceInstalled) return;
  app.__leaderboardExperienceInstalled = true;

  const REQUESTS = 'studentFriendRequests';
  const FRIENDSHIPS = 'studentFriendships';
  let acceptedFriendIds = new Set();
  let incomingRequests = [];
  let outgoingRequests = [];
  let lastConnectionLoad = 0;
  let connectionLoadPromise = null;
  let activePublicProfile = null;
  let lastFriendError = '';

  const safeText = (value, max = 180) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt = value => Math.max(0, Number(value) || 0).toLocaleString();
  const userId = () => String(app.authUser?.uid || '');
  const db = () => app.firestore || null;
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
    const message = String(error?.message || error || '');
    if (/permission|insufficient/i.test(message)) {
      return 'Friends sync-এর Firestore permission নেই। Firebase Console-এর Firestore Rules-এ studentFriendRequests ও studentFriendships collection-এর নিরাপদ access rule যোগ করতে হবে।';
    }
    return 'Friends sync হয়নি। নেটওয়ার্ক বা Firebase permission পরীক্ষা করে আবার চেষ্টা করুন।';
  };
  const pairId = (a, b) => [String(a), String(b)].sort().map(encodeURIComponent).join('__');
  const canManageFriends = () => !!userId() && !!db();

  async function loadConnections(force = false) {
    if (!canManageFriends()) {
      acceptedFriendIds = new Set();
      incomingRequests = [];
      outgoingRequests = [];
      lastConnectionLoad = Date.now();
      return { friendIds: [], incoming: [], outgoing: [] };
    }
    if (!force && connectionLoadPromise) return connectionLoadPromise;
    if (!force && Date.now() - lastConnectionLoad < 4000) {
      return { friendIds: Array.from(acceptedFriendIds), incoming: incomingRequests, outgoing: outgoingRequests };
    }
    const uid = userId();
    connectionLoadPromise = (async () => {
      try {
        const database = db();
        const [friendsA, friendsB, incomingSnap, outgoingSnap] = await Promise.all([
          getDocs(query(collection(database, FRIENDSHIPS), where('userA', '==', uid))),
          getDocs(query(collection(database, FRIENDSHIPS), where('userB', '==', uid))),
          getDocs(query(collection(database, REQUESTS), where('toUid', '==', uid))),
          getDocs(query(collection(database, REQUESTS), where('fromUid', '==', uid)))
        ]);
        const friendSet = new Set();
        [friendsA, friendsB].forEach(snap => snap.forEach(item => {
          const data = item.data();
          if (data.status !== 'accepted') return;
          const friendId = String(data.userA) === uid ? String(data.userB) : String(data.userA);
          if (friendId && friendId !== uid) friendSet.add(friendId);
        }));
        acceptedFriendIds = friendSet;
        incomingRequests = [];
        incomingSnap.forEach(item => {
          const data = item.data();
          if (data.status === 'pending') incomingRequests.push({ id: item.id, ...data });
        });
        outgoingRequests = [];
        outgoingSnap.forEach(item => {
          const data = item.data();
          if (data.status === 'pending') outgoingRequests.push({ id: item.id, ...data });
        });
        lastConnectionLoad = Date.now();
        lastFriendError = '';
        renderRequestPanel(document.querySelector('[data-leaderboard-period="friends"]')?.getAttribute('aria-selected') === 'true');
        if (activePublicProfile) renderRelationshipActions(activePublicProfile);
        return { friendIds: Array.from(acceptedFriendIds), incoming: incomingRequests, outgoing: outgoingRequests };
      } catch (error) {
        lastFriendError = errorMessage(error);
        console.warn('[Friends] Connection data could not be loaded:', error);
        renderRequestPanel(document.querySelector('[data-leaderboard-period="friends"]')?.getAttribute('aria-selected') === 'true');
        if (activePublicProfile) renderRelationshipActions(activePublicProfile);
        throw error;
      } finally {
        connectionLoadPromise = null;
      }
    })();
    return connectionLoadPromise;
  }

  function getFriendIds() {
    return Array.from(acceptedFriendIds);
  }
  function getRelationship(targetId) {
    const uid = userId();
    const id = String(targetId || '');
    if (!id) return 'unknown';
    if (uid && uid === id) return 'self';
    if (acceptedFriendIds.has(id)) return 'friends';
    if (incomingRequests.some(request => String(request.fromUid) === id)) return 'incoming';
    if (outgoingRequests.some(request => String(request.toUid) === id)) return 'outgoing';
    return 'none';
  }
  async function sendRequest(target) {
    if (!canManageFriends()) throw new Error('Friend request পাঠাতে registered account-এ login করুন।');
    const uid = userId();
    const targetId = String(target?.userId || target?.uid || '');
    if (!targetId || uid === targetId) throw new Error('নিজের account-এ friend request পাঠানো যাবে না।');
    await loadConnections(true);
    const relation = getRelationship(targetId);
    if (relation === 'friends') throw new Error('এই student ইতিমধ্যে আপনার friend।');
    if (relation === 'incoming') throw new Error('এই student-এর request আগে থেকেই এসেছে। Accept বা Reject করুন।');
    if (relation === 'outgoing') throw new Error('Friend request ইতিমধ্যে পাঠানো হয়েছে।');
    await addDoc(collection(db(), REQUESTS), {
      fromUid: uid,
      toUid: targetId,
      fromName: safeText(app.profile?.name || app.authUser?.displayName || 'Student', 80),
      fromCollege: safeText(app.profile?.college || '', 120),
      fromBatch: safeText(app.profile?.batch || app.profile?.class || '', 40),
      toName: safeText(target.name || 'Student', 80),
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await loadConnections(true);
    return true;
  }
  async function acceptRequest(requestId) {
    if (!canManageFriends()) throw new Error('Friend request গ্রহণ করতে registered account-এ login করুন।');
    const request = incomingRequests.find(item => item.id === String(requestId));
    if (!request) { await loadConnections(true); throw new Error('এই request আর pending নেই।'); }
    const uid = userId();
    const other = String(request.fromUid || '');
    if (!other || other === uid) throw new Error('Friend request-টি সঠিক নয়।');
    const database = db();
    const batch = writeBatch(database);
    batch.set(doc(database, FRIENDSHIPS, pairId(uid, other)), {
      userA: [uid, other].sort()[0],
      userB: [uid, other].sort()[1],
      status: 'accepted',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    batch.update(doc(database, REQUESTS, String(requestId)), { status: 'accepted', updatedAt: serverTimestamp() });
    await batch.commit();
    await loadConnections(true);
    return true;
  }
  async function rejectRequest(requestId) {
    if (!canManageFriends()) throw new Error('Friend request পরিচালনা করতে registered account-এ login করুন।');
    await updateDoc(doc(db(), REQUESTS, String(requestId)), { status: 'rejected', updatedAt: serverTimestamp() });
    await loadConnections(true);
    return true;
  }
  async function cancelRequest(requestId) {
    if (!canManageFriends()) throw new Error('Friend request পরিচালনা করতে registered account-এ login করুন।');
    await updateDoc(doc(db(), REQUESTS, String(requestId)), { status: 'cancelled', updatedAt: serverTimestamp() });
    await loadConnections(true);
    return true;
  }
  async function removeFriend(targetId) {
    if (!canManageFriends()) throw new Error('Friend remove করতে registered account-এ login করুন।');
    const uid = userId(), other = String(targetId || '');
    if (!other || !acceptedFriendIds.has(other)) throw new Error('এই student এখন আপনার friend নয়।');
    await deleteDoc(doc(db(), FRIENDSHIPS, pairId(uid, other)));
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
      list.innerHTML = '<div class="mat-profile-empty">Friends ও request sync করতে আপনার registered account-এ login করুন। Guest account-এ All Time ও Weekly leaderboard ব্যবহার করা যাবে।</div>';
      return;
    }
    if (lastFriendError) {
      list.innerHTML = '<div class="mat-profile-empty">' + escapeHTML(lastFriendError) + '</div>';
      return;
    }
    const incomingMarkup = incomingRequests.map(request =>
      '<div class="mat-friends-request"><div class="min-w-0"><strong>' + escapeHTML(request.fromName || 'Student') + '</strong><small>' + escapeHTML([request.fromCollege, request.fromBatch].filter(Boolean).join(' · ') || 'Friend request') + '</small></div><div class="mat-profile-actions"><button type="button" class="primary" data-friend-action="accept" data-request-id="' + escapeHTML(request.id) + '">Accept</button><button type="button" data-friend-action="reject" data-request-id="' + escapeHTML(request.id) + '">Reject</button></div></div>'
    ).join('');
    const outgoingMarkup = outgoingRequests.map(request =>
      '<div class="mat-friends-request"><div class="min-w-0"><strong>' + escapeHTML(request.toName || 'Student') + '</strong><small>Request sent · pending</small></div><div class="mat-profile-actions"><button type="button" data-friend-action="cancel" data-request-id="' + escapeHTML(request.id) + '">Cancel</button></div></div>'
    ).join('');
    list.innerHTML = (incomingMarkup || outgoingMarkup)
      ? (incomingMarkup || '') + (outgoingMarkup ? '<div class="mt-4"><h4 class="text-xs font-extrabold text-gray-500 dark:text-gray-400 mb-2">SENT REQUESTS</h4>' + outgoingMarkup + '</div>' : '')
      : '<div class="mat-profile-empty">এখন কোনো pending friend request নেই। Student-এর profile খুলে Add Friend চাপলে request পাঠানো যাবে।</div>';
  }

  function avatarMarkup(profile) {
    const avatar = safeText(profile?.avatar || '', 500);
    if (/^https:\/\//i.test(avatar)) return '<img src="' + escapeHTML(avatar) + '" alt="" loading="lazy">';
    if (avatar && avatar.length <= 12 && !/[<>]/.test(avatar)) return escapeHTML(avatar);
    return '<i class="fa-solid fa-user-graduate" aria-hidden="true"></i>';
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
      host.innerHTML = '<button type="button" data-student-friend-action="login"><i class="fa-solid fa-user-lock ml-1" aria-hidden="true"></i> Login to Add Friend</button>';
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
      host.innerHTML = '<button type="button" class="primary" data-student-friend-action="add"><i class="fa-solid fa-user-plus ml-1" aria-hidden="true"></i> Add Friend</button>';
    }
  }

  async function openStudentProfile(row) {
    if (!row) return;
    activePublicProfile = row;
    const view = document.getElementById('view-student-profile');
    const name = safeText(row.name || 'Medical Student', 80);
    const college = safeText(row.college || '', 120);
    const batch = safeText(row.batch || '', 40);
    const currentRank = safeText(row.rank || '—', 50);
    const avatar = document.getElementById('student-profile-avatar');
    const avatarMarkupHTML = avatarMarkup(row);
    if (avatar) {
      avatar.innerHTML = avatarMarkupHTML;
      avatar.classList.toggle('has-image', /^\s*<img/i.test(avatarMarkupHTML));
    }
    const write = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    write('student-profile-name', name);
    write('student-profile-college-batch', [college, batch].filter(Boolean).join(' · ') || 'College ও Batch এখনো যোগ করা হয়নি');
    write('student-profile-rank-level', currentRank + ' · Level ' + Math.max(1, Number(row.level) || 1));
    write('student-profile-xp', fmt(row.xp) + ' XP');
    write('student-profile-total-rp', fmt(row.totalRP) + ' RP');
    write('student-profile-weekly-rp', fmt(row.weeklyRankPoints) + ' RP');
    write('student-profile-current-rp', fmt(row.rankPoints) + ' RP');
    write('student-profile-level', 'Lv. ' + Math.max(1, Number(row.level) || 1));
    write('student-profile-exams', Number.isFinite(Number(row.quizzes)) && Number(row.quizzes) > 0 ? fmt(row.quizzes) : '—');
    write('student-profile-accuracy', Number(row.accuracy) > 0 ? Number(row.accuracy).toFixed(1) + '%' : '—');
    write('student-profile-rank', currentRank);
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
    try {
      if (action === 'add') {
        await sendRequest(activePublicProfile || { userId: targetId, name: 'Student' });
        setStatus('Friend request পাঠানো হয়েছে।', false);
      } else if (action === 'remove') {
        if (!window.confirm('এই student-কে Friends থেকে remove করবেন?')) return;
        await removeFriend(targetId);
        setStatus('Friend remove করা হয়েছে।', false);
      } else if (action === 'accept') {
        await acceptRequest(requestId);
        setStatus('Friend request accepted।', false);
      } else if (action === 'reject') {
        await rejectRequest(requestId);
        setStatus('Friend request rejected।', false);
      } else if (action === 'cancel') {
        await cancelRequest(requestId);
        setStatus('Friend request cancelled।', false);
      } else if (action === 'edit-profile') {
        app.openAccountProfile();
        return;
      } else if (action === 'login') {
        if (typeof app.openAccountAuth === 'function') app.openAccountAuth('login');
        else if (typeof app.openAuthModal === 'function') app.openAuthModal('login');
        else if (typeof window.redirectToLogin === 'function') window.redirectToLogin();
        return;
      }
      if (activePublicProfile) renderRelationshipActions(activePublicProfile);
      if (window.MedGlobalLeague && typeof window.MedGlobalLeague.reload === 'function') await window.MedGlobalLeague.reload();
      renderRequestPanel(document.querySelector('[data-leaderboard-period="friends"]')?.getAttribute('aria-selected') === 'true');
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
      await handleFriendAction(requestAction.dataset.friendAction, '', requestAction.dataset.requestId);
    }
  });
  document.addEventListener('student-auth-state-resolved', () => {
    acceptedFriendIds = new Set();
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
    getFriendIds,
    getRelationship,
    renderRequestPanel,
    sendRequest,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    removeFriend
  });
  window.MedStudentProfile = Object.freeze({ open: openStudentProfile });

  const oldShowView = app.showView.bind(app);
  app.showView = function(viewName, force) {
    const result = oldShowView(viewName, force);
    if (viewName === 'leaderboard') {
      loadConnections().catch(() => {});
      if (window.MedGlobalLeague && typeof window.MedGlobalLeague.reload === 'function') window.MedGlobalLeague.reload();
    }
    return result;
  };
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
