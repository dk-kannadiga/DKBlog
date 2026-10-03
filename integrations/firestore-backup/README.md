# DK Blog backup

Two independent recovery copies are used:

1. GitHub keeps the website source and its full change history.
2. Firestore data is exported as raw Firestore REST JSON: once locally with `node scripts/backup-firestore.mjs`, and daily to the owner's Google Drive by this standalone Apps Script.

The Drive folder is named **DK Blog — Private Firestore Backups**. It retains 30 days of daily copies; older copies go to Google Drive Trash, so they remain recoverable there for Drive's normal trash-retention period. The Script Property `backupFolderId` pins the folder after initial setup.

The snapshot contains all known top-level collections, including private quiz keys, participant contact information and administrator settings. It must never be shared or hosted. `backup/` is ignored by Firebase Hosting and Git.

## Installation

1. Create a standalone Apps Script project named `DK Blog — Private Backups`.
2. Copy in `Code.gs` and `appsscript.json`.
3. Run `installDailyFirestoreBackups` once. It creates or reuses the private Drive folder, takes an initial snapshot, and schedules daily backups around 07:20 IST.

Apps Script daily triggers are approximate, not minute-exact. The service has read-only Firestore access; its only Drive changes are creating backup files and moving copies older than 30 days to Trash.

## Restore safety

Snapshots are intentionally raw so field types and document names survive. A restore must be a separate reviewed operation: inspect the manifest, choose the exact snapshot, make a fresh backup first, and restore only the collections/documents actually needed. Do not blindly overwrite production data.
