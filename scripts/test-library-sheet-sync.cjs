const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('integrations/google-sheets/Code.gs', 'utf8');
function runtime() {
  const properties = new Map();
  const ctx = vm.createContext({ console: { log() {}, warn() {} },
    PropertiesService: { getDocumentProperties: () => ({
      getProperty: key => properties.get(key) ?? null,
      setProperty: (key, value) => properties.set(key, value),
    }) },
  });
  vm.runInContext(source, ctx);
  return ctx;
}
function sheet(ids, maxRows = 1000, sheetId = 42, header = 'Book ID') {
  return { getSheetId: () => sheetId, getMaxRows: () => maxRows,
    getLastRow: () => ids.length + 1,
    getRange: (row) => ({ getDisplayValue: () => header,
      getDisplayValues: () => ids.map(id => [id]) }),
  };
}

{
  const ctx = runtime();
  const ids = Array.from({ length: 800 }, (_, i) => String(i + 1));
  ctx.saveLibrarySnapshot_(sheet(ids), ids);
  assert.deepEqual(Array.from(ctx.readLibrarySnapshot_().ids), ids);
  ctx.rememberSyncedBookId_(sheet(ids, 999), 'new');
  assert.equal(ctx.readLibrarySnapshot_().maxRows, 1000);
  assert.equal(ctx.readLibrarySnapshot_().ids.at(-1), 'new');
}
{
  const ctx = runtime();
  const deleted = [];
  ctx.deleteFirestoreBookSafely_ = id => deleted.push(id);
  ctx.reconcileRemovedBookRows_(sheet([]));
  assert.equal(deleted.length, 0, 'initial setup must never infer a deletion');
  ctx.saveLibrarySnapshot_(sheet(['one', 'two']), ['one', 'two']);
  ctx.reconcileRemovedBookRows_(sheet(['two', 'new-website-book'], 999));
  assert.deepEqual(deleted, ['one'], 'only a previously synced missing ID is deleted');
  assert.throws(() => ctx.reconcileRemovedBookRows_(sheet([], 999, 43)), /identity/);
  assert.throws(() => ctx.reconcileRemovedBookRows_(sheet([], 999, 42, 'Renamed')), /header/);
  ctx.withLibraryLock_ = callback => callback();
  ctx.refreshLibrarySheet_ = () => assert.fail('unrelated change must not refresh');
  ctx.syncRemovedBookRows({ changeType: 'EDIT' });
  ctx.syncRemovedBookRows({ changeType: 'REMOVE_ROW', source: {
    getSheetByName: () => sheet([], 1000),
  } });
  assert.deepEqual(deleted, ['one'], 'removing a row on a different tab cannot delete books');
}
function transactionTest(status, requestStatus, missing = false, conflict = false) {
  const ctx = runtime();
  const calls = [];
  const doc = {
    name: 'projects/dkblog-6c5e5/databases/(default)/documents/libraryBooks/test',
    updateTime: '2026-09-30T00:00:00Z',
    fields: { id: { stringValue: 'test' }, title: { stringValue: 'Test' },
      status: { stringValue: status } },
  };
  ctx.googleAuthHeaders_ = () => ({});
  ctx.UrlFetchApp = { fetch: () => ({ getResponseCode: () => missing ? 404 : 200,
    getContentText: () => JSON.stringify(doc) }) };
  ctx.fetchGoogleJson_ = (url, options) => {
    const payload = JSON.parse(options.payload);
    calls.push({ url, payload });
    if (url.endsWith(':beginTransaction')) return { transaction: 'test-tx' };
    if (url.endsWith(':runQuery')) return requestStatus ? [
      { document: { fields: { status: { stringValue: requestStatus } } } },
    ] : [];
    if (url.endsWith(':commit') && conflict) throw new Error('concurrent edit');
    return {};
  };
  if (conflict) assert.throws(() => ctx.deleteFirestoreBookSafely_('test'), /concurrent/);
  else ctx.deleteFirestoreBookSafely_('test');
  return { calls, doc };
}
{
  const { calls, doc } = transactionTest('available', 'returned');
  const commit = calls.find(c => c.url.endsWith(':commit')).payload;
  assert.equal(commit.transaction, 'test-tx');
  assert.equal(commit.writes.length, 2, 'backup and deletion must be atomic');
  assert.match(commit.writes[0].update.name, /databases\/\(default\)\/documents\/libraryBookTrash\/test_/);
  assert.equal(commit.writes[0].update.fields.title.stringValue, 'Test');
  assert.equal(commit.writes[1].delete, doc.name);
  assert.equal(commit.writes[1].currentDocument.updateTime, doc.updateTime);
  assert(!calls.some(c => c.url.endsWith(':rollback')));
}
for (const request of ['requested', 'approved', 'borrowed']) {
  const { calls } = transactionTest('available', request);
  assert(!calls.some(c => c.url.endsWith(':commit')));
  assert(calls.some(c => c.url.endsWith(':rollback')));
}
for (const status of ['reserved', 'borrowed']) {
  const { calls } = transactionTest(status, null);
  assert(!calls.some(c => c.url.endsWith(':commit')));
}
assert(transactionTest('available', null, true).calls.some(c => c.url.endsWith(':rollback')));
assert(transactionTest('available', null, false, true).calls.some(c => c.url.endsWith(':rollback')));
{
  const ctx = runtime();
  const edit = { getHandlerFunction: () => 'syncEditedBook' };
  const change = { getHandlerFunction: () => 'syncRemovedBookRows' };
  const unrelated = { getHandlerFunction: () => 'unrelatedJob' };
  const triggers = [edit, change, unrelated, { getHandlerFunction: () => 'pullBooksFromFirestore', minutes: 5 }];
  let failCreate = false;
  ctx.ScriptApp = {
    getProjectTriggers: () => [...triggers],
    deleteTrigger: trigger => triggers.splice(triggers.indexOf(trigger), 1),
    newTrigger: handler => {
      const schedule = {};
      const builder = { timeBased: () => builder,
        atHour: value => { schedule.hour = value; return builder; },
        nearMinute: value => { schedule.minute = value; return builder; },
        everyDays: value => { schedule.days = value; return builder; },
        inTimezone: value => { schedule.timezone = value; return builder; },
        create: () => {
          if (failCreate) throw new Error('Cannot create trigger');
          triggers.push({ getHandlerFunction: () => handler, ...schedule });
        },
      };
      return builder;
    },
  };
  ctx.scheduleDailyLibraryPull(); ctx.scheduleDailyLibraryPull();
  assert(triggers.includes(edit) && triggers.includes(change) && triggers.includes(unrelated));
  const daily = triggers.filter(t => t.getHandlerFunction() === 'pullBooksFromFirestore');
  assert.equal(daily.length, 1);
  assert.deepEqual({ hour: daily[0].hour, minute: daily[0].minute, days: daily[0].days, timezone: daily[0].timezone },
    { hour: 7, minute: 0, days: 1, timezone: 'Asia/Kolkata' });
  failCreate = true;
  assert.throws(() => ctx.scheduleDailyLibraryPull(), /Cannot create/);
  assert(triggers.includes(daily[0]), 'creation failure must preserve the previous timer');
}
console.log('Library Sheet sync safety tests passed.');
