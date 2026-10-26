/**
 * Medical Admission Tracker — standalone Google Apps Script backend.
 *
 * Uses two existing Google spreadsheets:
 *   1) Students: account/profile + current Medical XP/RP/rank
 *   2) ExamAttempts: exam history + persistent leaderboard-activity queue
 *
 * Deployment: configure the required Script Properties, run setupBackend(), then
 * deploy a new Web App version. The site uses Firebase ID tokens for registered
 * users and guestToken for guest sessions.
 */

const MAT_CONFIG = Object.freeze({
  PROFILE_SPREADSHEET_ID: '1KGTY-CrbIPNlcxu_5E6yWRUaiwNMlibkDG_5boswmSg',
  EXAM_SPREADSHEET_ID: '19tbpEbzHO-iO8cmG-Ad_tcPvx3c0W3Mw_3UjyyLc3GE',
  PROFILE_TAB: 'Students',
  EXAM_TAB: 'ExamAttempts',
  TIME_ZONE: 'Asia/Dhaka',
  ACTIVITY_DAILY_LIMIT: 20,
  LEADERBOARD_SIZE: 100,
  TOP_ACTIVITY_SIZE: 10,
  TRIGGER_MINUTES: 5,
  WEEKLY_DEMOTION_HOUR: 1
});

const MAT_STUDENT_HEADERS = [
  'UserID', 'Name', 'AccountType', 'Email', 'College', 'Batch', 'Avatar',
  'XP', 'RP', 'TotalRP', 'Level', 'Rank', 'CreatedAt', 'UpdatedAt',
  'SignupTelegramSent', 'GuestTokenHash', 'LastSeenAt', 'LastError', 'LastRewardAttemptID',
  'LastWeeklyDemotionWeek'
];

// Exam records and queued activity notifications share this one tab to keep
// the backend to two spreadsheets and two principal tabs.
const MAT_FRIENDS_TAB = 'StudentFriends';
const MAT_FRIEND_HEADERS = [
  'RecordID', 'RecordType', 'UserA', 'UserB', 'FromUserID', 'ToUserID',
  'FromName', 'FromCollege', 'FromBatch', 'ToName', 'Status', 'CreatedAt', 'UpdatedAt'
];

const MAT_EXAM_HEADERS = [
  'RecordType', 'AttemptID', 'UserID', 'ExamMode', 'TotalQuestions', 'Correct',
  'Wrong', 'Score', 'XPEarned', 'RPEarned', 'RankBefore', 'RankAfter',
  'SubmittedAt', 'ActivityID', 'ActivityCreatedAt', 'ActivityMessage',
  'NotificationStatus', 'SentAt', 'RetryCount', 'LastError', 'RewardStatus'
];

// Keep server rank progression aligned with the existing Achievement Vault trophy order.
// Every named tier has V, IV, III, II, I sub-ranks; Immortal is the final tier.
const MAT_RANKS = Object.freeze([
  'Bronze V', 'Bronze IV', 'Bronze III', 'Bronze II', 'Bronze I',
  'Silver V', 'Silver IV', 'Silver III', 'Silver II', 'Silver I',
  'Gold V', 'Gold IV', 'Gold III', 'Gold II', 'Gold I',
  'Platinum V', 'Platinum IV', 'Platinum III', 'Platinum II', 'Platinum I',
  'Emerald V', 'Emerald IV', 'Emerald III', 'Emerald II', 'Emerald I',
  'Diamond V', 'Diamond IV', 'Diamond III', 'Diamond II', 'Diamond I',
  'Master V', 'Master IV', 'Master III', 'Master II', 'Master I',
  'Grandmaster V', 'Grandmaster IV', 'Grandmaster III', 'Grandmaster II', 'Grandmaster I',
  'Legend V', 'Legend IV', 'Legend III', 'Legend II', 'Legend I',
  'Mythic V', 'Mythic IV', 'Mythic III', 'Mythic II', 'Mythic I',
  'Immortal'
]);

const MAT_TOP10_PROPERTY = 'MAT_TOP10_ALLTIME_SNAPSHOT_V1';
const MAT_WEEKLY_DEMOTION_PROPERTY = 'MAT_WEEKLY_DEMOTION_PROCESSED_WEEK_V1';
const MAT_LOCK_WAIT_MS = 20000;

/* ------------------------------ Web entry points ------------------------------ */

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || 'health');
    if (action === 'health') return matJson_({ success: true, service: 'Medical Admission Tracker API', status: 'ok' });
    if (action === 'leaderboard' || action === 'getLeaderboard') {
      return matJson_(matGetLeaderboard_(String((e.parameter && e.parameter.period) || 'all-time'), String((e.parameter && e.parameter.ids) || ''), String((e.parameter && e.parameter.includeIds) || '')));
    }
    return matJson_({ success: false, error: 'Use POST for this action.' });
  } catch (err) {
    return matJson_({ success: false, error: matErrorText_(err) });
  }
}

function doPost(e) {
  let payload = {};
  try {
    const raw = e && e.postData && e.postData.contents;
    if (raw) payload = JSON.parse(raw);
    else if (e && e.parameter) payload = e.parameter;
    const action = String(payload.action || '').trim();
    return matJson_(matDispatch_(action, payload));
  } catch (err) {
    return matJson_({ success: false, error: matErrorText_(err) });
  }
}

function matDispatch_(action, p) {
  switch (action) {
    case 'health':
      return { success: true, service: 'Medical Admission Tracker API', status: 'ok' };
    case 'setupBackend':
      // This action intentionally does not run over the public API.
      throw new Error('Run setupBackend() manually from the Apps Script editor.');
    case 'createGuest':
    case 'guestCreate':
      return matCreateGuest_(p || {});
    case 'registerUser':
    case 'signup':
    case 'login':
      return matRegisterUser_(p || {});
    case 'profile':
    case 'getProfile':
      return matGetProfile_(p || {});
    case 'updateProfile':
    case 'saveProfile':
      return matUpdateProfile_(p || {});
    case 'leaderboard':
    case 'getLeaderboard':
      return matGetLeaderboard_(String((p && p.period) || 'all-time'), p && p.userIds);
    case 'friendConnections':
      return matFriendConnections_(p || {});
    case 'sendFriendRequest':
      return matSendFriendRequest_(p || {});
    case 'acceptFriendRequest':
      return matResolveFriendRequest_(p || {}, 'accepted');
    case 'rejectFriendRequest':
      return matResolveFriendRequest_(p || {}, 'rejected');
    case 'cancelFriendRequest':
      return matResolveFriendRequest_(p || {}, 'cancelled');
    case 'removeFriend':
      return matRemoveFriend_(p || {});
    case 'submitExam':
    case 'recordExam':
    case 'gameEnd': // compatibility action name only; uses Medical-only rewards.
      return matSubmitExam_(p || {});
    case 'processPendingActivityNotifications':
      throw new Error('This action is trigger-only and cannot be called through the public API.');
    default:
      throw new Error('Unknown action.');
  }
}

/* --------------------------- One-time initial setup --------------------------- */

/**
 * Run this function ONCE manually from Apps Script.
 * It checks the two provided spreadsheets, adds missing headers without clearing
 * existing cells, seeds the Top-10 baseline, and installs the notification and
 * weekly rank-demotion triggers. It never clears existing rows.
 */
