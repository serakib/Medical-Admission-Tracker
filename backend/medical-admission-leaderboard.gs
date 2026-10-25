/**
 * Medical Admission Tracker — shared League/Leaderboard API.
 * Deploy as a Google Apps Script Web App. Firebase remains the identity provider;
 * Google Sheets stores public leaderboard aggregates and friend links.
 *
 * Script Properties required:
 *   SPREADSHEET_ID   = ID of the Google spreadsheet created by setupMedicalLeaderboard()
 *   FIREBASE_API_KEY = public Web API key from js/firebase-config.js (used to verify ID tokens)
 */

var MAT_LEAGUES = ['Bronze', 'Silver', 'Gold', 'Diamond'];
var MAT_RP_PER_LEAGUE = 100;
var MAT_SAFE_ZONE_RATIO = 0.75;
var MAT_TIMEZONE = 'Asia/Dhaka';
var MAT_SHEETS = {
  USERS: 'Users',
  ATTEMPTS: 'Attempts',
  FRIENDS: 'FriendRequests'
};
var MAT_HEADERS = {
  Users: ['uid', 'name', 'college', 'avatar', 'allTimePoints', 'weeklyPoints', 'weekKey', 'league', 'rankRP', 'quizzes', 'correct', 'answered', 'accuracy', 'updatedAt'],
  Attempts: ['attemptKey', 'uid', 'attemptId', 'quizPoints', 'correct', 'wrong', 'total', 'createdAt'],
  FriendRequests: ['fromUid', 'toUid', 'status', 'createdAt', 'updatedAt']
};

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'health';
  if (action === 'health') {
    return matJson_({ success: true, service: 'Medical Admission Tracker Global League API', configured: !!matSpreadsheetId_(), leagues: MAT_LEAGUES });
  }
  return matJson_(matDispatch_({ action: action, period: e.parameter.period, league: e.parameter.league, sortBy: e.parameter.sortBy }));
}

function doPost(e) {
  var req = {};
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return matJson_({ success: false, error: 'Invalid JSON request.' });
  }
  try {
    return matJson_(matDispatch_(req));
  } catch (err) {
    return matJson_({ success: false, error: String(err && err.message || err || 'Request failed.') });
  }
}

function matDispatch_(req) {
  req = req || {};
  var action = String(req.action || 'health');
  if (action === 'health') return { success: true, service: 'Medical Admission Tracker Global League API', configured: !!matSpreadsheetId_(), leagues: MAT_LEAGUES };
  if (action === 'leaderboard') return matGetLeaderboard_(req);
  if (action === 'profileSync') return matProfileSync_(req);
  if (action === 'recordResult') return matRecordResult_(req);
  if (action === 'sendFriendRequest') return matSendFriendRequest_(req);
  if (action === 'getFriendRequests') return matGetFriendRequests_(req);
  if (action === 'respondFriendRequest') return matRespondFriendRequest_(req);
  if (action === 'getFriends') return matGetFriends_(req);
  throw new Error('Unknown action: ' + action);
}

function setupMedicalLeaderboard() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  var ss = null;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (err) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('Medical Admission Tracker — Global Leaderboard');
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }
  Object.keys(MAT_HEADERS).forEach(function(name) {
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    var headers = MAT_HEADERS[name];
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  });
  Logger.log('Leaderboard spreadsheet: ' + ss.getUrl());
  Logger.log('Add FIREBASE_API_KEY to Script Properties before deploying.');
  return ss.getUrl();
}

function matJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function matSpreadsheetId_() {
  return PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '';
}
function matSpreadsheet_() {
  var id = matSpreadsheetId_();
  if (!id) throw new Error('Backend is not initialized. Run setupMedicalLeaderboard() first.');
  return SpreadsheetApp.openById(id);
}
function matSheet_(name) {
  var sheet = matSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet "' + name + '". Run setupMedicalLeaderboard() again.');
  return sheet;
}
function matText_(value, maxLen) {
  var s = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLen || 120);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
