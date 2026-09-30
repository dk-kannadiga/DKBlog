# ಸ್ವಾನಂದ ಗ್ರಂಥನಿಧಿ — Google Sheets sync

This folder is the version-controlled source for the Apps Script bound to the
`ಸ್ವಾನಂದ ಗ್ರಂಥನಿಧಿ - Books Inventory` Google Sheet.

- A manual Sheet edit writes the edited book fields to Firestore immediately.
- Complete each physical book manually in the Sheet. Once Title and Author are
  present, the row is synced automatically.
- Book ID may be entered manually. When it is left blank, the smallest unused
  sequential number is assigned automatically.
- Website/Admin changes are pulled into the Sheet every five minutes.
- Deleting a whole book row deletes the corresponding website entry through
  an installed change trigger. Clearing individual cells is not a deletion.
- Only IDs in the previous successful sync snapshot can be deleted. Newly
  created website books are never deleted just because they are absent here.
- Active requests, reservations, and loans block deletion and restore the row.
  Deleted books are backed up privately in Firestore `libraryBookTrash`.
- Borrower names, contact details, requests, and loan records are intentionally
  excluded from the Sheet.
- `Book URL` is the permanent per-book link and can be used directly as the QR
  value in BarTender, Avery Design & Print, or another label designer.

Run `installLibrarySync` once in the bound Apps Script project to create or
repair the edit, row-change, and five-minute time triggers.