function setupBackend() {
  const studentsSheet = matGetStudentsSheet_();
  const examsSheet = matGetExamSheet_();
  const friendsSheet = matGetFriendsSheet_();
  matInitializeTop10Snapshot_();

  const triggers = ScriptApp.getProjectTriggers();
  const hasQueueTrigger = triggers.some(function (t) {
    return t.getHandlerFunction() === 'processPendingActivityNotifications';
  });
  if (!hasQueueTrigger) {
    ScriptApp.newTrigger('processPendingActivityNotifications')
      .timeBased()
      .everyMinutes(MAT_CONFIG.TRIGGER_MINUTES)
      .create();
  }
  const hasWeeklyDemotionTrigger = triggers.some(function (t) {
    return t.getHandlerFunction() === 'processWeeklyRankDemotions';
  });
  if (!hasWeeklyDemotionTrigger) {
    ScriptApp.newTrigger('processWeeklyRankDemotions')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.MONDAY)
      .atHour(MAT_CONFIG.WEEKLY_DEMOTION_HOUR)
      .inTimezone(MAT_CONFIG.TIME_ZONE)
      .create();
  }

  const result = {
    success: true,
    message: 'Backend initialized. Review the execution log and then deploy as a Web app.',
    studentsSpreadsheet: MAT_CONFIG.PROFILE_SPREADSHEET_ID,
    studentsTab: studentsSheet.getName(),
    examsSpreadsheet: MAT_CONFIG.EXAM_SPREADSHEET_ID,
    examsTab: examsSheet.getName(),
    friendsTab: friendsSheet.getName(),
    notificationLimit: MAT_CONFIG.ACTIVITY_DAILY_LIMIT,
    activityQueue: 'Persistent FIFO queue stored in ExamAttempts rows',
    weeklyDemotion: 'Runs every Monday at about 01:00 Asia/Dhaka; one subrank maximum per student'
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/** Time-driven trigger target. Do not rename without updating setupBackend(). */
function processPendingActivityNotifications() {
  return matDrainActivityQueue_();
}

/**
 * Weekly rank review, scheduled for Monday around 01:00 Asia/Dhaka.
 * It evaluates the completed Monday-to-Monday week, applies at most one
 * subrank demotion, resets only current RP for demoted users, and never reduces
 * lifetime TotalRP. Per-user markers make interrupted runs safely repeatable.
 */
function processWeeklyRankDemotions() {
  const lock = LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  try {
    const currentWeekStart = matWeekStartKey_();
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty(MAT_WEEKLY_DEMOTION_PROPERTY) === currentWeekStart) {
      return { success: true, skipped: true, weekStart: currentWeekStart, message: 'Weekly review already completed.' };
    }

    const previousWeekStart = matOffsetDateKey_(currentWeekStart, -7);
    const weeklyRPByUser = matGetWeeklyRPByUser_(previousWeekStart, currentWeekStart);
    const sheet = matGetStudentsSheet_();
    const students = matReadObjects_(sheet);
    const now = matNowIso_();
    let processed = 0;
    let demoted = 0;
    let safe = 0;
    let lowestRank = 0;
    let maximumRank = 0;
    let alreadyProcessed = 0;

    students.forEach(function (student) {
      const uid = String(student.UserID || '');
      if (!uid || !student._rowNumber) return;
      if (String(student.LastWeeklyDemotionWeek || '') === currentWeekStart) {
        alreadyProcessed += 1;
        return;
      }
      const normalized = matNormaliseStudent_(student);
      const rankIndex = MAT_RANKS.indexOf(String(normalized.Rank || MAT_RANKS[0]));
      const weeklyRP = Math.max(0, matFiniteNumber_(weeklyRPByUser[uid], 0));
      const update = { LastWeeklyDemotionWeek: currentWeekStart, UpdatedAt: now };
      processed += 1;

      // Immortal has no next trophy to protect against; Bronze V has no lower rank.
      if (rankIndex <= 0) {
        lowestRank += 1;
      } else if (rankIndex >= MAT_RANKS.length - 1) {
        maximumRank += 1;
      } else {
        const nextTrophyRequirement = matRankPromotionCost_(rankIndex);
        const safeZoneThreshold = Math.ceil(nextTrophyRequirement * 0.30);
        if (weeklyRP < safeZoneThreshold) {
          update.Rank = MAT_RANKS[rankIndex - 1];
          update.RP = 0;
          update.LastError = '';
          demoted += 1;
        } else {
          safe += 1;
        }
      }
      matUpdateObjectRow_(sheet, student._rowNumber, update);
    });

    props.setProperty(MAT_WEEKLY_DEMOTION_PROPERTY, currentWeekStart);
    return {
      success: true,
      weekReviewed: previousWeekStart,
      weekStart: currentWeekStart,
      processed: processed,
      demoted: demoted,
      safe: safe,
      lowestRankProtected: lowestRank,
      immortalProtected: maximumRank,
      alreadyProcessed: alreadyProcessed,
      message: 'Weekly Safe Zone review completed. Demotions are limited to one subrank and lifetime TotalRP is unchanged.'
    };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------- Guest accounts ------------------------------- */

function matCreateGuest_(p) {
  // Reuse the current Guest if its persisted token was provided.
  const providedToken = String(p.guestToken || '').trim();
  if (providedToken) {
    const existing = matFindGuestByToken_(providedToken);
    if (existing) {
      matUpdateLastSeen_(existing);
      return { success: true, user: matPublicProfile_(existing, true), guestToken: providedToken, existing: true };
    }
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  let created;
  try {
    const now = matNowIso_();
    const guestToken = Utilities.getUuid() + '-' + Utilities.getUuid();
    const guestId = 'guest_' + Utilities.getUuid().replace(/-/g, '').toLowerCase();
    const randomNumber = Math.floor(1000 + Math.random() * 9000);
    const guest = {
      UserID: guestId,
      Name: 'Guest Student ' + randomNumber,
      AccountType: 'GUEST',
      Email: '',
      College: '',
      Batch: '',
      Avatar: '',
      XP: 0,
      RP: 0,
      TotalRP: 0,
      Level: 1,
      Rank: MAT_RANKS[0],
      CreatedAt: now,
      UpdatedAt: now,
      SignupTelegramSent: 'NOT_APPLICABLE',
      GuestTokenHash: matSha256_(guestToken),
      LastSeenAt: now,
      LastError: ''
    };
    const sheet = matGetStudentsSheet_();
    matAppendObject_(sheet, guest);
    created = { guest: guest, token: guestToken };
    matInitializeTop10Snapshot_();
  } finally {
    lock.releaseLock();
  }
  return {
    success: true,
    user: matPublicProfile_(created.guest, true),
    guestToken: created.token,
    existing: false
  };
}

function matFindGuestByToken_(token) {
  if (!token) return null;
  const hash = matSha256_(token);
  const rows = matReadObjects_(matGetStudentsSheet_());
  const row = rows.find(function (r) {
    return String(r.AccountType || '').toUpperCase() === 'GUEST' &&
      String(r.GuestTokenHash || '') === hash;
  });
  return row || null;
}

/* ------------------------- Firebase and student profiles ------------------------ */

function matRegisterUser_(p) {
  const idToken = String(p.idToken || p.firebaseIdToken || '').trim();
  if (!idToken) throw new Error('Firebase ID token is required for a registered account.');
  const firebaseUser = matVerifyFirebaseIdToken_(idToken);
  const userId = String(firebaseUser.localId || '');
  if (!userId) throw new Error('Firebase identity could not be verified.');

  const lock = LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  let user;
  let isNew = false;
  let shouldRetrySignupAlert = false;
  try {
    const sheet = matGetStudentsSheet_();
    user = matFindStudentById_(userId);
    if (!user) {
      const now = matNowIso_();
      const email = String(firebaseUser.email || '').trim().slice(0, 180);
      const displayName = String(p.name || firebaseUser.displayName || '').trim();
      const safeDefault = email ? email.split('@')[0] : ('Medical Student ' + userId.slice(-4));
      const created = {
        UserID: userId,
        Name: matSheetSafeText_(matCleanText_(displayName || safeDefault, 80)),
        AccountType: 'REGISTERED',
        Email: email,
        College: matSheetSafeText_(matCleanText_(p.college || '', 120)),
        Batch: matSheetSafeText_(matCleanText_(p.batch || '', 40)),
        Avatar: matSheetSafeText_(matCleanText_(p.avatar || '', 500)),
        XP: 0,
        RP: 0,
        TotalRP: 0,
        Level: 1,
        Rank: MAT_RANKS[0],
        CreatedAt: now,
        UpdatedAt: now,
        SignupTelegramSent: 'PENDING',
        GuestTokenHash: '',
        LastSeenAt: now,
        LastError: ''
      };
      matAppendObject_(sheet, created);
      user = matFindStudentById_(userId);
      isNew = true;
      shouldRetrySignupAlert = true;
      matInitializeTop10Snapshot_();
    } else {
      // Refresh only trusted identity metadata; never overwrite reward/rank fields
      // with values sent from the browser.
      const update = { LastSeenAt: matNowIso_(), UpdatedAt: matNowIso_() };
      if (firebaseUser.email) update.Email = String(firebaseUser.email).trim().slice(0, 180);
      matUpdateObjectRow_(matGetStudentsSheet_(), user._rowNumber, update);
      user = matFindStudentById_(userId);
      const status = String(user.SignupTelegramSent || '').toUpperCase();
      shouldRetrySignupAlert = status === 'PENDING' || status === 'FAILED';
    }
  } finally {
    lock.releaseLock();
  }

  // Signup notification is deliberately outside the activity daily limit.
  if (shouldRetrySignupAlert) matSendSignupNotification_(userId);
  user = matFindStudentById_(userId) || user;
  return {
    success: true,
    created: isNew,
    user: matPublicProfile_(user, true),
    message: isNew ? 'Registered profile created.' : 'Profile loaded.'
  };
}

function matVerifyFirebaseIdToken_(idToken) {
  const apiKey = matScriptProperty_('FIREBASE_API_KEY');
  if (!apiKey) throw new Error('Script Property FIREBASE_API_KEY is not configured.');
  const url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(apiKey);
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ idToken: idToken }),
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  let body = {};
  try { body = JSON.parse(response.getContentText() || '{}'); } catch (_) {}
  if (status < 200 || status >= 300 || !body.users || !body.users.length) {
    throw new Error('Firebase token validation failed. Please sign in again.');
  }
  const user = body.users[0];
  if (!user.localId || user.disabled === true) throw new Error('Firebase account is invalid or disabled.');
  return user;
}

function matAuthenticate_(p) {
  p = p || {};
  const guestToken = String(p.guestToken || '').trim();
  if (guestToken) {
    const guest = matFindGuestByToken_(guestToken);
    if (!guest) throw new Error('Guest session expired or invalid. Create a new Guest session.');
    return guest;
  }
  const idToken = String(p.idToken || p.firebaseIdToken || '').trim();
  if (idToken) {
    const firebaseUser = matVerifyFirebaseIdToken_(idToken);
    const user = matFindStudentById_(String(firebaseUser.localId || ''));
    if (!user) throw new Error('Registered profile not found. Call registerUser once after login.');
    matUpdateLastSeen_(user);
    return matFindStudentById_(user.UserID) || user;
  }
  throw new Error('Authentication required: send Firebase idToken or guestToken.');
}

function matGetProfile_(p) {
  const user = matAuthenticate_(p);
  return { success: true, user: matPublicProfile_(user, true) };
}

function matUpdateProfile_(p) {
  const user = matAuthenticate_(p);
  const allowed = ['name', 'college', 'batch', 'avatar'];
  const update = { UpdatedAt: matNowIso_(), LastSeenAt: matNowIso_() };
  if (Object.prototype.hasOwnProperty.call(p, 'name')) {
    const value = matCleanText_(p.name, 80);
    if (value.length < 2) throw new Error('Name must contain at least 2 characters.');
    update.Name = matSheetSafeText_(value);
  }
  if (Object.prototype.hasOwnProperty.call(p, 'college')) update.College = matSheetSafeText_(matCleanText_(p.college, 120));
  if (Object.prototype.hasOwnProperty.call(p, 'batch')) update.Batch = matSheetSafeText_(matCleanText_(p.batch, 40));
  if (Object.prototype.hasOwnProperty.call(p, 'avatar')) {
    const avatar = String(p.avatar == null ? '' : p.avatar).trim();
    if (avatar.length > 20000) throw new Error('Avatar image is too large to sync. Choose a smaller avatar image.');
    if (avatar && !/^https:\/\//i.test(avatar) && !/^data:image\/(?:webp|png);base64,[A-Za-z0-9+/=]+$/i.test(avatar) && !/^data:image\/svg\+xml;charset=utf-8,%3Csvg/i.test(avatar)) {
      throw new Error('Unsupported avatar image source. Choose an existing avatar or upload a supported image.');
    }
    update.Avatar = matSheetSafeText_(avatar);
  }
  if (!allowed.some(function (key) { return Object.prototype.hasOwnProperty.call(p, key); })) {
    throw new Error('No editable profile fields were supplied.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  try {
    const fresh = matFindStudentById_(user.UserID);
    if (!fresh) throw new Error('Student profile not found.');
    matUpdateObjectRow_(matGetStudentsSheet_(), fresh._rowNumber, update);
  } finally {
    lock.releaseLock();
  }
  return { success: true, user: matPublicProfile_(matFindStudentById_(user.UserID), true) };
}

function matSendSignupNotification_(userId) {
  // Claim the notification so concurrent login requests do not send duplicates.
  const lock = LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  let user;
  try {
    user = matFindStudentById_(userId);
    if (!user) return false;
    const status = String(user.SignupTelegramSent || '').toUpperCase();
    if (status === 'SENT' || status === 'NOT_APPLICABLE') return status === 'SENT';
    if (status === 'SENDING') {
      const marker = String(user.LastError || '');
      const stamp = marker.indexOf('SIGNUP_SENDING_AT:') === 0 ? marker.slice('SIGNUP_SENDING_AT:'.length) : '';
      const started = stamp ? new Date(stamp).getTime() : 0;
      if (started && Date.now() - started < 10 * 60 * 1000) return false;
      // Recover a stale in-progress status after an Apps Script execution stopped.
    }
    matUpdateObjectRow_(matGetStudentsSheet_(), user._rowNumber, {
      SignupTelegramSent: 'SENDING', UpdatedAt: matNowIso_(), LastError: 'SIGNUP_SENDING_AT:' + matNowIso_()
    });
  } finally {
    lock.releaseLock();
  }

  let succeeded = false;
  let errorText = '';
  try {
    const message = [
      '🎓 Medical Admission Tracker — New registered user',
      'Name: ' + (user.Name || 'Unknown'),
      'Email: ' + (user.Email || 'Not provided'),
      'College: ' + (user.College || 'Not provided'),
      'Batch: ' + (user.Batch || 'Not provided'),
      'User ID: ' + user.UserID,
      'Created: ' + matFormatTime_(user.CreatedAt || matNowIso_()),
      'Account: REGISTERED'
    ].join('\n');
    matTelegramSend_(message); // No activity daily limit applies here.
    succeeded = true;
  } catch (err) {
    errorText = matErrorText_(err).slice(0, 450);
  }

  const finishLock = LockService.getScriptLock();
  finishLock.waitLock(MAT_LOCK_WAIT_MS);
  try {
    const latest = matFindStudentById_(userId);
    if (latest) matUpdateObjectRow_(matGetStudentsSheet_(), latest._rowNumber, {
      SignupTelegramSent: succeeded ? 'SENT' : 'PENDING',
      UpdatedAt: matNowIso_(),
      LastError: succeeded ? '' : errorText
    });
  } finally {
    finishLock.releaseLock();
  }
  return succeeded;
}

function matUpdateLastSeen_(user) {
  if (!user || !user._rowNumber) return;
  matUpdateObjectRow_(matGetStudentsSheet_(), user._rowNumber, { LastSeenAt: matNowIso_() });
}

/* ------------------------------ Exam submission ------------------------------- */

function matSubmitExam_(p) {
  const authenticatedUser = matAuthenticate_(p);
  const attemptId = matCleanText_(p.attemptId || p.AttemptID || p.gameId || '', 160);
  if (!attemptId) throw new Error('A unique attemptId is required.');

  const lock = LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  let result;
  try {
    const examSheet = matGetExamSheet_();
    let existing = matFindExamByAttempt_(attemptId);

    if (existing && String(existing.UserID) !== String(authenticatedUser.UserID)) {
      throw new Error('This attempt ID is already linked to another user.');
    }

    if (existing) {
      if (String(existing.RewardStatus || '').toUpperCase() === 'PROCESSING') {
        // Recover an interrupted prior request instead of granting twice or losing it.
        result = matFinalizeProcessingExam_(existing);
      } else {
        const current = matFindStudentById_(authenticatedUser.UserID) || authenticatedUser;
        result = {
          success: true,
          duplicate: true,
          attemptId: attemptId,
          xpGained: Number(existing.XPEarned || 0),
          rankPointsDelta: Number(existing.RPEarned || 0),
          user: matApiUser_(current),
          message: 'Duplicate attempt ignored; rewards were not added again.'
        };
      }
    } else {
      // Recover any interrupted attempt for this account before accepting a newer one.
      const pendingForUser = matReadObjects_(examSheet).filter(function (r) {
        return matIsExamRecord_(r) && String(r.UserID || '') === String(authenticatedUser.UserID) &&
          String(r.RewardStatus || '').toUpperCase() === 'PROCESSING';
      }).sort(function (a, b) { return String(a.SubmittedAt || '').localeCompare(String(b.SubmittedAt || '')); });
      pendingForUser.forEach(function (pending) { matFinalizeProcessingExam_(pending); });

      const correct = matSafeNonNegativeInt_(p.correctCount != null ? p.correctCount : (p.correctCatches != null ? p.correctCatches : p.correct), 'correctCount');
      const wrong = matSafeNonNegativeInt_(p.wrongCount != null ? p.wrongCount : (p.wrongCatches != null ? p.wrongCatches : p.wrong), 'wrongCount');
      const total = matSafeNonNegativeInt_(p.totalQuestions != null ? p.totalQuestions : (p.total != null ? p.total : (p.catches != null ? p.catches : correct + wrong)), 'totalQuestions');
      if (total < 1) throw new Error('totalQuestions must be at least 1.');
      if (correct + wrong > total) throw new Error('Correct + wrong cannot exceed totalQuestions.');
      if (total > 1000) throw new Error('totalQuestions exceeds the allowed limit.');
      const score = matFiniteNumber_(p.score != null ? p.score : p.quizPoints, 0);
      const examMode = matCleanText_(p.examMode || p.mode || 'Exam', 60) || 'Exam';
      const answered = correct + wrong;
      const accuracy = answered ? correct / answered : 0;

      // Medical-only rewards. Never accept XP/RP amounts supplied by the browser.
      // Note: correctness counts still need trusted answer-key grading in the backend
      // if the product requires tamper-resistant competitive ranking.
      const xpEarned = Math.max(5, Math.round(5 + correct * 2 + accuracy * 10));
      const rpEarned = Math.max(1, Math.round(accuracy * 25 + Math.min(correct, 100) * 0.05));
      const freshUser = matFindStudentById_(authenticatedUser.UserID);
      if (!freshUser) throw new Error('Student profile not found.');
      const rankBefore = String(freshUser.Rank || MAT_RANKS[0]);
      const rankPreview = matApplyRankProgress_(rankBefore, Math.max(0, matFiniteNumber_(freshUser.RP, 0)), rpEarned);
      const now = matNowIso_();

      // Write an idempotency record FIRST. If execution stops later, the next request
      // resumes this row and checks LastRewardAttemptID before applying rewards again.
      matAppendObject_(examSheet, {
        RecordType: 'EXAM',
        AttemptID: attemptId,
        UserID: authenticatedUser.UserID,
        ExamMode: examMode,
        TotalQuestions: total,
        Correct: correct,
        Wrong: wrong,
        Score: score,
        XPEarned: xpEarned,
        RPEarned: rpEarned,
        RankBefore: rankBefore,
        RankAfter: rankPreview.rank,
        SubmittedAt: now,
        RewardStatus: 'PROCESSING'
      });
      existing = matFindExamByAttempt_(attemptId);
      result = matFinalizeProcessingExam_(existing);
    }
  } finally {
    lock.releaseLock();
  }

  // Send what fits in today's allowance. Unsent activity stays queued in the sheet.
  try { matDrainActivityQueue_(); } catch (err) { Logger.log('Activity queue will retry: ' + matErrorText_(err)); }
  return result;
}

/** Completes a logged PROCESSING exam and safely recovers interrupted executions. */
function matFinalizeProcessingExam_(attempt) {
  if (!attempt || !attempt._rowNumber) throw new Error('Pending exam record was not found.');
  const attemptId = String(attempt.AttemptID || '');
  const userId = String(attempt.UserID || '');
  if (!attemptId || !userId) throw new Error('Pending exam record is incomplete.');

  const current = matFindStudentById_(userId);
  if (!current) throw new Error('Student profile not found while recovering exam.');
  const alreadyApplied = String(current.LastRewardAttemptID || '') === attemptId;
  const oldSnapshot = matGetTop10Snapshot_();
  let rankBefore = String(attempt.RankBefore || current.Rank || MAT_RANKS[0]);
  let rankAfter = String(attempt.RankAfter || rankBefore);

  if (!alreadyApplied) {
    const xpEarned = Math.max(0, matFiniteNumber_(attempt.XPEarned, 0));
    const rpEarned = Math.max(0, matFiniteNumber_(attempt.RPEarned, 0));
    const currentRank = String(current.Rank || MAT_RANKS[0]);
    rankBefore = currentRank;
    const rankResult = matApplyRankProgress_(currentRank, Math.max(0, matFiniteNumber_(current.RP, 0)), rpEarned);
    rankAfter = rankResult.rank;
    const currentXP = Math.max(0, matFiniteNumber_(current.XP, 0));
    const lifetimeRP = Math.max(Math.max(0, matFiniteNumber_(current.RP, 0)), matFiniteNumber_(current.TotalRP, matFiniteNumber_(current.RP, 0)));
    matUpdateObjectRow_(matGetStudentsSheet_(), current._rowNumber, {
      XP: currentXP + xpEarned,
      RP: rankResult.rp,
      TotalRP: lifetimeRP + rpEarned,
      Level: matGetLevel_(currentXP + xpEarned),
      Rank: rankAfter,
      UpdatedAt: matNowIso_(),
      LastSeenAt: matNowIso_(),
      LastError: '',
      LastRewardAttemptID: attemptId
    });
  }

  // Generate activity IDs deterministically from attempt + user to avoid duplicate
  // queue entries if an execution stopped after enqueueing but before committing.
  const newSnapshot = matBuildTop10_();
  matEnqueueTop10Changes_(oldSnapshot, newSnapshot, String(attempt.SubmittedAt || matNowIso_()), attemptId);
  matSaveTop10Snapshot_(newSnapshot);
  matUpdateObjectRow_(matGetExamSheet_(), attempt._rowNumber, {
    RewardStatus: 'COMMITTED',
    RankBefore: rankBefore,
    RankAfter: rankAfter,
    LastError: ''
  });

  const latest = matFindStudentById_(userId) || current;
  return {
    success: true,
    duplicate: alreadyApplied,
    attemptId: attemptId,
    xpGained: Math.max(0, matFiniteNumber_(attempt.XPEarned, 0)),
    rankPointsDelta: Math.max(0, matFiniteNumber_(attempt.RPEarned, 0)),
    rankChanged: rankBefore !== rankAfter,
    rankBefore: rankBefore,
    rankAfter: rankAfter,
    totalRP: matNormaliseStudent_(latest).TotalRP,
    user: matApiUser_(latest),
    message: alreadyApplied ? 'Recovered previously applied reward without adding it twice.' : 'Medical exam reward saved.'
  };
}

function matRankPromotionCost_(rankIndex) {
  if (rankIndex < 0 || rankIndex >= MAT_RANKS.length - 1) return 0;
  // Mirrors the existing Achievement Vault: first promotion costs 200 RP;
  // later subranks scale by 20%, rounded to the nearest 5 RP.
  const step = rankIndex + 1;
  const base = step * 200;
  const requirement = step === 1 ? base : base * 1.2;
  return Math.max(5, Math.round(requirement / 5) * 5);
}

function matRankSafeZoneThreshold_(rankIndex) {
  if (rankIndex < 0 || rankIndex >= MAT_RANKS.length - 1) return 0;
  return Math.ceil(matRankPromotionCost_(rankIndex) * 0.30);
}

function matApplyRankProgress_(rank, currentRP, earnedRP) {
  let index = MAT_RANKS.indexOf(String(rank || ''));
  if (index < 0) index = 0;
  let rp = Math.max(0, matFiniteNumber_(currentRP, 0)) + Math.max(0, matFiniteNumber_(earnedRP, 0));
  const before = MAT_RANKS[index];
  while (index < MAT_RANKS.length - 1 && rp >= matRankPromotionCost_(index)) {
    rp -= matRankPromotionCost_(index);
    index += 1;
  }
  // Immortal is the final trophy; lifetime TotalRP is stored separately and never reset.
  return { rank: MAT_RANKS[index], rp: rp, before: before };
}

function matGetLevel_(xp) {
  // Simple educational progression: one level per 100 accumulated Medical XP.
  return Math.max(1, Math.floor(Math.max(0, Number(xp) || 0) / 100) + 1);
}

/* -------------------------- Leaderboard and Top 10 ---------------------------- */

function matGetLeaderboard_(period, userIds, includeUserIds) {
  const safePeriod = String(period || 'all-time').toLowerCase() === 'weekly' ? 'weekly' : 'all-time';
  const requestedIds = Array.isArray(userIds)
    ? userIds.map(function (id) { return String(id || '').trim(); }).filter(Boolean)
    : String(userIds || '').split(',').map(function (id) { return String(id || '').trim(); }).filter(Boolean);
  const requestedIdSet = new Set(requestedIds);
  const includeIds = Array.isArray(includeUserIds)
    ? includeUserIds.map(function (id) { return String(id || '').trim(); }).filter(Boolean)
    : String(includeUserIds || '').split(',').map(function (id) { return String(id || '').trim(); }).filter(Boolean);
  const includeIdSet = new Set(includeIds);
  const allStudents = matReadObjects_(matGetStudentsSheet_()).map(matNormaliseStudent_);
  const students = requestedIdSet.size ? allStudents.filter(function (s) { return requestedIdSet.has(s.UserID); }) : allStudents;
  // Include current-week RP in every profile payload, even on All Time/Friends tabs.
  const weeklyByUser = matGetWeeklyRPByUser_();
  const examStatsByUser = matGetExamStatsByUser_();
  const rows = students.map(function (s) {
    const weeklyRP = Number(weeklyByUser[s.UserID] || 0);
    const examStats = examStatsByUser[s.UserID] || { matches: 0, correct: 0, wrong: 0, accuracy: 0 };
    return {
      userId: s.UserID,
      playerId: s.UserID,
      uid: s.UserID,
      username: s.Name || 'Medical Student',
      name: s.Name || 'Medical Student',
      accountType: s.AccountType || 'GUEST',
      college: s.College || '',
      batch: s.Batch || '',
      avatar: s.Avatar || '',
      xp: Number(s.XP || 0),
      level: Number(s.Level || 1),
      rank: s.Rank || MAT_RANKS[0],
      rankPoints: Number(s.RP || 0),
      rp: Number(s.RP || 0),
      totalRP: Number(s.TotalRP || 0),
      weeklyRP: weeklyRP,
      weeklyRankPoints: weeklyRP,
      rankScore: safePeriod === 'weekly' ? weeklyRP : Number(s.TotalRP || 0),
      score: safePeriod === 'weekly' ? weeklyRP : Number(s.TotalRP || 0),
      matches: Number(examStats.matches || 0),
      completedExams: Number(examStats.matches || 0),
      correctCount: Number(examStats.correct || 0),
      wrongCount: Number(examStats.wrong || 0),
      accuracy: Number(examStats.accuracy || 0),
      streak: Number(examStats.streak || 0)
    };
  });
  rows.sort(function (a, b) {
    const primaryA = safePeriod === 'weekly' ? a.weeklyRP : a.totalRP;
    const primaryB = safePeriod === 'weekly' ? b.weeklyRP : b.totalRP;
    return primaryB - primaryA || b.xp - a.xp || String(a.name).localeCompare(String(b.name));
  });
  // Preserve true global position before adding an out-of-top-100 current user.
  rows.forEach(function (r, i) { r.position = i + 1; });
  // A Friends request supplies exact account IDs; return all requested friends,
  // even if they are outside the global top-100 leaderboard window.
  let visibleRows;
  if (requestedIdSet.size) {
    // The Friends endpoint intentionally returns only its requested IDs.
    visibleRows = rows.slice(0, requestedIdSet.size);
  } else if (includeIdSet.size) {
    // For All Time and Weekly, keep the global top list and always include the
    // requesting student's own row, even if they are outside the global top 100.
    const visibleIds = new Set(rows.slice(0, MAT_CONFIG.LEADERBOARD_SIZE).map(function (r) { return String(r.userId); }));
    includeIdSet.forEach(function (id) { visibleIds.add(id); });
    visibleRows = rows.filter(function (r) { return visibleIds.has(String(r.userId)); });
  } else {
    visibleRows = rows.slice(0, MAT_CONFIG.LEADERBOARD_SIZE);
  }
  const limited = visibleRows;
  const response = {
    success: true,
    period: safePeriod,
    scope: safePeriod,
    weekly: safePeriod === 'weekly',
    weekStart: matWeekStartKey_(),
    entries: limited,
    users: limited
  };
  if (safePeriod === 'weekly') response.weeklyEntries = limited;
  return response;
}

function matGetWeeklyRPByUser_(startInclusive, endExclusive) {
  const weekStart = String(startInclusive || matWeekStartKey_());
  const weekEnd = String(endExclusive || '');
  const exams = matReadObjects_(matGetExamSheet_());
  const totals = {};
  exams.forEach(function (r) {
    if (!matIsExamRecord_(r)) return;
    const dateKey = matDateKey_(r.SubmittedAt);
    if (!dateKey || dateKey < weekStart || (weekEnd && dateKey >= weekEnd)) return;
    const uid = String(r.UserID || '');
    if (!uid) return;
    totals[uid] = (totals[uid] || 0) + Math.max(0, matFiniteNumber_(r.RPEarned, 0));
  });
  return totals;
}

function matGetExamStatsByUser_() {
  const totals = {};
  matReadObjects_(matGetExamSheet_()).forEach(function (record) {
    if (!matIsExamRecord_(record)) return;
    const status = String(record.RewardStatus || '').toUpperCase();
    if (status && status !== 'COMMITTED') return;
    const uid = String(record.UserID || '');
    if (!uid) return;
    if (!totals[uid]) totals[uid] = { matches: 0, correct: 0, wrong: 0, accuracy: 0, dates: {} };
    const stat = totals[uid];
    stat.matches += 1;
    stat.correct += Math.max(0, matFiniteNumber_(record.Correct, 0));
    stat.wrong += Math.max(0, matFiniteNumber_(record.Wrong, 0));
    const dateKey = matDateKey_(record.SubmittedAt);
    if (dateKey) stat.dates[dateKey] = true;
  });
  const today = matDateKey_(matNowIso_());
  const yesterday = matOffsetDateKey_(today, -1);
  Object.keys(totals).forEach(function (uid) {
    const stat = totals[uid];
    const answered = stat.correct + stat.wrong;
    stat.accuracy = answered ? Math.round((stat.correct / answered) * 1000) / 10 : 0;
    // A day counts once even if the student takes multiple exams that day.
    // A streak remains active through today or yesterday, using Dhaka-local dates.
    const dates = stat.dates || {};
    const latest = Object.keys(dates).sort().pop() || '';
    let cursor = latest && (latest === today || latest === yesterday) ? latest : '';
    let streak = 0;
    while (cursor && dates[cursor]) {
      streak += 1;
      cursor = matOffsetDateKey_(cursor, -1);
    }
    stat.streak = streak;
    delete stat.dates;
  });
  return totals;
}

function matBuildTop10_() {
  const rows = matReadObjects_(matGetStudentsSheet_()).map(matNormaliseStudent_);
  rows.sort(function (a, b) {
    return Number(b.TotalRP || 0) - Number(a.TotalRP || 0) ||
      Number(b.XP || 0) - Number(a.XP || 0) ||
      String(a.Name || '').localeCompare(String(b.Name || ''));
  });
  return rows.slice(0, MAT_CONFIG.TOP_ACTIVITY_SIZE).map(function (r, i) {
    return {
      userId: String(r.UserID),
      name: String(r.Name || 'Medical Student'),
      totalRP: Number(r.TotalRP || 0),
      rank: String(r.Rank || MAT_RANKS[0]),
      position: i + 1
    };
  });
}

function matInitializeTop10Snapshot_() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty(MAT_TOP10_PROPERTY)) matSaveTop10Snapshot_(matBuildTop10_());
}

