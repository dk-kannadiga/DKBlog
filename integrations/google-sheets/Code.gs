/**
 * Two-way library inventory sync for the bound Google Sheet.
 *
 * Sheet edits are written to Firestore immediately through an installable
 * on-edit trigger. Website/admin changes are pulled into the sheet daily around
 * 07:00 IST. Borrower details remain only in Firestore and are never copied here.
 */

const LIBRARY_SYNC = Object.freeze({
  projectId: "dkblog-6c5e5",
  databaseId: "(default)",
  collection: "libraryBooks",
  sheetName: "Books",
  tableName: "BooksTable",
  siteRoot: "https://dkblog-6c5e5.web.app",
  headers: [
    "Book ID",
    "Title",
    "Author",
    "Language",
    "Category",
    "Publisher",
    "Published Year",
    "ISBN / Barcode",
    "Shelf / Location",
    "Cover Image URL",
    "Description",
    "Lending Policy",
    "Status",
    "Book URL",
    "Last Updated",
  ],
});

const EDITABLE_COLUMN_FIELDS = Object.freeze({
  2: "title",
  3: "author",
  4: "language",
  5: "category",
  6: "publisher",
  7: "year",
  8: "isbn",
  9: "shelf",
  10: "coverImage",
  11: "description",
  12: "lendingPolicy",
  13: "status",
});

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Library Sync")
    .addItem("Sync from website now", "pullBooksFromFirestore")
    .addSeparator()
    .addItem("Install / repair automatic sync", "installLibrarySync")
    .addToUi();
}

function installLibrarySync() {
  const spreadsheet = SpreadsheetApp.getActive();
  ensureSheetStructure_(spreadsheet);
  console.log("Installer: sheet structure ready");

  const managedHandlers = new Set(["syncEditedBook", "syncRemovedBookRows", "pullBooksFromFirestore"]);
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (managedHandlers.has(trigger.getHandlerFunction())) ScriptApp.deleteTrigger(trigger);
  });

  ScriptApp.newTrigger("syncEditedBook").forSpreadsheet(spreadsheet).onEdit().create();
  ScriptApp.newTrigger("syncRemovedBookRows").forSpreadsheet(spreadsheet).onChange().create();
  scheduleDailyLibraryPull();
  console.log("Installer: triggers created");
  pullBooksFromFirestore();
  console.log("Automatic two-way library sync is active.");
}

// Safe schedule migration: leave edit/change triggers and all Sheet data alone.
function scheduleDailyLibraryPull() {
  const previous = ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === "pullBooksFromFirestore");
  // Create first so a scheduling error cannot remove the existing automation.
  ScriptApp.newTrigger("pullBooksFromFirestore").timeBased()
    .atHour(7).nearMinute(0).everyDays(1).inTimezone("Asia/Kolkata").create();
  previous.forEach(trigger => ScriptApp.deleteTrigger(trigger));
  console.log("Website-to-Sheet sync scheduled daily around 07:00 IST; Sheet edit/change triggers preserved.");
}

function syncEditedBook(event) {
  if (!event || !event.range) return;
  const range = event.range;
  const sheet = range.getSheet();
  if (sheet.getName() !== LIBRARY_SYNC.sheetName || range.getLastRow() < 2) return;

  withLibraryLock_(() => {
    const firstRow = Math.max(2, range.getRow());
    const lastRow = range.getLastRow();
    const firstColumn = range.getColumn();
    const lastColumn = range.getLastColumn();

    for (let row = firstRow; row <= lastRow; row += 1) {
      syncEditedBookRow_(sheet, row, firstColumn, lastColumn);
    }
  });
}

