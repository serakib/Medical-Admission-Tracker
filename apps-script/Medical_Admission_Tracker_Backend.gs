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
  WEEKLY_DEMOTION_HOUR: 1,
  MONTHLY_REVIEW_HOUR: 1
});

// Public, non-secret version/capability metadata for deployment verification.
const MAT_API_VERSION = '2026.11.10.9';
const MAT_API_CAPABILITIES = Object.freeze([
  'firebase-token-auth',
  'permanent-account-deletion-cleans-all-user-ledger-and-friend-records',
  'persistent-guest-accounts',
  'guest-creation-requires-name-college-batch-confirmation',
  'guest-logout-restorable-while-token-valid',
  'total-rp-is-cumulative-lifetime-rp-never-weekly-reset',
  'server-profile-management',
  'exam-rewards-idempotency',
  'full-rp-all-exam-modes-and-question-counts',
  'final-score-5-rp-8-xp-all-modes-including-practice',
  'weighted-pb-for-30-plus-question-exams',
  'pb-only-above-40-percent-no-extra-multiplier',
  'account-configurable-pb-expiry',
  'account-configurable-pending-friends-leaderboard',
  'monthly-weekly-and-friends-leaderboards',
  'monthly-rp-ledger-and-monthly-leaderboard',
  'monthly-rank-review-main-rank-safe-zone-demotion-no-promotion-zone',
  'student-search-and-friend-requests',
  'daily-streak-sync',
  'top-ten-activity-telegram-queue',
  'daily-weekly-promotion-zone-check-asia-dhaka',
  'weekly-hard-reset-bronze-v-zero-rp-asia-dhaka',
  'weekly-only-rank-promotion-ledger',
  'immediate-rank-promotion',
  'weekly-full-tier-immediate-promotion',
  'expired-guest-cleanup',
  'guest-account-72-hour-pending-deletion-and-cancellation',
  'guest-deletion-audit-and-super-admin-deadline-management',
  'guest-cleanup-weekly-rp-zero',
  'weekly-rp-ledger-includes-committed-exams-and-rp-events',
  'rank-change-sets-target-rank-basic-rp-no-bonus',
  'weekly-rank-review-daily-promotion-plus-unconditional-weekly-reset',
  'canonical-main-rank-weekly-promotion-threshold',
  'highest-weekly-rp-profile-stat',
  'monthly-rp-profile-stat',
  'highest-monthly-rp-profile-stat',
  'live-highest-weekly-rp-sync',
  'immediate-promotion-no-extra-rp-bonus',
  'single-step-rank-promotion',
  'single-immortal-final-rank-no-promotion-zone',
  'bronze-v-weekly-rp-zero',
  'admin-bootstrap-status',
  'verified-firebase-admin-authorization',
  'admin-suspension-expiry-metadata-persistence',
  'weekly-leaderboard-zero-rp-bronze-v-display',
  'super-admin-script-property-configuration',
  'admin-member-management',
  'super-admin-only-admin-management',
  'admin-promo-redemption-status',
  'super-admin-admin-only-promo-toggle',
  'global-promo-code-configuration',
  'member-specific-promo-code-configuration',
  'admin-promo-target-management',
  'admin-only-fixed-promo-code',
  'super-admin-master-promo-reward-limit-period-editing',
  'server-side-promo-redemption-limits-and-ledger',
  'daily-promo-one-redemption-per-dhaka-calendar-day'
]);

const MAT_STUDENT_HEADERS = [
  'UserID', 'Name', 'AccountType', 'Email', 'College', 'Batch', 'Avatar',
  'XP', 'RP', 'RankProgressVersion', 'PB', 'PBEntries', 'TotalRP', 'Level', 'Rank', 'CreatedAt', 'UpdatedAt',
  'SignupTelegramSent', 'GuestTokenHash', 'LastSeenAt', 'LastError', 'LastRewardAttemptID',
  'LastWeeklyDemotionWeek', 'LastMonthlyRankReviewMonth', 'HighestWeeklyRP', 'HighestMonthlyRP', 'Streak', 'HighestStreak', 'LastStreakActivityDate', 'StreakActivityDates', 'GuestZeroRPAt', 'PBExpiryEnabled', 'PBExpiryValue', 'PBExpiryUnit', 'FriendsIncludePending', 'GuestDeletionRequestedAt', 'GuestDeletionScheduledAt', 'GuestDeletionReason', 'LastWeeklyPromotionReviewDate', 'LastWeeklyRankResetWeek', 'PromoPB', 'ShowGoldName'
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
// Named tiers through Mythic have five sub-ranks; Immortal is one terminal rank.
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
const MAT_RANK_PROGRESS_VERSION = 2;
const MAT_LOCK_WAIT_MS = 20000;

/* ------------------------------ Web entry points ------------------------------ */

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || 'health');
    if (action === 'health' || action === 'capabilities') return matJson_(matApiHealth_());
    if (action === 'leaderboard' || action === 'getLeaderboard') {
      return matJson_(matGetLeaderboard_(String((e.parameter && e.parameter.period) || 'monthly'), String((e.parameter && e.parameter.ids) || ''), String((e.parameter && e.parameter.includeIds) || '')));
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
    case 'getPromoInfo': return matGetPromoInfo_(p || {});
    case 'redeemPromoCode': return matRedeemPromoCode_(p || {});
    case 'adminBootstrapStatus': return matAdminBootstrapStatus_(p || {});
    case 'adminListMembers': return matAdminListMembers_(p || {});
    case 'adminListGuestDeletionTargets': return matAdminListGuestDeletionTargets_(p || {});
    case 'adminCreateGuestDeletionRequest': return matAdminCreateGuestDeletionRequest_(p || {});
    case 'adminListGuestDeletionRequests': return matAdminListGuestDeletionRequests_(p || {});
    case 'adminResolveGuestDeletionRequest': return matAdminResolveGuestDeletionRequest_(p || {});
    case 'adminCancelGuestDeletion': return matAdminCancelGuestDeletion_(p || {});
    case 'adminExtendGuestDeletion': return matAdminExtendGuestDeletion_(p || {});
    case 'adminListGuestDeletionAudit': return matAdminListGuestDeletionAudit_(p || {});
    case 'adminDeleteGuestDeletionAudit': return matAdminDeleteGuestDeletionAudit_(p || {});
    case 'adminListPremiumNameAccess': return matAdminListPremiumNameAccess_(p || {});
    case 'adminSetPremiumNameAccess': return matAdminSetPremiumNameAccess_(p || {});
    case 'adminAddMember': return matAdminAddMember_(p || {});
    case 'adminRemoveMember': return matAdminRemoveMember_(p || {});
    case 'adminSuspendMember': return matAdminSuspendMember_(p || {});
    case 'adminReactivateMember': return matAdminReactivateMember_(p || {});
    case 'adminPromoStatus': return matAdminPromoStatus_(p || {});
    case 'adminSetUnlimitedEnabled': return matAdminSetUnlimitedEnabled_(p || {});
    case 'adminSaveFixedPromoCode': return matAdminSaveFixedPromoCode_(p || {});
    case 'adminGetPromoConfig': return matAdminGetPromoConfig_(p || {});
    case 'adminSavePromoConfig': return matAdminSavePromoConfig_(p || {});
    case 'adminListPromoTargets': return matAdminListPromoTargets_(p || {});
    case 'adminSaveMemberPromo': return matAdminSaveMemberPromo_(p || {});
    case 'adminDeleteMemberPromo': return matAdminDeleteMemberPromo_(p || {});
    case 'setGoldNameVisibility': return matSetGoldNameVisibility_(p || {});
    case 'updateProfile':
    case 'saveProfile':
      return matUpdateProfile_(p || {});
    case 'leaderboard':
    case 'getLeaderboard':
      return matGetLeaderboard_(String((p && p.period) || 'monthly'), p && p.userIds, p && p.includeUserIds);
    case 'getAccountSettings':
      return matGetAccountSettings_(p || {});
    case 'saveAccountSettings':
      return matSaveAccountSettings_(p || {});
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
    case 'requestGuestDeletion':
      return matRequestGuestDeletion_(p || {});
    case 'cancelGuestDeletion':
      return matCancelGuestDeletion_(p || {});
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
 * existing cells, seeds the Top-10 baseline, and installs notification, daily
 * Weekly Promotion Zone check, and monthly rank-review triggers. It never clears existing rows.
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
  // Keep one daily weekly-rank review trigger. Sunday-Friday checks promotions;
  // Saturday performs the unconditional new-week Bronze V / 0 RP reset.
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === 'processWeeklyRankDemotions' ||
        t.getHandlerFunction() === 'processDailyWeeklyPromotionReview') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('processDailyWeeklyPromotionReview')
    .timeBased()
    .everyDays(1)
    .atHour(MAT_CONFIG.WEEKLY_DEMOTION_HOUR)
    .inTimezone(MAT_CONFIG.TIME_ZONE)
    .create();
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === 'processMonthlyRankReview') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processMonthlyRankReview')
    .timeBased()
    .onMonthDay(1)
    .atHour(MAT_CONFIG.MONTHLY_REVIEW_HOUR)
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
    weeklyRankReview: 'Sunday-Friday daily Promotion Zone review using current-week RP; Saturday about 01:00 Asia/Dhaka unconditionally resets every existing account to Bronze V and 0 current RP, regardless of Safe Zone; lifetime XP, TotalRP, PB, streaks and history are preserved',
    monthlyRankReview: 'Runs on the first day of each month at about 01:00 Asia/Dhaka; checks the previous month Safe Zone for the whole Main Rank and demotes at most one Main Rank; no Promotion Zone'
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
 * Daily weekly-rank review in Asia/Dhaka.
 * Sunday-Friday: evaluate the current week's Promotion Zone.
 * Saturday: close the completed Saturday-Friday week, record its high-water
 * mark, then reset EVERY existing account to Bronze V / 0 current RP.
 * Safe Zone status never exempts an account from the Saturday hard reset.
 * Lifetime XP, TotalRP, PB, streaks and historical records are preserved.
 */