function matGetTop10Snapshot_() {
  const raw = PropertiesService.getScriptProperties().getProperty(MAT_TOP10_PROPERTY);
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    } catch (_) {}
  }
  const baseline = matBuildTop10_();
  matSaveTop10Snapshot_(baseline);
  return baseline;
}

function matSaveTop10Snapshot_(snapshot) {
  PropertiesService.getScriptProperties().setProperty(MAT_TOP10_PROPERTY, JSON.stringify(snapshot || []));
}

function matEnqueueTop10Changes_(oldRows, newRows, eventTime, sourceAttemptId) {
  const oldList = Array.isArray(oldRows) ? oldRows : [];
  const newList = Array.isArray(newRows) ? newRows : [];
  const oldMap = {};
  const newMap = {};
  oldList.forEach(function (r) { oldMap[String(r.userId)] = r; });
  newList.forEach(function (r) { newMap[String(r.userId)] = r; });
  const events = [];

  newList.forEach(function (current) {
    const id = String(current.userId);
    const previous = oldMap[id];
    if (!previous) {
      events.push({
        userId: id,
        message: '🏆 Medical Top 10: ' + current.name + ' entered at #' + current.position +
          ' with ' + current.totalRP + ' lifetime RP. Event time: ' + matFormatTime_(eventTime) + '.'
      });
      return;
    }
    if (current.position >= previous.position) return;

    const crossed = oldList.filter(function (other) {
      if (String(other.userId) === id || Number(other.position) >= Number(previous.position)) return false;
      const theirNew = newMap[String(other.userId)];
      return !theirNew || Number(theirNew.position) > Number(current.position);
    }).map(function (other) {
      const theirNew = newMap[String(other.userId)];
      const gap = Number(current.totalRP || 0) - Number(other.totalRP || 0);
      return other.name + ' (now ' + (theirNew ? '#' + theirNew.position : 'outside Top 10') +
        ', gap ' + gap + ' RP)';
    });

    const message = crossed.length
      ? '📊 Medical leaderboard activity: ' + current.name + ' climbed #' + previous.position +
        ' → #' + current.position + ' and passed ' + crossed.join('; ') +
        '. Event time: ' + matFormatTime_(eventTime) + '.'
      : '📈 Medical leaderboard activity: ' + current.name + ' climbed #' + previous.position +
        ' → #' + current.position + ' (' + current.totalRP + ' lifetime RP). Event time: ' + matFormatTime_(eventTime) + '.';
    events.push({ userId: id, message: message });
  });

  if (!events.length) return;
  const sheet = matGetExamSheet_();
  const source = String(sourceAttemptId || eventTime || 'unknown-event');
  const existingIds = new Set(matReadObjects_(sheet).filter(function (r) {
    return String(r.RecordType || '').toUpperCase() === 'ACTIVITY';
  }).map(function (r) { return String(r.ActivityID || ''); }));
  events.forEach(function (event) {
    const activityId = source + ':TOP10:' + event.userId;
    if (existingIds.has(activityId)) return;
    matAppendObject_(sheet, {
      RecordType: 'ACTIVITY',
      ActivityID: activityId,
      ActivityCreatedAt: eventTime,
      ActivityMessage: event.message,
      NotificationStatus: 'PENDING',
      SentAt: '',
      RetryCount: 0,
      LastError: ''
    });
    existingIds.add(activityId);
  });
}