function syncEditedBookRow_(sheet, row, firstColumn, lastColumn) {
  const displayed = LIBRARY_SYNC.headers.map(
    (_, index) => sheet.getRange(row, index + 1).getDisplayValue(),
  );
  let id = String(displayed[0] || "").trim();
  const title = clean_(displayed[1]);
  const author = clean_(displayed[2]);

  if (!id && !title && !author) return;

  const newIdAssigned = !id;
  if (newIdAssigned) {
    const usedIds = new Set(listFirestoreBooks_().map((book) => String(book.id)));
    id = nextAvailableSequentialId_(usedIds);
  }
  if (!isValidBookId_(id)) {
    console.warn(`Invalid Book ID in row ${row}. Use letters, numbers, hyphens, or underscores only.`);
    return;
  }

  const remoteDocument = getFirestoreDocument_(id);
  if (!title || !author) {
    if (remoteDocument) writeBookRow_(sheet, row, firestoreDocumentToBook_(remoteDocument));
    console.warn("Title and Author are required. The incomplete edit was not synced.");
    return;
  }

  const now = new Date();
  const book = {
    id,
    title,
    author,
    language: clean_(displayed[3]) || "ಕನ್ನಡ",
    category: clean_(displayed[4]),
    publisher: clean_(displayed[5]),
    year: clean_(displayed[6]),
    isbn: clean_(displayed[7]),
    shelf: clean_(displayed[8]),
    coverImage: clean_(displayed[9]),
    description: clean_(displayed[10]),
    lendingPolicy: normalizePolicy_(displayed[11]),
    status: normalizeStatus_(displayed[12]),
    updatedAt: now,
  };

  let fieldsToWrite;
  if (newIdAssigned || !remoteDocument) {
    fieldsToWrite = Object.keys(book);
  } else {
    fieldsToWrite = [];
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const field = EDITABLE_COLUMN_FIELDS[column];
      if (field && !fieldsToWrite.includes(field)) fieldsToWrite.push(field);
    }
    if (!fieldsToWrite.length) {
      writeBookRow_(sheet, row, firestoreDocumentToBook_(remoteDocument));
      return;
    }
  }

  patchFirestoreBook_(book, fieldsToWrite);
  writeBookRow_(sheet, row, book);
  rememberSyncedBookId_(sheet, id);
  const lastBookRow = lastBookDataRow_(sheet);
  applySheetRulesSafely_(sheet, Math.max(lastBookRow + 20, 100));
  resizeNativeTableSafely_(sheet, Math.max(lastBookRow, 2));
  console.log(`Synced: ${book.title}`);
}

function pullBooksFromFirestore() {
  withLibraryLock_(() => {
    const spreadsheet = SpreadsheetApp.getActive();
    const sheet = ensureSheetStructure_(spreadsheet);
    // Also catches a row removal whose change trigger is still waiting for the lock.
    const snapshot = readLibrarySnapshot_();
    if (snapshot && sheet.getMaxRows() < snapshot.maxRows) {
      reconcileRemovedBookRows_(sheet);
    }
    refreshLibrarySheet_(sheet);
  });
}

function syncRemovedBookRows(event) {
  if (!event || event.changeType !== "REMOVE_ROW") return;
  withLibraryLock_(() => {
    const spreadsheet = event.source || SpreadsheetApp.getActive();
    const sheet = spreadsheet.getSheetByName(LIBRARY_SYNC.sheetName);
    if (!sheet) throw new Error("Books tab is missing; no website books were deleted.");
    const snapshot = readLibrarySnapshot_();
    // Change events cover every tab. Only a smaller Books grid proves this tab lost rows.
    if (snapshot && sheet.getMaxRows() >= snapshot.maxRows) return;
    reconcileRemovedBookRows_(sheet);
    refreshLibrarySheet_(sheet);
  });
}

