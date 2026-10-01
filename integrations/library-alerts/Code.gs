/** Standalone request alerts. No Sheet access, inbox access, or Firestore writes. */
const REQUEST_ALERTS = Object.freeze({
  projectId: 'dkblog-6c5e5',
  siteRoot: 'https://dkblog-6c5e5.web.app',
  stateProperty: 'libraryRequestAlertState',
  batchSize: 20,
});

function installLibraryRequestAlerts() {
  withRequestAlertLock_(() => {
    // Check authorization and Firestore access before changing any triggers.
    requestAlertRecipient_();
    const quota = MailApp.getRemainingDailyQuota();
    const properties = PropertiesService.getScriptProperties();
    let state = readRequestAlertState_();
    if (!state) state = { startedAt: new Date().toISOString(), cursor: null };
    listNewLibraryRequests_(state);
    saveRequestAlertState_(state);
    const triggers = ScriptApp.getProjectTriggers()
      .filter(trigger => trigger.getHandlerFunction() === 'pollLibraryRequestAlerts');
    // Keep an existing timer: repeated installation cannot add duplicate timers.
    if (!triggers.length) ScriptApp.newTrigger('pollLibraryRequestAlerts')
      .timeBased().everyMinutes(5).create();
    if (!properties.getProperty('libraryRequestAlertTestSentAt') && quota > 0) {
      sendLibraryRequestAlertTest();
      properties.setProperty('libraryRequestAlertTestSentAt', new Date().toISOString());
    }
    console.log('Book-request alerts active; five-minute timer installed.');
  });
}

function sendLibraryRequestAlertTest() {
  if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Daily email quota is exhausted; retry later.');
  MailApp.sendEmail({
    to: requestAlertRecipient_(),
    name: 'ಸ್ವಾನಂದ ಗ್ರಂಥನಿಧಿ',
    subject: 'ಸ್ವಾನಂದ ಗ್ರಂಥನಿಧಿ — ಪುಸ್ತಕ ಕೋರಿಕೆಯ ಮಿಂಚಂಚೆ ಸೂಚನೆ ಸಿದ್ಧವಾಗಿದೆ',
    body: 'ನಮಸ್ಕಾರ ದರ್ಶನ,\n\nಇದು ಪರೀಕ್ಷಾ ಮಿಂಚಂಚೆ. ಹೊಸ ಪುಸ್ತಕ ಎರವಲು ಕೋರಿಕೆ ಬಂದಾಗ ನಿಮಗೆ ಮಿಂಚಂಚೆ ಸೂಚನೆ ಬರಲಿದೆ.\n\n'
      + 'ಕೋರಿಕೆಗಳನ್ನು ಪ್ರತಿ ಐದು ನಿಮಿಷಕ್ಕೊಮ್ಮೆ ಪರಿಶೀಲಿಸಲಾಗುತ್ತದೆ. ಹಿಂದಿನ ಕೋರಿಕೆಗಳಿಗೆ ಸೂಚನೆ ಕಳುಹಿಸುವುದಿಲ್ಲ.\n\n'
      + `ನಿರ್ವಹಣಾ ಪುಟ: ${REQUEST_ALERTS.siteRoot}/admin\n\nಸ್ವಾನಂದ ಗ್ರಂಥನಿಧಿ`,
  });
  console.log('Test email submitted to Google MailApp.');
}

function pollLibraryRequestAlerts() {
  withRequestAlertLock_(() => {
    const state = readRequestAlertState_();
    if (!state) throw new Error('Run installLibraryRequestAlerts before polling.');
    const documents = listNewLibraryRequests_(state);
    let quota = MailApp.getRemainingDailyQuota();
    let sent = 0;
    for (const document of documents) {
      const requestedAt = requestAlertField_(document, 'requestedAt');
      if (!document.name || !requestedAt) throw new Error('Malformed request; cursor was not advanced.');
      if (quota < 1) {
        console.warn('Daily email quota exhausted; remaining requests retained for the next check.');
        break;
      }
      MailApp.sendEmail(libraryRequestEmail_(document));
      // Checkpoint only after MailApp succeeds. A failed send is retried next run.
      state.cursor = { requestedAt, name: document.name };
      saveRequestAlertState_(state);
      quota -= 1;
      sent += 1;
    }
    // Do not log borrower names, contact details, or message content.
    console.log(`Book-request alerts: ${sent} email(s) submitted; ${documents.length} request(s) checked.`);
  });
}