/* -------------------------- Persistent FIFO notifications --------------------- */

function matDrainActivityQueue_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { sent: 0, remaining: 'queued' };
  let sent = 0;
  try {
    const sheet = matGetExamSheet_();
    const all = matReadObjects_(sheet);
    const today = matDateKey_(matNowIso_());
    let sentToday = all.filter(function (r) {
      return String(r.RecordType || '').toUpperCase() === 'ACTIVITY' &&
        String(r.NotificationStatus || '').toUpperCase() === 'SENT' &&
        matDateKey_(r.SentAt) === today;
    }).length;

    // FIFO by the original activity timestamp; no pending notification expires.
    const pending = all.filter(function (r) {
      return String(r.RecordType || '').toUpperCase() === 'ACTIVITY' &&
        String(r.NotificationStatus || '').toUpperCase() !== 'SENT';
    }).sort(function (a, b) {
      return String(a.ActivityCreatedAt || '').localeCompare(String(b.ActivityCreatedAt || '')) ||
        String(a.ActivityID || '').localeCompare(String(b.ActivityID || ''));
    });

    for (let i = 0; i < pending.length && sentToday < MAT_CONFIG.ACTIVITY_DAILY_LIMIT; i++) {
      const item = pending[i];
      const rowStatus = String(item.NotificationStatus || '').toUpperCase();
      if (rowStatus === 'SENDING') {
        const marker = String(item.LastError || '');
        const stamp = marker.indexOf('SENDING_AT:') === 0 ? marker.slice('SENDING_AT:'.length) : '';
        const started = stamp ? new Date(stamp).getTime() : 0;
        if (started && Date.now() - started < 10 * 60 * 1000) break; // Preserve FIFO while a send may still be running.
        // Recover a stale claim after a timed-out/terminated Apps Script execution.
      }
      matUpdateObjectRow_(sheet, item._rowNumber, {
        NotificationStatus: 'SENDING',
        LastError: 'SENDING_AT:' + matNowIso_()
      });
      try {
        matTelegramSend_(String(item.ActivityMessage || 'Medical leaderboard activity'));
        matUpdateObjectRow_(sheet, item._rowNumber, {
          NotificationStatus: 'SENT',
          SentAt: matNowIso_(),
          RetryCount: Math.max(0, matFiniteNumber_(item.RetryCount, 0)),
          LastError: ''
        });
        sent += 1;
        sentToday += 1;
      } catch (err) {
        matUpdateObjectRow_(sheet, item._rowNumber, {
          NotificationStatus: 'PENDING',
          RetryCount: Math.max(0, matFiniteNumber_(item.RetryCount, 0)) + 1,
          LastError: matErrorText_(err).slice(0, 450)
        });
        // Preserve FIFO: don't pass a failed older notification to send a newer one.
        break;
      }
    }

    const nowRows = matReadObjects_(sheet);
    const remaining = nowRows.filter(function (r) {
      return String(r.RecordType || '').toUpperCase() === 'ACTIVITY' &&
        String(r.NotificationStatus || '').toUpperCase() !== 'SENT';
    }).length;
    return { sent: sent, sentToday: sentToday, dailyLimit: MAT_CONFIG.ACTIVITY_DAILY_LIMIT, pending: remaining };
  } finally {
    lock.releaseLock();
  }
}