function refreshLibrarySheet_(sheet) {
    console.log("Pull: sheet ready");
    const books = listFirestoreBooks_().sort((a, b) =>
      String(a.title || "").localeCompare(String(b.title || ""), "kn"),
    );
    console.log(`Pull: fetched ${books.length} books`);

    const previousDataRows = Math.max(lastBookDataRow_(sheet) - 1, 0);
    const targetEndRow = Math.max(books.length + 1, 2);
    console.log(`Pull: ${previousDataRows} existing rows, target end row ${targetEndRow}`);
    if (books.length > previousDataRows) resizeNativeTableSafely_(sheet, targetEndRow);
    if (books.length) {
      writeBookRows_(sheet, 2, books.map((book) => bookToRow_(book)));
      console.log("Pull: book rows written");
    }
    if (previousDataRows > books.length) {
      const rowsToClear = previousDataRows - books.length;
      writeBookRows_(
        sheet,
        books.length + 2,
        Array.from({ length: rowsToClear }, () => Array(LIBRARY_SYNC.headers.length).fill("")),
      );
    }

    applySheetRulesSafely_(sheet, targetEndRow);
    console.log("Pull: validation refreshed");
    resizeNativeTableSafely_(sheet, targetEndRow);
    console.log("Pull: table range refreshed");
    PropertiesService.getDocumentProperties().setProperty("lastLibraryPull", new Date().toISOString());
    saveLibrarySnapshot_(sheet, books.map((book) => String(book.id)));
    console.log(`${books.length} books synced from the website.`);
}

function sheetBookIds_(sheet) {
  if (sheet.getRange(1, 1).getDisplayValue() !== "Book ID") {
    throw new Error("Book ID header changed; no website books were deleted.");
  }
  const count = Math.max(sheet.getLastRow() - 1, 0);
  return new Set(count ? sheet.getRange(2, 1, count, 1).getDisplayValues()
    .map((row) => clean_(row[0])).filter(Boolean) : []);
}

function readLibrarySnapshot_() {
  const properties = PropertiesService.getDocumentProperties();
  const raw = properties.getProperty("librarySnapshotMeta");
  if (!raw) return null;
  const snapshot = JSON.parse(raw);
  snapshot.ids = [];
  for (let chunk = 0; chunk < snapshot.chunks; chunk += 1) {
    const part = properties.getProperty(`librarySnapshotIds${chunk}`);
    if (!part) throw new Error("Library snapshot is incomplete; deletion sync stopped.");
    snapshot.ids.push(...JSON.parse(part));
  }
  return snapshot;
}

function saveLibrarySnapshot_(sheet, ids) {
  const properties = PropertiesService.getDocumentProperties();
  const uniqueIds = [...new Set(ids)];
  const chunks = Math.ceil(uniqueIds.length / 200);
  for (let chunk = 0; chunk < chunks; chunk += 1) {
    properties.setProperty(`librarySnapshotIds${chunk}`,
      JSON.stringify(uniqueIds.slice(chunk * 200, (chunk + 1) * 200)));
  }
  properties.setProperty("librarySnapshotMeta", JSON.stringify({
    sheetId: sheet.getSheetId(), maxRows: sheet.getMaxRows(), chunks,
  }));
}

function rememberSyncedBookId_(sheet, id) {
  const snapshot = readLibrarySnapshot_();
  if (!snapshot) return; // Initial installation establishes the baseline first.
  // Keep absent IDs until the row-removal handler processes them.
  const previousMaxRows = snapshot.maxRows;
  saveLibrarySnapshot_(sheet, snapshot.ids.concat(String(id)));
  if (sheet.getMaxRows() < previousMaxRows) {
    const properties = PropertiesService.getDocumentProperties();
    const meta = JSON.parse(properties.getProperty("librarySnapshotMeta"));
    meta.maxRows = previousMaxRows;
    properties.setProperty("librarySnapshotMeta", JSON.stringify(meta));
  }
}

function reconcileRemovedBookRows_(sheet) {
  const snapshot = readLibrarySnapshot_();
  if (!snapshot) {
    console.log("No previous snapshot: deletion baseline will be established without deleting books.");
    return;
  }
  if (snapshot.sheetId !== sheet.getSheetId()) {
    throw new Error("Books tab identity changed; no website books were deleted.");
  }
  const present = sheetBookIds_(sheet);
  const removed = snapshot.ids.filter((id) => !present.has(id));
  for (const id of removed) {
    const result = deleteFirestoreBookSafely_(id);
    console.log(`Row removal ${id}: ${result}`);
  }
}

