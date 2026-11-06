/** Trusted grading. Never return keys, contacts, or owner OAuth credentials to callers. */
var QUIZ_PROJECT = 'dkblog-6c5e5';
var QUIZ_API_KEY = 'AIzaSyCHuyfBo7zAKlYc6Gq9uOPQavv_bwxh4x4';
var QUIZ_ROOT = 'projects/' + QUIZ_PROJECT + '/databases/(default)/documents';

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ service: 'DK secure quiz grading', version: 2 })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var request, uid;
  try {
    var text = e && e.postData && e.postData.contents;
    if (typeof text !== 'string' || text.length > 20000) throw new Error('INVALID_REQUEST');
    request = JSON.parse(text);
    if (!request || !/^[a-f0-9-]{36}$/.test(request.requestId || '') || !/^[A-Za-z0-9-]{1,64}$/.test(request.quizId || '')) throw new Error('INVALID_REQUEST');
    uid = verifyQuizUser_(request.idToken);
    var receiptId = request.requestId + '_' + uid;
    var existingReceipt = quizRead_('quizReceipts/' + receiptId);
    if (existingReceipt) return quizReply_('received');
    for (var attempt = 0; attempt < 3; attempt++) {
      try { gradeQuizRequest_(request, uid, receiptId); return quizReply_('received'); }
      catch (error) { if (error.message !== 'ABORTED' || attempt === 2) throw error; }
    }
  } catch (error) {
    // Only authenticated users get a private receipt; no token/PII is logged.
    if (uid && request) {
      var allowed = ['QUIZ_CLOSED', 'QUIZ_CHANGED', 'INVALID_ANSWERS', 'INVALID_NAME', 'INVALID_CONTACT', 'ALREADY_SUBMITTED'];
      var code = allowed.indexOf(error.message) >= 0 ? error.message : 'SERVICE_UNAVAILABLE';
      try { quizCommit_([{ update: { name: QUIZ_ROOT + '/quizReceipts/' + request.requestId + '_' + uid, fields: quizFields_({ status: 'error', code: code, createdAt: new Date().toISOString() }) }, currentDocument: { exists: false } }]); } catch (_) {}
    }
    return quizReply_('rejected');
  }
}

function quizReply_(status) {
  return ContentService.createTextOutput(JSON.stringify({ status: status })).setMimeType(ContentService.MimeType.JSON);
}

function verifyQuizUser_(token) {
  if (typeof token !== 'string' || token.length > 8000) throw new Error('UNAUTHENTICATED');
  var claims;
  try { claims = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(token.split('.')[1])).getDataAsString()); }
  catch (_) { throw new Error('UNAUTHENTICATED'); }
  if (claims.aud !== QUIZ_PROJECT || claims.iss !== 'https://securetoken.google.com/' + QUIZ_PROJECT || typeof claims.sub !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(claims.sub) || !(claims.exp > Date.now() / 1000) || claims.iat > Date.now() / 1000 + 60) throw new Error('UNAUTHENTICATED');
  // This call verifies the signature/token with Firebase; decoded claims alone are NOT trusted.
  var response = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + QUIZ_API_KEY, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: token }), muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('UNAUTHENTICATED');
  var user = JSON.parse(response.getContentText()).users;
  if (!user || user.length !== 1 || user[0].localId !== claims.sub || user[0].disabled) throw new Error('UNAUTHENTICATED');
  return claims.sub;
}

function validateQuizAnswers_(request, quiz, key) {
  if (!quiz || String(quiz.id) !== request.quizId || quiz.state !== 'live') throw new Error('QUIZ_CLOSED');
  if (quiz.securityVersion !== 2 || !key || quiz.version !== key.version || !key.locked) throw new Error('QUIZ_CHANGED');
  var questions = key.questions;
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 100 || !Array.isArray(quiz.questions) || questions.length !== quiz.questions.length) throw new Error('QUIZ_CHANGED');
  if (typeof request.participantName !== 'string' || !request.participantName.trim() || request.participantName.length > 80) throw new Error('INVALID_NAME');
  if (typeof request.contact !== 'string' || request.contact.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.contact.trim())) throw new Error('INVALID_CONTACT');
  if (!Array.isArray(request.answers) || request.answers.length !== questions.length) throw new Error('INVALID_ANSWERS');
  var score = 0;
  questions.forEach(function(q, i) {
    var published = quiz.questions[i], answer = request.answers[i];
    if (!Array.isArray(q.opts) || q.opts.length < 2 || q.opts.length > 20 || !Number.isInteger(q.ans) || q.ans < 0 || q.ans >= q.opts.length || q.q !== published.q || JSON.stringify(q.opts) !== JSON.stringify(published.opts)) throw new Error('QUIZ_CHANGED');
    if (!Number.isInteger(answer) || answer < -1 || answer >= q.opts.length) throw new Error('INVALID_ANSWERS');
    if (answer === q.ans) score++;
  });
  return score;
}