function matTelegramSend_(message) {
  const botToken = matScriptProperty_('TELEGRAM_BOT_TOKEN');
  const chatId = matScriptProperty_('TELEGRAM_OWNER_CHAT_ID');
  if (!botToken || !chatId) throw new Error('Set TELEGRAM_BOT_TOKEN and TELEGRAM_OWNER_CHAT_ID in Script Properties.');
  const url = 'https://api.telegram.org/bot' + botToken + '/sendMessage';
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: String(message || '').slice(0, 3900), disable_web_page_preview: true }),
    muteHttpExceptions: true
  });
  let body = {};
  try { body = JSON.parse(response.getContentText() || '{}'); } catch (_) {}
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || body.ok !== true) {
    throw new Error('Telegram send failed: ' + String(body.description || response.getResponseCode()));
  }
  return body;
}


/* -------------------------- Google Sheets friendships -------------------------- */
function matFriendAuthenticate_(p) {
  // Firebase users and persistent Google Sheets guest sessions can both use Friends.
  // matAuthenticate_ validates the Firebase ID token or the unguessable guest token
  // and returns only the account represented by that credential.
  return matAuthenticate_(p || {});
}

function matFriendRows_() {
  return matReadObjects_(matGetFriendsSheet_());
}

function matFriendPublicRequest_(row, incoming) {
  return {
    id: String(row.RecordID || ''),
    fromUid: String(row.FromUserID || ''),
    toUid: String(row.ToUserID || ''),
    fromName: String(row.FromName || 'Student'),
    fromCollege: String(row.FromCollege || ''),
    fromBatch: String(row.FromBatch || ''),
    toName: String(row.ToName || 'Student'),
    status: String(row.Status || 'pending'),
    direction: incoming ? 'incoming' : 'outgoing',
    createdAt: String(row.CreatedAt || '')
  };
}

