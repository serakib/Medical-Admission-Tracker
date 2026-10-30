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
  PROFILE_SPREADSHEET_ID: '19tbpEbzHO-iO8cmG-Ad_tcPvx3c0W3Mw_3UjyyLc3GE',
  EXAM_SPREADSHEET_ID: '1KGTY-CrbIPNlcxu_5E6yWRUaiwNMlibkDG_5boswmSg',
  PROFILE_TAB: 'Students',
  EXAM_TAB: 'ExamAttempts',
  TIME_ZONE: 'Asia/Dhaka',
  ACTIVITY_DAILY_LIMIT: 20,
  LEADERBOARD_SIZE: 100,
  TOP_ACTIVITY_SIZE: 10,
  TRIGGER_MINUTES: 5,
  WEEKLY_DEMOTION_HOUR: 1
});

// Public, non-secret version/capability metadata for deployment verification.
const MAT_API_VERSION = '2026.10.30.5';
const MAT_API_CAPABILITIES = Object.freeze([
  'firebase-token-auth',
  'persistent-guest-accounts',
  'server-profile-management',
  'exam-rewards-idempotency',
  'full-rp-all-exam-modes-and-question-counts',
  'final-score-5-rp-8-xp-all-modes-including-practice',
  'weighted-pb-for-30-plus-question-exams',
  'pb-only-above-40-percent-no-extra-multiplier',
  'pb-wallet-conversion-and-two-hour-expiry',
  'all-time-weekly-and-friends-leaderboards',
  'student-search-and-friend-requests',
  'daily-streak-sync',
  'top-ten-activity-telegram-queue',
  'weekly-rank-review-saturday-asia-dhaka',
  'immediate-rank-promotion',
  'expired-guest-cleanup',
  'guest-cleanup-weekly-rp-zero',
  'weekly-rp-ledger-includes-pb-and-promotion-rewards',
  'weekly-promotion-reward-safe-zone-thirty-percent',
  'weekly-rank-review-demotion-safe-zone-promotion-zone',
  'weekly-rp-starting-balance-after-reset',
  'highest-weekly-rp-profile-stat',
  'immediate-promotion-no-extra-rp-bonus'
]);

const MAT_STUDENT_HEADERS = [
  'UserID', 'Name', 'AccountType', 'Email', 'College', 'Batch', 'Avatar',
  'XP', 'RP', 'RankProgressVersion', 'PB', 'PBEntries', 'TotalRP', 'Level', 'Rank', 'CreatedAt', 'UpdatedAt',
  'SignupTelegramSent', 'GuestTokenHash', 'LastSeenAt', 'LastError', 'LastRewardAttemptID',
  'LastWeeklyDemotionWeek', 'HighestWeeklyRP', 'Streak', 'HighestStreak', 'LastStreakActivityDate', 'StreakActivityDates', 'GuestZeroRPAt'
];

// Exam records and queued activity notifications share this one tab to keep
// the backend to two spreadsheets and two principal tabs.
const MAT_FRIENDS_TAB = 'StudentFriends';
const MAT_FRIEND_HEADERS = [
  'RecordID', 'RecordType', 'UserA', 'UserB', 'FromUserID', 'ToUserID',
  'FromName', 'FromCollege', 'FromBatch', 'ToName', 'Status', 'CreatedAt', 'UpdatedAt'
];

const MAT_EXAM_HEADERS = [
  'RecordType', 'AttemptID', 'UserID', 'ExamMode', 'Subject', 'ExamYear', 'TimeUsed', 'TotalQuestions', 'Correct',
  'Wrong', 'Score', 'XPEarned', 'RPEarned', 'PBEarned', 'RankBefore', 'RankAfter',
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
  'Immortal V', 'Immortal IV', 'Immortal III', 'Immortal II', 'Immortal I'
]);

const MAT_TOP10_PROPERTY = 'MAT_TOP10_ALLTIME_SNAPSHOT_V1';
const MAT_WEEKLY_DEMOTION_PROPERTY = 'MAT_WEEKLY_DEMOTION_PROCESSED_WEEK_V1';
const MAT_RANK_PROGRESS_VERSION = 2;
const MAT_LOCK_WAIT_MS = 20000;

/* ------------------------------ Web entry points ------------------------------ */

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || 'health');
    if (action === 'health' || action === 'capabilities') return matJson_(matApiHealth_());
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
    case 'capabilities':
      return matApiHealth_();
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
    case 'progress':
    case 'getProgress':
      return matGetProgress_(p || {});
    case 'syncStreak':
      return matSyncStreak_(p || {});
    case 'convertPB':
      return matConvertPB_(p || {});
    case 'updateProfile':
    case 'saveProfile':
      return matUpdateProfile_(p || {});
    case 'leaderboard':
    case 'getLeaderboard':
      return matGetLeaderboard_(String((p && p.period) || 'all-time'), p && p.userIds);
    case 'searchStudents':
      return matSearchStudents_(p || {});
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
    case 'deleteAccount':
      return matDeleteAccount_(p || {});
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
  const hasGuestCleanupTrigger = triggers.some(function (t) {
    return t.getHandlerFunction() === 'cleanupExpiredGuestAccounts';
  });
  if (!hasGuestCleanupTrigger) {
    ScriptApp.newTrigger('cleanupExpiredGuestAccounts')
      .timeBased()
      .everyHours(1)
      .create();
  }
  // Reconcile the weekly trigger on every setup run so older Monday-based
  // deployments are migrated to the Saturday-start/Saturday-review schedule.
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === 'processWeeklyRankDemotions') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('processWeeklyRankDemotions')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SATURDAY)
    .atHour(MAT_CONFIG.WEEKLY_DEMOTION_HOUR)
    .inTimezone(MAT_CONFIG.TIME_ZONE)
    .create();

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
    weeklyDemotion: 'Runs every Saturday at about 01:00 Asia/Dhaka; reviews the previous Saturday-Friday week and applies at most one subrank demotion per student'
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/** Time-driven trigger target. Do not rename without updating setupBackend(). */
function processPendingActivityNotifications() {
  let result = null;
  try { result = matDrainActivityQueue_(); }
  catch (err) { Logger.log('Activity queue will retry: ' + matErrorText_(err)); }
  try { matSettleExpiredPBs_(); }
  catch (err) { Logger.log('PB expiry settlement will retry: ' + matErrorText_(err)); }
  return result;
}

/**
 * Weekly rank review, scheduled for Saturday around 01:00 Asia/Dhaka.
 * Reviews the completed Saturday-Friday week. The current sub-rank's RP
 * determines the zone: below Safe Zone demotes one sub-rank, Safe Zone keeps
 * the rank, and Promotion Zone promotes one sub-rank. Every result starts the
 * new week at 30% of that rank's Safe Zone RP, added to both rank progress and
 * the new weekly leaderboard through an idempotent RP_EVENT.
 */