function libraryRequestEmail_(document) {
  const title = requestAlertText_(requestAlertField_(document, 'bookTitle'), 160) || 'ಪುಸ್ತಕ';
  const name = requestAlertText_(requestAlertField_(document, 'name'), 80) || 'ಹೆಸರು ನೀಡಿಲ್ಲ';
  const contact = requestAlertText_(requestAlertField_(document, 'contact'), 120) || 'ಸಂಪರ್ಕ ವಿವರ ನೀಡಿಲ್ಲ';
  const bookId = requestAlertText_(requestAlertField_(document, 'bookId'), 160);
  const date = new Date(requestAlertField_(document, 'requestedAt'));
  const time = Number.isNaN(date.valueOf()) ? 'ಸಮಯ ಲಭ್ಯವಿಲ್ಲ'
    : Utilities.formatDate(date, 'Asia/Kolkata', 'dd-MM-yyyy HH:mm:ss') + ' (ಭಾರತೀಯ ಸಮಯ)';
  return {
    to: requestAlertRecipient_(),
    name: 'ಸ್ವಾನಂದ ಗ್ರಂಥನಿಧಿ',
    subject: `ಸ್ವಾನಂದ ಗ್ರಂಥನಿಧಿ — ಹೊಸ ಪುಸ್ತಕ ಎರವಲು ಕೋರಿಕೆ: ${title}`,
    body: `ಹೊಸ ಪುಸ್ತಕ ಎರವಲು ಕೋರಿಕೆ ಬಂದಿದೆ.\n\nಪುಸ್ತಕ: ${title}\nಪುಸ್ತಕದ ಗುರುತು: ${bookId}\n`
      + `ಕೋರಿದವರ ಹೆಸರು: ${name}\nಸಂಪರ್ಕ: ${contact}\nಕೋರಿಕೆಯ ಸಮಯ: ${time}\n\n`
      + `ಕೋರಿಕೆಯನ್ನು ಪರಿಶೀಲಿಸಿ: ${REQUEST_ALERTS.siteRoot}/admin\n\n`
      + 'ಮೇಲಿನ ಸಂಪರ್ಕ ವಿವರವನ್ನು ಕೋರಿಕೆ ಸಲ್ಲಿಸಿದವರು ನೀಡಿದ್ದಾರೆ. ಪುಸ್ತಕ ನೀಡುವ ಮೊದಲು ಪರಿಶೀಲಿಸಿ.\n\nಸ್ವಾನಂದ ಗ್ರಂಥನಿಧಿ',
  };
}

function listNewLibraryRequests_(state) {
  const query = {
    from: [{ collectionId: 'libraryRequests' }],
    select: { fields: ['bookId', 'bookTitle', 'name', 'contact', 'requestedAt']
      .map(fieldPath => ({ fieldPath })) },
    where: { fieldFilter: {
      field: { fieldPath: 'requestedAt' }, op: 'GREATER_THAN_OR_EQUAL',
      value: { timestampValue: state.startedAt },
    } },
    orderBy: [
      { field: { fieldPath: 'requestedAt' }, direction: 'ASCENDING' },
      { field: { fieldPath: '__name__' }, direction: 'ASCENDING' },
    ],
    limit: REQUEST_ALERTS.batchSize,
  };
  if (state.cursor) query.startAt = {
    before: false,
    values: [
      { timestampValue: state.cursor.requestedAt },
      { referenceValue: state.cursor.name },
    ],
  };
  const rows = requestAlertFetch_(`${requestAlertFirestoreRoot_()}:runQuery`, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ structuredQuery: query }),
  });
  if (!Array.isArray(rows)) throw new Error('Unexpected Firestore query response.');
  return rows.filter(row => row.document).map(row => row.document);
}

function requestAlertFirestoreRoot_() {
  return `https://firestore.googleapis.com/v1/projects/${REQUEST_ALERTS.projectId}/databases/(default)/documents`;
}

function requestAlertFetch_(url, options) {
  const response = UrlFetchApp.fetch(url, Object.assign({}, options, {
    headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
    muteHttpExceptions: true,
  }));
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    // Keep provider response bodies out of logs: they may contain private data.
    throw new Error(`Request-alert Firestore read failed (${code}).`);
  }
  return JSON.parse(response.getContentText());
}

function requestAlertField_(document, field) {
  const value = document.fields && document.fields[field];
  return value && (value.stringValue || value.timestampValue) || '';
}

function requestAlertText_(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

function requestAlertRecipient_() {
  // Keep the owner's address private: never publish it in the repository or site.
  const recipient = PropertiesService.getScriptProperties().getProperty('libraryRequestAlertRecipient') || '';
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(recipient)) {
    throw new Error('Configure one recipient in the private libraryRequestAlertRecipient script property.');
  }
  return recipient;
}

function readRequestAlertState_() {
  const raw = PropertiesService.getScriptProperties().getProperty(REQUEST_ALERTS.stateProperty);
  if (!raw) return null;
  const state = JSON.parse(raw);
  if (!state.startedAt || Number.isNaN(new Date(state.startedAt).valueOf())
      || (state.cursor && (!state.cursor.name || !state.cursor.requestedAt))) {
    throw new Error('Invalid alert checkpoint; polling stopped to prevent duplicate emails.');
  }
  return state;
}

function saveRequestAlertState_(state) {
  PropertiesService.getScriptProperties().setProperty(REQUEST_ALERTS.stateProperty, JSON.stringify(state));
}

function withRequestAlertLock_(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    console.log('An alert check is already running; skipped overlapping check.');
    return;
  }
  try { return callback(); }
  finally { lock.releaseLock(); }
}