function matFriendConnections_(p) {
  const user = matFriendAuthenticate_(p);
  const uid = String(user.UserID);
  const rows = matFriendRows_();
  const friendIds = new Set();
  const incoming = [];
  const outgoing = [];
  rows.forEach(function (row) {
    const kind = String(row.RecordType || '').toUpperCase();
    const status = String(row.Status || '').toLowerCase();
    if (kind === 'FRIENDSHIP' && status === 'accepted') {
      const a = String(row.UserA || ''), b = String(row.UserB || '');
      if (a === uid && b) friendIds.add(b);
      else if (b === uid && a) friendIds.add(a);
    }
    if (kind !== 'REQUEST' || status !== 'pending') return;
    if (String(row.ToUserID || '') === uid) incoming.push(matFriendPublicRequest_(row, true));
    if (String(row.FromUserID || '') === uid) outgoing.push(matFriendPublicRequest_(row, false));
  });
  return { success: true, friendIds: Array.from(friendIds), incoming: incoming, outgoing: outgoing };
}

function matSendFriendRequest_(p) {
  const user = matFriendAuthenticate_(p);
  const uid = String(user.UserID);
  const targetId = String(p.targetUserId || '').trim();
  if (!targetId || targetId === uid) throw new Error('নিজের account-এ friend request পাঠানো যাবে না।');
  const target = matFindStudentById_(targetId);
  if (!target) {
    throw new Error('এই student-কে পাওয়া যায়নি। আবার search করে চেষ্টা করুন।');
  }
  // Guest profiles are valid targets too; do not allow sending to an unknown ID.
  // Existing-request and self-request checks below still prevent duplicates and self-links.
  const lock = LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  try {
    const rows = matFriendRows_();
    const relation = rows.find(function (r) {
      const status = String(r.Status || '').toLowerCase();
      if (status !== 'pending' && status !== 'accepted') return false;
      const kind = String(r.RecordType || '').toUpperCase();
      if (kind === 'FRIENDSHIP') return status === 'accepted' &&
        [String(r.UserA), String(r.UserB)].includes(uid) &&
        [String(r.UserA), String(r.UserB)].includes(targetId);
      if (kind === 'REQUEST') return (String(r.FromUserID) === uid && String(r.ToUserID) === targetId) ||
        (String(r.FromUserID) === targetId && String(r.ToUserID) === uid);
      return false;
    });
    if (relation) {
      const kind = String(relation.RecordType || '').toUpperCase();
      if (kind === 'FRIENDSHIP') throw new Error('এই student ইতিমধ্যে আপনার friend।');
      if (String(relation.FromUserID) === targetId) throw new Error('এই student-এর request আগে থেকেই এসেছে। Accept বা Reject করুন।');
      throw new Error('Friend request ইতিমধ্যে পাঠানো হয়েছে।');
    }
    const now = matNowIso_();
    matAppendObject_(matGetFriendsSheet_(), {
      RecordID: Utilities.getUuid(),
      RecordType: 'REQUEST',
      FromUserID: uid,
      ToUserID: targetId,
      FromName: matSheetSafeText_(matCleanText_(user.Name || 'Student', 80)),
      FromCollege: matSheetSafeText_(matCleanText_(user.College || '', 120)),
      FromBatch: matSheetSafeText_(matCleanText_(user.Batch || '', 40)),
      ToName: matSheetSafeText_(matCleanText_(target.Name || 'Student', 80)),
      Status: 'pending',
      CreatedAt: now,
      UpdatedAt: now
    });
  } finally {
    lock.releaseLock();
  }
  return matFriendConnections_(p);
}

