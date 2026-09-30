/**
 * Two-way library inventory sync for the bound Google Sheet.
 *
 * Sheet edits are written to Firestore immediately through an installable
 * on-edit trigger. Website/admin changes are pulled into the sheet every five
 * minutes. Borrower details remain only in Firestore and are never copied here.
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
    .addItem("Import all new books", "importAllNewBooks")
    .addSeparator()
    .addItem("Install / repair automatic sync", "installLibrarySync")
    .addToUi();
}

function installLibrarySync() {
  const spreadsheet = SpreadsheetApp.getActive();
  ensureSheetStructure_(spreadsheet);
  console.log("Installer: sheet structure ready");

  const managedHandlers = new Set(["syncEditedBook", "pullBooksFromFirestore"]);
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (managedHandlers.has(trigger.getHandlerFunction())) ScriptApp.deleteTrigger(trigger);
  });

  ScriptApp.newTrigger("syncEditedBook").forSpreadsheet(spreadsheet).onEdit().create();
  ScriptApp.newTrigger("pullBooksFromFirestore").timeBased().everyMinutes(5).create();
  console.log("Installer: triggers created");
  pullBooksFromFirestore();
  console.log("Automatic two-way library sync is active.");
}

function syncEditedBook(event) {
  if (!event || !event.range) return;
  const range = event.range;
  const sheet = range.getSheet();
  if (sheet.getName() !== LIBRARY_SYNC.sheetName || range.getLastRow() < 2) return;
  if (range.getNumRows() > 20) {
    console.warn("Large paste detected. Run Library Sync > Import all new books after pasting.");
    return;
  }

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
  const lastBookRow = lastBookDataRow_(sheet);
  applySheetRulesSafely_(sheet, Math.max(lastBookRow + 20, 100));
  resizeNativeTableSafely_(sheet, Math.max(lastBookRow, 2));
  console.log(`Synced: ${book.title}`);
}

function importAllNewBooks() {
  return withLibraryLock_(() => {
    const spreadsheet = SpreadsheetApp.getActive();
    const sheet = ensureSheetStructure_(spreadsheet);
    const finalRow = Math.max(sheet.getLastRow(), lastBookDataRow_(sheet));
    if (finalRow < 2) return showImportSummary_(0, []);

    const rowCount = finalRow - 1;
    const rows = readBookRows_(sheet, 2, rowCount);
    const remoteBooks = listFirestoreBooks_();
    const remoteById = new Map(remoteBooks.map((book) => [String(book.id), book]));
    const usedIds = new Set(remoteById.keys());
    rows.forEach((row) => {
      const id = clean_(row[0]);
      if (id) usedIds.add(id);
    });

    const seenSheetIds = new Set();
    const candidates = [];
    const issues = [];

    rows.forEach((displayed, index) => {
      const sheetRow = index + 2;
      const title = clean_(displayed[1]);
      const author = clean_(displayed[2]);
      let id = clean_(displayed[0]);

      if (!id && !title && !author) return;
      if (!title || !author) {
        issues.push(`Row ${sheetRow}: Title and Author are required.`);
        return;
      }

      if (!id) {
        id = nextAvailableSequentialId_(usedIds);
        usedIds.add(id);
        displayed[0] = id;
      }
      if (!isValidBookId_(id)) {
        issues.push(`Row ${sheetRow}: invalid Book ID ${id}.`);
        return;
      }
      if (seenSheetIds.has(id)) {
        issues.push(`Row ${sheetRow}: duplicate Book ID ${id}.`);
        return;
      }
      seenSheetIds.add(id);

      displayed[13] = bookUrl_(id);
      if (remoteById.has(id)) return;

      const book = bookFromDisplayedRow_(displayed, id, new Date());
      candidates.push({ row: sheetRow, book });
    });

    // Save generated IDs before network writes so a retry cannot create duplicates.
    sheet.getRange(2, 1, rowCount, 1).setValues(rows.map((row) => [clean_(row[0])]));
    sheet.getRange(2, 14, rowCount, 1).setValues(
      rows.map((row) => [clean_(row[0]) ? bookUrl_(row[0]) : clean_(row[13])]),
    );

    if (candidates.length) {
      patchFirestoreBooksBulk_(candidates.map((entry) => entry.book));
      writeBookEntries_(sheet, candidates);
    }

    const lastBookRow = Math.max(sheet.getLastRow(), lastBookDataRow_(sheet));
    applySheetRulesSafely_(sheet, Math.max(lastBookRow + 20, 100));
    resizeNativeTableSafely_(sheet, Math.max(lastBookRow, 2));
    console.log(`Bulk import complete: ${candidates.length} new books, ${issues.length} issues.`);
    return showImportSummary_(candidates.length, issues);
  });
}

function showImportSummary_(importedCount, issues) {
  const suffix = issues.length
    ? `\n\nSkipped rows (${issues.length}):\n${issues.slice(0, 12).join("\n")}`
      + (issues.length > 12 ? `\n…and ${issues.length - 12} more. See the execution log.` : "")
    : "";
  const message = `${importedCount} new books imported.${suffix}`;
  console.log(message);
  try {
    SpreadsheetApp.getUi().alert("Library import", message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (error) {
    console.log("Import summary shown in the execution log.");
  }
  return { importedCount, issues };
}

function pullBooksFromFirestore() {
  withLibraryLock_(() => {
    const spreadsheet = SpreadsheetApp.getActive();
    const sheet = ensureSheetStructure_(spreadsheet);
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
    console.log(`${books.length} books synced from the website.`);
  });
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

function readBookRows_(sheet, startRow, rowCount) {
  const columns = LIBRARY_SYNC.headers.map((_, index) =>
    sheet.getRange(startRow, index + 1, rowCount, 1).getDisplayValues().map((row) => row[0]),
  );
  return Array.from({ length: rowCount }, (_, rowIndex) =>
    columns.map((column) => column[rowIndex]),
  );
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

function writeBookEntries_(sheet, entries) {
  const ordered = entries.slice().sort((a, b) => a.row - b.row);
  let group = [];
  const flush = () => {
    if (!group.length) return;
    writeBookRows_(sheet, group[0].row, group.map((entry) => bookToRow_(entry.book)));
    group = [];
  };
  ordered.forEach((entry) => {
    if (group.length && entry.row !== group[group.length - 1].row + 1) flush();
    group.push(entry);
  });
  flush();
}

function bookFromDisplayedRow_(displayed, id, updatedAt) {
  return {
    id,
    title: clean_(displayed[1]),
    author: clean_(displayed[2]),
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
    updatedAt,
  };
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

function patchFirestoreBooksBulk_(books) {
  const fields = Object.keys(firestoreBookFields_(books[0] || {}));
  const mask = fields.map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join("&");
  const headers = googleAuthHeaders_();

  for (let offset = 0; offset < books.length; offset += 100) {
    const batch = books.slice(offset, offset + 100);
    const responses = UrlFetchApp.fetchAll(batch.map((book) => ({
      url: `${firestoreCollectionUrl_()}/${encodeURIComponent(book.id)}?${mask}&currentDocument.exists=false`,
      method: "patch",
      contentType: "application/json",
      headers,
      muteHttpExceptions: true,
      payload: JSON.stringify({ fields: firestoreBookFields_(book) }),
    })));
    responses.forEach((response) => parseGoogleResponse_(response));
    console.log(`Imported ${Math.min(offset + batch.length, books.length)} of ${books.length} books.`);
  }
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