function deleteFirestoreBookSafely_(id) {
  const root = firestoreCollectionUrl_().replace(/\/[^/]+$/, "");
  const transaction = fetchGoogleJson_(`${root}:beginTransaction`, {
    method: "post", contentType: "application/json", payload: JSON.stringify({ options: { readWrite: {} } }),
  }).transaction;
  let committed = false;
  try {
    const response = UrlFetchApp.fetch(
      `${firestoreCollectionUrl_()}/${encodeURIComponent(id)}?transaction=${encodeURIComponent(transaction)}`,
      { method: "get", headers: googleAuthHeaders_(), muteHttpExceptions: true },
    );
    if (response.getResponseCode() === 404) return "already deleted";
    const document = parseGoogleResponse_(response);
    const book = firestoreDocumentToBook_(document);
    const requests = fetchGoogleJson_(`${root}:runQuery`, {
      method: "post", contentType: "application/json", payload: JSON.stringify({
        transaction,
        structuredQuery: {
          from: [{ collectionId: "libraryRequests" }],
          where: { fieldFilter: { field: { fieldPath: "bookId" }, op: "EQUAL", value: { stringValue: String(id) } } },
          select: { fields: [{ fieldPath: "status" }] },
        },
      }),
    });
    const active = requests.some((row) => row.document
      && ["requested", "approved", "borrowed"].includes(firestoreValue_(row.document.fields.status)));
    if (active || ["borrowed", "reserved"].includes(book.status)) {
      return "protected: active request or loan; restored to Sheet";
    }
    const backupName = document.name.replace(/\/libraryBooks\/[^/]+$/, `/libraryBookTrash/${id}_${Date.now()}`);
    fetchGoogleJson_(`${root}:commit`, {
      method: "post", contentType: "application/json", payload: JSON.stringify({
        transaction,
        writes: [
          { update: { name: backupName, fields: {
            ...document.fields,
            deletedAt: { timestampValue: new Date().toISOString() },
            deletionSource: { stringValue: "Google Sheets row removal" },
          } }, currentDocument: { exists: false } },
          { delete: document.name, currentDocument: { updateTime: document.updateTime } },
        ],
      }),
    });
    committed = true;
    return "deleted from website (recoverable backup saved)";
  } finally {
    if (!committed) fetchGoogleJson_(`${root}:rollback`, {
      method: "post", contentType: "application/json", payload: JSON.stringify({ transaction }),
    });
  }
}

function ensureSheetStructure_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(LIBRARY_SYNC.sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(LIBRARY_SYNC.sheetName);
    sheet.getRange(1, 1, 1, LIBRARY_SYNC.headers.length).setValues([LIBRARY_SYNC.headers]);
    sheet.setFrozenRows(1);
  }
  applySheetRulesSafely_(sheet, Math.max(lastBookDataRow_(sheet) + 20, 100));
  return sheet;
}

function lastBookDataRow_(sheet) {
  const table = getNativeTable_(sheet);
  return table && table.range && table.range.endRowIndex
    ? Math.max(table.range.endRowIndex, 1)
    : 1;
}

function applySheetRulesSafely_(sheet, lastValidationRow) {
  try {
    applySheetRules_(sheet, lastValidationRow);
  } catch (error) {
    console.warn(`Validation refresh skipped for typed table columns: ${error.message}`);
  }
}

function applySheetRules_(sheet, lastValidationRow) {
  const finalRow = Math.min(Math.max(lastValidationRow, 2), sheet.getMaxRows());
  const rowCount = finalRow - 1;
  const lendingRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["lendable", "reference"], true)
    .setAllowInvalid(false)
    .build();
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["available", "reserved", "borrowed", "unavailable"], true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(2, 12, rowCount, 1).setDataValidation(lendingRule);
  sheet.getRange(2, 13, rowCount, 1).setDataValidation(statusRule);
  sheet.getRange(2, 1, rowCount, 1).setNumberFormat("@");
  sheet.getRange(2, 7, rowCount, 1).setNumberFormat("@");
  sheet.getRange(2, 8, rowCount, 1).setNumberFormat("@");
  sheet.getRange(2, 15, rowCount, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");
}