function matResolveFriendRequest_(p, nextStatus) {
  const user = matFriendAuthenticate_(p);
  const uid = String(user.UserID);
  const requestId = String(p.requestId || '').trim();
  if (!requestId) throw new Error('Friend request ID প্রয়োজন।');
  const lock = LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  try {
    const sheet = matGetFriendsSheet_();
    const rows = matReadObjects_(sheet);
    const request = rows.find(function (r) {
      return String(r.RecordID || '') === requestId &&
        String(r.RecordType || '').toUpperCase() === 'REQUEST' &&
        String(r.Status || '').toLowerCase() === 'pending';
    });
    if (!request) throw new Error('এই request আর pending নেই।');
    const from = String(request.FromUserID || ''), to = String(request.ToUserID || '');
    if (nextStatus === 'accepted') {
      if (to !== uid) throw new Error('শুধু request পাওয়া student এটি accept করতে পারবেন।');
      if (!from || from === uid) throw new Error('Friend request-টি সঠিক নয়।');
      const existing = rows.some(function (r) {
        return String(r.RecordType || '').toUpperCase() === 'FRIENDSHIP' &&
          String(r.Status || '').toLowerCase() === 'accepted' &&
          [String(r.UserA), String(r.UserB)].includes(uid) &&
          [String(r.UserA), String(r.UserB)].includes(from);
      });
      if (!existing) {
        const pair = [uid, from].sort();
        matAppendObject_(sheet, {
          RecordID: Utilities.getUuid(), RecordType: 'FRIENDSHIP',
          UserA: pair[0], UserB: pair[1], Status: 'accepted',
          CreatedAt: matNowIso_(), UpdatedAt: matNowIso_()
        });
      }
    } else if (nextStatus === 'rejected' && to !== uid) {
      throw new Error('শুধু request পাওয়া student এটি reject করতে পারবেন।');
    } else if (nextStatus === 'cancelled' && from !== uid) {
      throw new Error('শুধু request পাঠানো student এটি cancel করতে পারবেন।');
    }
    matUpdateObjectRow_(sheet, request._rowNumber, { Status: nextStatus, UpdatedAt: matNowIso_() });
  } finally {
    lock.releaseLock();
  }
  return matFriendConnections_(p);
}

function matRemoveFriend_(p) {
  const user = matFriendAuthenticate_(p);
  const uid = String(user.UserID);
  const targetId = String(p.targetUserId || '').trim();
  if (!targetId || targetId === uid) throw new Error('Friend ID সঠিক নয়।');
  const lock = LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  try {
    const sheet = matGetFriendsSheet_();
    const rows = matReadObjects_(sheet);
    let removed = false;
    rows.forEach(function (row) {
      if (String(row.RecordType || '').toUpperCase() !== 'FRIENDSHIP' ||
          String(row.Status || '').toLowerCase() !== 'accepted') return;
      const a = String(row.UserA || ''), b = String(row.UserB || '');
      if ((a === uid && b === targetId) || (b === uid && a === targetId)) {
        matUpdateObjectRow_(sheet, row._rowNumber, { Status: 'removed', UpdatedAt: matNowIso_() });
        removed = true;
      }
    });
    if (!removed) throw new Error('এই student এখন আপনার friend নয়।');
  } finally {
    lock.releaseLock();
  }
  return matFriendConnections_(p);
}