function gradeQuizRequest_(request, uid, receiptId) {
  var transaction = quizRpc_(':beginTransaction', { options: { readWrite: {} } }).transaction;
  try {
    var active = quizRead_('siteSettings/activeQuiz', transaction);
    var key = quizRead_('quizKeys/' + request.quizId, transaction);
    var submissionId = request.quizId + '_' + uid;
    var existing = quizRead_('quizSubmissions/' + submissionId, transaction);
    var score = validateQuizAnswers_(request, active && active.quiz, key);
    if (existing) {
      if (existing.gradingVersion !== 2) throw new Error('ALREADY_SUBMITTED');
      quizCommit_([quizCreate_('quizReceipts/' + receiptId, { status: 'ok', createdAt: new Date().toISOString() })], transaction);
      return;
    }
    var quiz = active.quiz, now = new Date().toISOString();
    var writes = [quizCreate_('quizSubmissions/' + submissionId, {
      quizId: request.quizId, userId: uid, answers: request.answers, participantName: request.participantName.trim(),
      score: score, total: key.questions.length, gradingVersion: 2, quizVersion: quiz.version, email: request.contact.trim(),
      submittedAt: { __timestamp: now },
    }), quizCreate_('quizReceipts/' + receiptId, { status: 'ok', createdAt: now })];
    if (quiz.type === 'prize') writes.push(quizCreate_('prizeQuizEntries/' + submissionId, { quizId: request.quizId, userId: uid, name: request.participantName.trim(), contact: request.contact.trim(), submittedAt: { __timestamp: now } }));
    // Reading the live state and key inside the transaction prevents close/edit races.
    quizCommit_(writes, transaction);
  } catch (error) {
    try { quizRpc_(':rollback', { transaction: transaction }); } catch (_) {}
    throw error;
  }
}

function quizCreate_(path, data) { return { update: { name: QUIZ_ROOT + '/' + path, fields: quizFields_(data) }, currentDocument: { exists: false } }; }
function quizCommit_(writes, transaction) { var data = { writes: writes }; if (transaction) data.transaction = transaction; return quizRpc_(':commit', data); }
function quizRpc_(suffix, body) { return quizHttp_('https://firestore.googleapis.com/v1/' + QUIZ_ROOT + suffix, 'post', body); }
function quizRead_(path, transaction) {
  var data = quizHttp_('https://firestore.googleapis.com/v1/' + QUIZ_ROOT + '/' + path + (transaction ? '?transaction=' + encodeURIComponent(transaction) : ''), 'get', null, true);
  if (!data) return null;
  return quizDecode_({ mapValue: { fields: data.fields || {} } });
}
function quizHttp_(url, method, body, missingOK) {
  var options = { method: method, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  if (body) { options.contentType = 'application/json'; options.payload = JSON.stringify(body); }
  var response = UrlFetchApp.fetch(url, options), status = response.getResponseCode();
  if (missingOK && status === 404) return null;
  var data = JSON.parse(response.getContentText());
  if (status < 200 || status >= 300) throw new Error(data.error && data.error.status === 'ABORTED' ? 'ABORTED' : 'SERVICE_UNAVAILABLE');
  return data;
}
function quizFields_(object) { var fields = {}; Object.keys(object).forEach(function(k) { fields[k] = quizEncode_(object[k]); }); return fields; }
function quizEncode_(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === 'number') return { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(quizEncode_) } };
  if (value && value.__timestamp) return { timestampValue: value.__timestamp };
  return { mapValue: { fields: quizFields_(value) } };
}
function quizDecode_(value) {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(quizDecode_);
  var object = {}; Object.keys(value.mapValue.fields || {}).forEach(function(k) { object[k] = quizDecode_(value.mapValue.fields[k]); }); return object;
}
