/** Daily owner-only Firestore snapshot to the owner's Google Drive. */
const DK_BACKUP = Object.freeze({
  projectId: 'dkblog-6c5e5', folderName: 'DK Blog — Private Firestore Backups',
  retentionDays: 30,
  collections: ['admins', 'posts', 'collections', 'libraryBooks', 'libraryRequests', 'libraryBookTrash', 'siteSettings', 'quizzes', 'quizKeys', 'quizReceipts', 'quizSubmissions', 'prizeQuizEntries', 'comments', 'likes', 'reactions'],
});

function installDailyFirestoreBackups() {
  withBackupLock_(function() {
    ensureBackupFolder_();
    createFirestoreBackup_();
    const old = ScriptApp.getProjectTriggers().filter(function(trigger) { return trigger.getHandlerFunction() === 'dailyFirestoreBackup'; });
    ScriptApp.newTrigger('dailyFirestoreBackup').timeBased().atHour(7).nearMinute(20).everyDays(1).inTimezone('Asia/Kolkata').create();
    old.forEach(function(trigger) { ScriptApp.deleteTrigger(trigger); });
    console.log('Daily private Firestore backups are active around 07:20 IST.');
  });
}

function dailyFirestoreBackup() { withBackupLock_(createFirestoreBackup_); }

function createFirestoreBackup_() {
  const startedAt = new Date().toISOString();
  const documents = {};
  DK_BACKUP.collections.forEach(function(collection) { documents[collection] = listBackupCollection_(collection); });
  const manifest = {
    format: 'DKBlog Firestore backup v1', projectId: DK_BACKUP.projectId, startedAt: startedAt,
    completedAt: new Date().toISOString(), collections: Object.fromEntries(DK_BACKUP.collections.map(function(name) { return [name, documents[name].length]; })),
    restoreNotice: 'Private backup. Contains participant information and quiz answer keys. Do not share.',
  };
  const safeStamp = startedAt.replace(/[:.]/g, '-');
  const body = JSON.stringify({ manifest: manifest, documents: documents }, null, 2);
  const file = ensureBackupFolder_().createFile(Utilities.newBlob(body, 'application/json', 'firestore-' + safeStamp + '.json'));
  pruneBackupFiles_(ensureBackupFolder_(), new Date(Date.now() - DK_BACKUP.retentionDays * 86400000));
  console.log('Firestore backup saved: ' + file.getName() + '; no document contents logged.');
}

function listBackupCollection_(collection) {
  const output = [];
  let pageToken = '';
  do {
    const query = { pageSize: 500, orderBy: '__name__' };
    if (pageToken) query.pageToken = pageToken;
    const response = backupFetch_(backupRoot_() + '/' + encodeURIComponent(collection) + '?' + Object.keys(query).map(function(key) { return encodeURIComponent(key) + '=' + encodeURIComponent(query[key]); }).join('&'));
    output.push.apply(output, response.documents || []); // retain raw Firestore types and IDs
    pageToken = response.nextPageToken || '';
  } while (pageToken);
  return output;
}

function ensureBackupFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const knownId = properties.getProperty('backupFolderId');
  if (knownId) { try { return DriveApp.getFolderById(knownId); } catch (_) { properties.deleteProperty('backupFolderId'); } }
  const existing = DriveApp.getFoldersByName(DK_BACKUP.folderName);
  const folder = existing.hasNext() ? existing.next() : DriveApp.createFolder(DK_BACKUP.folderName);
  properties.setProperty('backupFolderId', folder.getId());
  return folder;
}

function pruneBackupFiles_(folder, cutoff) {
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (file.getDateCreated() < cutoff) file.setTrashed(true); // recoverable in Drive Trash
  }
}

function backupRoot_() { return 'https://firestore.googleapis.com/v1/projects/' + DK_BACKUP.projectId + '/databases/(default)/documents'; }
function backupFetch_(url) {
  const response = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw new Error('Firestore backup read failed (' + response.getResponseCode() + ').');
  return JSON.parse(response.getContentText());
}
function withBackupLock_(work) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Another backup is already running.');
  try { return work(); } finally { lock.releaseLock(); }
}