function processWeeklyRankDemotions() {
  const lock = LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  try {
    const studentsSheet = matGetStudentsSheet_();
    const weekStart = matWeekStartKey_();
    const previousWeekStart = matOffsetDateKey_(weekStart, -7);
    const previousWeekRPByUser = matGetWeeklyRPByUser_(previousWeekStart, weekStart);
    const students = matReadObjects_(studentsSheet);
    const now = matNowIso_();
    let processed = 0;
    let demoted = 0;
    let promoted = 0;
    let unchanged = 0;
    let alreadyProcessed = 0;
    let startingRPAdded = 0;

    students.forEach(function (source) {
      const userId = String(source.UserID || '').trim();
      if (!userId || !source._rowNumber) return;
      if (String(source.LastWeeklyDemotionWeek || '') === weekStart) {
        alreadyProcessed += 1;
        return;
      }

      const student = matPrepareRankProgress_(matNormaliseStudent_(source), studentsSheet);
      let rankIndex = MAT_RANKS.indexOf(String(student.Rank || MAT_RANKS[0]));
      if (rankIndex < 0) rankIndex = 0;

      const currentMilestoneRP = matRankMilestoneCap_(rankIndex);
      const currentRankCost = matRankPromotionCost_(rankIndex);
      const subRankEarnedRP = Math.max(0, matFiniteNumber_(student.RP, 0) - currentMilestoneRP);
      const safeZoneThreshold = matRankSafeZoneThreshold_(rankIndex);
      const promotionZoneThreshold = matRankPromotionZoneThreshold_(rankIndex);
      let nextRankIndex = rankIndex;
      let outcome = 'safe';

      // Promotion Zone takes priority over Safe Zone. Immediate 100% promotions
      // are still handled by matApplyRankProgress_ when exam rewards are saved.
      if (rankIndex < MAT_RANKS.length - 1 &&
          promotionZoneThreshold > 0 &&
          subRankEarnedRP >= promotionZoneThreshold) {
        nextRankIndex = rankIndex + 1;
        outcome = 'promoted';
      } else if (rankIndex > 0 && subRankEarnedRP < safeZoneThreshold) {
        nextRankIndex = rankIndex - 1;
        outcome = 'demoted';
      }

      const startingRP = matRankSafeZoneReward_(nextRankIndex);
      const newRankRP = matRankMilestoneCap_(nextRankIndex) + startingRP;
      const previousWeekRP = Math.max(0, matFiniteNumber_(previousWeekRPByUser[userId], 0));
      const highestWeeklyRP = Math.max(
        0,
        matFiniteNumber_(student.HighestWeeklyRP, 0),
        previousWeekRP
      );
      const eventId = 'WEEKLY-START-' + weekStart + '-' + userId;

      // Write the idempotent weekly event first. If a run is interrupted before
      // the profile row is updated, a retry finds this same event and won't add
      // the starting RP twice.
      if (startingRP > 0) {
        matAppendRPEvent_(userId, startingRP, eventId, now);
      }

      const totalRP = Math.max(
        matFiniteNumber_(student.TotalRP, 0),
        matFiniteNumber_(student.RP, 0)
      ) + startingRP;
      matUpdateObjectRow_(studentsSheet, student._rowNumber, {
        Rank: MAT_RANKS[nextRankIndex],
        RP: newRankRP,
        TotalRP: totalRP,
        HighestWeeklyRP: highestWeeklyRP,
        LastWeeklyDemotionWeek: weekStart,
        RankProgressVersion: MAT_RANK_PROGRESS_VERSION,
        UpdatedAt: now
      });

      processed += 1;
      startingRPAdded += startingRP;
      if (outcome === 'demoted') demoted += 1;
      else if (outcome === 'promoted') promoted += 1;
      else unchanged += 1;
    });

    return {
      success: true,
      weekReviewed: previousWeekStart,
      newWeekStart: weekStart,
      processed: processed,
      demoted: demoted,
      promoted: promoted,
      unchanged: unchanged,
      alreadyProcessed: alreadyProcessed,
      startingRPAdded: startingRPAdded,
      message: 'Weekly rank review completed. Weekly RP has reset and the new rank Safe Zone starting RP has been added.'
    };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------- Guest accounts ------------------------------- */

/**
 * Scheduled server-side cleanup. Guest records are removed after 90 days without
 * a visit, or seven days without a visit after weekly RP is 0 and the existing
 * zero-RP timestamp window has elapsed. Registered accounts are never eligible.
 */
function cleanupExpiredGuestAccounts() {
  const lock = LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  try {
    const nowMs = Date.now();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const studentsSheet = matGetStudentsSheet_();
    const students = matReadObjects_(studentsSheet);
    // Guest deletion's seven-day rule must use this week's earned RP, not
    // the stored rank-progression RP or lifetime RP.
    const weeklyRPByUser = matGetWeeklyRPByUser_();
    const expired = students.filter(function (student) {
      if (String(student.AccountType || '').toUpperCase() !== 'GUEST' || !student._rowNumber) return false;

      const lastSeenMs = Date.parse(String(student.LastSeenAt || student.CreatedAt || ''));
      const inactive90Days = Number.isFinite(lastSeenMs) && nowMs - lastSeenMs >= ninetyDaysMs;
      if (inactive90Days) return true;

      const weeklyRP = Math.max(0, matFiniteNumber_(weeklyRPByUser[String(student.UserID || '')], 0));
      if (weeklyRP !== 0) return false;
      const zeroRpMs = Date.parse(String(student.GuestZeroRPAt || ''));
      if (!Number.isFinite(zeroRpMs)) return false;
      const inactivityAnchor = Math.max(zeroRpMs, Number.isFinite(lastSeenMs) ? lastSeenMs : zeroRpMs);
      return nowMs - inactivityAnchor >= sevenDaysMs;
    });

    if (!expired.length) {
      return { success: true, deletedGuests: 0, message: 'No expired Guest accounts.' };
    }

    const expiredIds = new Set(expired.map(function (student) { return String(student.UserID || ''); }).filter(Boolean));
    const friendsSheet = matGetFriendsSheet_();
    const friendRows = matReadObjects_(friendsSheet);
    const friendRowNumbers = friendRows.filter(function (row) {
      const kind = String(row.RecordType || '').toUpperCase();
      if (kind === 'REQUEST') {
        return expiredIds.has(String(row.FromUserID || '')) || expiredIds.has(String(row.ToUserID || ''));
      }
      if (kind === 'FRIENDSHIP') {
        return expiredIds.has(String(row.UserA || '')) || expiredIds.has(String(row.UserB || ''));
      }
      return false;
    }).map(function (row) { return row._rowNumber; });
    const deletedFriendRows = matDeleteRows_(friendsSheet, friendRowNumbers);

    const examSheet = matGetExamSheet_();
    const examRows = matReadObjects_(examSheet);
    const examRowNumbers = examRows.filter(function (row) {
      if (matIsExamRecord_(row)) return expiredIds.has(String(row.UserID || ''));
      if (String(row.RecordType || '').toUpperCase() !== 'ACTIVITY') return false;
      const activityId = String(row.ActivityID || '');
      return Array.from(expiredIds).some(function (uid) {
        return activityId.indexOf('MAT-' + uid + '-') >= 0 || activityId.endsWith(':TOP10:' + uid);
      });
    }).map(function (row) { return row._rowNumber; });
    const deletedExamAndActivityRows = matDeleteRows_(examSheet, examRowNumbers);

    const deletedProfileRows = matDeleteRows_(studentsSheet, expired.map(function (student) { return student._rowNumber; }));
    matSaveTop10Snapshot_(matBuildTop10_());

    return {
      success: true,
      deletedGuests: expiredIds.size,
      deletedProfileRows: deletedProfileRows,
      deletedFriendRows: deletedFriendRows,
      deletedExamAndActivityRows: deletedExamAndActivityRows,
      message: 'Expired Guest account data permanently deleted.'
    };
  } finally {
    lock.releaseLock();
  }
}

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
        LastError: '',
        Streak: 0,
        HighestStreak: 0,
        LastStreakActivityDate: '',
        StreakActivityDates: '[]'
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
    matUpdateLastSeen_(guest);
    return matFindStudentById_(guest.UserID) || guest;
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

/**
 * Return progress history for the authenticated account from the server-side
 * ExamAttempts sheet. XP/RP remain sourced from the Students sheet; browser
 * localStorage is not trusted as the canonical progress record.
 */
function matFormatTimeUsed_(value) {
  if (value == null || value === '') return '—';
  if (value instanceof Date && !isNaN(value.getTime())) {
    const clock = Utilities.formatDate(value, MAT_CONFIG.TIME_ZONE, 'H:mm');
    const parts = clock.split(':');
    return String(Number(parts[0])) + ':' + String(parts[1] || '00').padStart(2, '0');
  }
  const raw = String(value).trim();
  // Defensive compatibility for records that already contain a serialized 1899 date.
  const legacy = raw.match(/1899.*?\b(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (legacy) return String(Number(legacy[1])) + ':' + legacy[2];
  const duration = raw.match(/^(\d{1,3}):(\d{2})(?::\d{2})?$/);
  if (duration) return String(Number(duration[1])) + ':' + duration[2];
  return raw;
}

function matGetProgress_(p) {
  const user = matAuthenticate_(p);
  const userId = String(user.UserID || '');
  const attempts = matReadObjects_(matGetExamSheet_())
    .filter(function (row) {
      return matIsExamRecord_(row) &&
        String(row.UserID || '') === userId &&
        String(row.RewardStatus || '').toUpperCase() === 'COMMITTED';
    })
    .sort(function (a, b) {
      return String(b.SubmittedAt || '').localeCompare(String(a.SubmittedAt || ''));
    })
    .map(function (row) {
      const correct = Math.max(0, matFiniteNumber_(row.Correct, 0));
      const wrong = Math.max(0, matFiniteNumber_(row.Wrong, 0));
      const total = Math.max(0, matFiniteNumber_(row.TotalQuestions, 0));
      const answered = correct + wrong;
      const stamp = String(row.SubmittedAt || '');
      return {
        attemptId: String(row.AttemptID || ''),
        date: stamp ? Utilities.formatDate(new Date(stamp), MAT_CONFIG.TIME_ZONE, 'yyyy-MM-dd') : '',
        mode: String(row.ExamMode || 'Exam'),
        subject: String(row.Subject || '—'),
        year: String(row.ExamYear || ''),
        score: String(matFiniteNumber_(row.Score, 0).toFixed(2)),
        total: total,
        accuracy: (answered ? correct / answered * 100 : 0).toFixed(1) + '%',
        timeUsed: matFormatTimeUsed_(row.TimeUsed),
        correct: correct,
        wrong: wrong,
        submittedAt: stamp
      };
    });
  return {
    success: true,
    user: matPublicProfile_(matFindStudentById_(userId) || user, true),
    attempts: attempts,
    completedExams: attempts.length,
    source: 'Medical Sheets API'
  };
}

/**
 * Merge offline daily activity into the authenticated student's existing streak record.
 * The sheet keeps the canonical list of activity dates; repeat sync requests are idempotent.
 */
function matSyncStreak_(p) {
  const user = matAuthenticate_(p);
  const today = matDateKey_(matNowIso_());
  const yesterday = matOffsetDateKey_(today, -1);
  const hasSubmittedStreak = p.streak != null && String(p.streak).trim() !== '' && Number.isFinite(Number(p.streak));
  const clientStreak = hasSubmittedStreak ? Math.max(0, Math.floor(Number(p.streak))) : 0;
  const clientHighest = Math.max(0, Math.floor(matFiniteNumber_(p.highestStreak, 0)));
  const rawClientLast = String(p.lastStreakActivityDate || '').trim();
  const parsedClientLast = matParseStreakDates_([rawClientLast], today);
  let incomingLast = parsedClientLast.length ? parsedClientLast[parsedClientLast.length - 1] : '';
  let incomingDates = matParseStreakDates_(p.streakActivityDates, today);
  if (incomingLast && incomingDates.indexOf(incomingLast) < 0) incomingDates.push(incomingLast);
  incomingDates = Array.from(new Set(incomingDates)).sort().slice(-366);

  const lock = LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  let saved;
  let streak;
  let highestStreak;
  let latestDate;
  let activityDates;
  try {
    const fresh = matFindStudentById_(user.UserID);
    if (!fresh) throw new Error('Student profile not found.');
    const oldDates = matParseStreakDates_(fresh.StreakActivityDates, today);
    const oldLastList = matParseStreakDates_([fresh.LastStreakActivityDate], today);
    const oldLast = oldLastList.length ? oldLastList[oldLastList.length - 1] : (oldDates[oldDates.length - 1] || '');
    if (!incomingLast && incomingDates.length) incomingLast = incomingDates[incomingDates.length - 1];

    activityDates = Array.from(new Set(oldDates.concat(incomingDates))).sort().slice(-366);
    latestDate = activityDates.length ? activityDates[activityDates.length - 1] : '';
    const calculatedStreak = matStreakLength_(activityDates, today);
    const incomingIsNewestAndCurrent = !!incomingLast &&
      incomingLast >= oldLast &&
      (incomingLast === today || incomingLast === yesterday) &&
      hasSubmittedStreak;
    // The current streak sent by the device is authoritative when its last
    // activity date is current/recent. This also preserves a locally tracked
    // multi-day offline streak even if its older dates predate graph tracking.
    streak = incomingIsNewestAndCurrent ? clientStreak : calculatedStreak;
    highestStreak = Math.max(
      Math.max(0, Math.floor(matFiniteNumber_(fresh.HighestStreak, 0))),
      Math.max(0, Math.floor(matFiniteNumber_(fresh.Streak, 0))),
      clientHighest,
      streak
    );
    const update = {
      Streak: streak,
      HighestStreak: highestStreak,
      LastStreakActivityDate: latestDate,
      StreakActivityDates: JSON.stringify(activityDates),
      UpdatedAt: matNowIso_(),
      LastSeenAt: matNowIso_()
    };
    matUpdateObjectRow_(matGetStudentsSheet_(), fresh._rowNumber, update);
    saved = matFindStudentById_(user.UserID);
    if (!saved) throw new Error('Streak could not be read back from the Students sheet.');
  } finally {
    lock.releaseLock();
  }
  const finalUser = matPublicProfile_(saved, true);
  return {
    success: true,
    synced: true,
    streak: streak,
    highestStreak: highestStreak,
    lastStreakActivityDate: latestDate,
    streakActivityDates: activityDates,
    user: finalUser,
    source: 'Medical Sheets API'
  };
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

  let savedProfile;
  const lock = LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  try {
    const fresh = matFindStudentById_(user.UserID);
    if (!fresh) throw new Error('Student profile not found.');
    matUpdateObjectRow_(matGetStudentsSheet_(), fresh._rowNumber, update);
    savedProfile = matFindStudentById_(user.UserID);
    if (!savedProfile) throw new Error('Updated profile could not be read back from the Students sheet.');
    if (Object.prototype.hasOwnProperty.call(p, 'avatar')) {
      const expectedAvatar = String(update.Avatar == null ? '' : update.Avatar);
      const actualAvatar = String(savedProfile.Avatar == null ? '' : savedProfile.Avatar);
      if (actualAvatar !== expectedAvatar) {
        throw new Error('Avatar write verification failed: check that the Students sheet has an Avatar column and deploy the latest backend version.');
      }
    }
  } finally {
    lock.releaseLock();
  }
  return { success: true, user: matPublicProfile_(savedProfile, true) };
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

/** Calculates the performance-tier PB bonus for exams containing at least 30 questions. */
function matCalculateWeightedExamPB_(correct, wrong, totalQuestions) {
  const correctCount = matSafeNonNegativeInt_(correct, 'correctCount');
  const wrongCount = matSafeNonNegativeInt_(wrong, 'wrongCount');
  const total = matSafeNonNegativeInt_(totalQuestions, 'totalQuestions');
  if (total < 30) throw new Error('Weighted exam PB requires at least 30 questions.');
  if (correctCount + wrongCount > total) throw new Error('Correct + wrong cannot exceed totalQuestions.');

  // Match the exam result screen: each wrong answer deducts 0.25 marks.
  const finalScore = Math.max(0, correctCount - wrongCount * 0.25);
  // The first 40% is the qualifying baseline, not a PB-earning tier.
  // Only score above 40% earns PB, weighted by the band it falls into.
  const tiers = [
    { upTo: total * 0.50, multiplier: 2 },
    { upTo: total * 0.60, multiplier: 3 },
    { upTo: total * 0.70, multiplier: 4 },
    { upTo: total * 0.79, multiplier: 5 },
    { upTo: total, multiplier: 6 }
  ];
  let weightedScore = 0;
  let previousLimit = total * 0.40;
  tiers.forEach(function (tier) {
    const tierScore = Math.max(0, Math.min(finalScore, tier.upTo) - previousLimit);
    weightedScore += tierScore * tier.multiplier;
    previousLimit = tier.upTo;
  });
  // PB is a separate performance wallet; no extra multiplier and no RP changes.
  return Math.round(weightedScore);
}

function matParsePBEntries_(value) {
  try {
    const parsed = Array.isArray(value) ? value : JSON.parse(String(value || '[]'));
    if (!Array.isArray(parsed)) return [];
    return parsed.map(function (entry) {
      return {
        amount: Math.max(0, Math.floor(matFiniteNumber_(entry.amount, 0))),
        earnedAt: Math.max(0, matFiniteNumber_(entry.earnedAt, 0)),
        convertsAt: Math.max(0, matFiniteNumber_(entry.convertsAt, 0))
      };
    }).filter(function (entry) { return entry.amount > 0 && entry.convertsAt > 0; });
  } catch (_) { return []; }
}

/** Move expired PB to server-side RP once; callers must hold the script lock. */
function matSettlePBForStudent_(student, nowMs, sheet) {
  if (!student || !student._rowNumber) return 0;
  const entries = matParsePBEntries_(student.PBEntries);
  const remaining = [];
  let expired = 0;
  entries.forEach(function (entry) {
    if (entry.convertsAt <= nowMs) expired += entry.amount;
    else remaining.push(entry);
  });
  if (!expired) return 0;
  student = matPrepareRankProgress_(student, sheet || matGetStudentsSheet_());
  const currentRP = Math.max(0, matFiniteNumber_(student.RP, 0));
  const lifetimeRP = Math.max(currentRP, matFiniteNumber_(student.TotalRP, currentRP));
  const rankResult = matApplyRankProgress_(String(student.Rank || MAT_RANKS[0]), currentRP, expired);
  matUpdateObjectRow_(sheet || matGetStudentsSheet_(), student._rowNumber, {
    RP: rankResult.rp,
    TotalRP: lifetimeRP + expired + rankResult.bonusRP,
    Rank: rankResult.rank,
    PB: remaining.reduce(function (sum, entry) { return sum + entry.amount; }, 0),
    PBEntries: JSON.stringify(remaining),
    UpdatedAt: matNowIso_()
  });
  matAppendRPEvent_(student.UserID, expired, 'PB-EXPIRY-' + String(student.UserID || '') + '-' + String(student._rowNumber) + '-' + String(Math.floor(nowMs / 1000)), matNowIso_());
  if (rankResult.bonusRP > 0) matAppendRPEvent_(student.UserID, rankResult.bonusRP, 'RANK-BONUS-PB-EXPIRY-' + String(student.UserID || '') + '-' + String(Math.floor(nowMs / 1000)), matNowIso_());
  return expired;
}

/** Five-minute trigger: expire PB server-side and sync leaderboard/top-ten changes. */
function matSettleExpiredPBs_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  try {
    const sheet = matGetStudentsSheet_();
    const students = matReadObjects_(sheet);
    const oldSnapshot = matGetTop10Snapshot_();
    const nowMs = Date.now();
    let totalExpired = 0;
    students.forEach(function (student) {
      totalExpired += matSettlePBForStudent_(student, nowMs, sheet);
    });
    if (totalExpired > 0) {
      const eventTime = matNowIso_();
      const newSnapshot = matBuildTop10_();
      const timeKey = Utilities.formatDate(new Date(nowMs), MAT_CONFIG.TIME_ZONE, 'yyyyMMdd-HHmm');
      matEnqueueTop10Changes_(oldSnapshot, newSnapshot, eventTime, 'PB-EXPIRY-' + timeKey);
      matSaveTop10Snapshot_(newSnapshot);
    }
    return totalExpired;
  } finally {
    lock.releaseLock();
  }
}

/** Convert PB using authoritative Sheets balances. 1 PB -> 2 XP or 1 PB -> 1 RP. */
function matConvertPB_(p) {
  const user = matAuthenticate_(p);
  const amount = matSafeNonNegativeInt_(p.amount, 'amount');
  const kind = String(p.kind || p.target || '').toLowerCase();
  if (amount < 1) throw new Error('PB amount must be at least 1.');
  if (kind !== 'xp' && kind !== 'rp') throw new Error('Conversion target must be xp or rp.');

  const lock = LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  try {
    const sheet = matGetStudentsSheet_();
    let current = matFindStudentById_(user.UserID);
    if (!current) throw new Error('Student profile not found.');
    current = matPrepareRankProgress_(current, sheet);
    const oldSnapshot = matGetTop10Snapshot_();
    const nowMs = Date.now();
    const expired = matSettlePBForStudent_(current, nowMs, sheet);
    current = matFindStudentById_(user.UserID);
    const entries = matParsePBEntries_(current.PBEntries);
    const available = entries.reduce(function (sum, entry) { return sum + entry.amount; }, 0);

    if (amount > available) {
      if (expired > 0) {
        const updatedSnapshot = matBuildTop10_();
        matEnqueueTop10Changes_(oldSnapshot, updatedSnapshot, matNowIso_(), 'PB-EXPIRY-' + user.UserID + '-' + nowMs);
        matSaveTop10Snapshot_(updatedSnapshot);
      }
      throw new Error('Not enough convertible PB. PB older than two hours automatically converts to RP.');
    }

    let remainingToUse = amount;
    const nextEntries = entries.slice().sort(function (a, b) { return a.earnedAt - b.earnedAt; }).map(function (entry) {
      const used = Math.min(entry.amount, remainingToUse);
      remainingToUse -= used;
      return { amount: entry.amount - used, earnedAt: entry.earnedAt, convertsAt: entry.convertsAt };
    }).filter(function (entry) { return entry.amount > 0; });

    const currentXP = Math.max(0, matFiniteNumber_(current.XP, 0));
    const currentRP = Math.max(0, matFiniteNumber_(current.RP, 0));
    const lifetimeRP = Math.max(currentRP, matFiniteNumber_(current.TotalRP, currentRP));
    const earnedXP = kind === 'xp' ? amount * 2 : 0;
    const earnedRP = kind === 'rp' ? amount : 0;
    const rankResult = matApplyRankProgress_(String(current.Rank || MAT_RANKS[0]), currentRP, earnedRP);
    matUpdateObjectRow_(sheet, current._rowNumber, {
      XP: currentXP + earnedXP,
      RP: rankResult.rp,
      TotalRP: lifetimeRP + earnedRP + rankResult.bonusRP,
      Rank: rankResult.rank,
      Level: matGetLevel_(currentXP + earnedXP),
      PB: nextEntries.reduce(function (sum, entry) { return sum + entry.amount; }, 0),
      PBEntries: JSON.stringify(nextEntries),
      UpdatedAt: matNowIso_()
    });
    if (earnedRP > 0) matAppendRPEvent_(user.UserID, earnedRP, 'PB-CONVERT-RP-' + String(user.UserID) + '-' + String(nowMs), matNowIso_());
    if (rankResult.bonusRP > 0) matAppendRPEvent_(user.UserID, rankResult.bonusRP, 'RANK-BONUS-PB-CONVERT-' + String(user.UserID) + '-' + String(nowMs), matNowIso_());
    const latest = matFindStudentById_(user.UserID);
    const newSnapshot = matBuildTop10_();
    matEnqueueTop10Changes_(oldSnapshot, newSnapshot, matNowIso_(), 'PB-CONVERT-' + user.UserID + '-' + nowMs);
    matSaveTop10Snapshot_(newSnapshot);
    return {
      success: true,
      convertedPB: amount,
      kind: kind,
      earnedXP: earnedXP,
      earnedRP: earnedRP,
      expiredPBToRP: expired,
      user: matApiUser_(latest)
    };
  } finally {
    lock.releaseLock();
  }
}

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
          pbGained: Number(existing.PBEarned || 0),
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
      // Recalculate final score server-side: +1 per correct answer, -0.25 per wrong answer,
      // and no negative final score. Client-provided score is not trusted for rewards.
      const negativeMarks = wrong * 0.25;
      const score = Math.max(0, correct - negativeMarks);
      const examMode = matCleanText_(p.examMode || p.mode || 'Exam', 60) || 'Exam';
      const answered = correct + wrong;
      const accuracy = answered ? correct / answered : 0;

      // Base rewards use the server-calculated final score after negative marking.
      // Each final-score point grants 5 RP and 8 XP. Weighted performance bonus stays PB.
      // Never accept client-supplied XP, RP, or PB amounts.
      const calculatedXpEarned = Math.max(0, Math.round(score * 8));
      const baseRpEarned = Math.max(0, Math.round(score * 5));
      const hasWeightedExamRule = total >= 30;
      const pbEarned = hasWeightedExamRule ? matCalculateWeightedExamPB_(correct, wrong, total) : 0;
      // All exam modes, including Practice, use the same final-score base rewards.
      // Each final-score point grants 5 RP and 8 XP; weighted performance bonus stays PB.
      const xpEarned = calculatedXpEarned;
      const rpEarned = baseRpEarned;
      let freshUser = matFindStudentById_(authenticatedUser.UserID);
      if (!freshUser) throw new Error('Student profile not found.');
      freshUser = matPrepareRankProgress_(freshUser, matGetStudentsSheet_());
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
        Subject: matCleanText_(p.subject || '', 80),
        ExamYear: matCleanText_(p.year || '', 40),
        TimeUsed: matCleanText_(p.timeUsed || '', 20),
        TotalQuestions: total,
        Correct: correct,
        Wrong: wrong,
        Score: score,
        XPEarned: xpEarned,
        RPEarned: rpEarned,
        PBEarned: pbEarned,
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

  let current = matFindStudentById_(userId);
  if (!current) throw new Error('Student profile not found while recovering exam.');
  current = matPrepareRankProgress_(current, matGetStudentsSheet_());
  const alreadyApplied = String(current.LastRewardAttemptID || '') === attemptId;
  const oldSnapshot = matGetTop10Snapshot_();
  let rankBefore = String(attempt.RankBefore || current.Rank || MAT_RANKS[0]);
  let rankAfter = String(attempt.RankAfter || rankBefore);

  if (!alreadyApplied) {
    const xpEarned = Math.max(0, matFiniteNumber_(attempt.XPEarned, 0));
    const rpEarned = Math.max(0, matFiniteNumber_(attempt.RPEarned, 0));
    const pbEarned = Math.max(0, matFiniteNumber_(attempt.PBEarned, 0));
    const currentRank = String(current.Rank || MAT_RANKS[0]);
    rankBefore = currentRank;
    const rankResult = matApplyRankProgress_(currentRank, Math.max(0, matFiniteNumber_(current.RP, 0)), rpEarned);
    rankAfter = rankResult.rank;
    const currentXP = Math.max(0, matFiniteNumber_(current.XP, 0));
    const lifetimeRP = Math.max(Math.max(0, matFiniteNumber_(current.RP, 0)), matFiniteNumber_(current.TotalRP, matFiniteNumber_(current.RP, 0)));
    const nowMs = Date.now();
    const pbEntries = matParsePBEntries_(current.PBEntries);
    if (pbEarned > 0) pbEntries.push({ amount: pbEarned, earnedAt: nowMs, convertsAt: nowMs + 2 * 60 * 60 * 1000 });
    matUpdateObjectRow_(matGetStudentsSheet_(), current._rowNumber, {
      XP: currentXP + xpEarned,
      RP: rankResult.rp,
      PB: pbEntries.reduce(function (sum, entry) { return sum + entry.amount; }, 0),
      PBEntries: JSON.stringify(pbEntries),
      TotalRP: lifetimeRP + rpEarned + rankResult.bonusRP,
      Level: matGetLevel_(currentXP + xpEarned),
      Rank: rankAfter,
      UpdatedAt: matNowIso_(),
      LastSeenAt: matNowIso_(),
      LastError: '',
      LastRewardAttemptID: attemptId
    });
    if (rankResult.bonusRP > 0) matAppendRPEvent_(userId, rankResult.bonusRP, 'RANK-BONUS-EXAM-' + String(userId) + '-' + String(attemptId), matNowIso_());
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
    pbGained: Math.max(0, matFiniteNumber_(attempt.PBEarned, 0)),
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
  // Preserve the existing promotion-cost curve; each cost is a Tier milestone delta.
  let requirement = 500;
  for (let step = 1; step <= rankIndex; step++) requirement = Math.max(5, Math.round((500 + requirement * 0.2) / 5) * 5);
  return requirement;
}

function matRankTierStartIndex_(rankIndex) {
  const safeIndex = Math.max(0, Math.min(MAT_RANKS.length - 1, Math.floor(Number(rankIndex) || 0)));
  return Math.floor(safeIndex / 5) * 5;
}

function matRankMilestoneCap_(targetRankIndex) {
  const index = Math.max(0, Math.min(MAT_RANKS.length - 1, Math.floor(Number(targetRankIndex) || 0)));
  const tierStart = matRankTierStartIndex_(index);
  let cap = 0;
  for (let i = tierStart; i < index; i++) cap += matRankPromotionCost_(i);
  return cap;
}

function matRankTierCap_(rankIndex) {
  const tierStart = matRankTierStartIndex_(rankIndex);
  const tierEnd = Math.min(tierStart + 4, MAT_RANKS.length - 1);
  let cap = 0;
  for (let i = tierStart; i < tierEnd; i++) cap += matRankPromotionCost_(i);
  if (tierEnd < MAT_RANKS.length - 1) cap += matRankPromotionCost_(tierEnd);
  return cap;
}

// One-time migration from old sub-rank-local RP to Tier-cumulative RP.
// TotalRP remains the lifetime leaderboard score and is deliberately unchanged.
function matPrepareRankProgress_(source, sheet) {
  const student = Object.assign({}, source || {});
  if (Number(student.RankProgressVersion) >= MAT_RANK_PROGRESS_VERSION) return student;
  let rankIndex = MAT_RANKS.indexOf(String(student.Rank || MAT_RANKS[0]));
  if (rankIndex < 0) rankIndex = 0;
  const migratedRP = matRankMilestoneCap_(rankIndex) + Math.max(0, matFiniteNumber_(student.RP, 0));
  student.RP = migratedRP;
  student.RankProgressVersion = MAT_RANK_PROGRESS_VERSION;
  if (student._rowNumber) {
    matUpdateObjectRow_(sheet || matGetStudentsSheet_(), student._rowNumber, {
      RP: migratedRP,
      RankProgressVersion: MAT_RANK_PROGRESS_VERSION
    });
  }
  return student;
}

function matRankSafeZoneThreshold_(rankIndex) {
  if (rankIndex < 0 || rankIndex >= MAT_RANKS.length) return 0;
  const cost = rankIndex >= MAT_RANKS.length - 1 ? matRankPromotionCost_(rankIndex - 1) : matRankPromotionCost_(rankIndex);
  return Math.ceil(cost * 0.30);
}

function matRankPromotionZoneThreshold_(rankIndex) {
  if (rankIndex < 0 || rankIndex >= MAT_RANKS.length - 1) return 0;
  return Math.ceil(matRankPromotionCost_(rankIndex) * 0.70);
}

function matRankSafeZoneReward_(rankIndex) {
  return Math.ceil(matRankSafeZoneThreshold_(rankIndex) * 0.30);
}

function matGetRankProgress_(rank, currentRP) {
  let index = MAT_RANKS.indexOf(String(rank || ''));
  if (index < 0) index = 0;
  const rp = Math.max(0, matFiniteNumber_(currentRP, 0));
  const isFinalRank = index >= MAT_RANKS.length - 1;
  const tierStart = matRankTierStartIndex_(index);
  const tierEnd = Math.min(tierStart + 4, MAT_RANKS.length - 1);
  const currentMilestoneRP = matRankMilestoneCap_(index);
  const nextIndex = isFinalRank ? -1 : index + 1;
  const isTierTransition = !isFinalRank && matRankTierStartIndex_(nextIndex) !== tierStart;
  const milestoneCapRP = isFinalRank
    ? currentMilestoneRP
    : (isTierTransition ? matRankTierCap_(index) : matRankMilestoneCap_(nextIndex));
  const previousMilestoneRP = index === 0 ? 0 : (index % 5 === 0 ? matRankTierCap_(index - 1) : matRankMilestoneCap_(index - 1));
  const trophyDeltaRP = Math.max(0, currentMilestoneRP - previousMilestoneRP);
  return {
    currentRP: rp,
    tierName: MAT_RANKS[tierStart].split(' ')[0],
    tierStartRank: MAT_RANKS[tierStart],
    tierEndRank: MAT_RANKS[tierEnd],
    tierCapRP: matRankTierCap_(index),
    currentRankMilestoneRP: currentMilestoneRP,
    previousMilestoneRP: previousMilestoneRP,
    previousSubrankName: index === 0 ? '' : (index >= MAT_RANKS.length - 1 || index % 5 === 0 ? MAT_RANKS[index - 1] : MAT_RANKS[index]),
    previousSubrankCompleted: index > 0,
    nextRankName: isFinalRank ? '' : MAT_RANKS[nextIndex],
    milestoneCapRP: milestoneCapRP,
    promotionRequiredRP: milestoneCapRP,
    trophyRP: isFinalRank ? trophyDeltaRP : Math.max(0, milestoneCapRP - currentMilestoneRP),
    progressPercent: isFinalRank || milestoneCapRP <= 0 ? 100 : Math.min(100, Math.round((rp / milestoneCapRP) * 1000) / 10),
    isTierTransition: isTierTransition,
    isFinalRank: isFinalRank
  };
}

function matApplyRankProgress_(rank, currentRP, earnedRP) {
  let index = MAT_RANKS.indexOf(String(rank || ''));
  if (index < 0) index = 0;
  let rp = Math.max(0, matFiniteNumber_(currentRP, 0)) + Math.max(0, matFiniteNumber_(earnedRP, 0));
  const before = MAT_RANKS[index];
  let promoted = 0;
  let bonusRP = 0;
  let tierReset = false;

  // RP remains cumulative through sub-ranks in the current Tier.
  // Completing a Tier advances to the next Tier and hard-resets RP to zero.
  while (index < MAT_RANKS.length - 1) {
    const nextIndex = index + 1;
    const sameTier = matRankTierStartIndex_(nextIndex) === matRankTierStartIndex_(index);
    const requiredRP = sameTier ? matRankMilestoneCap_(nextIndex) : matRankTierCap_(index);
    if (requiredRP <= 0 || rp < requiredRP) break;
    index = nextIndex;
    promoted += 1;
    if (!sameTier) {
      rp = 0;
      tierReset = true;
      break;
    }
  }
  return { rank: MAT_RANKS[index], rp: rp, before: before, promoted: promoted, bonusRP: bonusRP, tierReset: tierReset };
}

function matLevelRequiredXP_(level) {
  const safeLevel = Math.max(1, Math.floor(matFiniteNumber_(level, 1)));
  // Approved smooth progression curve: XP required from this level to the next.
  return Math.round(150 + 18 * safeLevel + 4.5 * Math.pow(safeLevel, 1.5));
}

function matGetLevelProgress_(totalXP) {
  let remainingXP = Math.max(0, matFiniteNumber_(totalXP, 0));
  let level = 1;
  let requiredXP = matLevelRequiredXP_(level);
  // XP is cumulative. Each level consumes only its own threshold; extra XP carries over.
  while (remainingXP >= requiredXP && level < 100000) {
    remainingXP -= requiredXP;
    level += 1;
    requiredXP = matLevelRequiredXP_(level);
  }
  return {
    level: level,
    xpIntoLevel: remainingXP,
    xpRequiredForNextLevel: requiredXP,
    xpRemaining: Math.max(0, requiredXP - remainingXP),
    progressPercent: requiredXP > 0 ? Math.min(100, Math.round((remainingXP / requiredXP) * 1000) / 10) : 0
  };
}

function matGetLevel_(xp) {
  return matGetLevelProgress_(xp).level;
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
  const allStudents = matReadObjects_(matGetStudentsSheet_()).map(matReconcileStoredRankProgress_);
  const students = requestedIdSet.size ? allStudents.filter(function (s) { return requestedIdSet.has(s.UserID); }) : allStudents;
  // Include current-week RP in every profile payload, even on All Time/Friends tabs.
  const weeklyByUser = matGetWeeklyRPByUser_();
  const examStatsByUser = matGetExamStatsByUser_();
  const rows = students.map(function (s) {
    const weeklyRP = Math.max(0, Number(weeklyByUser[s.UserID] || 0));
    // A week's earned RP is a subset of lifetime earned RP. Preserve this invariant
    // in API output even for legacy rows whose stored TotalRP is undercounted.
    const lifetimeRP = Math.max(0, Number(s.TotalRP || 0), weeklyRP);
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
      avatar: String(s.Avatar || ''),
      Avatar: String(s.Avatar || ''),
      xp: Number(s.XP || 0),
      level: Number(s.Level || 1),
      rank: s.Rank || MAT_RANKS[0],
      rankPoints: Number(s.RP || 0),
      rp: Number(s.RP || 0),
      rankProgress: matGetRankProgress_(s.Rank, s.RP),
      levelProgress: matGetLevelProgress_(s.XP),
      totalRP: lifetimeRP,
      highestWeeklyRP: Math.max(0, matFiniteNumber_(s.HighestWeeklyRP, 0)),
      weeklyRP: weeklyRP,
      weeklyRankPoints: weeklyRP,
      rankScore: safePeriod === 'weekly' ? weeklyRP : lifetimeRP,
      score: safePeriod === 'weekly' ? weeklyRP : lifetimeRP,
      matches: Number(examStats.matches || 0),
      completedExams: Number(examStats.matches || 0),
      correctCount: Number(examStats.correct || 0),
      wrongCount: Number(examStats.wrong || 0),
      accuracy: Number(examStats.accuracy || 0),
      streak: (s.Streak != null && String(s.Streak).trim() !== '' && Number.isFinite(Number(s.Streak)))
        ? Math.max(0, Math.floor(Number(s.Streak)))
        : Number(examStats.streak || 0),
      highestStreak: Math.max(
        (s.Streak != null && String(s.Streak).trim() !== '' && Number.isFinite(Number(s.Streak)))
          ? Math.max(0, Math.floor(Number(s.Streak)))
          : Number(examStats.streak || 0),
        Math.max(0, Math.floor(matFiniteNumber_(s.HighestStreak, 0)))
      ),
      lastStreakActivityDate: String(s.LastStreakActivityDate || ''),
      streakActivityDates: matParseStreakDates_(s.StreakActivityDates, matDateKey_(matNowIso_()))
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
    const recordType = String(r.RecordType || '').toUpperCase();
    if (!matIsExamRecord_(r) && recordType !== 'RP_EVENT') return;
    const dateKey = matDateKey_(r.SubmittedAt);
    if (!dateKey || dateKey < weekStart || (weekEnd && dateKey >= weekEnd)) return;
    const uid = String(r.UserID || '');
    if (!uid) return;
    totals[uid] = (totals[uid] || 0) + Math.max(0, matFiniteNumber_(r.RPEarned, 0));
  });
  return totals;
}

function matAppendRPEvent_(userId, amount, eventId, timestamp) {
  const uid = String(userId || '').trim();
  const points = Math.max(0, matFiniteNumber_(amount, 0));
  const id = String(eventId || '').trim();
  if (!uid || !id || points <= 0) return false;
  const sheet = matGetExamSheet_();
  const exists = matReadObjects_(sheet).some(function (row) {
    return String(row.RecordType || '').toUpperCase() === 'RP_EVENT' && String(row.AttemptID || '') === id;
  });
  if (exists) return false;
  matAppendObject_(sheet, {
    RecordType: 'RP_EVENT', AttemptID: id, UserID: uid, RPEarned: points,
    SubmittedAt: timestamp || matNowIso_(), RewardStatus: 'COMMITTED'
  });
  return true;
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


/* ------------------------ Public student profile statistics --------------------- */
function matPublicStudentDirectoryEntry_(student, weeklyByUser, examStatsByUser) {
  const profile = matPublicProfile_(student, false);
  const uid = String(student.UserID || '');
  const weeklyRP = Math.max(0, matFiniteNumber_(weeklyByUser && weeklyByUser[uid], 0));
  const stats = (examStatsByUser && examStatsByUser[uid]) || { matches: 0, correct: 0, wrong: 0, accuracy: 0, streak: 0 };
  profile.weeklyRP = weeklyRP;
  profile.weeklyRankPoints = weeklyRP;
  profile.matches = Math.max(0, matFiniteNumber_(stats.matches, 0));
  profile.completedExams = profile.matches;
  profile.correctCount = Math.max(0, matFiniteNumber_(stats.correct, 0));
  profile.wrongCount = Math.max(0, matFiniteNumber_(stats.wrong, 0));
  profile.accuracy = Math.max(0, matFiniteNumber_(stats.accuracy, 0));
  profile.streak = Math.max(0, matFiniteNumber_(stats.streak, 0));
  return profile;
}

/* ---------------------------- Authenticated student search --------------------- */
/**
 * Search the student directory without returning private email/token fields.
 * Only authenticated students can query it.
 */
function matSearchStudents_(p) {
  p = p || {};
  const viewer = matAuthenticate_(p);
  const query = matCleanText_(p.query || p.term || p.q || '', 80).toLowerCase();
  if (query.length < 2) return { success: true, query: query, count: 0, entries: [], users: [] };

  const tokens = query.split(/\s+/).filter(Boolean);
  const requestedLimit = Number(p.limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(20, Math.max(1, Math.floor(requestedLimit)))
    : 12;
  const matched = matReadObjects_(matGetStudentsSheet_()).map(matNormaliseStudent_).filter(function (student) {
    if (String(student.UserID || '') === String(viewer.UserID || '')) return false;
    const searchable = [student.Name, student.College, student.Batch].join(' ').toLowerCase();
    return tokens.every(function (token) { return searchable.indexOf(token) >= 0; });
  });
  matched.sort(function (a, b) {
    const nameA = String(a.Name || '').toLowerCase();
    const nameB = String(b.Name || '').toLowerCase();
    const prefixA = nameA.indexOf(query) === 0 ? 0 : 1;
    const prefixB = nameB.indexOf(query) === 0 ? 0 : 1;
    return prefixA - prefixB || nameA.localeCompare(nameB);
  });
  const weeklyByUser = matGetWeeklyRPByUser_();
  const examStatsByUser = matGetExamStatsByUser_();
  const entries = matched.slice(0, limit).map(function (student) {
    return matPublicStudentDirectoryEntry_(student, weeklyByUser, examStatsByUser);
  });
  return { success: true, query: query, count: matched.length, entries: entries, users: entries };
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
  const studentById = {};
  matReadObjects_(matGetStudentsSheet_()).forEach(function (student) {
    const id = String(student.UserID || '');
    if (id) studentById[id] = matNormaliseStudent_(student);
  });
  const weeklyByUser = matGetWeeklyRPByUser_();
  const examStatsByUser = matGetExamStatsByUser_();
  const friends = Array.from(friendIds).map(function (id) {
    return studentById[id] ? matPublicStudentDirectoryEntry_(studentById[id], weeklyByUser, examStatsByUser) : null;
  }).filter(Boolean).sort(function (a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
  return { success: true, friendIds: Array.from(friendIds), friends: friends, incoming: incoming, outgoing: outgoing };
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

/* --------------------------- Account deletion ---------------------------------- */
/**
 * Remove the authenticated account's Medical Sheets data. This validates Firebase
 * directly so cleanup can be retried if a client-side deletion step fails later.
 */
function matDeleteAccount_(p) {
  p = p || {};
  const idToken = String(p.idToken || p.firebaseIdToken || '').trim();
  if (!idToken) throw new Error('Firebase ID token is required to delete an account.');
  const firebaseUser = matVerifyFirebaseIdToken_(idToken);
  const userId = String(firebaseUser.localId || '');
  if (!userId) throw new Error('Firebase identity could not be verified for account deletion.');

  const lock = LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  let result;
  try {
    const studentsSheet = matGetStudentsSheet_();
    const student = matFindStudentById_(userId);
    if (student && String(student.AccountType || '').toUpperCase() === 'GUEST') {
      throw new Error('A registered Firebase account is required for password-verified account deletion.');
    }

    const friendsSheet = matGetFriendsSheet_();
    const friendRows = matReadObjects_(friendsSheet);
    const friendRowNumbers = friendRows.filter(function (row) {
      const kind = String(row.RecordType || '').toUpperCase();
      if (kind === 'REQUEST') {
        return String(row.FromUserID || '') === userId || String(row.ToUserID || '') === userId;
      }
      if (kind === 'FRIENDSHIP') {
        return String(row.UserA || '') === userId || String(row.UserB || '') === userId;
      }
      return false;
    }).map(function (row) { return row._rowNumber; });
    const deletedFriendRows = matDeleteRows_(friendsSheet, friendRowNumbers);

    const examSheet = matGetExamSheet_();
    const examRows = matReadObjects_(examSheet);
    const activitySourceMarker = 'MAT-' + userId + '-';
    const top10TargetMarker = ':TOP10:' + userId;
    const examRowNumbers = examRows.filter(function (row) {
      if (matIsExamRecord_(row)) return String(row.UserID || '') === userId;
      if (String(row.RecordType || '').toUpperCase() !== 'ACTIVITY') return false;
      const activityId = String(row.ActivityID || '');
      return activityId.indexOf(activitySourceMarker) >= 0 || activityId.endsWith(top10TargetMarker);
    }).map(function (row) { return row._rowNumber; });
    const deletedExamAndActivityRows = matDeleteRows_(examSheet, examRowNumbers);

    let deletedProfile = false;
    if (student && student._rowNumber) {
      studentsSheet.deleteRow(student._rowNumber);
      deletedProfile = true;
    }
    matSaveTop10Snapshot_(matBuildTop10_());

    result = {
      success: true,
      deleted: true,
      userId: userId,
      deletedProfile: deletedProfile,
      deletedFriendRows: deletedFriendRows,
      deletedExamAndActivityRows: deletedExamAndActivityRows,
      message: 'Medical account data deleted. Finish deleting the Firebase account in the client.'
    };
  } finally {
    lock.releaseLock();
  }
  return result;
}

/* ---------------------------- Spreadsheet helpers ---------------------------- */

function matDeleteRows_(sheet, rowNumbers) {
  const rows = Array.from(new Set((rowNumbers || []).map(Number).filter(function (row) {
    return Number.isInteger(row) && row >= 2;
  }))).sort(function (a, b) { return b - a; });
  rows.forEach(function (rowNumber) { sheet.deleteRow(rowNumber); });
  return rows.length;
}

function matGetStudentsSheet_() {
  return matEnsureSheet_(MAT_CONFIG.PROFILE_SPREADSHEET_ID, MAT_CONFIG.PROFILE_TAB,
    MAT_STUDENT_HEADERS, ['UserID', 'Name']);
}

function matGetFriendsSheet_() {
  return matEnsureSheet_(MAT_CONFIG.PROFILE_SPREADSHEET_ID, MAT_FRIENDS_TAB,
    MAT_FRIEND_HEADERS, ['RecordID', 'RecordType']);
}

function matGetExamSheet_() {
  const sheet = matEnsureSheet_(MAT_CONFIG.EXAM_SPREADSHEET_ID, MAT_CONFIG.EXAM_TAB,
    MAT_EXAM_HEADERS, ['AttemptID', 'UserID']);
  matNormalizeExamSheetFormats_(sheet);
  return sheet;
}

/**
 * Prevent Google Sheets from interpreting an exam duration such as "1:30"
 * as a clock time. Older rows that were auto-converted to a Date (1899) are
 * restored to the original minutes:seconds display before being stored as text.
 */
function matNormalizeExamSheetFormats_(sheet) {
  const headers = matHeaders_(sheet);
  const timeCol = headers.indexOf('TimeUsed') + 1;
  const submittedCol = headers.indexOf('SubmittedAt') + 1;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  if (timeCol > 0) {
    const range = sheet.getRange(2, timeCol, lastRow - 1, 1);
    const values = range.getValues();
    let changed = false;
    values.forEach(function (row, i) {
      const value = row[0];
      if (value instanceof Date && !isNaN(value.getTime())) {
        // The legacy "m:ss" value was auto-parsed as a clock time. Its hour
        // and minute components correspond to the original minutes/seconds.
        const clock = Utilities.formatDate(value, sheet.getParent().getSpreadsheetTimeZone(), 'H:mm');
        const parts = clock.split(':');
        row[0] = String(Number(parts[0])) + ':' + String(parts[1] || '00').padStart(2, '0');
        changed = true;
      } else if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1) {
        // A legacy "m:ss" clock parse stores the first field as hours and
        // the second as minutes. Restore those components as minutes:seconds.
        const totalMinutes = Math.round(value * 24 * 60);
        row[0] = Math.floor(totalMinutes / 60) + ':' + String(totalMinutes % 60).padStart(2, '0');
        changed = true;
      }
    });
    range.setNumberFormat('@');
    if (changed) range.setValues(values);
  }

  if (submittedCol > 0) {
    sheet.getRange(2, submittedCol, lastRow - 1, 1).setNumberFormat('dd mmm yyyy, hh:mm AM/PM');
  }
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
  row.PB = Math.max(0, matFiniteNumber_(row.PB, 0));
  row.PBEntries = JSON.stringify(matParsePBEntries_(row.PBEntries));
  row.TotalRP = Math.max(row.RP, matFiniteNumber_(row.TotalRP, row.RP));
  row.HighestWeeklyRP = Math.max(0, matFiniteNumber_(row.HighestWeeklyRP, 0));
  // Recalculate level from authoritative cumulative XP using the current progression curve.
  row.Level = matGetLevel_(row.XP);
  if (MAT_RANKS.indexOf(String(row.Rank || '')) === -1) row.Rank = MAT_RANKS[0];
  return row;
}

function matReconcileStoredRankProgress_(source) {
  let student = matNormaliseStudent_(source);
  student = matPrepareRankProgress_(student, matGetStudentsSheet_());
  const rankIndex = MAT_RANKS.indexOf(String(student.Rank || MAT_RANKS[0]));
  if (rankIndex < 0 || rankIndex >= MAT_RANKS.length - 1) return student;

  // Repair accounts that already had enough RP before immediate promotion was
  // deployed, so profile/leaderboard reads cannot leave them stuck in an old rank.
  const rankResult = matApplyRankProgress_(student.Rank, student.RP, 0);
  if (rankResult.promoted <= 0) return student;

  student.Rank = rankResult.rank;
  student.RP = rankResult.rp;
  student.TotalRP = Math.max(student.TotalRP, student.RP) + rankResult.bonusRP;
  student.UpdatedAt = matNowIso_();
  if (student._rowNumber) {
    matUpdateObjectRow_(matGetStudentsSheet_(), student._rowNumber, {
      Rank: student.Rank,
      RP: student.RP,
      TotalRP: student.TotalRP,
      RankProgressVersion: MAT_RANK_PROGRESS_VERSION,
      UpdatedAt: student.UpdatedAt
    });
    if (rankResult.bonusRP > 0) {
      matAppendRPEvent_(student.UserID, rankResult.bonusRP, 'RANK-BONUS-REPAIR-' + String(student.UserID) + '-' + String(student.UpdatedAt), student.UpdatedAt);
    }
  }
  return student;
}

function matPublicProfile_(r, includeEmail) {
  const s = matReconcileStoredRankProgress_(r);
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
    pb: s.PB,
    pendingPB: s.PB,
    totalRP: s.TotalRP,
    highestWeeklyRP: s.HighestWeeklyRP,
    level: s.Level,
    levelProgress: matGetLevelProgress_(s.XP),
    rank: s.Rank,
    rankProgress: matGetRankProgress_(s.Rank, s.RP),
    streak: (s.Streak != null && String(s.Streak).trim() !== '' && Number.isFinite(Number(s.Streak))) ? Math.max(0, Math.floor(Number(s.Streak))) : 0,
    highestStreak: Math.max(
      (s.Streak != null && String(s.Streak).trim() !== '' && Number.isFinite(Number(s.Streak))) ? Math.max(0, Math.floor(Number(s.Streak))) : 0,
      Math.max(0, Math.floor(matFiniteNumber_(s.HighestStreak, 0)))
    ),
    lastStreakActivityDate: String(s.LastStreakActivityDate || ''),
    streakActivityDates: matParseStreakDates_(s.StreakActivityDates, matDateKey_(matNowIso_())),
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

function matApiHealth_() {
  return {
    success: true,
    service: 'Medical Admission Tracker API',
    status: 'ok',
    apiVersion: MAT_API_VERSION,
    capabilities: MAT_API_CAPABILITIES.slice()
  };
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

function matParseStreakDates_(value, today) {
  let list = [];
  if (Array.isArray(value)) {
    list = value;
  } else if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      list = Array.isArray(parsed) ? parsed : [value];
    } catch (_) {
      list = value.split(',');
    }
  }
  const upperBound = String(today || matDateKey_(matNowIso_()));
  const unique = new Set();
  list.forEach(function (item) {
    let key = '';
    if (item instanceof Date) key = Utilities.formatDate(item, MAT_CONFIG.TIME_ZONE, 'yyyy-MM-dd');
    else key = String(item == null ? '' : item).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || key > upperBound) return;
    const parts = key.split('-').map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    if (date.getUTCFullYear() !== parts[0] || date.getUTCMonth() + 1 !== parts[1] || date.getUTCDate() !== parts[2]) return;
    unique.add(key);
  });
  return Array.from(unique).sort().slice(-366);
}

function matStreakLength_(dates, today) {
  const set = new Set(Array.isArray(dates) ? dates : []);
  const currentDate = String(today || matDateKey_(matNowIso_()));
  const yesterday = matOffsetDateKey_(currentDate, -1);
  let cursor = set.has(currentDate) ? currentDate : (set.has(yesterday) ? yesterday : '');
  let count = 0;
  while (cursor && set.has(cursor) && count < 366) {
    count += 1;
    cursor = matOffsetDateKey_(cursor, -1);
  }
  return count;
}

function matWeekStartKey_() {
  // Weekly leaderboard runs Saturday through Friday in Asia/Dhaka.
  // matDateKey_ converts the current instant to the Dhaka-local calendar date;
  // UTC is used below only for safe calendar-day arithmetic on that date key.
  const today = matDateKey_(matNowIso_());
  const parts = today.split('-').map(Number);
  const utc = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const weekday = utc.getUTCDay(); // Sunday=0
  const daysSinceSaturday = (weekday + 1) % 7;
  utc.setUTCDate(utc.getUTCDate() - daysSinceSaturday);
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