function writeBookRow_(sheet, row, book) {
  writeBookRows_(sheet, row, [bookToRow_(book)]);
}

function writeBookRows_(sheet, startRow, rows) {
  if (!rows.length) return;
  for (let column = 0; column < LIBRARY_SYNC.headers.length; column += 1) {
    sheet
      .getRange(startRow, column + 1, rows.length, 1)
      .setValues(rows.map((row) => [row[column]]));
  }
}

function bookToRow_(book) {
  const id = String(book.id || "").trim();
  const url = bookUrl_(id);
  const updatedAt = book.updatedAt instanceof Date ? book.updatedAt : new Date(book.updatedAt || Date.now());
  return [
    id,
    clean_(book.title),
    clean_(book.author),
    clean_(book.language) || "ಕನ್ನಡ",
    clean_(book.category),
    clean_(book.publisher),
    clean_(book.year),
    clean_(book.isbn),
    clean_(book.shelf),
    clean_(book.coverImage),
    clean_(book.description),
    normalizePolicy_(book.lendingPolicy),
    normalizeStatus_(book.status),
    url,
    Number.isNaN(updatedAt.valueOf()) ? new Date() : updatedAt,
  ];
}

function bookUrl_(id) {
  return `${LIBRARY_SYNC.siteRoot}/library/book/${encodeURIComponent(clean_(id))}`;
}

function listFirestoreBooks_() {
  const books = [];
  let pageToken = "";
  do {
    let url = `${firestoreCollectionUrl_()}?pageSize=500&orderBy=__name__`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const payload = fetchGoogleJson_(url, { method: "get" });
    (payload.documents || []).forEach((document) => books.push(firestoreDocumentToBook_(document)));
    pageToken = payload.nextPageToken || "";
  } while (pageToken);
  return books;
}

function getFirestoreDocument_(id) {
  const response = UrlFetchApp.fetch(`${firestoreCollectionUrl_()}/${encodeURIComponent(id)}`, {
    method: "get",
    headers: googleAuthHeaders_(),
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() === 404) return null;
  return parseGoogleResponse_(response);
}

function patchFirestoreBook_(book, fieldNames) {
  const uniqueFields = [...new Set(fieldNames.concat("updatedAt"))];
  const allFields = firestoreBookFields_(book);
  const selectedFields = {};
  uniqueFields.forEach((field) => {
    if (allFields[field]) selectedFields[field] = allFields[field];
  });

  const mask = uniqueFields
    .map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
    .join("&");
  const url = `${firestoreCollectionUrl_()}/${encodeURIComponent(book.id)}?${mask}`;
  fetchGoogleJson_(url, {
    method: "patch",
    contentType: "application/json",
    payload: JSON.stringify({ fields: selectedFields }),
  });
}

function firestoreBookFields_(book) {
  const stringField = (value) => ({ stringValue: clean_(value) });
  const id = clean_(book.id);
  const idValue = /^(0|[1-9]\d*)$/.test(id)
    ? { integerValue: id }
    : { stringValue: id };
  return {
    id: idValue,
    title: stringField(book.title),
    author: stringField(book.author),
    language: stringField(book.language),
    category: stringField(book.category),
    publisher: stringField(book.publisher),
    year: stringField(book.year),
    isbn: stringField(book.isbn),
    shelf: stringField(book.shelf),
    coverImage: stringField(book.coverImage),
    description: stringField(book.description),
    lendingPolicy: stringField(normalizePolicy_(book.lendingPolicy)),
    status: stringField(normalizeStatus_(book.status)),
    updatedAt: { timestampValue: new Date(book.updatedAt || Date.now()).toISOString() },
  };
}

function firestoreDocumentToBook_(document) {
  const source = document.fields || {};
  const idFromName = String(document.name || "").split("/").pop();
  return {
    id: firestoreValue_(source.id) || idFromName,
    title: firestoreValue_(source.title),
    author: firestoreValue_(source.author),
    language: firestoreValue_(source.language),
    category: firestoreValue_(source.category),
    publisher: firestoreValue_(source.publisher),
    year: firestoreValue_(source.year),
    isbn: firestoreValue_(source.isbn),
    shelf: firestoreValue_(source.shelf),
    coverImage: firestoreValue_(source.coverImage),
    description: firestoreValue_(source.description),
    lendingPolicy: firestoreValue_(source.lendingPolicy),
    status: firestoreValue_(source.status),
    updatedAt: firestoreValue_(source.updatedAt) || document.updateTime,
  };
}

function firestoreValue_(value) {
  if (!value) return "";
  if (Object.prototype.hasOwnProperty.call(value, "stringValue")) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, "integerValue")) return value.integerValue;
  if (Object.prototype.hasOwnProperty.call(value, "doubleValue")) return value.doubleValue;
  if (Object.prototype.hasOwnProperty.call(value, "booleanValue")) return value.booleanValue;
  if (Object.prototype.hasOwnProperty.call(value, "timestampValue")) return value.timestampValue;
  return "";
}

