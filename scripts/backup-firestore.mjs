/**
 * Creates an exact, restorable Firestore snapshot on this computer.
 * The JSON deliberately retains Firestore's native REST representation so dates,
 * document IDs and field types are not lost. It never writes to Firestore.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const projectId = 'dkblog-6c5e5';
const collections = [
  'admins', 'posts', 'collections', 'libraryBooks', 'libraryRequests', 'libraryBookTrash',
  'siteSettings', 'quizzes', 'quizKeys', 'quizReceipts', 'quizSubmissions',
  'prizeQuizEntries', 'comments', 'likes', 'reactions',
];
const outputFlag = process.argv.indexOf('--output');
const outputRoot = resolve(outputFlag >= 0 ? process.argv[outputFlag + 1] : 'backup/firestore');
if (outputFlag >= 0 && !process.argv[outputFlag + 1]) throw new Error('Provide a folder after --output.');

async function accessToken() {
  const paths = [
    join(homedir(), '.config', 'configstore', 'firebase-tools.json'),
    join(process.env.APPDATA || '', 'configstore', 'firebase-tools.json'),
  ];
  for (const path of paths) {
    try {
      const value = JSON.parse(await readFile(path, 'utf8')).tokens?.access_token;
      if (value) return value;
    } catch {}
  }
  throw new Error('Firebase CLI credentials are unavailable. Run firebase login, then retry.');
}

async function listCollection(name, token) {
  const all = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ pageSize: '500', orderBy: '__name__' });
    if (pageToken) query.set('pageToken', pageToken);
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${name}?${query}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) throw new Error(`Could not read ${name} (${response.status}).`);
    const page = await response.json();
    all.push(...(page.documents || []));
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return all;
}

async function gitRevision() {
  try { return (await execFileAsync('git', ['rev-parse', 'HEAD'])).stdout.trim(); }
  catch { return null; }
}

const startedAt = new Date().toISOString();
const token = await accessToken();
const snapshot = {};
for (const name of collections) snapshot[name] = await listCollection(name, token);
const completedAt = new Date().toISOString();
const stamp = startedAt.replace(/[:.]/g, '-');
const folder = join(outputRoot, stamp);
await mkdir(folder, { recursive: true });
const manifest = {
  format: 'DKBlog Firestore backup v1', projectId, startedAt, completedAt,
  gitRevision: await gitRevision(), collections: Object.fromEntries(collections.map(name => [name, snapshot[name].length])),
  restoreNotice: 'This is a raw Firestore REST snapshot. Restore only with a reviewed, owner-authorized restore tool; it contains private quiz keys and participant information.',
};
await writeFile(join(folder, 'firestore.json'), JSON.stringify({ manifest, documents: snapshot }, null, 2), 'utf8');
await writeFile(join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log(`Backup created: ${folder}`);
console.log(`Collections: ${Object.entries(manifest.collections).map(([name, count]) => `${name}=${count}`).join(', ')}`);