/* ---------------------------- Spreadsheet helpers ---------------------------- */

function matGetStudentsSheet_() {
  return matEnsureSheet_(MAT_CONFIG.PROFILE_SPREADSHEET_ID, MAT_CONFIG.PROFILE_TAB,
    MAT_STUDENT_HEADERS, ['UserID', 'Name']);
}

function matGetFriendsSheet_() {
  return matEnsureSheet_(MAT_CONFIG.PROFILE_SPREADSHEET_ID, MAT_FRIENDS_TAB,
    MAT_FRIEND_HEADERS, ['RecordID', 'RecordType']);
}

function matGetExamSheet_() {
  return matEnsureSheet_(MAT_CONFIG.EXAM_SPREADSHEET_ID, MAT_CONFIG.EXAM_TAB,
    MAT_EXAM_HEADERS, ['AttemptID', 'UserID']);
}

function matEnsureSheet_(spreadsheetId, desiredName, requiredHeaders, identityHeaders) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheets = ss.getSheets();
  let sheet = ss.getSheetByName(desiredName);

  // If the user already made the columns on Sheet1, reuse that sheet by headers.
  if (!sheet) {
    sheet = sheets.find(function (candidate) {
      const lastCol = candidate.getLastColumn();
      if (!lastCol) return false;
      const headers = candidate.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(function (x) { return String(x).trim(); });
      return identityHeaders.every(function (h) { return headers.indexOf(h) !== -1; });
    }) || null;
  }

  // Rename only a truly blank sole default tab. Never overwrite an unfamiliar sheet.
  if (!sheet) {
    const blank = sheets.find(function (candidate) { return candidate.getLastRow() === 0 && candidate.getLastColumn() === 0; });
    if (blank && sheets.length === 1) {
      blank.setName(desiredName);
      sheet = blank;
    } else {
      sheet = ss.insertSheet(desiredName);
    }
  }

  let lastCol = sheet.getLastColumn();
  let headers = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(function (x) { return String(x).trim(); })
    : [];
  while (headers.length && !headers[headers.length - 1]) headers.pop();

  if (!headers.length) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  const missing = requiredHeaders.filter(function (h) { return headers.indexOf(h) === -1; });
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function matHeaders_(sheet) {
  const width = sheet.getLastColumn();
  if (!width) throw new Error('Missing header row in sheet ' + sheet.getName());
  return sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(function (h) { return String(h).trim(); });
}

function matReadObjects_(sheet) {
  const lastRow = sheet.getLastRow();
  const headers = matHeaders_(sheet);
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(function (row, i) {
    const obj = { _rowNumber: i + 2 };
    headers.forEach(function (header, j) { if (header) obj[header] = row[j]; });
    return obj;
  }).filter(function (obj) {
    return headers.some(function (header) { return header && obj[header] !== '' && obj[header] != null; });
  });
}

function matAppendObject_(sheet, obj) {
  const headers = matHeaders_(sheet);
  const row = headers.map(function (header) {
    return Object.prototype.hasOwnProperty.call(obj, header) ? obj[header] : '';
  });
  const rowNumber = sheet.getLastRow() + 1;
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
  return rowNumber;
}

function matUpdateObjectRow_(sheet, rowNumber, obj) {
  if (!rowNumber || rowNumber < 2) throw new Error('Invalid spreadsheet row.');
  const headers = matHeaders_(sheet);
  const range = sheet.getRange(rowNumber, 1, 1, headers.length);
  const values = range.getValues()[0];
  headers.forEach(function (header, i) {
    if (header && Object.prototype.hasOwnProperty.call(obj, header)) values[i] = obj[header];
  });
  range.setValues([values]);
}

function matFindStudentById_(userId) {
  const target = String(userId || '');
  return matReadObjects_(matGetStudentsSheet_()).find(function (r) {
    return String(r.UserID || '') === target;
  }) || null;
}

function matFindExamByAttempt_(attemptId) {
  const target = String(attemptId || '');
  return matReadObjects_(matGetExamSheet_()).find(function (r) {
    return matIsExamRecord_(r) && String(r.AttemptID || '') === target;
  }) || null;
}

function matNormaliseStudent_(r) {
  const row = Object.assign({}, r || {});
  row.UserID = String(row.UserID || '');
  row.Name = String(row.Name || (String(row.AccountType).toUpperCase() === 'GUEST' ? 'Guest Student' : 'Medical Student'));
  row.XP = Math.max(0, matFiniteNumber_(row.XP, 0));
  row.RP = Math.max(0, matFiniteNumber_(row.RP, 0));
  row.TotalRP = Math.max(row.RP, matFiniteNumber_(row.TotalRP, row.RP));
  row.Level = Math.max(1, matFiniteNumber_(row.Level, matGetLevel_(row.XP)));
  if (MAT_RANKS.indexOf(String(row.Rank || '')) === -1) row.Rank = MAT_RANKS[0];
  return row;
}

function matPublicProfile_(r, includeEmail) {
  const s = matNormaliseStudent_(r);
  const result = {
    userId: s.UserID,
    uid: s.UserID,
    playerId: s.UserID,
    name: s.Name,
    username: s.Name,
    accountType: String(s.AccountType || 'GUEST'),
    college: String(s.College || ''),
    batch: String(s.Batch || ''),
    avatar: String(s.Avatar || ''),
    xp: s.XP,
    rankPoints: s.RP,
    rp: s.RP,
    totalRP: s.TotalRP,
    level: s.Level,
    rank: s.Rank,
    createdAt: String(s.CreatedAt || ''),
    updatedAt: String(s.UpdatedAt || '')
  };
  if (includeEmail) result.email = String(s.Email || '');
  return result;
}

function matApiUser_(r) {
  return matPublicProfile_(r, false);
}

/* -------------------------------- Small helpers ------------------------------- */

function matScriptProperty_(key) {
  return String(PropertiesService.getScriptProperties().getProperty(key) || '').trim();
}

function matJson_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function matSha256_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function matNowIso_() {
  return new Date().toISOString();
}

function matFormatTime_(value) {
  const d = value instanceof Date ? value : new Date(value || Date.now());
  if (isNaN(d.getTime())) return String(value || 'Unknown time');
  return Utilities.formatDate(d, MAT_CONFIG.TIME_ZONE, 'yyyy-MM-dd HH:mm:ss') + ' (Asia/Dhaka)';
}

function matDateKey_(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, MAT_CONFIG.TIME_ZONE, 'yyyy-MM-dd');
}

function matWeekStartKey_() {
  const today = matDateKey_(matNowIso_());
  const parts = today.split('-').map(Number);
  const utc = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const weekday = utc.getUTCDay(); // Sunday=0
  const daysSinceMonday = (weekday + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - daysSinceMonday);
  return Utilities.formatDate(utc, 'UTC', 'yyyy-MM-dd');
}

function matOffsetDateKey_(dateKey, offsetDays) {
  const parts = String(dateKey || '').split('-').map(Number);
  if (parts.length !== 3 || !parts.every(Number.isFinite)) throw new Error('Invalid date key for weekly review.');
  const utc = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  utc.setUTCDate(utc.getUTCDate() + Number(offsetDays || 0));
  return Utilities.formatDate(utc, 'UTC', 'yyyy-MM-dd');
}

function matSafeNonNegativeInt_(value, label) {
  const n = Number(value == null || value === '' ? 0 : value);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) throw new Error(label + ' must be a non-negative integer.');
  return n;
}

function matFiniteNumber_(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : (fallback == null ? 0 : fallback);
}

function matCleanText_(value, maxLength) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength || 120);
}

function matSheetSafeText_(value) {
  const text = String(value == null ? '' : value);
  return /^[=+@-]/.test(text) ? "'" + text : text;
}

function matIsExamRecord_(r) {
  const kind = String(r.RecordType || '').toUpperCase();
  return kind === 'EXAM' || (!kind && !!r.AttemptID && !!r.UserID);
}

function matErrorText_(err) {
  return String(err && err.message ? err.message : err || 'Unknown error').slice(0, 700);
}
