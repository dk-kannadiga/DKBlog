# ಸ್ವಾನಂದ ಗ್ರಂಥನಿಧಿ — Google Sheets sync

This folder is the version-controlled source for the Apps Script bound to the
`ಸ್ವಾನಂದ ಗ್ರಂಥನಿಧಿ - Books Inventory` Google Sheet.

- A manual Sheet edit writes the edited book fields to Firestore immediately.
- Complete each physical book manually in the Sheet. Once Title and Author are
  present, the row is synced automatically.
- Book ID may be entered manually. When it is left blank, the smallest unused
  sequential number is assigned automatically.
- Website/Admin changes are pulled into the Sheet every five minutes.
- The website remains the only place to delete a book, which preserves the
  existing active-loan safety check.
- Borrower names, contact details, requests, and loan records are intentionally
  excluded from the Sheet.
- `Book URL` is the permanent per-book link and can be used directly as the QR
  value in BarTender, Avery Design & Print, or another label designer.

Run `installLibrarySync` once in the bound Apps Script project to create or
repair the installable edit and five-minute time triggers.