function processDailyWeeklyPromotionReview() {
  const lock = LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  try {
    const studentsSheet = matGetStudentsSheet_();
    const today = matDateKey_(matNowIso_());
    const weekStart = matWeekStartKey_();
    const isSaturday = Utilities.formatDate(new Date(), MAT_CONFIG.TIME_ZONE, 'u') === '6';
    const reviewWeekStart = isSaturday ? matOffsetDateKey_(weekStart, -7) : weekStart;
    const reviewWeekEnd = isSaturday ? weekStart : '';
    const weeklyRPByUser = matGetWeeklyRPByUser_(reviewWeekStart, reviewWeekEnd);
    const students = matReadObjects_(studentsSheet);
    const now = matNowIso_();
    let processed = 0, promoted = 0, unchanged = 0, alreadyChecked = 0;
    let reset = 0, alreadyReset = 0;

    students.forEach(function (source) {
      const userId = String(source.UserID || '').trim();
      if (!userId || !source._rowNumber) return;

      // The reset is keyed to the new Saturday week-start date, making retries
      // idempotent while ensuring Safe Zone status cannot preserve the old rank.
      if (isSaturday) {
        if (String(source.LastWeeklyRankResetWeek || '') === weekStart) {
          alreadyReset += 1;
          return;
        }
        const completedWeekRP = Math.max(0, matFiniteNumber_(weeklyRPByUser[userId], 0));
        const highestWeeklyRP = Math.max(
          0,
          matFiniteNumber_(source.HighestWeeklyRP, 0),
          completedWeekRP
        );
        matUpdateObjectRow_(studentsSheet, source._rowNumber, {
          Rank: MAT_RANKS[0],
          RP: 0,
          RankProgressVersion: MAT_RANK_PROGRESS_VERSION,
          HighestWeeklyRP: highestWeeklyRP,
          LastWeeklyPromotionReviewDate: today,
          LastWeeklyRankResetWeek: weekStart,
          UpdatedAt: now
        });
        processed += 1;
        reset += 1;
        return;
      }

      if (String(source.LastWeeklyPromotionReviewDate || '') === today) {
        alreadyChecked += 1;
        return;
      }

      const student = matReconcileStoredRankProgress_(source);
      const weeklyEarnedRP = Math.max(0, matFiniteNumber_(weeklyRPByUser[userId], 0));
      const highestWeeklyRP = Math.max(0, matFiniteNumber_(student.HighestWeeklyRP, 0), weeklyEarnedRP);

      // Rank promotion is based only on this Saturday-Friday week's earned RP.
      // Month-to-date RP must not re-promote a student after the weekly reset.
      const periodPromotion = matApplyPeriodRankPromotion_(student, weeklyEarnedRP, 0);
      let rankIndex = MAT_RANKS.indexOf(String(student.Rank || MAT_RANKS[0]));
      if (rankIndex < 0) rankIndex = 0;
      const promotionZoneThreshold = matRankPromotionZoneThreshold_(rankIndex);

      if (periodPromotion.promoted > 0) {
        matUpdateObjectRow_(studentsSheet, student._rowNumber, {
          HighestWeeklyRP: highestWeeklyRP,
          LastWeeklyPromotionReviewDate: today
        });
        promoted += periodPromotion.promoted;
      } else if (rankIndex < MAT_RANKS.length - 1 &&
          promotionZoneThreshold > 0 &&
          weeklyEarnedRP >= promotionZoneThreshold) {
        const nextRankIndex = rankIndex + 1;
        matUpdateObjectRow_(studentsSheet, student._rowNumber, {
          Rank: MAT_RANKS[nextRankIndex],
          RP: matRankMilestoneCap_(nextRankIndex),
          HighestWeeklyRP: highestWeeklyRP,
          LastWeeklyPromotionReviewDate: today,
          RankProgressVersion: MAT_RANK_PROGRESS_VERSION,
          UpdatedAt: now
        });
        promoted += 1;
      } else {
        matUpdateObjectRow_(studentsSheet, student._rowNumber, {
          HighestWeeklyRP: highestWeeklyRP,
          LastWeeklyPromotionReviewDate: today
        });
        unchanged += 1;
      }
      processed += 1;
    });

    return {
      success: true,
      reviewDate: today,
      weekStart: reviewWeekStart,
      currentWeekStart: weekStart,
      processed: processed,
      promoted: promoted,
      unchanged: unchanged,
      reset: reset,
      alreadyReset: alreadyReset,
      alreadyChecked: alreadyChecked,
      message: isSaturday
        ? 'Weekly hard reset completed: every existing account starts the new week at Bronze V with 0 RP. Lifetime records are preserved.'
        : 'Daily Weekly Promotion Zone review completed using current-week RP only.'
    };
  } finally {
    lock.releaseLock();
  }
}
function processMonthlyRankReview() {
  const lock = LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  try {
    const studentsSheet = matGetStudentsSheet_();
    const monthStart = matMonthStartKey_();
    const previousMonthStart = matOffsetMonthStartKey_(monthStart, -1);
    const monthlyRPByUser = matGetMonthlyRPByUser_(previousMonthStart, monthStart);
    const students = matReadObjects_(studentsSheet);
    const now = matNowIso_();
    let processed = 0, demoted = 0, unchanged = 0, alreadyProcessed = 0;

    students.forEach(function (source) {
      const userId = String(source.UserID || '').trim();
      if (!userId || !source._rowNumber) return;
      if (String(source.LastMonthlyRankReviewMonth || '') === monthStart) {
        alreadyProcessed += 1;
        return;
      }
      const student = matReconcileStoredRankProgress_(source);
      let rankIndex = MAT_RANKS.indexOf(String(student.Rank || MAT_RANKS[0]));
      if (rankIndex < 0) rankIndex = 0;
      const mainRankStartIndex = Math.floor(rankIndex / 5) * 5;
      const previousMonthRP = Math.max(0, matFiniteNumber_(monthlyRPByUser[userId], 0));
      const safeZoneThreshold = matMainRankSafeZoneThreshold_(mainRankStartIndex);
      let nextRankIndex = mainRankStartIndex;
      let outcome = 'unchanged';

      // Monthly Safe Zone covers the entire Main Rank. There is no Monthly Promotion Zone.
      if (mainRankStartIndex > 0 && previousMonthRP < safeZoneThreshold) {
        nextRankIndex = mainRankStartIndex - 5;
        outcome = 'demoted';
      }
      const finalRankIndex = outcome === 'demoted' ? nextRankIndex : rankIndex;
      const finalRP = outcome === 'demoted'
        ? matRankMilestoneCap_(finalRankIndex)
        : Math.max(0, matFiniteNumber_(student.RP, 0));
      matUpdateObjectRow_(studentsSheet, student._rowNumber, {
        Rank: MAT_RANKS[finalRankIndex],
        RP: finalRP,
        LastMonthlyRankReviewMonth: monthStart,
        RankProgressVersion: MAT_RANK_PROGRESS_VERSION,
        UpdatedAt: now
      });
      processed += 1;
      if (outcome === 'demoted') demoted += 1;
      else unchanged += 1;
    });
    return {
      success: true, monthReviewed: previousMonthStart, newMonthStart: monthStart,
      processed: processed, demoted: demoted, unchanged: unchanged,
      alreadyProcessed: alreadyProcessed,
      message: 'Monthly Safe Zone review completed. Demotion sets the demoted Main Rank Basic RP; no bonus is added.'
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Scheduled server-side cleanup. Inactive Guests with zero Weekly RP are
 * removed after 21 days; Guests with non-zero Weekly RP are removed after
 * 90 days. Registered accounts are never eligible.
 */
function cleanupExpiredGuestAccounts() {
  const lock = LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  try {
    const nowMs = Date.now();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    const twentyOneDaysMs = 21 * 24 * 60 * 60 * 1000;
    const studentsSheet = matGetStudentsSheet_();
    const students = matReadObjects_(studentsSheet);
    // The deletion branch is based on this week's earned RP, never lifetime RP
    // or the stored rank-progression RP.
    const weeklyRPByUser = matGetWeeklyRPByUser_();
    const expired = students.filter(function (student) {
      if (String(student.AccountType || '').toUpperCase() !== 'GUEST' || !student._rowNumber) return false;

      const scheduledDeletionMs = Date.parse(String(student.GuestDeletionScheduledAt || ''));
      if (Number.isFinite(scheduledDeletionMs) && scheduledDeletionMs > 0 && scheduledDeletionMs <= nowMs) return true;

      const lastSeenMs = Date.parse(String(student.LastSeenAt || student.CreatedAt || ''));
      if (!Number.isFinite(lastSeenMs) || lastSeenMs <= 0) return false;
      const weeklyRP = Math.max(0, matFiniteNumber_(weeklyRPByUser[String(student.UserID || '')], 0));

      if (weeklyRP === 0) {
        const zeroRpMs = Date.parse(String(student.GuestZeroRPAt || ''));
        const inactivityAnchor = Number.isFinite(zeroRpMs) && zeroRpMs > 0
          ? Math.max(zeroRpMs, lastSeenMs)
          : lastSeenMs;
        return nowMs - inactivityAnchor >= twentyOneDaysMs;
      }

      return nowMs - lastSeenMs >= ninetyDaysMs;
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
  // A brand-new Guest account is created only after the visitor submits the required profile.
  const guestName = matCleanText_(p.name || '', 80);
  const guestCollege = matCleanText_(p.college || '', 120);
  const guestBatch = matCleanText_(p.batch || '', 40);
  // Reuse the current Guest if its persisted token was provided.
  const providedToken = String(p.guestToken || '').trim();
  if (providedToken) {
    const existing = matFindGuestByToken_(providedToken);
    if (!existing) {
      // A stale token must never silently create a replacement Guest session.
      // This prevents an expired/deleted Guest from being auto-replaced on reload.
      throw new Error('This Guest session is no longer available. A new Guest account will not be created automatically.');
    }
    matUpdateLastSeen_(existing);
    const latest = matFindStudentById_(existing.UserID) || existing;
    return { success: true, user: matPublicProfile_(latest, true), guestToken: providedToken, existing: true, deletionPending: !!latest.GuestDeletionScheduledAt };
  }

  if (!guestName || !guestCollege || !guestBatch) {
    throw new Error('নতুন Guest account তৈরির জন্য নাম, College ও Batch পূরণ করুন।');
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
      Name: matSheetSafeText_(guestName),
      AccountType: 'GUEST',
      Email: '',
      College: matSheetSafeText_(guestCollege),
      Batch: matSheetSafeText_(guestBatch),
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
    }).filter(function (entry) { return entry.amount > 0; });
  } catch (_) { return []; }
}

/** Move expired PB to server-side RP once; callers must hold the script lock. */
function matSettlePBForStudent_(student, nowMs, sheet) {
  if (!student || !student._rowNumber) return 0;
  const entries = matParsePBEntries_(student.PBEntries);
  const remaining = [];
  let expired = 0;
  entries.forEach(function (entry) {
    if (entry.convertsAt > 0 && entry.convertsAt <= nowMs) expired += entry.amount;
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
function matGetPBExpirySettings_(student) {
  const enabledRaw = student && student.PBExpiryEnabled;
  const enabled = enabledRaw == null || String(enabledRaw).trim() === '' ? true :
    !(['false', '0', 'off', 'no'].indexOf(String(enabledRaw).toLowerCase()) >= 0);
  const value = Math.max(1, Math.min(999, Math.floor(matFiniteNumber_(student && student.PBExpiryValue, 2))));
  const unitRaw = String(student && student.PBExpiryUnit || 'hour').toLowerCase();
  const unit = ['hour', 'day', 'month', 'year'].indexOf(unitRaw) >= 0 ? unitRaw : 'hour';
  return { enabled: enabled, value: value, unit: unit };
}
function matPBExpiryAt_(earnedAt, value, unit) {
  const date = new Date(Math.max(0, Number(earnedAt) || Date.now()));
  const amount = Math.max(1, Math.min(999, Math.floor(Number(value) || 2)));
  if (unit === 'year' || unit === 'month') {
    const originalDay = date.getDate();
    date.setDate(1);
    if (unit === 'year') date.setFullYear(date.getFullYear() + amount);
    else date.setMonth(date.getMonth() + amount);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(originalDay, lastDay));
  } else if (unit === 'day') date.setDate(date.getDate() + amount);
  else date.setHours(date.getHours() + amount);
  return date.getTime();
}
function matGetAccountSettings_(p) {
  const user = matAuthenticate_(p);
  const student = matFindStudentById_(user.UserID);
  if (!student) throw new Error('Student profile not found.');
  const superAdminEmail = String(matScriptProperty_('MAT_SUPER_ADMIN_EMAIL') || '').trim().toLowerCase();
  const authenticatedEmail = String(user.Email || '').trim().toLowerCase();
  return { success: true, isSuperAdmin: !!(superAdminEmail && authenticatedEmail === superAdminEmail), settings: Object.assign(matGetPBExpirySettings_(student), {
    includePendingFriends: String(student.FriendsIncludePending || '').toLowerCase() === 'true'
  }) };
}
function matSaveAccountSettings_(p) {
  const user = matAuthenticate_(p);
  const enabled = p.pbExpiryEnabled !== false && String(p.pbExpiryEnabled).toLowerCase() !== 'false';
  const value = Math.max(1, Math.min(999, Math.floor(Number(p.pbExpiryValue) || 2)));
  const unit = String(p.pbExpiryUnit || 'hour').toLowerCase();
  if (['hour', 'day', 'month', 'year'].indexOf(unit) < 0) throw new Error('Invalid PB expiry unit.');
  const includePending = p.includePendingFriends === true || String(p.includePendingFriends).toLowerCase() === 'true';
  const lock = LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  try {
    const sheet = matGetStudentsSheet_();
    let student = matFindStudentById_(user.UserID);
    if (!student) throw new Error('Student profile not found.');
    const nowMs = Date.now();
    const oldSnapshot = matGetTop10Snapshot_();
    const entries = matParsePBEntries_(student.PBEntries).map(function (entry) {
      return { amount: entry.amount, earnedAt: entry.earnedAt, convertsAt: enabled ? matPBExpiryAt_(entry.earnedAt, value, unit) : 0 };
    });
    matUpdateObjectRow_(sheet, student._rowNumber, {
      PBExpiryEnabled: enabled ? 'TRUE' : 'FALSE',
      PBExpiryValue: value,
      PBExpiryUnit: unit,
      FriendsIncludePending: includePending ? 'TRUE' : 'FALSE',
      PBEntries: JSON.stringify(entries),
      UpdatedAt: matNowIso_()
    });
    student = matFindStudentById_(user.UserID);
    // Apply the new expiry immediately if the chosen duration is shorter than the
    // age of existing PB; never-expire entries use convertsAt=0.
    const expired = matSettlePBForStudent_(student, nowMs, sheet);
    if (expired > 0) {
      const snapshot = matBuildTop10_();
      matEnqueueTop10Changes_(oldSnapshot, snapshot, matNowIso_(), 'PB-EXPIRY-SETTINGS-' + user.UserID + '-' + nowMs);
      matSaveTop10Snapshot_(snapshot);
    }
    const latest = matFindStudentById_(user.UserID);
    return { success: true, expiredPBToRP: expired, settings: {
      pbExpiryEnabled: enabled, pbExpiryValue: value, pbExpiryUnit: unit,
      includePendingFriends: includePending
    }, user: matApiUser_(latest) };
  } finally {
    lock.releaseLock();
  }
}

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
    const promoAvailable = Math.max(0, matFiniteNumber_(current.PromoPB, 0));
    const available = promoAvailable + entries.reduce(function (sum, entry) { return sum + entry.amount; }, 0);

    if (amount > available) {
      if (expired > 0) {
        const updatedSnapshot = matBuildTop10_();
        matEnqueueTop10Changes_(oldSnapshot, updatedSnapshot, matNowIso_(), 'PB-EXPIRY-' + user.UserID + '-' + nowMs);
        matSaveTop10Snapshot_(updatedSnapshot);
      }
      throw new Error('Not enough convertible PB. PB may have expired according to your account PB expiry setting.');
    }

    let remainingToUse = Math.max(0, amount - promoAvailable);
    const nextPromoPB = Math.max(0, promoAvailable - amount);
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
      PromoPB: nextPromoPB,
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
    if (pbEarned > 0) {
      const expiry = matGetPBExpirySettings_(current);
      const convertsAt = expiry.enabled ? matPBExpiryAt_(nowMs, expiry.value, expiry.unit) : 0;
      pbEntries.push({ amount: pbEarned, earnedAt: nowMs, convertsAt: convertsAt });
    }
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

  matUpdateObjectRow_(matGetExamSheet_(), attempt._rowNumber, {
    RewardStatus: 'COMMITTED',
    RankBefore: rankBefore,
    RankAfter: rankAfter,
    LastError: ''
  });

  // The committed exam now contributes to both period ledgers. Reconcile its
  // full-tier promotion before returning the canonical profile and Top 10 state.
  const committedStudent = matFindStudentById_(userId) || current;
  const weeklyRPByUser = matGetWeeklyRPByUser_();
  const monthlyRPByUser = matGetMonthlyRPByUser_();
  matApplyPeriodRankPromotion_(committedStudent, weeklyRPByUser[userId], monthlyRPByUser[userId]);

  const latest = matFindStudentById_(userId) || committedStudent;
  rankAfter = String(latest.Rank || rankAfter);
  matUpdateObjectRow_(matGetExamSheet_(), attempt._rowNumber, { RankAfter: rankAfter });

  // Snapshot after the promotion so the rank label remains synchronized.
  const newSnapshot = matBuildTop10_();
  matEnqueueTop10Changes_(oldSnapshot, newSnapshot, String(attempt.SubmittedAt || matNowIso_()), attemptId);
  matSaveTop10Snapshot_(newSnapshot);
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
// TotalRP is the cumulative Lifetime RP earned by the account across its entire life.
// It is never replaced by weekly/monthly RP and is preserved by the weekly hard reset.
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

function matRankTierCumulativeCap_(rankIndex) {
  const tierStart = matRankTierStartIndex_(rankIndex);
  const tierEnd = Math.min(tierStart + 5, MAT_RANKS.length);
  let cap = 0;
  for (let index = 0; index < tierEnd; index++) cap += matRankPromotionCost_(index);
  return cap;
}

function matRankPromotionZoneThreshold_(rankIndex) {
  if (rankIndex < 0 || rankIndex >= MAT_RANKS.length - 1) return 0;
  const tierRequiredRP = matMainRankRequiredRP_(rankIndex);
  const tierStartRP = Math.max(0, matRankTierCumulativeCap_(rankIndex) - tierRequiredRP);
  return tierStartRP + Math.ceil(tierRequiredRP * 0.70);
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
    weeklyPromotionZoneThreshold: isFinalRank ? 0 : matRankPromotionZoneThreshold_(index),
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

  // A single reward/reconciliation pass advances at most one sub-rank.
  // Reaching 100% of the next milestone promotes immediately. Every rank
  // change sets RP to the target rank's Basic RP, without any extra bonus.
  if (index < MAT_RANKS.length - 1) {
    const nextIndex = index + 1;
    const sameTier = matRankTierStartIndex_(nextIndex) === matRankTierStartIndex_(index);
    const requiredRP = sameTier ? matRankMilestoneCap_(nextIndex) : matRankTierCap_(index);
    if (requiredRP > 0 && rp >= requiredRP) {
      index = nextIndex;
      promoted = 1;
      // Basic RP is the target rank's milestone baseline (zero at a new Tier).
      rp = matRankMilestoneCap_(index);
      if (!sameTier) tierReset = true;
    }
  }
  return { rank: MAT_RANKS[index], rp: rp, before: before, promoted: promoted, bonusRP: bonusRP, tierReset: tierReset };
}

function matApplyPeriodRankPromotion_(student, weeklyRP, monthlyRP) {
  if (!student || !student._rowNumber || !student.UserID) {
    return { promoted: 0, rank: String(student && student.Rank || MAT_RANKS[0]) };
  }

  // Rank progression belongs to the Saturday-Friday weekly cycle only.
  // Ignore month-to-date RP so it cannot restore an old rank after Saturday's hard reset.
  const periodRP = Math.max(0, matFiniteNumber_(weeklyRP, 0));
  function promotionTarget(startRank) {
    let index = MAT_RANKS.indexOf(String(startRank || MAT_RANKS[0]));
    if (index < 0) index = 0;
    const before = MAT_RANKS[index];
    let promoted = 0;
    while (index < MAT_RANKS.length - 1) {
      const requiredRP = matRankTierCumulativeCap_(index);
      if (requiredRP <= 0 || periodRP < requiredRP) break;
      const nextRankIndex = Math.min(matRankTierStartIndex_(index) + 5, MAT_RANKS.length - 1);
      if (nextRankIndex <= index) break;
      index = nextRankIndex;
      promoted += 1;
    }
    return { index: index, promoted: promoted, before: before };
  }

  const preview = promotionTarget(student.Rank);
  if (!preview.promoted) return { promoted: 0, rank: String(student.Rank || MAT_RANKS[0]) };

  // Reads and reward writes can overlap. Re-read the canonical row under the
  // script lock before updating it, unless the caller already owns that lock.
  const lock = LockService.getScriptLock();
  const alreadyLocked = lock.hasLock();
  if (!alreadyLocked) lock.waitLock(MAT_LOCK_WAIT_MS);
  try {
    const latest = matFindStudentById_(student.UserID) || student;
    const target = promotionTarget(latest.Rank);
    if (!target.promoted) {
      student.Rank = latest.Rank;
      student.RP = latest.RP;
      return { promoted: 0, rank: String(latest.Rank || MAT_RANKS[0]) };
    }

    const nextRank = MAT_RANKS[target.index];
    const nextRP = matRankMilestoneCap_(target.index);
    const updatedAt = matNowIso_();
    matUpdateObjectRow_(matGetStudentsSheet_(), latest._rowNumber, {
      Rank: nextRank,
      RP: nextRP,
      RankProgressVersion: MAT_RANK_PROGRESS_VERSION,
      UpdatedAt: updatedAt
    });
    student.Rank = nextRank;
    student.RP = nextRP;
    student.RankProgressVersion = MAT_RANK_PROGRESS_VERSION;
    student.UpdatedAt = updatedAt;
    return { promoted: target.promoted, before: target.before, rank: nextRank, rp: nextRP };
  } finally {
    if (!alreadyLocked) lock.releaseLock();
  }
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
  const requestedPeriod = String(period || 'monthly').toLowerCase();
  const safePeriod = requestedPeriod === 'weekly' ? 'weekly' : 'monthly';
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
  const weeklyByUser = matGetWeeklyRPByUser_();
  const monthlyByUser = matGetMonthlyRPByUser_();
  const historicalHighestByUser = matGetHighestWeeklyRPByUser_();
  const historicalHighestMonthlyByUser = matGetHighestMonthlyRPByUser_();
  const examStatsByUser = matGetExamStatsByUser_();
  const rows = students.map(function (s) {
    const weeklyRP = Math.max(0, Number(weeklyByUser[s.UserID] || 0));
    const monthlyRP = Math.max(0, Number(monthlyByUser[s.UserID] || 0));
    // Leaderboard reads must never promote the canonical Main Rank; only committed reward/review flows may do that.
    const highestWeeklyRP = Math.max(
      0, matFiniteNumber_(s.HighestWeeklyRP, 0),
      matFiniteNumber_(historicalHighestByUser[s.UserID], 0), weeklyRP
    );
    if (highestWeeklyRP > matFiniteNumber_(s.HighestWeeklyRP, 0) && s._rowNumber) {
      matUpdateObjectRow_(matGetStudentsSheet_(), s._rowNumber, { HighestWeeklyRP: highestWeeklyRP });
      s.HighestWeeklyRP = highestWeeklyRP;
    }
    const highestMonthlyRP = Math.max(0, matFiniteNumber_(s.HighestMonthlyRP, 0), matFiniteNumber_(historicalHighestMonthlyByUser[s.UserID], 0), monthlyRP);
    if (highestMonthlyRP > matFiniteNumber_(s.HighestMonthlyRP, 0) && s._rowNumber) {
      matUpdateObjectRow_(matGetStudentsSheet_(), s._rowNumber, { HighestMonthlyRP: highestMonthlyRP });
      s.HighestMonthlyRP = highestMonthlyRP;
    }
    const examStats = examStatsByUser[s.UserID] || { matches: 0, correct: 0, wrong: 0, accuracy: 0 };
    return {
      userId: s.UserID, playerId: s.UserID, uid: s.UserID,
      username: s.Name || 'Medical Student', name: s.Name || 'Medical Student',
      accountType: s.AccountType || 'GUEST', isAdmin: String(s.AccountType || '').toUpperCase() === 'REGISTERED' && matPromoIsAdmin_(s), isGoldName: matPromoHasGoldName_(s), showGoldName: String(s.ShowGoldName == null || s.ShowGoldName === '' ? 'TRUE' : s.ShowGoldName).toUpperCase() !== 'FALSE', college: s.College || '', batch: s.Batch || '',
      avatar: String(s.Avatar || ''), Avatar: String(s.Avatar || ''),
      xp: Number(s.XP || 0), level: Number(s.Level || 1),
      // Weekly leaderboard must never display a higher rank for a zero-Weekly-RP account.
      rank: safePeriod === 'weekly' && weeklyRP <= 0 ? MAT_RANKS[0] : (s.Rank || MAT_RANKS[0]),
      rankPoints: Number(s.RP || 0), rp: Number(s.RP || 0),
      // Lifetime RP is cumulative across all time; never substitute weekly/monthly RP.
      totalRP: Math.max(0, matFiniteNumber_(s.TotalRP, 0), matFiniteNumber_(s.RP, 0)),
      lifetimeRP: Math.max(0, matFiniteNumber_(s.TotalRP, 0), matFiniteNumber_(s.RP, 0)),
      TotalRP: Math.max(0, matFiniteNumber_(s.TotalRP, 0), matFiniteNumber_(s.RP, 0)),
      rankProgress: matGetRankProgress_(s.Rank, s.RP),
      leaderboardRequiredRPMultiplier: safePeriod === 'monthly' ? 5 : 1,
      levelProgress: matGetLevelProgress_(s.XP),
      monthlyRP: monthlyRP,
      monthlyRankPoints: monthlyRP,
      highestWeeklyRP: highestWeeklyRP,
      highestMonthlyRP: highestMonthlyRP,
      weeklyRP: weeklyRP, weeklyRankPoints: weeklyRP,
      rankScore: safePeriod === 'weekly' ? weeklyRP : monthlyRP,
      score: safePeriod === 'weekly' ? weeklyRP : monthlyRP,
      matches: Number(examStats.matches || 0), completedExams: Number(examStats.matches || 0),
      correctCount: Number(examStats.correct || 0), wrongCount: Number(examStats.wrong || 0),
      accuracy: Number(examStats.accuracy || 0),
      streak: (s.Streak != null && String(s.Streak).trim() !== '' && Number.isFinite(Number(s.Streak)))
        ? Math.max(0, Math.floor(Number(s.Streak))) : Number(examStats.streak || 0),
      highestStreak: Math.max(
        (s.Streak != null && String(s.Streak).trim() !== '' && Number.isFinite(Number(s.Streak)))
          ? Math.max(0, Math.floor(Number(s.Streak))) : Number(examStats.streak || 0),
        Math.max(0, Math.floor(matFiniteNumber_(s.HighestStreak, 0)))
      ),
    };
  });
  rows.sort(function (a, b) {
    const primaryA = safePeriod === 'weekly' ? a.weeklyRP : a.monthlyRP;
    const primaryB = safePeriod === 'weekly' ? b.weeklyRP : b.monthlyRP;
    return primaryB - primaryA || b.xp - a.xp || String(a.name).localeCompare(String(b.name));
  });
  rows.forEach(function (row, index) { row.position = index + 1; });
  let visibleRows;
  if (requestedIdSet.size) {
    visibleRows = rows.slice(0, requestedIdSet.size);
  } else if (includeIdSet.size) {
    const visibleIds = new Set(rows.slice(0, MAT_CONFIG.LEADERBOARD_SIZE).map(function (row) { return String(row.userId); }));
    includeIdSet.forEach(function (id) { visibleIds.add(id); });
    visibleRows = rows.filter(function (row) { return visibleIds.has(String(row.userId)); });
  } else {
    visibleRows = rows.slice(0, MAT_CONFIG.LEADERBOARD_SIZE);
  }
  const response = {
    success: true, period: safePeriod, scope: safePeriod,
    weekly: safePeriod === 'weekly', monthly: safePeriod === 'monthly',
    weekStart: matWeekStartKey_(), monthStart: matMonthStartKey_(),
    entries: visibleRows, users: visibleRows
  };
  if (safePeriod === 'weekly') response.weeklyEntries = visibleRows;
  else response.monthlyEntries = visibleRows;
  return response;
}

function matWeekStartKeyForDate_(dateKey) {
  const parts = String(dateKey || '').split('-').map(Number);
  if (parts.length !== 3 || !parts.every(Number.isFinite)) return '';
  const utc = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const daysSinceSaturday = (utc.getUTCDay() + 1) % 7;
  utc.setUTCDate(utc.getUTCDate() - daysSinceSaturday);
  return Utilities.formatDate(utc, 'UTC', 'yyyy-MM-dd');
}

// Backfill the all-time weekly record from existing exam and RP event history,
// so the new profile stat does not start at zero for accounts with older data.
function matGetHighestWeeklyRPByUser_(endExclusive) {
  const weekEnd = String(endExclusive || '');
  const totalsByWeek = {};
  matReadObjects_(matGetExamSheet_()).forEach(function (row) {
    const recordType = String(row.RecordType || '').toUpperCase();
    if (!matIsExamRecord_(row) && recordType !== 'RP_EVENT') return;
    const rewardStatus = String(row.RewardStatus || '').toUpperCase();
    if (rewardStatus && rewardStatus !== 'COMMITTED') return;
    const dateKey = matDateKey_(row.SubmittedAt);
    if (!dateKey || (weekEnd && dateKey >= weekEnd)) return;
    const userId = String(row.UserID || '');
    const weekKey = matWeekStartKeyForDate_(dateKey);
    if (!userId || !weekKey) return;
    if (!totalsByWeek[weekKey]) totalsByWeek[weekKey] = {};
    totalsByWeek[weekKey][userId] = (totalsByWeek[weekKey][userId] || 0) +
      Math.max(0, matFiniteNumber_(row.RPEarned, 0));
  });
  const highestByUser = {};
  Object.keys(totalsByWeek).forEach(function (weekKey) {
    Object.keys(totalsByWeek[weekKey]).forEach(function (userId) {
      highestByUser[userId] = Math.max(
        highestByUser[userId] || 0,
        totalsByWeek[weekKey][userId]
      );
    });
  });
  return highestByUser;
}

function matGetWeeklyRPByUser_(startInclusive, endExclusive) {
  const weekStart = String(startInclusive || matWeekStartKey_());
  const weekEnd = String(endExclusive || '');
  const exams = matReadObjects_(matGetExamSheet_());
  const totals = {};
  exams.forEach(function (r) {
    const recordType = String(r.RecordType || '').toUpperCase();
    if (!matIsExamRecord_(r) && recordType !== 'RP_EVENT') return;
    const rewardStatus = String(r.RewardStatus || '').toUpperCase();
    if (rewardStatus && rewardStatus !== 'COMMITTED') return;
    const dateKey = matDateKey_(r.SubmittedAt);
    if (!dateKey || dateKey < weekStart || (weekEnd && dateKey >= weekEnd)) return;
    const uid = String(r.UserID || '');
    if (!uid) return;
    totals[uid] = (totals[uid] || 0) + Math.max(0, matFiniteNumber_(r.RPEarned, 0));
  });
  return totals;
}

function matGetMonthlyRPByUser_(startInclusive, endExclusive) {
  // Monthly RP always follows the Bangladesh calendar month (Asia/Dhaka).
  // The end boundary is exclusive: next month's first day at 00:00 Asia/Dhaka.
  const monthStart = String(startInclusive || matMonthStartKey_());
  const monthEnd = String(endExclusive || matOffsetMonthStartKey_(monthStart, 1));
  const totals = {};
  matReadObjects_(matGetExamSheet_()).forEach(function (row) {
    const recordType = String(row.RecordType || '').toUpperCase();
    if (!matIsExamRecord_(row) && recordType !== 'RP_EVENT' && recordType !== 'MONTHLY_START') return;
    const rewardStatus = String(row.RewardStatus || '').toUpperCase();
    if (rewardStatus && rewardStatus !== 'COMMITTED') return;
    const dateKey = matDateKey_(row.SubmittedAt);
    if (!dateKey || dateKey < monthStart || (monthEnd && dateKey >= monthEnd)) return;
    const userId = String(row.UserID || '');
    if (!userId) return;
    totals[userId] = (totals[userId] || 0) + Math.max(0, matFiniteNumber_(row.RPEarned, 0));
  });
  return totals;
}

// Backfill the all-time highest monthly RP from committed exam and RP-event history.
function matGetHighestMonthlyRPByUser_(endExclusive) {
  const monthEnd = String(endExclusive || '');
  const totalsByMonth = {};
  matReadObjects_(matGetExamSheet_()).forEach(function (row) {
    const recordType = String(row.RecordType || '').toUpperCase();
    if (!matIsExamRecord_(row) && recordType !== 'RP_EVENT' && recordType !== 'MONTHLY_START') return;
    const rewardStatus = String(row.RewardStatus || '').toUpperCase();
    if (rewardStatus && rewardStatus !== 'COMMITTED') return;
    const dateKey = matDateKey_(row.SubmittedAt);
    if (!dateKey || (monthEnd && dateKey >= monthEnd)) return;
    const userId = String(row.UserID || '');
    const monthKey = dateKey.slice(0, 7);
    if (!userId || !monthKey) return;
    if (!totalsByMonth[monthKey]) totalsByMonth[monthKey] = {};
    totalsByMonth[monthKey][userId] = (totalsByMonth[monthKey][userId] || 0) +
      Math.max(0, matFiniteNumber_(row.RPEarned, 0));
  });
  const highestByUser = {};
  Object.keys(totalsByMonth).forEach(function (monthKey) {
    Object.keys(totalsByMonth[monthKey]).forEach(function (userId) {
      highestByUser[userId] = Math.max(highestByUser[userId] || 0, totalsByMonth[monthKey][userId]);
    });
  });
  return highestByUser;
}

function matMainRankRequiredRP_(rankIndex) {
  const start = Math.floor(Math.max(0, Number(rankIndex) || 0) / 5) * 5;
  const end = Math.min(start + 5, MAT_RANKS.length);
  let required = 0;
  for (let index = start; index < end; index++) required += matRankPromotionCost_(index);
  return required;
}

function matMainRankSafeZoneThreshold_(rankIndex) {
  if (rankIndex < 0 || rankIndex >= MAT_RANKS.length - 1) return 0;
  const tierRequiredRP = matMainRankRequiredRP_(rankIndex);
  const tierStartRP = Math.max(0, matRankTierCumulativeCap_(rankIndex) - tierRequiredRP);
  return tierStartRP + Math.ceil(tierRequiredRP * 0.30);
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
  const student = matFindStudentById_(uid);
  if (student) {
    const weeklyRPByUser = matGetWeeklyRPByUser_();
    const monthlyRPByUser = matGetMonthlyRPByUser_();
    matApplyPeriodRankPromotion_(student, weeklyRPByUser[uid], monthlyRPByUser[uid]);
  }
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
  const monthlyRPByUser = matGetMonthlyRPByUser_();
  const rows = matReadObjects_(matGetStudentsSheet_()).map(matNormaliseStudent_).map(function (student) {
    student.MonthlyRP = Math.max(0, Number(monthlyRPByUser[String(student.UserID || '')] || 0));
    return student;
  });
  rows.sort(function (a, b) {
    return Number(b.MonthlyRP || 0) - Number(a.MonthlyRP || 0) ||
      Number(b.XP || 0) - Number(a.XP || 0) ||
      String(a.Name || '').localeCompare(String(b.Name || ''));
  });
  return rows.slice(0, MAT_CONFIG.TOP_ACTIVITY_SIZE).map(function (r, i) {
    return {
      userId: String(r.UserID),
      name: String(r.Name || 'Medical Student'),
      monthlyRP: Number(r.MonthlyRP || 0),
      monthStart: matMonthStartKey_(),
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
      const currentMonth = matMonthStartKey_();
      if (Array.isArray(arr) && arr.every(function (row) { return row && Object.prototype.hasOwnProperty.call(row, 'monthlyRP') && String(row.monthStart || '') === currentMonth; })) return arr;
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
          ' with ' + current.monthlyRP + ' Monthly RP. Event time: ' + matFormatTime_(eventTime) + '.'
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
      const gap = Number(current.monthlyRP || 0) - Number(other.monthlyRP || 0);
      return other.name + ' (now ' + (theirNew ? '#' + theirNew.position : 'outside Top 10') +
        ', gap ' + gap + ' RP)';
    });

    const message = crossed.length
      ? '📊 Medical leaderboard activity: ' + current.name + ' climbed #' + previous.position +
        ' → #' + current.position + ' and passed ' + crossed.join('; ') +
        '. Event time: ' + matFormatTime_(eventTime) + '.'
      : '📈 Medical leaderboard activity: ' + current.name + ' climbed #' + previous.position +
        ' → #' + current.position + ' (' + current.monthlyRP + ' Monthly RP). Event time: ' + matFormatTime_(eventTime) + '.';
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
  const fromStudent = matFindStudentById_(String(row.FromUserID || ''));
  const toStudent = matFindStudentById_(String(row.ToUserID || ''));
  return {
    id: String(row.RecordID || ''),
    fromUid: String(row.FromUserID || ''),
    toUid: String(row.ToUserID || ''),
    fromName: String(row.FromName || 'Student'),
    fromIsGoldName: fromStudent ? matPromoHasGoldName_(fromStudent) : false,
    fromShowGoldName: !fromStudent || String(fromStudent.ShowGoldName == null || fromStudent.ShowGoldName === '' ? 'TRUE' : fromStudent.ShowGoldName).toUpperCase() !== 'FALSE',
    fromCollege: String(row.FromCollege || ''),
    fromBatch: String(row.FromBatch || ''),
    toName: String(row.ToName || 'Student'),
    toIsGoldName: toStudent ? matPromoHasGoldName_(toStudent) : false,
    toShowGoldName: !toStudent || String(toStudent.ShowGoldName == null || toStudent.ShowGoldName === '' ? 'TRUE' : toStudent.ShowGoldName).toUpperCase() !== 'FALSE',
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
function matRequestGuestDeletion_(p) {
  const user = matAuthenticate_(p);
  if (String(user.AccountType || '').toUpperCase() !== 'GUEST') throw new Error('This flow is only for Guest accounts.');
  const lock = LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  try {
    const latest = matFindStudentById_(user.UserID);
    if (!latest || String(latest.AccountType || '').toUpperCase() !== 'GUEST') throw new Error('Guest account not found.');
    if (latest.GuestDeletionScheduledAt) {
      const scheduled = Date.parse(String(latest.GuestDeletionScheduledAt));
      if (Number.isFinite(scheduled) && scheduled > Date.now()) {
        return { success: true, pending: true, requestedAt: String(latest.GuestDeletionRequestedAt || ''), scheduledAt: String(latest.GuestDeletionScheduledAt), user: matPublicProfile_(latest, true) };
      }
    }
    const now = Date.now();
    const requestedAt = new Date(now).toISOString();
    const scheduledAt = new Date(now + 72 * 60 * 60 * 1000).toISOString();
    matUpdateObjectRow_(matGetStudentsSheet_(), latest._rowNumber, {
      GuestDeletionRequestedAt: requestedAt,
      GuestDeletionScheduledAt: scheduledAt,
      GuestDeletionReason: '',
      LastSeenAt: requestedAt,
      UpdatedAt: requestedAt
    });
    const updated = matFindStudentById_(user.UserID);
    matGuestDeletionAudit_(user.UserID,'SELF_DELETION_REQUESTED',user,'',scheduledAt,'Guest initiated deletion');
    return { success: true, pending: true, requestedAt: requestedAt, scheduledAt: scheduledAt, user: matPublicProfile_(updated, true) };
  } finally {
    lock.releaseLock();
  }
}

function matCancelGuestDeletion_(p) {
  const user = matAuthenticate_(p);
  if (String(user.AccountType || '').toUpperCase() !== 'GUEST') throw new Error('This flow is only for Guest accounts.');
  const lock = LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  try {
    const latest = matFindStudentById_(user.UserID);
    if (!latest || String(latest.AccountType || '').toUpperCase() !== 'GUEST') throw new Error('Guest account not found.');
    const scheduled = Date.parse(String(latest.GuestDeletionScheduledAt || ''));
    if (!Number.isFinite(scheduled) || !latest.GuestDeletionScheduledAt || scheduled <= Date.now()) {
      throw new Error('The deletion window has ended or no deletion is pending.');
    }
    matUpdateObjectRow_(matGetStudentsSheet_(), latest._rowNumber, {
      GuestDeletionRequestedAt: '',
      GuestDeletionScheduledAt: '',
      GuestDeletionReason: '',
      LastSeenAt: matNowIso_(),
      UpdatedAt: matNowIso_()
    });
    const updated = matFindStudentById_(user.UserID);
    matGuestDeletionAudit_(user.UserID,'SELF_DELETION_CANCELLED',user,String(latest.GuestDeletionScheduledAt||''),'','Guest cancelled own deletion');
    return { success: true, pending: false, user: matPublicProfile_(updated, true) };
  } finally {
    lock.releaseLock();
  }
}

function matDeleteAccount_(p) {
  p = p || {};
  const idToken = String(p.idToken || p.firebaseIdToken || '').trim();
  if (!idToken) throw new Error('Firebase ID token is required to delete an account.');
  const firebaseUser = matVerifyFirebaseIdToken_(idToken);
  const userId = String(firebaseUser.localId || '');
  if (!userId) throw new Error('Firebase identity could not be verified for account deletion.');
  const superAdminEmail = String(matScriptProperty_('MAT_SUPER_ADMIN_EMAIL') || '').trim().toLowerCase();
  const authenticatedEmail = String(firebaseUser.email || '').trim().toLowerCase();
  if (superAdminEmail && authenticatedEmail && authenticatedEmail === superAdminEmail) {
    throw new Error('Super Admin account deletion is permanently disabled.');
  }

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
      // Remove every row owned by this UID, not only visible exam rows. This
      // includes RP_EVENT / MONTHLY_START ledger entries and queued activity
      // notifications, so deleted users cannot reappear in weekly/monthly boards.
      if (String(row.UserID || '') === userId) return true;
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
  row.HighestMonthlyRP = Math.max(0, matFiniteNumber_(row.HighestMonthlyRP, 0));
  // Recalculate level from authoritative cumulative XP using the current progression curve.
  row.Level = matGetLevel_(row.XP);
  const storedRank = String(row.Rank || '').trim();
  if (/^Immortal(?:\s+[VIX]+)?$/i.test(storedRank)) row.Rank = 'Immortal';
  else if (MAT_RANKS.indexOf(storedRank) === -1) row.Rank = MAT_RANKS[0];
  return row;
}

function matReconcileStoredRankProgress_(source) {
  let student = matNormaliseStudent_(source);
  student = matPrepareRankProgress_(student, matGetStudentsSheet_());
  // Persist legacy Immortal V/IV/III/II/I records as the single canonical Immortal rank.
  if (source && source._rowNumber && /^Immortal(?:\s+[VIX]+)?$/i.test(String(source.Rank || '').trim()) &&
      String(source.Rank || '').trim() !== 'Immortal') {
    student.UpdatedAt = matNowIso_();
    matUpdateObjectRow_(matGetStudentsSheet_(), source._rowNumber, {
      Rank: 'Immortal',
      UpdatedAt: student.UpdatedAt
    });
  }
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

function matGuestAutoDeletionAt_(student, weeklyRP) {
  const s = student || {};
  if (String(s.AccountType || '').toUpperCase() !== 'GUEST') return '';
  const deadlines = [];
  const scheduled = Date.parse(String(s.GuestDeletionScheduledAt || ''));
  if (Number.isFinite(scheduled) && scheduled > 0) deadlines.push(scheduled);

  const lastSeen = Date.parse(String(s.LastSeenAt || s.CreatedAt || ''));
  const currentWeeklyRP = Math.max(0, matFiniteNumber_(weeklyRP, 0));
  if (Number.isFinite(lastSeen) && lastSeen > 0) {
    if (currentWeeklyRP === 0) {
      const zeroRP = Date.parse(String(s.GuestZeroRPAt || ''));
      const inactivityAnchor = Number.isFinite(zeroRP) && zeroRP > 0
        ? Math.max(zeroRP, lastSeen)
        : lastSeen;
      deadlines.push(inactivityAnchor + 21 * 86400000);
    } else {
      deadlines.push(lastSeen + 90 * 86400000);
    }
  }
  return deadlines.length ? new Date(Math.min.apply(null, deadlines)).toISOString() : '';
}

function matPublicProfile_(r, includeEmail) {
  const s = matReconcileStoredRankProgress_(r);
  const monthlyRPByUser = matGetMonthlyRPByUser_();
  const highestMonthlyRPByUser = matGetHighestMonthlyRPByUser_();
  const weeklyRPByUser = matGetWeeklyRPByUser_();
  const weeklyRP = Math.max(0, Number(weeklyRPByUser[String(s.UserID || '')] || 0));
  const monthlyRP = Math.max(0, Number(monthlyRPByUser[String(s.UserID || '')] || 0));
  // Profile reads are observational; keep the stored Main Rank unchanged.
  const guestAutoDeletionAt = matGuestAutoDeletionAt_(s, weeklyRP);
  const highestMonthlyRP = Math.max(0, matFiniteNumber_(s.HighestMonthlyRP, 0), Number(highestMonthlyRPByUser[String(s.UserID || '')] || 0), monthlyRP);
  const result = {
    userId: s.UserID,
    uid: s.UserID,
    playerId: s.UserID,
    name: s.Name,
    username: s.Name,
    accountType: String(s.AccountType || 'GUEST'),
    isAdmin: String(s.AccountType || '').toUpperCase() === 'REGISTERED' && matPromoIsAdmin_(s),
    isGoldName: matPromoHasGoldName_(s),
    showGoldName: String(s.ShowGoldName == null || s.ShowGoldName === '' ? 'TRUE' : s.ShowGoldName).toUpperCase() !== 'FALSE',
    college: String(s.College || ''),
    batch: String(s.Batch || ''),
    avatar: String(s.Avatar || ''),
    xp: s.XP,
    rankPoints: s.RP,
    rp: s.RP,
    pb: Math.max(0, matFiniteNumber_(s.PB, 0)) + Math.max(0, matFiniteNumber_(s.PromoPB, 0)),
    pendingPB: Math.max(0, matFiniteNumber_(s.PB, 0)) + Math.max(0, matFiniteNumber_(s.PromoPB, 0)),
    promoPB: Math.max(0, matFiniteNumber_(s.PromoPB, 0)),
    totalRP: Math.max(0, matFiniteNumber_(s.TotalRP, 0), matFiniteNumber_(s.RP, 0)),
    lifetimeRP: Math.max(0, matFiniteNumber_(s.TotalRP, 0), matFiniteNumber_(s.RP, 0)),
    weeklyRP: weeklyRP,
    weeklyRankPoints: weeklyRP,
    currentWeekStart: matWeekStartKey_(),
    monthlyRP: monthlyRP,
    monthlyRankPoints: monthlyRP,
    highestWeeklyRP: s.HighestWeeklyRP,
    highestMonthlyRP: highestMonthlyRP,
    level: s.Level,
    levelProgress: matGetLevelProgress_(s.XP),
    rank: s.Rank,
    rankProgress: matGetRankProgress_(s.Rank, s.RP),
    streak: (s.Streak != null && String(s.Streak).trim() !== '' && Number.isFinite(Number(s.Streak))) ? Math.max(0, Math.floor(Number(s.Streak))) : 0,
    highestStreak: Math.max(
      (s.Streak != null && String(s.Streak).trim() !== '' && Number.isFinite(Number(s.Streak))) ? Math.max(0, Math.floor(Number(s.Streak))) : 0,
      Math.max(0, Math.floor(matFiniteNumber_(s.HighestStreak, 0)))
    ),
    createdAt: String(s.CreatedAt || ''),
  };
  if (includeEmail) {
    // Private account-management fields are returned only to the authenticated account owner.
    result.email = String(s.Email || '');
    result.guestDeletionPending = String(s.AccountType || '').toUpperCase() === 'GUEST' && !!s.GuestDeletionScheduledAt;
    result.guestDeletionReason = String(s.GuestDeletionReason || '');
    result.guestDeletionRequestedAt = String(s.GuestDeletionRequestedAt || '');
    result.guestDeletionScheduledAt = String(s.GuestDeletionScheduledAt || '');
    result.guestAutoDeletionAt = guestAutoDeletionAt;
    result.streakActivityDates = matParseStreakDates_(s.StreakActivityDates, matDateKey_(matNowIso_()));
    result.lastStreakActivityDate = String(s.LastStreakActivityDate || '');
    const expiry = matGetPBExpirySettings_(s);
    result.pbExpiryEnabled = expiry.enabled;
    result.pbExpiryValue = expiry.value;
    result.pbExpiryUnit = expiry.unit;
    result.includePendingFriends = String(s.FriendsIncludePending || '').toLowerCase() === 'true';
    result.updatedAt = String(s.UpdatedAt || '');
  }
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


function matMonthStartKey_() {
  const today = matDateKey_(matNowIso_());
  return today.slice(0, 7) + '-01';
}

function matOffsetMonthStartKey_(monthStart, offsetMonths) {
  const parts = String(monthStart || '').split('-').map(Number);
  if (parts.length !== 3 || !parts.every(Number.isFinite)) throw new Error('Invalid month key for monthly review.');
  const utc = new Date(Date.UTC(parts[0], parts[1] - 1 + Number(offsetMonths || 0), 1));
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


/* MAT_PROMO_SYSTEM_V1 — promo PB is held separately from expiring PB. */
function matPromoFixedCode_(){return matScriptProperty_('MAT_PROMO_FIXED_CODE');}
const MAT_PROMO_TZ_='Asia/Dhaka';
function matPromoDate_(){return Utilities.formatDate(new Date(),MAT_PROMO_TZ_,'yyyy-MM-dd');}
function matPromoOffset_(key,n){const a=key.split('-').map(Number),d=new Date(Date.UTC(a[0],a[1]-1,a[2]));d.setUTCDate(d.getUTCDate()+n);return Utilities.formatDate(d,'UTC','yyyy-MM-dd');}
function matPromoPublic_(){
 const key=matPromoDate_(),a=key.split('-').map(Number),d=new Date(Date.UTC(a[0],a[1]-1,a[2])),w=d.getUTCDay();
 if(w===6){const e=matPromoOffset_(key,6).split('-').map(Number),m=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];return {code:'WEEK '+String(a[2]).padStart(2,'0')+' '+m[a[1]-1]+' - '+String(e[2]).padStart(2,'0')+' '+m[e[1]-1],type:'weekly',period:key,reward:800};}
 return {code:'DAILY '+String(a[2]).padStart(2,'0')+'-'+String(a[1]).padStart(2,'0')+'-'+a[0],type:'daily',period:key,reward:200};
}
function matPromoSheets_(){
 const ss=SpreadsheetApp.openById(MAT_CONFIG.PROFILE_SPREADSHEET_ID);
 function get(n,h){let sh=ss.getSheetByName(n);if(!sh)sh=ss.insertSheet(n);if(!sh.getLastRow()){sh.getRange(1,1,1,h.length).setValues([h]);sh.setFrozenRows(1);}else{const old=matHeaders_(sh),miss=h.filter(x=>!old.includes(x));if(miss.length)sh.getRange(1,old.length+1,1,miss.length).setValues([miss]);}return sh;}
 return {admins:get('PromoAdmins',['Email','Role','Status','AddedAt','AddedBy','SuspendedUntil','UpdatedAt','UpdatedBy']),redemptions:get('PromoRedemptions',['RedemptionID','UserID','Code','Type','PeriodKey','RewardPB','RedeemedAt']),guestDeletionRequests:get('AdminGuestDeletionRequests',['RequestID','TargetUserID','Status','RequestedBy','RequestedAt','Reason','ReviewedBy','ReviewedAt','Decision']),guestDeletionAudit:get('GuestDeletionAudit',['EventID','TargetUserID','Event','ActorEmail','ActorRole','EventAt','PreviousDeadline','NewDeadline','Notes'])};
}
function matPromoEmail_(u){return String(u&&u.Email||'').trim().toLowerCase();}
var MAT_PROMO_ADMIN_EMAIL_LOOKUP_ = null;
var MAT_PROMO_GOLD_NAME_EMAIL_LOOKUP_ = null;
function matPromoAdminEmailLookup_(){
 if(MAT_PROMO_ADMIN_EMAIL_LOOKUP_)return MAT_PROMO_ADMIN_EMAIL_LOOKUP_;
 const lookup=Object.create(null),root=String(matScriptProperty_('MAT_SUPER_ADMIN_EMAIL')||'').trim().toLowerCase();
 if(root)lookup[root]=true;
 try{
  matReadObjects_(matPromoSheets_().admins).forEach(function(row){
   const email=String(row.Email||'').trim().toLowerCase();
   const status=String(row.Status||'').trim().toUpperCase(),until=Date.parse(String(row.SuspendedUntil||''));
   if(email&&(status==='ACTIVE'||(status==='SUSPENDED'&&Number.isFinite(until)&&until<=Date.now())))lookup[email]=true;
  });
 }catch(error){Logger.log('Promo admin badge lookup unavailable: '+error);}
 MAT_PROMO_ADMIN_EMAIL_LOOKUP_=lookup;
 return lookup;
}
function matPromoIsAdmin_(u){
 const email=matPromoEmail_(u);
 return !!(email&&matPromoAdminEmailLookup_()[email]);
}
function matPremiumNameAccessSheet_(){
 const ss=SpreadsheetApp.openById(MAT_CONFIG.PROFILE_SPREADSHEET_ID);
 let sh=ss.getSheetByName('PremiumNameAccess');
 if(!sh){sh=ss.insertSheet('PremiumNameAccess');sh.getRange(1,1,1,8).setValues([['UserID','Email','Name','Status','GrantedAt','GrantedBy','UpdatedAt','UpdatedBy']]);sh.setFrozenRows(1);}
 else {
  const old=matHeaders_(sh),missing=['UserID','Email','Name','Status','GrantedAt','GrantedBy','UpdatedAt','UpdatedBy'].filter(function(h){return old.indexOf(h)<0;});
  if(missing.length)sh.getRange(1,old.length+1,1,missing.length).setValues([missing]);
 }
 return sh;
}
function matPremiumNameAccessLookup_(){
 if(MAT_PROMO_GOLD_NAME_EMAIL_LOOKUP_)return MAT_PROMO_GOLD_NAME_EMAIL_LOOKUP_;
 const lookup=Object.create(null);
 try{
  matReadObjects_(matPremiumNameAccessSheet_()).forEach(function(row){
   if(String(row.Status||'').trim().toUpperCase()!=='ACTIVE')return;
   const userId=String(row.UserID||'').trim(),email=String(row.Email||'').trim().toLowerCase();
   if(userId)lookup['uid:'+userId]=true;
   if(email)lookup['email:'+email]=true;
  });
 }catch(error){Logger.log('Premium name access lookup unavailable: '+error);}
 MAT_PROMO_GOLD_NAME_EMAIL_LOOKUP_=lookup;
 return lookup;
}
function matPromoHasGoldName_(u){
 if(!u||String(u.AccountType||'').toUpperCase()!=='REGISTERED')return false;
 if(matPromoIsAdmin_(u))return true;
 const lookup=matPremiumNameAccessLookup_(),userId=String(u.UserID||u.userId||'').trim(),email=matPromoEmail_(u);
 return !!((userId&&lookup['uid:'+userId])||(email&&lookup['email:'+email]));
}
function matPromoRequireSuperAdmin_(p){
 const actor=matPromoRequireAdmin_(p),root=String(matScriptProperty_('MAT_SUPER_ADMIN_EMAIL')||'').trim().toLowerCase();
 if(!root||matPromoEmail_(actor)!==root)throw new Error('Only Super Admin can manage Premium Name access.');
 return actor;
}
function matAdminListPremiumNameAccess_(p){
 matPromoRequireSuperAdmin_(p);
 const latestByUser=Object.create(null);
 matReadObjects_(matPremiumNameAccessSheet_()).forEach(function(row){
  const id=String(row.UserID||'').trim();
  if(!id)return;
  if(!latestByUser[id]||Number(row._rowNumber||0)>Number(latestByUser[id]._rowNumber||0))latestByUser[id]=row;
 });
 const access=Object.keys(latestByUser).map(function(id){
  const row=latestByUser[id];if(String(row.Status||'').trim().toUpperCase()!=='ACTIVE')return null;
  const current=matFindStudentById_(id);
  return {userId:id,name:String(current&&current.Name||row.Name||''),email:String(current&&current.Email||row.Email||''),grantedAt:String(row.GrantedAt||''),status:'ACTIVE'};
 }).filter(Boolean);
 return {success:true,access:access};
}
function matAdminSetPremiumNameAccess_(p){
 const actor=matPromoRequireSuperAdmin_(p),userId=String(p&&p.userId||'').trim(),enabled=p&&p.enabled===true;
 if(!userId)throw new Error('Select a registered member.');
 const target=matFindStudentById_(userId);
 if(!target||String(target.AccountType||'').toUpperCase()!=='REGISTERED')throw new Error('Only registered members can receive Premium Name access.');
 const email=String(target.Email||'').trim().toLowerCase();
 if(!email)throw new Error('Member email is not available.');
 if(matPromoIsAdmin_(target))throw new Error('Admin members already have automatic Golden Name access.');
 const lock=LockService.getScriptLock();lock.waitLock(MAT_LOCK_WAIT_MS);
 let result;
 try{
  const sh=matPremiumNameAccessSheet_(),rows=matReadObjects_(sh),matches=rows.filter(function(row){return String(row.UserID||'').trim()===userId||String(row.Email||'').trim().toLowerCase()===email;});
  const old=matches.reduce(function(best,row){return !best||Number(row._rowNumber||0)>Number(best._rowNumber||0)?row:best;},null);
  const now=matNowIso_(),actorEmail=matPromoEmail_(actor);
  const values=enabled
   ? {UserID:userId,Email:email,Name:String(target.Name||''),Status:'ACTIVE',GrantedAt:old&&old.GrantedAt||now,GrantedBy:old&&old.GrantedBy||actorEmail,UpdatedAt:now,UpdatedBy:actorEmail}
   : {UserID:userId,Email:email,Name:String(target.Name||''),Status:'REVOKED',UpdatedAt:now,UpdatedBy:actorEmail};
  if(matches.length){matches.forEach(function(row){matUpdateObjectRow_(sh,row._rowNumber,values);});}
  else if(enabled){matAppendObject_(sh,values);}
  SpreadsheetApp.flush();
  const verified=matReadObjects_(sh).filter(function(row){return String(row.UserID||'').trim()===userId||String(row.Email||'').trim().toLowerCase()===email;});
  const latest=verified.reduce(function(best,row){return !best||Number(row._rowNumber||0)>Number(best._rowNumber||0)?row:best;},null);
  const actual=!!(latest&&String(latest.Status||'').trim().toUpperCase()==='ACTIVE');
  if(actual!==!!enabled)throw new Error('Golden Name access write verification failed. Please refresh and retry.');
  result={success:true,verified:true,enabled:actual,userId:userId,email:email};
 }finally{lock.releaseLock();}
 MAT_PROMO_GOLD_NAME_EMAIL_LOOKUP_=null;
 return result;
}
function matSetGoldNameVisibility_(p) {
  const user = matAuthenticate_(p);
  if (String(user.AccountType || '').toUpperCase() !== 'REGISTERED' || !matPromoHasGoldName_(user)) {
    throw new Error('Golden Name access required.');
  }
  const visible = p.showGoldName !== false && String(p.showGoldName).toLowerCase() !== 'false';
  matUpdateObjectRow_(matGetStudentsSheet_(), user._rowNumber, {
    ShowGoldName: visible ? 'TRUE' : 'FALSE',
    UpdatedAt: matNowIso_()
  });
  const updated = matFindStudentById_(user.UserID) || user;
  return { success: true, showGoldName: visible, user: matPublicProfile_(updated, true) };
}
function matPromoRequireAdmin_(p){const token=String(p&& (p.idToken||p.firebaseIdToken)||'').trim();if(!token)throw new Error('Registered Admin sign-in required.');const identity=matVerifyFirebaseIdToken_(token);if(identity.emailVerified!==true)throw new Error('Admin account email must be verified in Firebase.');const u=matAuthenticate_(p);u.Email=String(identity.email||'').trim().toLowerCase();if(String(u.AccountType).toUpperCase()!=='REGISTERED'||!matPromoIsAdmin_(u))throw new Error('Admin access required.');return u;}
function matAdminBootstrapStatus_(p){const u=matAuthenticate_(p);let verifiedEmail='';const token=String(p&&(p.idToken||p.firebaseIdToken)||'').trim();if(token){const identity=matVerifyFirebaseIdToken_(token);if(identity.emailVerified===true)verifiedEmail=String(identity.email||'').trim().toLowerCase();}u.Email=verifiedEmail;return {success:true,configured:!!matScriptProperty_('MAT_SUPER_ADMIN_EMAIL'),isAdmin:!!verifiedEmail&&String(u.AccountType).toUpperCase()==='REGISTERED'&&matPromoIsAdmin_(u)};}
function matSetInitialPromoSuperAdmin(email){const e=String(email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))throw new Error('Valid email required.');const p=PropertiesService.getScriptProperties();if(p.getProperty('MAT_SUPER_ADMIN_EMAIL'))throw new Error('Super Admin already configured.');p.setProperty('MAT_SUPER_ADMIN_EMAIL',e);return 'Super Admin configured.';}

/* --------------------- Guest account deletion approval --------------------- */
// Request rows deliberately contain no Guest name, token, email, or profile data.
function matAdminGuestProfileData_(row) {
  row = row || {};
  const userId = String(row.UserID || '');
  const weeklyRPByUser = matGetWeeklyRPByUser_();
  const weeklyRP = Math.max(0, Number(
    row.WeeklyRP || row.WeeklyRankPoints || weeklyRPByUser[userId] || 0
  ) || 0);
  return {
    userId: userId,
    name: String(row.Name || row.DisplayName || 'Guest Student'),
    college: String(row.College || row.CollegeName || ''),
    batch: String(row.Batch || row.Class || row.HSCBatch || ''),
    rank: String(row.Rank || row.CurrentRank || 'Bronze'),
    level: Number(row.Level || 1),
    xp: Number(row.XP || row.TotalXP || 0),
    totalRP: Number(row.TotalRP || row.LifetimeRP || 0),
    weeklyRP: weeklyRP,
    monthlyRP: Number(row.MonthlyRP || 0),
    quizzes: Number(row.Quizzes || row.TotalQuizzes || 0),
    accuracy: Number(row.Accuracy || 0),
    accountType: String(row.AccountType || 'GUEST'),
    guestDeletionPending: !!row.GuestDeletionScheduledAt,
    guestDeletionRequestedAt: String(row.GuestDeletionRequestedAt || ''),
    guestDeletionScheduledAt: String(row.GuestDeletionScheduledAt || ''),
    guestDeletionReason: String(row.GuestDeletionReason || ''),
    guestAutoDeletionAt: matGuestAutoDeletionAt_(row, weeklyRP)
  };
}
function matAdminListGuestDeletionTargets_(p) {
  matPromoRequireAdmin_(p);
  const students = matReadObjects_(matGetStudentsSheet_()).filter(function (row) {
    return String(row.AccountType || '').toUpperCase() === 'GUEST';
  });
  return {success:true,guests:students.map(function (row) {
    const profile = matAdminGuestProfileData_(row);
    return Object.assign(profile, {deletionPending:!!row.GuestDeletionScheduledAt,requestedAt:String(row.GuestDeletionRequestedAt||''),scheduledAt:String(row.GuestDeletionScheduledAt||'')});
  })};
}
function matAdminCreateGuestDeletionRequest_(p) {
  const actor = matPromoRequireAdmin_(p), userId = String(p.userId || '').trim(), reason=String(p.reason||'').trim();
  if (!userId) throw new Error('Select a Guest account.');
  if(reason.length<5||reason.length>500)throw new Error('কারণ ৫ থেকে ৫০০ অক্ষরের মধ্যে লিখুন।');
  const lock = LockService.getScriptLock(); lock.waitLock(MAT_LOCK_WAIT_MS);
  try {
    const target = matFindStudentById_(userId);
    if (!target || String(target.AccountType || '').toUpperCase() !== 'GUEST') throw new Error('Guest account not found.');
    if (target.GuestDeletionScheduledAt) throw new Error('This Guest already has a deletion scheduled.');
    const sh = matPromoSheets_().guestDeletionRequests, rows = matReadObjects_(sh);
    const duplicate = rows.find(function (row) {
      return String(row.TargetUserID || '') === userId && String(row.Status || '').toUpperCase() === 'PENDING';
    });
    if (duplicate) { SpreadsheetApp.flush(); const verified=matReadObjects_(sh).some(function(row){return String(row.RequestID||'')===String(duplicate.RequestID) && String(row.Status||'').trim().toUpperCase()==='PENDING';}); if(!verified) throw new Error('Existing pending request could not be verified.'); return {success:true,requestId:String(duplicate.RequestID),status:'PENDING',existing:true,verified:true}; }
    const id = Utilities.getUuid(), now = matNowIso_();
    matAppendObject_(sh,{RequestID:id,TargetUserID:userId,Status:'PENDING',RequestedBy:matPromoEmail_(actor),RequestedAt:now,Reason:reason,ReviewedBy:'',ReviewedAt:'',Decision:''});
    SpreadsheetApp.flush();
    const saved = matReadObjects_(sh).find(function(row){return String(row.RequestID||'')===id && String(row.Status||'').trim().toUpperCase()==='PENDING';});
    if(!saved) throw new Error('Request could not be verified in the Super Admin approval queue. Please retry; no success was recorded.');
    matGuestDeletionAudit_(userId,'ADMIN_DELETION_REQUESTED',actor,'','','Request '+id);
    return {success:true,requestId:id,status:'PENDING',verified:true};
  } finally { lock.releaseLock(); }
}
function matAdminListGuestDeletionRequests_(p) {
  const actor = matPromoRequireAdmin_(p);
  const root = String(matScriptProperty_('MAT_SUPER_ADMIN_EMAIL') || '').trim().toLowerCase();
  if (!root || matPromoEmail_(actor) !== root) throw new Error('Only Super Admin can view Guest deletion requests.');
  SpreadsheetApp.flush();
  const rows = matReadObjects_(matPromoSheets_().guestDeletionRequests);
  return {success:true,requests:rows.filter(function(row){return String(row.Status||'').trim().toUpperCase()==='PENDING' && String(row.RequestID||'').trim();}).map(function(row){
    const userId = String(row.TargetUserID || '');
    const target = matFindStudentById_(userId);
    return {requestId:String(row.RequestID||''),userId:userId,name:target?String(target.Name||target.DisplayName||'Guest Student'):'Account unavailable',profile:target?matAdminGuestProfileData_(target):null,requestedAt:String(row.RequestedAt||''),requestedBy:String(row.RequestedBy||''),reason:String(row.Reason||'')};
  })};
}
function matAdminResolveGuestDeletionRequest_(p) {
  const actor = matPromoRequireAdmin_(p);
  const root = String(matScriptProperty_('MAT_SUPER_ADMIN_EMAIL') || '').trim().toLowerCase();
  if (!root || matPromoEmail_(actor) !== root) throw new Error('Only Super Admin can approve or reject Guest deletion.');
  const requestId = String(p.requestId || '').trim(), decision = String(p.decision || '').trim().toUpperCase();
  if (!requestId || ['APPROVE','REJECT'].indexOf(decision) < 0) throw new Error('Invalid approval decision.');
  const lock = LockService.getScriptLock(); lock.waitLock(MAT_LOCK_WAIT_MS);
  try {
    const sh = matPromoSheets_().guestDeletionRequests, row = matReadObjects_(sh).find(function(item){return String(item.RequestID||'')===requestId;});
    if (!row || String(row.Status||'').toUpperCase()!=='PENDING') throw new Error('Request is no longer pending.');
    const now = matNowIso_(), userId = String(row.TargetUserID||'');
    if (decision === 'APPROVE') {
      const target = matFindStudentById_(userId);
      if (!target || String(target.AccountType||'').toUpperCase()!=='GUEST') throw new Error('Guest account no longer exists.');
      // The existing scheduled Guest cleanup trigger performs the full Sheets cleanup.
      const scheduledAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      matUpdateObjectRow_(matGetStudentsSheet_(),target._rowNumber,{GuestDeletionRequestedAt:now,GuestDeletionScheduledAt:scheduledAt,GuestDeletionReason:String(row.Reason||''),UpdatedAt:now});
    }
    matUpdateObjectRow_(sh,row._rowNumber,{Status:decision==='APPROVE'?'APPROVED':'REJECTED',ReviewedBy:matPromoEmail_(actor),ReviewedAt:now,Decision:decision});
    const latestTarget=matFindStudentById_(userId);
    matGuestDeletionAudit_(userId,decision==='APPROVE'?'ADMIN_DELETION_APPROVED':'ADMIN_DELETION_REJECTED',actor,'',latestTarget&&latestTarget.GuestDeletionScheduledAt||'', 'Request '+requestId);
    return {success:true,status:decision==='APPROVE'?'APPROVED':'REJECTED'};
  } finally { lock.releaseLock(); }
}


function matGuestDeletionAudit_(userId,event,actor,previousDeadline,newDeadline,notes){
  const email=matPromoEmail_(actor),root=String(matScriptProperty_('MAT_SUPER_ADMIN_EMAIL')||'').trim().toLowerCase();
  matAppendObject_(matPromoSheets_().guestDeletionAudit,{EventID:Utilities.getUuid(),TargetUserID:String(userId||''),Event:String(event||''),ActorEmail:email,ActorRole:email===root?'SUPER_ADMIN':'ADMIN',EventAt:matNowIso_(),PreviousDeadline:String(previousDeadline||''),NewDeadline:String(newDeadline||''),Notes:String(notes||'')});
}
function matAdminListGuestDeletionAudit_(p){
  const actor=matPromoRequireAdmin_(p),root=String(matScriptProperty_('MAT_SUPER_ADMIN_EMAIL')||'').trim().toLowerCase();
  if(!root||matPromoEmail_(actor)!==root)throw new Error('Only Super Admin can view deletion audit history.');
  const rows=matReadObjects_(matPromoSheets_().guestDeletionAudit);
  return {success:true,events:rows.slice(-100).reverse().map(function(row){return {eventId:String(row.EventID||''),userId:String(row.TargetUserID||''),event:String(row.Event||''),actor:String(row.ActorEmail||''),role:String(row.ActorRole||''),at:String(row.EventAt||''),previousDeadline:String(row.PreviousDeadline||''),newDeadline:String(row.NewDeadline||''),notes:String(row.Notes||'')};})};
}
function matAdminDeleteGuestDeletionAudit_(p){
  const actor=matPromoRequireAdmin_(p),root=String(matScriptProperty_('MAT_SUPER_ADMIN_EMAIL')||'').trim().toLowerCase();
  if(!root||matPromoEmail_(actor)!==root)throw new Error('Only Super Admin can remove deletion audit records.');
  const ids=Array.isArray(p.eventIds)?Array.from(new Set(p.eventIds.map(function(id){return String(id||'').trim();}).filter(Boolean))):[];
  if(!ids.length||ids.length>100)throw new Error('Select between 1 and 100 audit records.');
  const lock=LockService.getScriptLock();lock.waitLock(MAT_LOCK_WAIT_MS);
  try{
    const sheet=matPromoSheets_().guestDeletionAudit,values=sheet.getDataRange().getValues(),headers=values.length?values[0].map(String):[],idColumn=headers.indexOf('EventID');
    if(idColumn<0)throw new Error('Audit EventID column is missing.');
    const wanted=Object.create(null);ids.forEach(function(id){wanted[id]=true;});
    const rowsToDelete=[];
    for(let i=1;i<values.length;i++){const id=String(values[i][idColumn]||'').trim();if(id&&wanted[id])rowsToDelete.push(i+1);}
    if(rowsToDelete.length!==ids.length)throw new Error('One or more selected audit records were not found. Refresh the history and try again.');
    rowsToDelete.sort(function(a,b){return b-a;}).forEach(function(rowNumber){sheet.deleteRow(rowNumber);});
    SpreadsheetApp.flush();
    return {success:true,removed:rowsToDelete.length};
  }finally{lock.releaseLock();}
}
function matAdminCancelGuestDeletion_(p){
  const actor=matPromoRequireAdmin_(p),root=String(matScriptProperty_('MAT_SUPER_ADMIN_EMAIL')||'').trim().toLowerCase();
  if(!root||matPromoEmail_(actor)!==root)throw new Error('Only Super Admin can cancel an admin-approved Guest deletion.');
  const userId=String(p.userId||'').trim();if(!userId)throw new Error('Guest account required.');
  const lock=LockService.getScriptLock();lock.waitLock(MAT_LOCK_WAIT_MS);
  try{
    const target=matFindStudentById_(userId);
    if(!target||String(target.AccountType||'').toUpperCase()!=='GUEST')throw new Error('Guest account not found.');
    const old=String(target.GuestDeletionScheduledAt||'');if(!old||Date.parse(old)<=Date.now())throw new Error('No cancellable deletion is pending.');
    matUpdateObjectRow_(matGetStudentsSheet_(),target._rowNumber,{GuestDeletionRequestedAt:'',GuestDeletionScheduledAt:'',GuestDeletionReason:'',UpdatedAt:matNowIso_()});
    matGuestDeletionAudit_(userId,'ADMIN_DELETION_CANCELLED',actor,old,'','Cancelled by Super Admin');
    return {success:true,cancelled:true,userId:userId};
  }finally{lock.releaseLock();}
}
function matAdminExtendGuestDeletion_(p){
  const actor=matPromoRequireAdmin_(p),userId=String(p.userId||'').trim(),extensionMinutes=Math.round(Number(p.extensionMinutes)),reason=String(p.reason||'').trim();
  if(!userId||!Number.isSafeInteger(extensionMinutes)||extensionMinutes<1||extensionMinutes>525600)throw new Error('Choose an extension from 1 minute to 365 days.');
  if(!reason)throw new Error('Reason is required to extend a Guest deletion deadline.');
  if(reason.length>1000)throw new Error('Reason must be 1000 characters or fewer.');
  const lock=LockService.getScriptLock();lock.waitLock(MAT_LOCK_WAIT_MS);
  try{
    const target=matFindStudentById_(userId);
    if(!target||String(target.AccountType||'').toUpperCase()!=='GUEST')throw new Error('Guest account not found.');
    const old=String(target.GuestDeletionScheduledAt||''),oldMs=Date.parse(old);
    if(!old||!Number.isFinite(oldMs)||oldMs<=Date.now())throw new Error('Only an active pending deletion can be extended.');
    const next=new Date(oldMs+extensionMinutes*60000).toISOString();
    if(Date.parse(next)<=oldMs)throw new Error('A deadline cannot be shortened.');
    matUpdateObjectRow_(matGetStudentsSheet_(),target._rowNumber,{GuestDeletionScheduledAt:next,UpdatedAt:matNowIso_()});
    const durationLabel=extensionMinutes%1440===0?(extensionMinutes/1440)+' day(s)':extensionMinutes%60===0?(extensionMinutes/60)+' hour(s)':extensionMinutes+' minute(s)';
    matGuestDeletionAudit_(userId,'DEADLINE_EXTENDED',actor,old,next,'Extension: '+durationLabel+'. Reason: '+reason);
    return {success:true,userId:userId,previousDeadline:old,scheduledAt:next,extensionMinutes:extensionMinutes,reason:reason};
  }finally{lock.releaseLock();}
}

function matAdminListMembers_(p){
 const actor=matPromoRequireAdmin_(p),root=String(matScriptProperty_('MAT_SUPER_ADMIN_EMAIL')||'').trim().toLowerCase(),now=Date.now();
 const students=matReadObjects_(matGetStudentsSheet_()).filter(function(row){return String(row.AccountType||'').trim().toUpperCase()==='REGISTERED';}),byEmail=Object.create(null);
 students.forEach(function(row){const email=String(row.Email||'').trim().toLowerCase();if(email)byEmail[email]=row;});
 function memberRecord(email,role,status,until){
  const key=String(email||'').trim().toLowerCase(),student=byEmail[key]||null,profile=student?matPublicProfile_(student,false):null;
  return {email:matPromoEmail_(actor)===root?key:'',role:role,status:status,suspendedUntil:status==='SUSPENDED'?until:'',userId:student?String(student.UserID||''):'',websiteName:profile?String(profile.name||''):'',profile:profile};
 }
 const admins=matReadObjects_(matPromoSheets_().admins).filter(function(row){
  return String(row.Status||'').trim().toUpperCase()!=='REMOVED';
 }).map(function(row){
  const status=String(row.Status||'').trim().toUpperCase(),until=String(row.SuspendedUntil||''),untilMs=Date.parse(until),effective=status==='SUSPENDED'&&Number.isFinite(untilMs)&&untilMs<=now?'ACTIVE':status;
  return memberRecord(row.Email,'ADMIN',effective,until);
 });
 return {success:true,canManage:matPromoEmail_(actor)===root,members:[memberRecord(root,'SUPER_ADMIN','ACTIVE','')].concat(admins)};
}
function matAdminAddMember_(p){const actor=matPromoRequireAdmin_(p),root=String(matScriptProperty_('MAT_SUPER_ADMIN_EMAIL')||'').trim().toLowerCase();if(matPromoEmail_(actor)!==root)throw new Error('Only Super Admin can manage Admin Members.');const e=String(p.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))throw new Error('Valid registered email required.');const registered=matReadObjects_(matGetStudentsSheet_()).some(x=>String(x.AccountType||'').toUpperCase()==='REGISTERED'&&String(x.Email||'').trim().toLowerCase()===e);if(!registered)throw new Error('এই email দিয়ে আগে website-এ একবার sign in করতে হবে।');if(e===root)throw new Error('Already Super Admin.');const sh=matPromoSheets_().admins,rows=matReadObjects_(sh),r=rows.find(x=>String(x.Email||'').toLowerCase()===e);if(r)matUpdateObjectRow_(sh,r._rowNumber,{Status:'ACTIVE',SuspendedUntil:'',UpdatedAt:matNowIso_(),UpdatedBy:root});else matAppendObject_(sh,{Email:e,Role:'ADMIN',Status:'ACTIVE',AddedAt:matNowIso_(),AddedBy:root});MAT_PROMO_ADMIN_EMAIL_LOOKUP_=null;return matAdminListMembers_(p);}
function matAdminRemoveMember_(p){
  const actor=matPromoRequireAdmin_(p);
  const root=String(matScriptProperty_('MAT_SUPER_ADMIN_EMAIL')||'').trim().toLowerCase();
  if(matPromoEmail_(actor)!==root)throw new Error('Only Super Admin can manage Admin Members.');
  const email=String(p.email||'').trim().toLowerCase();
  if(!email||email===root)throw new Error('Super Admin cannot be removed.');
  const lock=LockService.getScriptLock();
  lock.waitLock(MAT_LOCK_WAIT_MS);
  try{
    const sheet=matPromoSheets_().admins;
    const member=matReadObjects_(sheet).find(row=>String(row.Email||'').trim().toLowerCase()===email);
    if(!member)throw new Error('Admin Member not found or already removed.');
    if(String(member.Status||'').trim().toUpperCase()==='REMOVED')throw new Error('Admin Member is already removed.');
    matUpdateObjectRow_(sheet,member._rowNumber,{
      Status:'REMOVED',SuspendedUntil:'',UpdatedAt:matNowIso_(),UpdatedBy:root
    });
    SpreadsheetApp.flush();
    const verified=matReadObjects_(sheet).find(row=>String(row.Email||'').trim().toLowerCase()===email);
    if(!verified||String(verified.Status||'').trim().toUpperCase()!=='REMOVED'){
      throw new Error('Admin access removal could not be verified. Refresh and try again.');
    }
    MAT_PROMO_ADMIN_EMAIL_LOOKUP_=null;
  }finally{
    lock.releaseLock();
  }
  const refreshed=matAdminListMembers_(p);
  return Object.assign({},refreshed,{removed:true,email:email,status:'REMOVED',verified:true});
}
function matAdminSuspendMember_(p){const actor=matPromoRequireAdmin_(p),root=String(matScriptProperty_('MAT_SUPER_ADMIN_EMAIL')||'').trim().toLowerCase();if(matPromoEmail_(actor)!==root)throw new Error('Only Super Admin can suspend Admin Members.');const e=String(p.email||'').trim().toLowerCase(),minutes=Math.round(Number(p.durationMinutes));if(!e||e===root)throw new Error('Super Admin cannot be suspended.');if(!Number.isSafeInteger(minutes)||minutes<1||minutes>525600)throw new Error('Suspension must be between 1 minute and 365 days.');const sh=matPromoSheets_().admins,r=matReadObjects_(sh).find(x=>String(x.Email||'').toLowerCase()===e);if(!r||String(r.Status||'').toUpperCase()==='REMOVED')throw new Error('Active Admin Member not found.');const until=new Date(Date.now()+minutes*60000).toISOString();matUpdateObjectRow_(sh,r._rowNumber,{Status:'SUSPENDED',SuspendedUntil:until,UpdatedAt:matNowIso_(),UpdatedBy:root});MAT_PROMO_ADMIN_EMAIL_LOOKUP_=null;return {success:true,email:e,status:'SUSPENDED',suspendedUntil:until};}
function matAdminReactivateMember_(p){const actor=matPromoRequireAdmin_(p),root=String(matScriptProperty_('MAT_SUPER_ADMIN_EMAIL')||'').trim().toLowerCase();if(matPromoEmail_(actor)!==root)throw new Error('Only Super Admin can reactivate Admin Members.');const e=String(p.email||'').trim().toLowerCase();if(!e||e===root)throw new Error('Invalid Admin Member.');const sh=matPromoSheets_().admins,r=matReadObjects_(sh).find(x=>String(x.Email||'').toLowerCase()===e);if(!r||String(r.Status||'').toUpperCase()==='REMOVED')throw new Error('Admin Member not found or already removed.');matUpdateObjectRow_(sh,r._rowNumber,{Status:'ACTIVE',SuspendedUntil:'',UpdatedAt:matNowIso_(),UpdatedBy:root});MAT_PROMO_ADMIN_EMAIL_LOOKUP_=null;return {success:true,email:e,status:'ACTIVE'};}
function matGetPromoInfo_(p){
 const u=matAuthenticate_(p),c=matPromoPublic_();
 let verifiedEmail='',isAdmin=false;
 const token=String(p&&(p.idToken||p.firebaseIdToken)||'').trim();
 if(token){
  const identity=matVerifyFirebaseIdToken_(token);
  if(identity.emailVerified===true)verifiedEmail=String(identity.email||'').trim().toLowerCase();
 }
 if(verifiedEmail&&String(u.AccountType).toUpperCase()==='REGISTERED'){
  u.Email=verifiedEmail;
  isAdmin=matPromoIsAdmin_(u);
 }
 return {success:true,publicCode:c.code,publicType:c.type,rewardPB:c.reward,promoPB:Math.max(0,matFiniteNumber_(u.PromoPB,0)),isAdmin,adminCode:isAdmin&&matScriptProperty_('MAT_PROMO_FIXED_ENABLED')!=='FALSE'?matPromoFixedCode_():''};
}
function matRedeemPromoCode_(p){
 const u=matAuthenticate_(p),input=String(p.code||'').trim().toUpperCase();if(!input)throw new Error('Promo Code লিখুন।');
 const lock=LockService.getScriptLock();lock.waitLock(MAT_LOCK_WAIT_MS);
 try{const sh=matPromoSheets_().redemptions,c=matPromoPublic_(),now=matNowIso_();let type,period,reward;
 if(input===matPromoFixedCode_() && matScriptProperty_('MAT_PROMO_FIXED_ENABLED')!=='FALSE'){type='unlimited';period='';reward=100000;}
 else if(input===c.code.toUpperCase()){type=c.type;period=c.period;reward=c.reward;}
 else throw new Error('এই Promo Code এখন valid নয়।');
 const rows=matReadObjects_(sh);if(type!=='unlimited'&&rows.some(r=>String(r.UserID)===String(u.UserID)&&String(r.Type)===type&&String(r.PeriodKey)===period))throw new Error('এই period-এর code আপনি ইতিমধ্যে redeem করেছেন।');
 const ss=matGetStudentsSheet_(),current=matFindStudentById_(u.UserID);if(!current)throw new Error('Student profile not found.');
 const balance=Math.max(0,matFiniteNumber_(current.PromoPB,0))+reward;
 matUpdateObjectRow_(ss,current._rowNumber,{PromoPB:balance,UpdatedAt:now});
 matAppendObject_(sh,{RedemptionID:Utilities.getUuid(),UserID:u.UserID,Code:input,Type:type,PeriodKey:period,RewardPB:reward,RedeemedAt:now});
 return {success:true,rewardPB:reward,promoPB:balance,user:matApiUser_(matFindStudentById_(u.UserID))};
 }finally{lock.releaseLock();}
}
function matAdminPromoStatus_(p){matPromoRequireAdmin_(p);const c=matPromoPublic_(),r=matReadObjects_(matPromoSheets_().redemptions);return {success:true,publicCode:c.code,publicType:c.type,publicRewardPB:c.reward,redemptions:r.length,unlimitedEnabled:matScriptProperty_('MAT_PROMO_FIXED_ENABLED')!=='FALSE'};}
function matAdminSetUnlimitedEnabled_(p){
 const actor=matPromoRequireAdmin_(p),root=String(matScriptProperty_('MAT_SUPER_ADMIN_EMAIL')||'').trim().toLowerCase();
 if(!root||matPromoEmail_(actor)!==root)throw new Error('Only Super Admin can change this setting.');
 const enabled=p.enabled===true||String(p.enabled).toLowerCase()==='true';
 PropertiesService.getScriptProperties().setProperty('MAT_PROMO_FIXED_ENABLED',enabled?'TRUE':'FALSE');
 return {success:true,verified:true,enabled:matScriptProperty_('MAT_PROMO_FIXED_ENABLED')==='TRUE'};
}
function matAdminSaveFixedPromoCode_(p){
 const actor=matPromoRequireAdmin_(p),root=String(matScriptProperty_('MAT_SUPER_ADMIN_EMAIL')||'').trim().toLowerCase();
 if(!root||matPromoEmail_(actor)!==root)throw new Error('Only Super Admin can change the Admin-only Promo Code settings.');
 const code=String(p.code||'').trim().toUpperCase();
 if(code.length<3||code.length>80||/^DAILY \d{2}-\d{2}-\d{4}$/.test(code)||/^WEEK \d{2} [A-Z]{3} - \d{2} [A-Z]{3}$/.test(code))throw new Error('Admin-only Promo Code must be 3–80 characters and cannot use a reserved Daily/Weekly format.');
 const reward=matSafeNonNegativeInt_(p.rewardPB,'Master Admin Reward PB');
 const limit=matSafeNonNegativeInt_(p.limitCount,'Master Admin redemption limit');
 const period=matPromoNormalizePeriod_(p.limitPeriod);
 const enabled=p.enabled===false||String(p.enabled).toLowerCase()==='false'?'FALSE':'TRUE';
 const props=PropertiesService.getScriptProperties();
 props.setProperties({MAT_PROMO_FIXED_CODE:code,MAT_PROMO_FIXED_REWARD_PB:String(reward),MAT_PROMO_FIXED_LIMIT_COUNT:String(limit),MAT_PROMO_FIXED_LIMIT_PERIOD:period,MAT_PROMO_FIXED_ENABLED:enabled},false);
 const verified=matScriptProperty_('MAT_PROMO_FIXED_CODE')===code&&Number(matScriptProperty_('MAT_PROMO_FIXED_REWARD_PB'))===reward&&Number(matScriptProperty_('MAT_PROMO_FIXED_LIMIT_COUNT'))===limit&&matPromoNormalizePeriod_(matScriptProperty_('MAT_PROMO_FIXED_LIMIT_PERIOD'))===period&&matScriptProperty_('MAT_PROMO_FIXED_ENABLED')===enabled;
 if(!verified)throw new Error('Master Promo Settings save verification failed.');
 return {success:true,verified:true,code:code,rewardPB:reward,limitCount:limit,limitPeriod:period,enabled:enabled==='TRUE'};
}


/* --------------------- Configurable global/member promo codes --------------------- */
// Global values are defaults. A member row overrides only the fields it explicitly sets.
function matPromoConfigSheets_() {
  const ss = SpreadsheetApp.openById(MAT_CONFIG.PROFILE_SPREADSHEET_ID);
  function ensure(name, headers) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (!sh.getLastRow()) { sh.getRange(1,1,1,headers.length).setValues([headers]); sh.setFrozenRows(1); }
    else {
      const old = matHeaders_(sh), missing = headers.filter(h => old.indexOf(h) < 0);
      if (missing.length) sh.getRange(1, old.length + 1, 1, missing.length).setValues([missing]);
    }
    return sh;
  }
  return {
    global: ensure('PromoGlobalSettings', ['Key','Code','RewardPB','LimitCount','LimitPeriod','Enabled','UpdatedAt','UpdatedBy']),
    members: ensure('PromoMemberSettings', ['UserID','Name','Email','Code','RewardPB','LimitCount','LimitPeriod','Enabled','UpdatedAt','UpdatedBy','AdminCode','AdminRewardPB','AdminLimitCount','AdminLimitPeriod','AdminEnabled'])
  };
}
function matPromoNormalizePeriod_(value) {
  const p = String(value || '').trim().toUpperCase();
  return ['DAILY','WEEKLY','MONTHLY','UNLIMITED'].indexOf(p) >= 0 ? p : 'DAILY';
}
function matPromoWindowKey_(period, now) {
  const date = Utilities.formatDate(now || new Date(), MAT_CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  if (period === 'UNLIMITED') return 'ALL';
  if (period === 'MONTHLY') return date.slice(0,7);
  if (period === 'WEEKLY') {
    const d = new Date(date + 'T12:00:00+06:00');
    const day = Number(Utilities.formatDate(d, MAT_CONFIG.TIME_ZONE, 'u'));
    d.setDate(d.getDate() - ((day + 1) % 7)); // Saturday is the week start.
    return Utilities.formatDate(d, MAT_CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  }
  return date;
}
function matPromoReadConfig_() {
  const sh = matPromoConfigSheets_(), gs = matReadObjects_(sh.global), ms = matReadObjects_(sh.members);
  const g = gs.find(x => String(x.Key || '') === 'GLOBAL') || {};
  return { global:g, members:ms };
}
function matPromoEffectiveConfig_(user, kind, publicCode) {
  const all = matPromoReadConfig_(), own = all.members.find(x => String(x.UserID) === String(user.UserID)) || {};
  const global = all.global;
  const code = String(own.Code || '').trim() || String(global.Code || '').trim() || publicCode;
  const ownEnabled = String(own.Enabled || '').toUpperCase();
  const globalEnabled = String(global.Enabled || '').toUpperCase();
  const enabled = ownEnabled ? ownEnabled !== 'FALSE' : (globalEnabled ? globalEnabled !== 'FALSE' : true);
  const rewardRaw = own.RewardPB !== '' && own.RewardPB != null ? own.RewardPB : (global.RewardPB !== '' && global.RewardPB != null ? global.RewardPB : null);
  const reward = rewardRaw == null ? null : matSafeNonNegativeInt_(rewardRaw, 'Reward PB');
  const limitRaw = own.LimitCount !== '' && own.LimitCount != null ? own.LimitCount : (global.LimitCount !== '' && global.LimitCount != null ? global.LimitCount : null);
  const limitCount = limitRaw == null ? (kind === 'unlimited' ? 0 : 1) : matSafeNonNegativeInt_(limitRaw, 'Redemption limit');
  const periodRaw = String(own.LimitPeriod || '').trim() || String(global.LimitPeriod || '').trim();
  const limitPeriod = periodRaw ? matPromoNormalizePeriod_(periodRaw) : (kind === 'weekly' ? 'WEEKLY' : kind === 'daily' ? 'DAILY' : 'UNLIMITED');
  return { code:code, enabled:enabled, rewardPB:reward == null ? null : reward, limitCount:limitCount, limitPeriod:limitPeriod, hasMemberOverride:!!Object.keys(own).length, member:own, global:global };
}
function matPromoAdminMemberConfig_(row, code) {
  row = row || {};
  // A member-specific Admin override wins; otherwise use Super Admin's shared master settings.
  const rewardDefault = matSafeNonNegativeInt_(matScriptProperty_('MAT_PROMO_FIXED_REWARD_PB') || 100000, 'Master Admin Reward PB');
  const limitDefault = matSafeNonNegativeInt_(matScriptProperty_('MAT_PROMO_FIXED_LIMIT_COUNT') || 0, 'Master Admin redemption limit');
  const periodDefault = matPromoNormalizePeriod_(matScriptProperty_('MAT_PROMO_FIXED_LIMIT_PERIOD') || 'UNLIMITED');
  const reward = row.AdminRewardPB === '' || row.AdminRewardPB == null ? rewardDefault : matSafeNonNegativeInt_(row.AdminRewardPB, 'Admin Reward PB');
  const count = row.AdminLimitCount === '' || row.AdminLimitCount == null ? limitDefault : matSafeNonNegativeInt_(row.AdminLimitCount, 'Admin redemption limit');
  const period = String(row.AdminLimitPeriod || '').trim() ? matPromoNormalizePeriod_(row.AdminLimitPeriod) : periodDefault;
  return {code:String(code || row.AdminCode || '').trim().toUpperCase(),enabled:String(row.AdminEnabled || 'TRUE').toUpperCase() !== 'FALSE',rewardPB:reward,limitCount:count,limitPeriod:period};
}
function matPromoCountForLimit_(rows, userId, code, period, windowKey) {
  // A configured member/global limit applies across all Promo Code types for that member.
  return rows.filter(r => String(r.UserID) === String(userId) &&
    String(r.LimitPeriod || 'UNLIMITED').toUpperCase() === period &&
    String(r.LimitWindow || 'ALL') === windowKey).length;
}
function matAdminGetPromoConfig_(p) {
  const actor = matPromoRequireAdmin_(p), all = matPromoReadConfig_();
  const root = String(matScriptProperty_('MAT_SUPER_ADMIN_EMAIL') || '').trim().toLowerCase();
  const canManage = !!root && matPromoEmail_(actor) === root;
  const g = all.global;
  return {success:true, canManage:canManage, global:{
    code:String(g.Code || ''), rewardPB:g.RewardPB === '' || g.RewardPB == null ? '' : Number(g.RewardPB),
    limitCount:g.LimitCount === '' || g.LimitCount == null ? '' : Number(g.LimitCount),
    limitPeriod:String(g.LimitPeriod || 'DAILY'), enabled:String(g.Enabled || 'TRUE') !== 'FALSE'
  }, fixedCode:canManage ? matPromoFixedCode_() : '',
  fixedRewardPB:canManage ? matSafeNonNegativeInt_(matScriptProperty_('MAT_PROMO_FIXED_REWARD_PB') || 100000, 'Master Admin Reward PB') : null,
  fixedLimitCount:canManage ? matSafeNonNegativeInt_(matScriptProperty_('MAT_PROMO_FIXED_LIMIT_COUNT') || 0, 'Master Admin redemption limit') : null,
  fixedLimitPeriod:canManage ? matPromoNormalizePeriod_(matScriptProperty_('MAT_PROMO_FIXED_LIMIT_PERIOD') || 'UNLIMITED') : '',
  fixedEnabled:matScriptProperty_('MAT_PROMO_FIXED_ENABLED') !== 'FALSE'};
}
function matAdminSavePromoConfig_(p) {
  const actor = matPromoRequireAdmin_(p), sh = matPromoConfigSheets_().global;
  const code = String(p.code || '').trim().toUpperCase();
  matPromoValidateCustomCode_(code);

  const reward = p.rewardPB === '' || p.rewardPB == null ? '' : matSafeNonNegativeInt_(p.rewardPB, 'Reward PB');
  const count = p.limitCount === '' || p.limitCount == null ? '' : matSafeNonNegativeInt_(p.limitCount, 'Redemption limit');
  const period = matPromoNormalizePeriod_(p.limitPeriod);
  const enabled = p.enabled === false || String(p.enabled).toLowerCase() === 'false' ? 'FALSE' : 'TRUE';
  const row = matReadObjects_(sh).find(x => String(x.Key) === 'GLOBAL');
  const values = {Key:'GLOBAL',Code:code,RewardPB:reward,LimitCount:count,LimitPeriod:period,Enabled:enabled,UpdatedAt:matNowIso_(),UpdatedBy:matPromoEmail_(actor)};
  if (row) matUpdateObjectRow_(sh,row._rowNumber,values); else matAppendObject_(sh,values);
  return {success:true};
}
function matAdminListPromoTargets_(p) {
  matPromoRequireAdmin_(p);
  const students = matReadObjects_(matGetStudentsSheet_()).filter(x => String(x.AccountType || '').toUpperCase() === 'REGISTERED');
  const settings = matPromoReadConfig_().members;
  const root = String(matScriptProperty_('MAT_SUPER_ADMIN_EMAIL') || '').trim().toLowerCase();
  const canManage = !!root && matPromoEmail_(matPromoRequireAdmin_(p)) === root;
  return {success:true,members:students.map(x => {
    const cfg = settings.find(y => String(y.UserID) === String(x.UserID)) || {};
    const adminTarget = matPromoIsAdmin_(x);
    const reveal = !adminTarget || canManage;
    return {userId:String(x.UserID),name:String(x.Name || ''),email:String(x.Email || ''),isAdmin:adminTarget,
      code:reveal ? String(adminTarget ? cfg.AdminCode || '' : cfg.Code || '') : '',
      rewardPB:reveal ? (adminTarget ? cfg.AdminRewardPB == null ? '' : cfg.AdminRewardPB : cfg.RewardPB == null ? '' : cfg.RewardPB) : '',
      limitCount:reveal ? (adminTarget ? cfg.AdminLimitCount == null ? '' : cfg.AdminLimitCount : cfg.LimitCount == null ? '' : cfg.LimitCount) : '',
      limitPeriod:reveal ? String(adminTarget ? cfg.AdminLimitPeriod || '' : cfg.LimitPeriod || '') : '',
      enabled:reveal ? String((adminTarget ? cfg.AdminEnabled : cfg.Enabled) || 'TRUE') !== 'FALSE' : true,
      hasOverride:reveal && !!(adminTarget ? cfg.AdminCode || cfg.AdminRewardPB != null || cfg.AdminLimitCount != null || cfg.AdminLimitPeriod || cfg.AdminEnabled : cfg.Code || cfg.RewardPB != null || cfg.LimitCount != null || cfg.LimitPeriod || cfg.Enabled)};
  })};
}
function matAdminSaveMemberPromo_(p) {
  const actor = matPromoRequireAdmin_(p);
  const userId = String(p.userId || '').trim();
  if (!userId) throw new Error('Select a registered member.');
  const target = matFindStudentById_(userId);
  if (!target || String(target.AccountType || '').toUpperCase() !== 'REGISTERED') throw new Error('Registered member not found.');
  // Only Super Admin may change promo settings for another Admin account.
  if (matPromoIsAdmin_(target)) {
    const root = String(matScriptProperty_('MAT_SUPER_ADMIN_EMAIL') || '').trim().toLowerCase();
    if (!root || matPromoEmail_(actor) !== root) throw new Error('Only Super Admin can edit Admin-only Promo Code settings.');
  }
  const code = String(p.code || '').trim().toUpperCase();
  matPromoValidateCustomCode_(code);

  const reward = p.rewardPB === '' || p.rewardPB == null ? '' : matSafeNonNegativeInt_(p.rewardPB, 'Reward PB');
  const count = p.limitCount === '' || p.limitCount == null ? '' : matSafeNonNegativeInt_(p.limitCount, 'Redemption limit');
  const period = String(p.limitPeriod || '').trim() ? matPromoNormalizePeriod_(p.limitPeriod) : '';
  const sh = matPromoConfigSheets_().members, rows = matReadObjects_(sh), old = rows.find(x => String(x.UserID) === userId);
  const adminTarget = matPromoIsAdmin_(target);
  const v = adminTarget
    ? {UserID:userId,Name:String(target.Name || ''),Email:String(target.Email || ''),AdminCode:code,AdminRewardPB:reward,AdminLimitCount:count,AdminLimitPeriod:period,AdminEnabled:p.enabled === false || String(p.enabled).toLowerCase() === 'false' ? 'FALSE' : 'TRUE',UpdatedAt:matNowIso_(),UpdatedBy:matPromoEmail_(actor)}
    : {UserID:userId,Name:String(target.Name || ''),Email:String(target.Email || ''),Code:code,RewardPB:reward,LimitCount:count,LimitPeriod:period,Enabled:p.enabled === false || String(p.enabled).toLowerCase() === 'false' ? 'FALSE' : 'TRUE',UpdatedAt:matNowIso_(),UpdatedBy:matPromoEmail_(actor)};
  if (old) matUpdateObjectRow_(sh,old._rowNumber,v); else matAppendObject_(sh,v);
  return {success:true};
}
function matAdminDeleteMemberPromo_(p) {
  const actor = matPromoRequireAdmin_(p);
  const userId = String(p.userId || '').trim();
  if (!userId) throw new Error('Select a registered member.');
  const target = matFindStudentById_(userId);
  if (target && matPromoIsAdmin_(target)) {
    const root = String(matScriptProperty_('MAT_SUPER_ADMIN_EMAIL') || '').trim().toLowerCase();
    if (!root || matPromoEmail_(actor) !== root) throw new Error('Only Super Admin can remove an Admin member promo override.');
  }
  const sh = matPromoConfigSheets_().members;
  const row = matReadObjects_(sh).find(x => String(x.UserID) === userId);
  if (row && target && matPromoIsAdmin_(target)) {
    matUpdateObjectRow_(sh,row._rowNumber,{AdminCode:'',AdminRewardPB:'',AdminLimitCount:'',AdminLimitPeriod:'',AdminEnabled:'',UpdatedAt:matNowIso_(),UpdatedBy:matPromoEmail_(actor)});
  } else if (row) sh.deleteRow(row._rowNumber);
  return {success:true};
}
// Override the legacy endpoint so Admin-only code details are returned only to a verified Admin.
function matGetPromoInfo_(p) {
  const u = matAuthenticate_(p), c = matPromoPublic_();
  let admin = false, fixedCode = '', adminCodeEnabled = false, adminRewardPB = 100000;
  const token = String(p && (p.idToken || p.firebaseIdToken) || '').trim();
  if (token) {
    const identity = matVerifyFirebaseIdToken_(token);
    if (identity.emailVerified === true) {
      u.Email = String(identity.email || '').trim().toLowerCase();
      admin = String(u.AccountType || '').toUpperCase() === 'REGISTERED' && matPromoIsAdmin_(u);
      if (admin) {
        const own = matPromoReadConfig_().members.find(x => String(x.UserID) === String(u.UserID)) || {};
        const ownAdmin = matPromoAdminMemberConfig_(own, own.AdminCode || matPromoFixedCode_());
        fixedCode = ownAdmin.code;
        adminCodeEnabled = ownAdmin.enabled && (String(own.AdminCode || '').trim() ? true : matScriptProperty_('MAT_PROMO_FIXED_ENABLED') !== 'FALSE');
        adminRewardPB = ownAdmin.rewardPB;
      }
    }
  }
  const effective = matPromoEffectiveConfig_(u, c.type, c.code);
  return {success:true,publicCode:c.code,publicType:c.type,rewardPB:effective.rewardPB == null ? c.reward : effective.rewardPB,
    promoPB:Math.max(0,matFiniteNumber_(u.PromoPB,0)),isAdmin:admin,
    adminCode:admin && adminCodeEnabled ? fixedCode : '',
    adminCodeEnabled:admin && adminCodeEnabled,adminCodeRewardPB:adminRewardPB};
}
// Override redemption to enforce verified Admin eligibility and server-side per-code limits.
function matRedeemPromoCode_(p) {
  const input = String(p && p.code || '').trim().toUpperCase();
  if (!input) throw new Error('Promo Code লিখুন।');
  const lock = LockService.getScriptLock(); lock.waitLock(MAT_LOCK_WAIT_MS);
  try {
    let u = matAuthenticate_(p), c = matPromoPublic_(), type = '', periodKey = '', cfg = null, code = '';
    const fixed = matPromoFixedCode_();
    const token = String(p && (p.idToken || p.firebaseIdToken) || '').trim();
    let verifiedAdmin = false;
    if (token) {
      const identity = matVerifyFirebaseIdToken_(token);
      if (identity.emailVerified === true) {
        u.Email = String(identity.email || '').trim().toLowerCase();
        verifiedAdmin = String(u.AccountType || '').toUpperCase() === 'REGISTERED' && matPromoIsAdmin_(u);
      }
    }
    const promoConfig = matPromoReadConfig_();
    const memberCfg = promoConfig.members.find(x => String(x.UserID) === String(u.UserID)) || {};
    const memberCode = String(memberCfg.Code || '').trim().toUpperCase();
    const adminCfg = verifiedAdmin ? matPromoAdminMemberConfig_(memberCfg, memberCfg.AdminCode || fixed) : null;
    if (verifiedAdmin && String(memberCfg.AdminCode || '').trim() && input === String(memberCfg.AdminCode).trim().toUpperCase()) {
      if (!adminCfg.enabled) throw new Error('আপনার individual Admin-only Promo Code access বন্ধ করা হয়েছে।');
      type = 'admin-member-custom'; code = adminCfg.code; cfg = adminCfg;
    } else if (verifiedAdmin && input === String(fixed || '').toUpperCase() && fixed && matScriptProperty_('MAT_PROMO_FIXED_ENABLED') !== 'FALSE') {
      if (!adminCfg.enabled) throw new Error('আপনার Admin-only Promo Code access বন্ধ করা হয়েছে।');
      type = 'unlimited'; code = fixed; cfg = adminCfg;
    } else {
      const globalCfg = promoConfig.global || {};
      const globalCode = String(globalCfg.Code || '').trim().toUpperCase();
      if (memberCode && input === memberCode && !verifiedAdmin && String(memberCfg.Enabled || 'TRUE') !== 'FALSE') {
        type = 'member-custom'; code = memberCode; cfg = matPromoEffectiveConfig_(u,type,memberCode);
      } else if (globalCode && input === globalCode && String(globalCfg.Enabled || 'TRUE') !== 'FALSE') {
        type = 'global-custom'; code = globalCode; cfg = matPromoEffectiveConfig_(u,type,globalCode);
      } else if (input === String(c.code).toUpperCase()) {
        type = c.type; code = c.code; cfg = matPromoEffectiveConfig_(u,type,c.code);
      } else throw new Error('এই Promo Code এখন valid নয়।');
      if (!cfg.enabled) throw new Error('এই Promo Code বর্তমানে বন্ধ আছে।');
      periodKey = c.period || matPromoWindowKey_(cfg.limitPeriod,new Date());
    }
    if (cfg.rewardPB == null) cfg.rewardPB = type === 'weekly' ? c.reward : type === 'daily' ? c.reward : 100000;
    const windowKey = matPromoWindowKey_(cfg.limitPeriod,new Date());
    const rows = matReadObjects_(matPromoSheets_().redemptions);
    // Hard one-per-Bangladesh-day guard for public Daily codes.
    // Match both the ledger period key and the actual redemption timestamp so
    // older rows with missing/mismatched PeriodKey cannot bypass the check.
    const dhakaToday = Utilities.formatDate(new Date(), MAT_CONFIG.TIME_ZONE, 'yyyy-MM-dd');
    if (type === 'daily' && rows.some(r => {
      if (String(r.UserID).trim() !== String(u.UserID).trim()) return false;
      const redeemed = r.RedeemedAt ? new Date(r.RedeemedAt) : null;
      const redeemedDay = redeemed && !isNaN(redeemed.getTime())
        ? Utilities.formatDate(redeemed, MAT_CONFIG.TIME_ZONE, 'yyyy-MM-dd') : '';
      return String(r.Type || '').trim().toLowerCase() === 'daily' &&
        (String(r.PeriodKey || '').trim() === String(c.period || periodKey) ||
         redeemedDay === dhakaToday);
    })) {
      throw new Error('আজকের Daily Promo Code আপনি ইতিমধ্যে redeem করেছেন।');
    }
    // Weekly public codes remain one redemption per Bangladesh week.
    if (type === 'weekly' && rows.some(r =>
      String(r.UserID).trim() === String(u.UserID).trim() &&
      String(r.Type || '').trim().toLowerCase() === 'weekly' &&
      String(r.PeriodKey || '').trim() === String(c.period || periodKey))) {
      throw new Error('এই Weekly Promo Code আপনি ইতিমধ্যে redeem করেছেন।');
    }
    const limit = Math.max(0,Number(cfg.limitCount || 0));
    if (limit > 0 && matPromoCountForLimit_(rows,u.UserID,code,cfg.limitPeriod,windowKey) >= limit)
      throw new Error('আপনার এই Promo Code-এর নির্ধারিত redemption limit শেষ হয়েছে।');
    const ss = matGetStudentsSheet_(), current = matFindStudentById_(u.UserID);
    if (!current) throw new Error('Student profile not found.');
    const reward = Math.max(0,matSafeNonNegativeInt_(cfg.rewardPB,'Reward PB'));
    const balance = Math.max(0,matFiniteNumber_(current.PromoPB,0)) + reward;
    matUpdateObjectRow_(ss,current._rowNumber,{PromoPB:balance,UpdatedAt:matNowIso_()});
    matAppendObject_(matPromoSheets_().redemptions,{RedemptionID:Utilities.getUuid(),UserID:u.UserID,Code:code,Type:type,PeriodKey:periodKey,RewardPB:reward,RedeemedAt:matNowIso_(),LimitPeriod:cfg.limitPeriod,LimitWindow:windowKey});
    return {success:true,rewardPB:reward,promoPB:balance,user:matApiUser_(matFindStudentById_(u.UserID))};
  } finally { lock.releaseLock(); }
}


/* Extend the redemption ledger with explicit limit-window fields without clearing existing rows. */
function matPromoSheets_(){
 const ss=SpreadsheetApp.openById(MAT_CONFIG.PROFILE_SPREADSHEET_ID);
 function get(n,h){let sh=ss.getSheetByName(n);if(!sh)sh=ss.insertSheet(n);if(!sh.getLastRow()){sh.getRange(1,1,1,h.length).setValues([h]);sh.setFrozenRows(1);}else{const old=matHeaders_(sh),miss=h.filter(x=>!old.includes(x));if(miss.length)sh.getRange(1,old.length+1,1,miss.length).setValues([miss]);}return sh;}
 return {
  admins:get('PromoAdmins',['Email','Role','Status','AddedAt','AddedBy','SuspendedUntil','UpdatedAt','UpdatedBy']),
  redemptions:get('PromoRedemptions',['RedemptionID','UserID','Code','Type','PeriodKey','RewardPB','RedeemedAt','LimitPeriod','LimitWindow']),
  guestDeletionRequests:get('AdminGuestDeletionRequests',['RequestID','TargetUserID','Status','RequestedBy','RequestedAt','Reason','ReviewedBy','ReviewedAt','Decision']),
  guestDeletionAudit:get('GuestDeletionAudit',['EventID','TargetUserID','Event','ActorEmail','ActorRole','EventAt','PreviousDeadline','NewDeadline','Notes'])
 };
}
function matGetPromoInfo_(p) {
 const u=matAuthenticate_(p), c=matPromoPublic_(), all=matPromoReadConfig_();
 const member=all.members.find(x=>String(x.UserID)===String(u.UserID))||{};
 const global=all.global||{};
 const assigned=String(member.Code||'').trim() || String(global.Code||'').trim();
 const effective=matPromoEffectiveConfig_(u,c.type,c.code);
 let admin=false,fixedCode='';
 const token=String(p&&(p.idToken||p.firebaseIdToken)||'').trim();
 if(token){const identity=matVerifyFirebaseIdToken_(token);if(identity.emailVerified===true){u.Email=String(identity.email||'').trim().toLowerCase();admin=String(u.AccountType||'').toUpperCase()==='REGISTERED'&&matPromoIsAdmin_(u);if(admin)fixedCode=matPromoFixedCode_();}}
 const adminPromo=admin?matPromoEffectiveConfig_(u,'unlimited',fixedCode):null;
 const adminCodeEnabled=!!(admin&&fixedCode&&matScriptProperty_('MAT_PROMO_FIXED_ENABLED')!=='FALSE'&&adminPromo&&adminPromo.enabled);
 return {success:true,publicCode:c.code,publicType:c.type,rewardPB:effective.rewardPB==null?c.reward:effective.rewardPB,
   assignedCode:assigned,assignedRewardPB:effective.rewardPB,promoPB:Math.max(0,matFiniteNumber_(u.PromoPB,0)),isAdmin:admin,
   adminCode:adminCodeEnabled?fixedCode:'',
   adminCodeEnabled:adminCodeEnabled};
}

function matPromoValidateCustomCode_(code) {
  if (!code) return;
  if (code.length < 3 || code.length > 80) throw new Error('Promo Code must be 3–80 characters.');
  if (code === String(matPromoFixedCode_() || '').trim().toUpperCase() ||
      /^DAILY \d{2}-\d{2}-\d{4}$/.test(code) ||
      /^WEEK \d{2} [A-Z]{3} - \d{2} [A-Z]{3}$/.test(code)) {
    throw new Error('এই code-টি reserved. অন্য Promo Code ব্যবহার করুন।');
  }
}