function resizeNativeTable_(sheet, endRowIndex) {
  const table = getNativeTable_(sheet);
  if (!table) return;
  if (table.range && table.range.endRowIndex === endRowIndex) return;
  const spreadsheetId = sheet.getParent().getId();

  Sheets.Spreadsheets.batchUpdate({
    requests: [{
      updateTable: {
        table: {
          tableId: table.tableId,
          range: {
            sheetId: sheet.getSheetId(),
            startRowIndex: 0,
            endRowIndex,
            startColumnIndex: 0,
            endColumnIndex: LIBRARY_SYNC.headers.length,
          },
        },
        fields: "range",
      },
    }],
  }, spreadsheetId);
}

function getNativeTable_(sheet) {
  const spreadsheetId = sheet.getParent().getId();
  const metadata = Sheets.Spreadsheets.get(spreadsheetId, {
    fields: "sheets(properties(sheetId,title),tables(tableId,name,range))",
  });
  const sheetMetadata = (metadata.sheets || []).find(
    (item) => item.properties && item.properties.sheetId === sheet.getSheetId(),
  );
  const table = (sheetMetadata && sheetMetadata.tables || []).find(
    (item) => item.name === LIBRARY_SYNC.tableName,
  );
  return table || null;
}

function resizeNativeTableSafely_(sheet, endRowIndex) {
  try {
    resizeNativeTable_(sheet, endRowIndex);
  } catch (error) {
    console.warn(`Native table resize skipped: ${error.message}`);
  }
}

function firestoreCollectionUrl_() {
  return `https://firestore.googleapis.com/v1/projects/${LIBRARY_SYNC.projectId}`
    + `/databases/${encodeURIComponent(LIBRARY_SYNC.databaseId)}`
    + `/documents/${LIBRARY_SYNC.collection}`;
}

function fetchGoogleJson_(url, options) {
  const request = Object.assign({}, options || {}, {
    headers: Object.assign({}, googleAuthHeaders_(), options && options.headers || {}),
    muteHttpExceptions: true,
  });
  return parseGoogleResponse_(UrlFetchApp.fetch(url, request));
}

function parseGoogleResponse_(response) {
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error(`Google API request failed (${code}): ${text.slice(0, 800)}`);
  }
  return text ? JSON.parse(text) : {};
}

function googleAuthHeaders_() {
  return { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` };
}

function normalizePolicy_(value) {
  return clean_(value) === "reference" ? "reference" : "lendable";
}

function normalizeStatus_(value) {
  const status = clean_(value);
  return ["available", "reserved", "borrowed", "unavailable"].includes(status)
    ? status
    : "available";
}

function isValidBookId_(value) {
  return /^[A-Za-z0-9_-]+$/.test(clean_(value));
}

function nextAvailableSequentialId_(usedIds) {
  let candidate = 1;
  while (usedIds.has(String(candidate))) candidate += 1;
  return String(candidate);
}

function clean_(value) {
  return String(value == null ? "" : value).trim();
}

function withLibraryLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}