function matNum_(value, max) {
  var n = Number(value);
  if (!isFinite(n) || n < 0) return 0;
  n = Math.floor(n);
  return typeof max === 'number' ? Math.min(n, max) : n;
}
function matVerifyToken_(idToken) {
  var token = String(idToken || '');
  if (!token) throw new Error('Sign in to sync leaderboard data.');
  var apiKey = PropertiesService.getScriptProperties().getProperty('FIREBASE_API_KEY');
  if (!apiKey) throw new Error('Firebase token verification is not configured. Add FIREBASE_API_KEY in Apps Script Script Properties.');
  var url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(apiKey);
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ idToken: token }),
    muteHttpExceptions: true
  });
  var status = response.getResponseCode();
  var data = {};
  try { data = JSON.parse(response.getContentText() || '{}'); } catch (err) {}
  if (status !== 200 || !data.users || !data.users.length || !data.users[0].localId) {
    throw new Error('Your sign-in session could not be verified. Please sign in again.');
  }
  var u = data.users[0];
  return { uid: String(u.localId), email: String(u.email || ''), name: String(u.displayName || '') };
}
function matWeekKey_(dateValue) {
  var localDate = Utilities.formatDate(dateValue || new Date(), MAT_TIMEZONE, 'yyyy-MM-dd');
  var p = localDate.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  var day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}
