const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('integrations/library-alerts/Code.gs', 'utf8');
const root = 'projects/dkblog-6c5e5/databases/(default)/documents/libraryRequests/';
const baseline = '2026-10-01T00:00:00.000Z';
const key = 'libraryRequestAlertState';
function request(id, timestamp, title = 'ಪರೀಕ್ಷಾ ಪುಸ್ತಕ') {
  return { name: root + id, fields: {
    requestedAt: { timestampValue: timestamp }, bookId: { stringValue: 'SG00001' },
    bookTitle: { stringValue: title }, name: { stringValue: 'ಪರೀಕ್ಷಾ ಓದುಗ' },
    contact: { stringValue: 'reader@example.com' }, message: { stringValue: 'PRIVATE NOTE' },
  } };
}
function runtime(documents = [], initial = { startedAt: baseline, cursor: null }) {
  const properties = new Map(initial ? [[key, JSON.stringify(initial)]] : []);
  properties.set('libraryRequestAlertRecipient', 'owner@example.com');
  const mails = [], triggers = [], queries = [], logs = [];
  const control = { quota: 100, failSend: false, failRead: false, locked: false, releases: 0 };
  const ctx = vm.createContext({
    console: { log: value => logs.push(value), warn: value => logs.push(value) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: prop => properties.get(prop) ?? null,
      setProperty: (prop, value) => properties.set(prop, value),
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => !control.locked,
      releaseLock: () => { control.releases += 1; } }) },
    ScriptApp: { getOAuthToken: () => 'mock-token', getProjectTriggers: () => triggers,
      newTrigger: handler => ({ timeBased: () => ({ everyMinutes: minutes => ({
        create: () => triggers.push({ getHandlerFunction: () => handler, minutes }),
      }) }) }) },
    MailApp: { getRemainingDailyQuota: () => control.quota, sendEmail: mail => {
      if (control.failSend) throw new Error('Simulated mail failure');
      mails.push(mail); control.quota -= 1;
    } },
    Utilities: { formatDate: (date, timezone) => {
      assert.equal(timezone, 'Asia/Kolkata'); return date.toISOString();
    } },
    UrlFetchApp: { fetch: (url, options) => {
      assert(url.endsWith('/documents:runQuery'), 'only request reads are permitted');
      assert.equal(options.method, 'post');
      const query = JSON.parse(options.payload).structuredQuery;
      queries.push(query);
      let selected = documents.filter(doc => doc.fields.requestedAt.timestampValue >= query.where.fieldFilter.value.timestampValue)
        .sort((a, b) => a.fields.requestedAt.timestampValue.localeCompare(b.fields.requestedAt.timestampValue) || a.name.localeCompare(b.name));
      if (query.startAt) {
        assert.equal(query.startAt.before, false);
        const [time, name] = query.startAt.values;
        selected = selected.filter(doc => doc.fields.requestedAt.timestampValue > time.timestampValue
          || (doc.fields.requestedAt.timestampValue === time.timestampValue && doc.name > name.referenceValue));
      }
      return { getResponseCode: () => control.failRead ? 403 : 200,
        getContentText: () => JSON.stringify(selected.slice(0, query.limit).map(document => ({ document }))) };
    } },
  });
  vm.runInContext(source, ctx);
  return { ctx, properties, mails, triggers, queries, logs, control };
}
{
  const docs = [request('old', '2026-09-30T00:00:00.000Z'),
    request('a', '2026-10-01T01:00:00.123456Z'), request('b', '2026-10-01T01:00:00.123456Z')];
  const r = runtime(docs);
  r.ctx.pollLibraryRequestAlerts();
  assert.equal(r.mails.length, 2, 'old requests must not generate mail');
  assert.equal(JSON.parse(r.properties.get(key)).cursor.name, root + 'b');
  assert.equal(JSON.parse(r.properties.get(key)).cursor.requestedAt, '2026-10-01T01:00:00.123456Z');
  r.ctx.pollLibraryRequestAlerts();
  assert.equal(r.mails.length, 2, 'repeat checks must not resend');
  docs.push(request('a', '2026-10-01T02:00:00.000Z'));
  r.ctx.pollLibraryRequestAlerts();
  assert.equal(r.mails.length, 3, 'a new request using an existing ID must alert again');
  for (const mail of r.mails) {
    assert.equal(mail.to, 'owner@example.com');
    assert(mail.body.includes('/admin'));
    assert(mail.body.includes('reader@example.com'));
    assert(!mail.body.includes('PRIVATE NOTE'));
    assert(!mail.cc && !mail.bcc && !mail.htmlBody);
  }
  assert(!r.logs.join('\n').includes('reader@example.com'));
  assert.deepEqual(r.queries[0].select.fields.map(f => f.fieldPath), ['bookId', 'bookTitle', 'name', 'contact', 'requestedAt']);
}
{
  const r = runtime([request('a', '2026-10-01T01:00:00.000Z'), request('b', '2026-10-01T02:00:00.000Z')]);
  r.control.quota = 1;
  r.ctx.pollLibraryRequestAlerts();
  assert.equal(r.mails.length, 1);
  assert.equal(JSON.parse(r.properties.get(key)).cursor.name, root + 'a');
  r.control.quota = 100;
  r.ctx.pollLibraryRequestAlerts();
  assert.equal(r.mails.length, 2, 'quota-delayed requests must be retained');
}
{
  const r = runtime([request('a', '2026-10-01T01:00:00.000Z')]);
  r.control.failSend = true;
  assert.throws(() => r.ctx.pollLibraryRequestAlerts(), /mail failure/);
  assert.equal(JSON.parse(r.properties.get(key)).cursor, null);
  assert.equal(r.control.releases, 1);
  r.control.failSend = false;
  r.ctx.pollLibraryRequestAlerts();
  assert.equal(r.mails.length, 1);
}
{
  const docs = Array.from({ length: 25 }, (_, index) => request(String(index).padStart(2, '0'), '2026-10-01T01:00:00.000Z'));
  const r = runtime(docs);
  r.ctx.pollLibraryRequestAlerts(); r.ctx.pollLibraryRequestAlerts();
  assert.equal(r.mails.length, 25, 'limited batches must eventually send every request');
  const email = r.ctx.libraryRequestEmail_(request('bad-input', baseline, 'Title\r\nBcc: attacker@example.com'));
  assert(!/[\r\n]/.test(email.subject));
  assert.equal(email.to, 'owner@example.com');
}
{
  const r = runtime([], null);
  r.ctx.installLibraryRequestAlerts();
  const state = r.properties.get(key);
  r.ctx.installLibraryRequestAlerts();
  assert.equal(r.properties.get(key), state, 'repair must preserve the initial boundary');
  assert.equal(r.triggers.length, 1);
  assert.equal(r.triggers[0].minutes, 5);
  assert.equal(r.mails.length, 1, 'initial test is not resent by repair');
}
{
  const r = runtime([], null);
  r.control.failRead = true;
  assert.throws(() => r.ctx.installLibraryRequestAlerts(), /403/);
  assert.equal(r.triggers.length, 0);
  assert(!r.properties.has(key));
  assert.equal(r.mails.length, 0);
}
{
  const r = runtime();
  r.control.locked = true;
  r.ctx.pollLibraryRequestAlerts();
  assert.equal(r.queries.length, 0);
  r.control.locked = false;
  r.properties.set(key, '{"startedAt":"not-a-date"}');
  assert.throws(() => r.ctx.pollLibraryRequestAlerts(), /Invalid alert checkpoint/);
}
const manifest = JSON.parse(fs.readFileSync('integrations/library-alerts/appsscript.json', 'utf8'));
{
  const r = runtime();
  r.properties.set('libraryRequestAlertRecipient', 'owner@example.com,attacker@example.com');
  assert.throws(() => r.ctx.installLibraryRequestAlerts(), /Configure one recipient/);
  assert.equal(r.mails.length, 0);
  assert.equal(r.triggers.length, 0);
}
assert(manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.send_mail'));
assert(!manifest.oauthScopes.some(scope => /spreadsheets|mail.google.com|gmail/.test(scope)));
console.log('Library request email alert tests passed.');