function matPreviousWeekKey_() {
  var localDate = Utilities.formatDate(new Date(), MAT_TIMEZONE, 'yyyy-MM-dd').split('-').map(Number);
  var d = new Date(Date.UTC(localDate[0], localDate[1] - 1, localDate[2]));
  d.setUTCDate(d.getUTCDate() - 7);
  return matWeekKey_(d);
}
function matReadSheet_(sheetName) {
  var sheet = matSheet_(sheetName);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(String);
  return values.slice(1).map(function(row, index) {
    var obj = { _row: index + 2 };
    headers.forEach(function(key, i) {
      var value = row[i];
      obj[key] = value instanceof Date ? value.toISOString() : value;
    });
    return obj;
  }).filter(function(x) { return !!x.uid || !!x.fromUid || !!x.attemptKey; });
}
function matUserRow_(user) {
  return [
    user.uid, user.name, user.college, user.avatar,
    matNum_(user.allTimePoints), matNum_(user.weeklyPoints), user.weekKey,
    user.league, matNum_(user.rankRP), matNum_(user.quizzes),
    matNum_(user.correct), matNum_(user.answered),
    Number((Number(user.accuracy) || 0).toFixed(1)), new Date()
  ];
}
function matWriteUser_(user) {
  var sheet = matSheet_(MAT_SHEETS.USERS);
  var existing = matReadSheet_(MAT_SHEETS.USERS).find(function(x) { return x.uid === user.uid; });
  var row = matUserRow_(user);
  if (existing) sheet.getRange(existing._row, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
  user.updatedAt = new Date().toISOString();
  return user;
}
function matDefaultUser_(uid, name, college, avatar) {
  return {
    uid: uid, name: name || 'Student', college: college || '', avatar: avatar || '🩺',
    allTimePoints: 0, weeklyPoints: 0, weekKey: matWeekKey_(new Date()),
    league: MAT_LEAGUES[0], rankRP: 0, quizzes: 0, correct: 0, answered: 0, accuracy: 0
  };
}
function matEnsureUser_(uid, name, college, avatar) {
  var users = matReadSheet_(MAT_SHEETS.USERS);
  var user = users.find(function(x) { return x.uid === uid; });
  if (!user) return matWriteUser_(matDefaultUser_(uid, name, college, avatar));
  user.name = name || user.name || 'Student';
  user.college = college || user.college || '';
  user.avatar = avatar || user.avatar || '🩺';
  user.allTimePoints = matNum_(user.allTimePoints);
  user.weeklyPoints = matNum_(user.weeklyPoints);
  user.rankRP = matNum_(user.rankRP);
  user.quizzes = matNum_(user.quizzes);
  user.correct = matNum_(user.correct);
  user.answered = matNum_(user.answered);
  user.accuracy = Number(user.accuracy) || 0;
  user.league = MAT_LEAGUES.indexOf(user.league) >= 0 ? user.league : MAT_LEAGUES[0];
  return user;
}
function matSafeUser_(user) {
  return {
    uid: String(user.uid || ''), name: String(user.name || 'Student'), college: String(user.college || ''),
    avatar: String(user.avatar || '🩺'), allTimePoints: matNum_(user.allTimePoints),
    weeklyPoints: matNum_(user.weeklyPoints), weekKey: String(user.weekKey || ''),
    league: MAT_LEAGUES.indexOf(user.league) >= 0 ? user.league : MAT_LEAGUES[0],
    rankRP: matNum_(user.rankRP), quizzes: matNum_(user.quizzes), correct: matNum_(user.correct),
    answered: matNum_(user.answered), accuracy: Number((Number(user.accuracy) || 0).toFixed(1))
  };
}
function matEnsureWeeklyRollover_() {
  var currentWeek = matWeekKey_(new Date());
  var previousWeek = matPreviousWeekKey_();
  var users = matReadSheet_(MAT_SHEETS.USERS);
  var grouped = {};
  users.forEach(function(u) {
    if (String(u.weekKey || '') !== previousWeek || matNum_(u.weeklyPoints) <= 0) return;
    var key = String(u.league || MAT_LEAGUES[0]);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(u);
  });
  Object.keys(grouped).forEach(function(league) {
    var group = grouped[league].sort(function(a, b) {
      var points = matNum_(b.weeklyPoints) - matNum_(a.weeklyPoints);
      if (points) return points;
      return String(a.uid).localeCompare(String(b.uid));
    });
    var safeCount = Math.ceil(group.length * MAT_SAFE_ZONE_RATIO);
    group.forEach(function(u, index) {
      u.previousWeekPosition = index + 1;
      if (group.length >= 4 && index + 1 > safeCount) {
        var leagueIndex = MAT_LEAGUES.indexOf(String(u.league));
        if (leagueIndex > 0) {
          u.league = MAT_LEAGUES[leagueIndex - 1];
          u.rankRP = Math.max(0, matNum_(u.rankRP) - MAT_RP_PER_LEAGUE);
        }
      }
    });
  });
  users.forEach(function(u) {
    var changed = false;
    if (String(u.weekKey || '') !== currentWeek) {
      u.weeklyPoints = 0;
      u.weekKey = currentWeek;
      changed = true;
    }
    var previous = grouped[String(u.league || MAT_LEAGUES[0])] || [];
    // Always save a reset, including users who skipped the previous week.
    if (changed) {
      var sheet = matSheet_(MAT_SHEETS.USERS);
      var row = matUserRow_(u);
      sheet.getRange(u._row, 1, 1, row.length).setValues([row]);
    }
  });
}
function matWithLock_(callback) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return callback(); } finally { lock.releaseLock(); }
}
function matProfileSync_(req) {
  var identity = matVerifyToken_(req.idToken);
  return matWithLock_(function() {
    matEnsureWeeklyRollover_();
    var user = matEnsureUser_(identity.uid, matText_(req.name || identity.name || identity.email || 'Student', 80), matText_(req.college, 120), matText_(req.avatar, 16));
    user = matWriteUser_(user);
    return { success: true, user: matSafeUser_(user), currentWeekKey: matWeekKey_(new Date()) };
  });
}
function matRecordResult_(req) {
  var identity = matVerifyToken_(req.idToken);
  var attemptId = matText_(req.attemptId, 100);
  var total = matNum_(req.totalQuestions, 1000);
  var correct = matNum_(req.correctCount, 1000);
  var wrong = matNum_(req.wrongCount, 1000);
  var points = matNum_(req.quizPoints, 4000);
  if (!attemptId) throw new Error('Missing quiz attempt ID.');
  if (total < 1 || correct + wrong > total) throw new Error('Invalid quiz result counts.');
  var expectedPoints = Math.max(0, correct * 4 - wrong);
  if (points !== expectedPoints || points > total * 4) throw new Error('Quiz points do not match the scoring rules.');
  return matWithLock_(function() {
    matEnsureWeeklyRollover_();
    var attemptsSheet = matSheet_(MAT_SHEETS.ATTEMPTS);
    var key = identity.uid + '_' + attemptId;
    var attempts = matReadSheet_(MAT_SHEETS.ATTEMPTS);
    var dupe = attempts.find(function(x) { return x.attemptKey === key; });
    if (dupe) {
      var existing = matReadSheet_(MAT_SHEETS.USERS).find(function(x) { return x.uid === identity.uid; });
      return { success: true, duplicate: true, user: existing ? matSafeUser_(existing) : null };
    }
    var user = matEnsureUser_(identity.uid, matText_(req.name || identity.name || identity.email || 'Student', 80), matText_(req.college, 120), matText_(req.avatar, 16));
    var previousLeague = String(user.league || MAT_LEAGUES[0]);
    var currentWeek = matWeekKey_(new Date());
    if (user.weekKey !== currentWeek) { user.weekKey = currentWeek; user.weeklyPoints = 0; }
    user.allTimePoints = matNum_(user.allTimePoints) + points;
    user.weeklyPoints = matNum_(user.weeklyPoints) + points;
    user.rankRP = matNum_(user.rankRP) + points;
    user.quizzes = matNum_(user.quizzes) + 1;
    user.correct = matNum_(user.correct) + correct;
    user.answered = matNum_(user.answered) + correct + wrong;
    user.accuracy = Number((user.correct / Math.max(1, user.answered) * 100).toFixed(1));
    var leagueIndex = MAT_LEAGUES.indexOf(String(user.league));
    if (leagueIndex < 0) leagueIndex = 0;
    while (leagueIndex < MAT_LEAGUES.length - 1 && user.rankRP >= MAT_RP_PER_LEAGUE) {
      user.rankRP -= MAT_RP_PER_LEAGUE;
      leagueIndex++;
      user.league = MAT_LEAGUES[leagueIndex];
    }
    if (leagueIndex === MAT_LEAGUES.length - 1) user.rankRP = Math.min(999999, user.rankRP);
    matWriteUser_(user);
    attemptsSheet.appendRow([key, identity.uid, attemptId, points, correct, wrong, total, new Date()]);
    return { success: true, duplicate: false, user: matSafeUser_(user), currentWeekKey: currentWeek, promoted: String(user.league) !== previousLeague, previousLeague: previousLeague };
  });
}
function matGetLeaderboard_(req) {
  matWithLock_(function() { matEnsureWeeklyRollover_(); });
  var period = String(req.period || 'weekly');
  var league = String(req.league || MAT_LEAGUES[0]);
  var sortBy = period === 'all-time' ? 'allTimePoints' : 'weeklyPoints';
  if (MAT_LEAGUES.indexOf(league) < 0) league = MAT_LEAGUES[0];
  var currentUid = '';
  var identity = null;
  if (req.idToken) {
    try { identity = matVerifyToken_(req.idToken); currentUid = identity.uid; } catch (err) { currentUid = ''; }
  }
  var users = matReadSheet_(MAT_SHEETS.USERS).map(matSafeUser_);
  if (period === 'friends') {
    if (!currentUid) throw new Error('Sign in to view Friends leaderboard.');
    var links = matReadSheet_(MAT_SHEETS.FRIENDS).filter(function(f) { return f.status === 'accepted' && (f.fromUid === currentUid || f.toUid === currentUid); });
    var ids = {};
    ids[currentUid] = true;
    links.forEach(function(f) { ids[f.fromUid] = true; ids[f.toUid] = true; });
    users = users.filter(function(u) { return ids[u.uid]; });
    sortBy = String(req.sortBy || 'weekly') === 'all-time' ? 'allTimePoints' : 'weeklyPoints';
  }
  var me = currentUid ? users.find(function(u) { return u.uid === currentUid; }) || null : null;
  var entries = users.filter(function(u) { return u.league === league && matNum_(u.quizzes) > 0; }).sort(function(a, b) {
    var diff = matNum_(b[sortBy]) - matNum_(a[sortBy]);
    if (diff) return diff;
    return String(a.name || '').localeCompare(String(b.name || ''));
  }).map(function(u, index) {
    var obj = matSafeUser_(u);
    obj.points = sortBy === 'allTimePoints' ? obj.allTimePoints : obj.weeklyPoints;
    obj.position = index + 1;
    return obj;
  });
  if (period === 'friends') {
    entries = entries.filter(function(u) { return u.league === league; });
  }
  return { success: true, period: period, league: league, currentWeekKey: matWeekKey_(new Date()), entries: entries, me: me ? matSafeUser_(me) : null, leagues: MAT_LEAGUES, rpTarget: MAT_RP_PER_LEAGUE };
}
function matSendFriendRequest_(req) {
  var identity = matVerifyToken_(req.idToken);
  var toUid = matText_(req.toUid, 128);
  if (!toUid || toUid === identity.uid) throw new Error('Invalid friend target.');
  return matWithLock_(function() {
    var users = matReadSheet_(MAT_SHEETS.USERS);
    if (!users.some(function(u) { return u.uid === toUid; })) throw new Error('এই student এখনো leaderboard-এ নেই।');
    var sheet = matSheet_(MAT_SHEETS.FRIENDS);
    var links = matReadSheet_(MAT_SHEETS.FRIENDS);
    var existing = links.filter(function(f) {
      return (f.fromUid === identity.uid && f.toUid === toUid) || (f.fromUid === toUid && f.toUid === identity.uid);
    }).sort(function(a, b) { return Number(b._row || 0) - Number(a._row || 0); })[0];
    if (existing && existing.status === 'accepted') return { success: true, status: 'accepted' };
    if (existing && existing.status === 'pending' && existing.fromUid === identity.uid) return { success: true, status: 'pending' };
    if (existing && existing.status === 'pending' && existing.toUid === identity.uid) {
      sheet.getRange(existing._row, 3, 1, 1).setValue('accepted');
      sheet.getRange(existing._row, 5, 1, 1).setValue(new Date());
      return { success: true, status: 'accepted' };
    }
    sheet.appendRow([identity.uid, toUid, 'pending', new Date(), new Date()]);
    return { success: true, status: 'pending' };
  });
}
function matGetFriendRequests_(req) {
  var identity = matVerifyToken_(req.idToken);
  var users = matReadSheet_(MAT_SHEETS.USERS);
  var byId = {};
  users.forEach(function(u) { byId[u.uid] = matSafeUser_(u); });
  var incoming = matReadSheet_(MAT_SHEETS.FRIENDS).filter(function(f) { return f.toUid === identity.uid && f.status === 'pending'; }).map(function(f) {
    return { uid: f.fromUid, name: byId[f.fromUid] ? byId[f.fromUid].name : 'Student', college: byId[f.fromUid] ? byId[f.fromUid].college : '', avatar: byId[f.fromUid] ? byId[f.fromUid].avatar : '🩺', createdAt: f.createdAt };
  });
  return { success: true, requests: incoming };
}
function matRespondFriendRequest_(req) {
  var identity = matVerifyToken_(req.idToken);
  var fromUid = matText_(req.fromUid, 128);
  var decision = String(req.decision || '');
  if (!fromUid || ['accept', 'decline'].indexOf(decision) < 0) throw new Error('Invalid friend response.');
  return matWithLock_(function() {
    var sheet = matSheet_(MAT_SHEETS.FRIENDS);
    var link = matReadSheet_(MAT_SHEETS.FRIENDS).find(function(f) { return f.fromUid === fromUid && f.toUid === identity.uid && f.status === 'pending'; });
    if (!link) throw new Error('Friend request no longer exists.');
    sheet.getRange(link._row, 3).setValue(decision === 'accept' ? 'accepted' : 'declined');
    sheet.getRange(link._row, 5).setValue(new Date());
    return { success: true, status: decision === 'accept' ? 'accepted' : 'declined' };
  });
}
function matGetFriends_(req) {
  var identity = matVerifyToken_(req.idToken);
  var users = matReadSheet_(MAT_SHEETS.USERS).map(matSafeUser_);
  var links = matReadSheet_(MAT_SHEETS.FRIENDS).filter(function(f) { return f.status === 'accepted' && (f.fromUid === identity.uid || f.toUid === identity.uid); });
  var otherIds = {};
  links.forEach(function(f) { otherIds[f.fromUid === identity.uid ? f.toUid : f.fromUid] = true; });
  return { success: true, friends: users.filter(function(u) { return !!otherIds[u.uid]; }) };
}
