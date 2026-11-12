/**
 * DK Blog Mailer: private subscriber mailer. Google Apps Script bound to a Google Sheet.
 * Sends through the Gmail account that owns the script. No third-party service.
 * Tabs (created by installMailer): Subscribers, Certificates, Alerts, Seen.
 */
const CFG = {
  site: 'https://dkblog-6c5e5.web.app',
  project: 'dkblog-6c5e5',
  webAppUrl: 'https://script.google.com/macros/s/AKfycbxr6W_KrFTNOQX0Pb8geHFWtxXmbusdfvQAvcUpwjullLgdnto6G62xCQNMe809tQ5T/exec',
  brand: 'ಡೀಕೆಯ ಬರಹಗಳು',
  tagline: 'ಬರಹಗಳ ಜಗತ್ತು',
  signoff: 'ದರ್ಶನ (ಡೀಕೆ)',
  confirmDays: 7,           // confirmation links stop working after this many days
  confirmDailyCap: 30,      // max confirmation mails per day (protects the 100/day quota)
  pollMinutes: 10           // 1, 5, 10, 15 or 30
};
const TAB = { subs: 'Subscribers', certs: 'Certificates', alerts: 'Alerts', seen: 'Seen', deliveries: 'Deliveries' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const KIND = { post: 'ಹೊಸ ಬರಹ', member: 'ಸಂಕಲನದಲ್ಲಿ ಹೊಸ ಬರಹ', collection: 'ಹೊಸ ಸಂಕಲನ', quiz: 'ಹೊಸ ಕ್ವಿಜ್' };
const ACTION = { post: 'ಬರಹ ಓದಿ →', member: 'ಬರಹ ಓದಿ →', collection: 'ಸಂಕಲನ ನೋಡಿ →', quiz: 'ಕ್ವಿಜ್ ವಿವರ ನೋಡಿ →' };

/* ---------- access guard ----------
 * Any public (no trailing underscore) function can be called by a visitor through google.script.run on the
 * served pages, and it then runs with the owner's authority. Owner-only entry points call this first. */
function ownerOnly_(e) {
  const me = Session.getEffectiveUser().getEmail(), who = Session.getActiveUser().getEmail();
  if (me && who === me) return;                                   // editor, Sheet menu, or the owner's own browser
  const uid = e && e.triggerUid ? String(e.triggerUid) : '';
  if (uid && ScriptApp.getProjectTriggers().some(t => t.getUniqueId() === uid)) return;   // this script's own time trigger
  throw Error('Not allowed.');
}

/* ---------- sheet helpers ---------- */
function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');   // saved by installMailer; web app / triggers have no active spreadsheet
  if (id) return SpreadsheetApp.openById(id);
  const a = SpreadsheetApp.getActive();
  if (!a) throw Error('Run installMailer once from the Sheet\'s own Apps Script editor.');
  return a;
}
function sh_(name) { const ss = ss_(); return ss.getSheetByName(name) || ss.insertSheet(name); }
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function appUrl_() { if (!CFG.webAppUrl) throw Error('Set CFG.webAppUrl to the deployed Web app URL first.'); return CFG.webAppUrl; }
function setupSheets_() {
  const heads = {
    Subscribers: ['Email', 'Status', 'Token', 'Requested At', 'Confirmed At'],
    Certificates: ['Name', 'Email', 'Certificate Link', 'Quiz', 'Status'],
    Alerts: ['Batch ID', 'Created At', 'Items (JSON)', 'Status', 'Keys (JSON)'],
    Deliveries: ['Batch ID', 'Email', 'Sent At'],
    Seen: ['Key']
  };
  Object.keys(heads).forEach(n => {
    const s = sh_(n);
    if (s.getLastRow() === 0) { s.getRange(1, 1, 1, heads[n].length).setValues([heads[n]]).setFontWeight('bold'); s.setFrozenRows(1); }
  });
}
function alertKeys_() {   // every key already announced in a batch, whether or not "Seen" was updated afterwards
  const s = sh_(TAB.alerts), n = s.getLastRow(), out = [];
  if (n < 2) return out;
  s.getRange(2, 5, n - 1, 1).getValues().forEach(r => { try { JSON.parse(r[0] || '[]').forEach(k => out.push(String(k))); } catch (e) { /* ignore a damaged cell */ } });
  return out;
}
function seenSet_() {
  const s = sh_(TAB.seen), n = s.getLastRow();
  return new Set(n < 2 ? [] : s.getRange(2, 1, n - 1, 1).getValues().map(r => String(r[0])));
}
function appendSeen_(keys) {
  if (!keys.length) return;
  const s = sh_(TAB.seen);
  s.getRange(s.getLastRow() + 1, 1, keys.length, 1).setValues(keys.map(k => [k]));
}

/* ---------- e-mail templates (blog colours, Kannada) ---------- */
function btn_(url, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#7a3b1e" style="border-radius:24px;"><a href="${esc_(url)}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-size:17px;line-height:1.7;font-weight:700;">${esc_(label)}</a></td></tr></table>`;
}
function signoff_() { return `<p style="margin:24px 0 0;font-size:16px;line-height:1.9;">ಪ್ರೀತಿಯಿಂದ,<br><strong>${esc_(CFG.signoff)}</strong></p>`; }
function shell_(heading, body, footer) {
  return `<!DOCTYPE html><html lang="kn"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc_(heading)}</title><link href="https://fonts.googleapis.com/css2?family=Anek+Kannada:wght@400;500;700&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background-color:#f7f2e7;font-family:'Anek Kannada','Noto Sans Kannada',Arial,sans-serif;color:#2c1a0e;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f2e7;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="570" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:570px;background-color:#fffdf5;border:1px solid #e8d5b0;">
<tr><td align="center" style="padding:30px 24px;background-color:#3d1f0a;"><a href="${CFG.site}/" style="color:#e8d5b0;text-decoration:none;font-size:28px;line-height:1.6;font-weight:700;">${esc_(CFG.brand)}</a><p style="margin:8px 0 0;color:#e8d5b0;font-size:15px;line-height:1.8;">${esc_(CFG.tagline)}</p></td></tr>
<tr><td style="padding:30px 28px;"><h1 style="margin:0 0 16px;font-size:24px;line-height:1.7;color:#7a3b1e;">${esc_(heading)}</h1>${body}</td></tr>
<tr><td align="center" style="padding:22px 24px;background-color:#ede5d0;color:#5a3e2b;font-size:13px;line-height:1.9;">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}
function p_(t) { return `<p style="margin:0 0 18px;font-size:17px;line-height:1.9;color:#5a3e2b;">${t}</p>`; }
function confirmHtml_(token) {
  return shell_('ನಿಮ್ಮ ಚಂದಾದಾರಿಕೆಯನ್ನು ದೃಢೀಕರಿಸಿ',
    p_('ಆತ್ಮೀಯ ಓದುಗರೇ,<br>ಡೀಕೆಯ ಬರಹಗಳಿಗೆ ಚಂದಾದಾರರಾಗಲು ಕೋರಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು. ಕೆಳಗಿನ ಬಟನ್ ಒತ್ತಿ ನಿಮ್ಮ ಇಮೇಲ್ ದೃಢೀಕರಿಸಿ.') +
    p_('ಈ ಇಮೇಲ್ ಸ್ಪ್ಯಾಮ್ ಫೋಲ್ಡರ್‌ಗೆ ಬಂದಿದ್ದರೆ, ದಯವಿಟ್ಟು <strong>Not spam</strong> ಎಂದು ಗುರುತಿಸಿ. ಇದರಿಂದ ಮುಂದಿನ ಪ್ರಕಟಣೆಗಳ ಮಾಹಿತಿ ನಿಮ್ಮ ಇನ್‌ಬಾಕ್ಸ್‌ಗೆ ತಲುಪಲು ಸಹಾಯವಾಗುತ್ತದೆ.') +
    btn_(appUrl_() + '?a=confirm&t=' + encodeURIComponent(token), 'ಚಂದಾದಾರಿಕೆ ದೃಢೀಕರಿಸಿ') + signoff_(),
    '<p style="margin:0;">ನೀವು ಇದನ್ನು ಕೋರಿರದಿದ್ದರೆ, ಈ ಇಮೇಲ್ ಅನ್ನು ನಿರ್ಲಕ್ಷಿಸಿ.</p>');
}
function unsubLink_(token) { return appUrl_() + '?a=unsubscribe&t=' + encodeURIComponent(token); }
function footerUnsub_(token) {
  return `<p style="margin:0 0 12px;">ನೀವು ಡೀಕೆಯ ಬರಹಗಳಿಗೆ ಚಂದಾದಾರರಾಗಿರುವುದರಿಂದ ಈ ಇಮೇಲ್ ಬಂದಿದೆ.</p><p style="margin:0;"><a href="${esc_(unsubLink_(token))}" style="color:#7a3b1e;text-decoration:underline;">ಚಂದಾದಾರಿಕೆಯನ್ನು ನಿಲ್ಲಿಸಿ</a></p>`;
}
function welcomeHtml_(token) {
  return shell_('ಸ್ವಾಗತ! ನಿಮ್ಮ ಚಂದಾದಾರಿಕೆ ದೃಢವಾಗಿದೆ',
    p_('ಆತ್ಮೀಯ ಓದುಗರೇ,<br>ಇನ್ನು ಮುಂದೆ ಹೊಸ ಬರಹಗಳು ಮತ್ತು ಕ್ವಿಜ್‌ಗಳ ಮಾಹಿತಿ ನಿಮ್ಮ ಇಮೇಲ್‌ಗೆ ಬರುತ್ತದೆ.') +
    btn_(CFG.site + '/', 'ಬರಹಗಳನ್ನು ಓದಿ') + signoff_(), footerUnsub_(token));
}
function alertHtml_(items, token) {
  const heading = items.length === 1 ? 'ನಿಮಗಾಗಿ ಹೊಸ ಪ್ರಕಟಣೆ!' : 'ನಿಮಗಾಗಿ ಹೊಸ ಪ್ರಕಟಣೆಗಳು!';
  const entries = items.map(i => `<div style="margin:0 0 22px;padding-top:20px;border-top:1px solid #e8d5b0;"><p style="margin:0 0 10px;color:#7a3b1e;font-size:14px;line-height:1.8;">${esc_(KIND[i.kind] || '')}</p><h2 style="margin:0 0 18px;color:#2c1a0e;font-size:22px;line-height:1.7;overflow-wrap:anywhere;">${esc_(i.title)}</h2>${btn_(i.url, ACTION[i.kind] || 'ತೆರೆಯಿರಿ →')}</div>`).join('');
  return shell_(heading, p_('ಆತ್ಮೀಯ ಓದುಗರೇ,<br>ಡೀಕೆಯ ಬರಹಗಳ ಲೋಕದಲ್ಲಿ ಹೊಸ ಪ್ರಕಟಣೆ ಬಂದಿದೆ. ಕೆಳಗಿನ ಕೊಂಡಿಯ ಮೂಲಕ ಓದಿ, ನಿಮ್ಮ ಅನಿಸಿಕೆಗಳನ್ನು ಹಂಚಿಕೊಳ್ಳಿ.') + entries + signoff_(), footerUnsub_(token));
}
function certHtml_(name, quiz, link) {
  return shell_('ನಿಮ್ಮ ಪ್ರಮಾಣಪತ್ರ',
    p_(`ಆತ್ಮೀಯ ${esc_(name)} ಅವರೇ,<br>${esc_(quiz || 'ಕ್ವಿಜ್')}ನಲ್ಲಿ ಭಾಗವಹಿಸಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ಪ್ರಮಾಣಪತ್ರವನ್ನು ಈ ಇಮೇಲ್‌ಗೆ ಲಗತ್ತಿಸಲಾಗಿದೆ.`) +
    (link ? btn_(link, 'ಪ್ರಮಾಣಪತ್ರ ತೆರೆಯಿರಿ') : '') + signoff_(),
    `<p style="margin:0;"><a href="${CFG.site}/" style="color:#7a3b1e;">${esc_(CFG.brand)}</a></p>`);
}

/* ---------- subscribe / confirm / unsubscribe (web app) ---------- */
function subscribeResult_(email) {
  let r = 'busy';
  try { r = subscribe_(String(email || '')); } catch (err) { console.error(err); }
  return r === 'ok' ? { ok: true } : { ok: false, error: r };   // 'ok' also covers already-subscribed, so the form never reveals who is on the list
}
function doPost(e) {   // the subscribe form posts here (e-mail in the request body, never in a URL) and reads the answer via postMessage
  const p = (e && e.parameter) || {};
  const nonce = /^[A-Za-z0-9]{8,64}$/.test(String(p.n || '')) ? String(p.n) : '';
  const res = p.website ? { ok: true } : subscribeResult_(p.email);   // filled honeypot = bot
  const msg = JSON.stringify({ dkMailer: 1, nonce: nonce, res: res }).replace(/</g, '\\u003c');
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><script>window.top.postMessage(' + msg + ', ' + JSON.stringify(CFG.site) + ');</script>')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);   // lets the blog embed this reply in its hidden iframe
}
function takeConfirmSlot_() {
  const p = PropertiesService.getScriptProperties();
  const key = 'confirm_' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyyMMdd');
  p.getKeys().filter(k => k.indexOf('confirm_') === 0 && k !== key).forEach(k => p.deleteProperty(k));
  const n = Number(p.getProperty(key) || 0);
  if (n >= CFG.confirmDailyCap || MailApp.getRemainingDailyQuota() < 1) return false;
  p.setProperty(key, String(n + 1)); return true;
}
function subscribe_(raw) {   // returns 'ok' | 'invalid' | 'busy'
  const email = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return 'invalid';
  const lock = LockService.getScriptLock(); if (!lock.tryLock(15000)) return 'busy';
  try {
    const s = sh_(TAB.subs), data = s.getDataRange().getValues(), now = new Date();
    let row = -1; for (let i = 1; i < data.length; i++) if (String(data[i][0]).toLowerCase() === email) { row = i + 1; break; }
    let token;
    if (row > 0) {
      const status = data[row - 1][1], asked = data[row - 1][3];
      if (status === 'confirmed') return 'ok';
      if (status === 'pending' && asked && now - new Date(asked) < 10 * 60 * 1000) return 'ok';   // confirmation mail already sent in the last 10 minutes
      token = status === 'pending' ? String(data[row - 1][2]) : Utilities.getUuid();
      s.getRange(row, 2, 1, 4).setValues([['pending', token, '', '']]);
    } else {
      token = Utilities.getUuid(); s.appendRow([email, 'pending', token, '', '']); row = s.getLastRow();
    }
    if (!takeConfirmSlot_()) return 'busy';   // daily cap or mail quota used up: row stays pending, can be retried
    try { MailApp.sendEmail({ to: email, subject: 'ಚಂದಾದಾರಿಕೆಯನ್ನು ದೃಢೀಕರಿಸಿ — ' + CFG.brand, htmlBody: confirmHtml_(token), name: CFG.brand }); }
    catch (err) { console.error(err); return 'busy'; }
    s.getRange(row, 4).setValue(new Date());  // "Requested At" is recorded only after the mail really went out
    return 'ok';
  } finally { lock.releaseLock(); }
}
function findByToken_(t) {
  t = String(t || ''); if (!/^[0-9a-f-]{36}$/.test(t)) return null;
  const s = sh_(TAB.subs), data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) if (String(data[i][2]) === t) return { sheet: s, row: i + 1, email: String(data[i][0]), status: data[i][1], requested: data[i][3] };
  return null;
}
function confirmByToken(t) {   // called from the confirm page button; returns 'ok' | 'expired' | 'invalid'
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const f = findByToken_(t); if (!f || f.status === 'unsubscribed') return 'invalid';
    if (f.status === 'confirmed') return 'ok';
    if (!f.requested || new Date() - new Date(f.requested) > CFG.confirmDays * 86400000) return 'expired';
    f.sheet.getRange(f.row, 2).setValue('confirmed'); f.sheet.getRange(f.row, 5).setValue(new Date());
    if (MailApp.getRemainingDailyQuota() > 0) { try { MailApp.sendEmail({ to: f.email, subject: 'ಸ್ವಾಗತ! ನಿಮ್ಮ ಚಂದಾದಾರಿಕೆ ದೃಢವಾಗಿದೆ', htmlBody: welcomeHtml_(String(t)), name: CFG.brand }); } catch (err) { console.error(err); } }
    return 'ok';
  } finally { lock.releaseLock(); }
}
function unsubscribeByToken(t) {   // called from the unsubscribe page button
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try { const f = findByToken_(t); if (!f) return false; f.sheet.getRange(f.row, 2).setValue('unsubscribed'); return true; }
  finally { lock.releaseLock(); }
}
function page_(title, body) {
  return HtmlService.createHtmlOutput(`<!doctype html><html lang="kn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_top"><title>${esc_(title)}</title>
<style>body{margin:0;font-family:'Noto Sans Kannada',Arial,sans-serif;background:#f7f2e7;color:#2c1a0e;display:flex;min-height:100vh;align-items:center;justify-content:center}.c{max-width:440px;margin:24px;padding:32px;background:#fffdf5;border:1px solid #e8d5b0;text-align:center;line-height:1.9}h2{color:#7a3b1e}a{color:#7a3b1e}button{background:#7a3b1e;color:#fff;border:0;border-radius:24px;padding:12px 24px;font-size:17px;cursor:pointer}</style></head>
<body><div class="c"><h2>${esc_(title)}</h2>${body}<p><a href="${CFG.site}">${esc_(CFG.brand)}</a></p></div></body></html>`).setTitle(title);
}
function doGet(e) {
  const p = (e && e.parameter) || {};
  const tok = /^[0-9a-f-]{36}$/.test(String(p.t || '')) ? String(p.t) : '';
  if (p.a === 'confirm') {   // opening the link only shows a button, so mail scanners that fetch links cannot confirm anyone
    return page_('ಚಂದಾದಾರಿಕೆ ದೃಢೀಕರಿಸಿ', `<p>ಕೆಳಗಿನ ಬಟನ್ ಒತ್ತಿ ನಿಮ್ಮ ಚಂದಾದಾರಿಕೆಯನ್ನು ದೃಢೀಕರಿಸಿ.</p><button id="b" onclick="go()">ದೃಢೀಕರಿಸಿ</button><p id="m"></p>
<script>var M={ok:'ಧನ್ಯವಾದಗಳು! ನಿಮ್ಮ ಚಂದಾದಾರಿಕೆ ದೃಢವಾಗಿದೆ.',expired:'ಈ ಕೊಂಡಿಯ ಅವಧಿ ಮುಗಿದಿದೆ. ಚಂದಾದಾರಿಕೆ ಪುಟದಲ್ಲಿ ಮತ್ತೆ ಕೋರಿ.',invalid:'ಈ ಕೊಂಡಿ ಮಾನ್ಯವಾಗಿಲ್ಲ.'};function go(){var b=document.getElementById('b'),m=document.getElementById('m');b.disabled=true;google.script.run.withSuccessHandler(function(r){m.textContent=M[r]||M.invalid}).withFailureHandler(function(){m.textContent='ತೊಂದರೆಯಾಯಿತು. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';b.disabled=false}).confirmByToken('${tok}')}</script>`);
  }
  if (p.a === 'unsubscribe') {
    return page_('ಚಂದಾದಾರಿಕೆ ನಿಲ್ಲಿಸಬೇಕೇ?', `<p>ಹೊಸ ಬರಹಗಳ ಇಮೇಲ್‌ಗಳು ಇನ್ನು ಮುಂದೆ ಬರುವುದಿಲ್ಲ.</p><button id="b" onclick="go()">ಹೌದು, ನಿಲ್ಲಿಸಿ</button><p id="m"></p>
<script>function go(){var b=document.getElementById('b'),m=document.getElementById('m');b.disabled=true;google.script.run.withSuccessHandler(function(ok){m.textContent=ok?'ಚಂದಾದಾರಿಕೆಯನ್ನು ನಿಲ್ಲಿಸಲಾಗಿದೆ.':'ಈ ಕೊಂಡಿ ಮಾನ್ಯವಾಗಿಲ್ಲ.'}).withFailureHandler(function(){m.textContent='ತೊಂದರೆಯಾಯಿತು. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';b.disabled=false}).unsubscribeByToken('${tok}')}</script>`);
  }
  return page_(CFG.brand, '<p>ಚಂದಾದಾರರಾಗಲು ಬ್ಲಾಗ್‌ನ ಚಂದಾದಾರಿಕೆ ಪುಟವನ್ನು ಬಳಸಿ.</p>');
}

/* ---------- new post / collection / quiz detection (public Firestore reads) ---------- */
function fsValue_(v) { if (!v) return null; if (v.mapValue) return fsFields_(v.mapValue.fields || {}); if (v.arrayValue) return (v.arrayValue.values || []).map(fsValue_); if (v.integerValue !== undefined) return Number(v.integerValue); return v.stringValue !== undefined ? v.stringValue : (v.booleanValue !== undefined ? v.booleanValue : (v.timestampValue !== undefined ? v.timestampValue : null)); }
function fsFields_(f) { const o = {}; Object.keys(f).forEach(k => o[k] = fsValue_(f[k])); return o; }
function fsBase_() { return 'https://firestore.googleapis.com/v1/projects/' + CFG.project + '/databases/(default)/documents/'; }
function fsList_(coll, fields) {
  let out = [], token = '';
  do {
    const url = fsBase_() + coll + '?pageSize=300' + fields.map(f => '&mask.fieldPaths=' + f).join('') + (token ? '&pageToken=' + encodeURIComponent(token) : '');
    const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (r.getResponseCode() >= 300) throw Error('Firestore read failed (' + coll + '): ' + r.getResponseCode());
    const j = JSON.parse(r.getContentText());
    out = out.concat((j.documents || []).map(d => Object.assign({ __id: d.name.split('/').pop() }, fsFields_(d.fields || {}))));
    token = j.nextPageToken || '';
  } while (token);
  return out;
}
function currentItems_() {
  const items = [], enc = encodeURIComponent;
  const posts = fsList_('posts', ['id', 'title', 'collectionId']);
  posts.forEach(p => { const id = p.id != null ? p.id : p.__id; items.push({ key: 'post-' + id, kind: 'post', title: p.title || String(id), url: CFG.site + '/post/' + enc(id) }); });
  fsList_('collections', ['id', 'title']).forEach(c => { const id = c.id != null ? c.id : c.__id; items.push({ key: 'collection-' + id, kind: 'collection', title: c.title || String(id), url: CFG.site + '/collection/' + enc(id) }); });
  posts.filter(p => p.collectionId).forEach(p => { const id = p.id != null ? p.id : p.__id; items.push({ key: 'member-' + id + '-' + p.collectionId, postKey: 'post-' + id, kind: 'member', title: p.title || String(id), url: CFG.site + '/post/' + enc(id) }); });
  const r = UrlFetchApp.fetch(fsBase_() + 'siteSettings/activeQuiz', { muteHttpExceptions: true });
  if (r.getResponseCode() < 300) {
    const q = fsFields_(JSON.parse(r.getContentText()).fields || {}).quiz;
    if (q && ['upcoming', 'live'].indexOf(q.state) >= 0) items.push({ key: 'quiz-' + q.id, kind: 'quiz', title: q.title || String(q.id), url: CFG.site + '/quiz/' + enc(q.id) });
  } else if (r.getResponseCode() !== 404) throw Error('Firestore read failed (activeQuiz): ' + r.getResponseCode());
  return items;
}
function subjectFor_(items) { return items.length === 1 ? KIND[items[0].kind] + ': ' + items[0].title : CFG.brand + ' — ಹೊಸ ಪ್ರಕಟಣೆಗಳು'; }
function pollAlerts(e) {
  ownerOnly_(e);
  const lock = LockService.getScriptLock(); if (!lock.tryLock(1000)) return;
  try {
    if (!PropertiesService.getScriptProperties().getProperty('MAILER_INSTALLED')) throw Error('Run installMailer first.');
    const seen = seenSet_(); alertKeys_().forEach(k => seen.add(k));
    const fresh = currentItems_().filter(i => !seen.has(i.key));
    if (fresh.length) {
      const keys = new Set(fresh.map(i => i.key)), toSend = fresh.filter(i => !i.postKey || !keys.has(i.postKey));   // a brand-new post in a collection is announced once, not twice
      const id = 'B' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0, 4);   // unique even if two batches land in the same second
      sh_(TAB.alerts).appendRow([id, new Date(), JSON.stringify(toSend), 'pending', JSON.stringify(fresh.map(i => i.key))]);   // one write: a crash after it cannot create a second batch for the same items
      appendSeen_(fresh.map(i => i.key));
    }
    deliverPending_();
  } finally { lock.releaseLock(); }
}
function deliverPending_() {
  const started=Date.now(),budget=240000;
  const al = sh_(TAB.alerts), rows = al.getDataRange().getValues(), subs = sh_(TAB.subs), led = sh_(TAB.deliveries);
  const done = new Set(led.getLastRow() < 2 ? [] : led.getRange(2, 1, led.getLastRow() - 1, 2).getValues().map(r => r[0] + '|' + String(r[1]).toLowerCase()));
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][3] === 'sent') continue;
    const batch = String(rows[i][0]), created = new Date(rows[i][1]), items = JSON.parse(rows[i][2]), data = subs.getDataRange().getValues();
    let incomplete = false;
    for (let r = 1; r < data.length; r++) {
      if(Date.now()-started>budget){al.getRange(i+1,4).setValue('partial');return;}
      const email = String(data[r][0]).toLowerCase(), key = batch + '|' + email;
      if (data[r][1] !== 'confirmed' || done.has(key)) continue;                  // one ledger row per (batch, subscriber)
      if (!data[r][4] || new Date(data[r][4]) > created) continue;                // joined after this batch was created: it is not news to them
      if (MailApp.getRemainingDailyQuota() < 1) { al.getRange(i + 1, 4).setValue('partial'); return; }   // continues on a later poll after the quota resets
      try {
        MailApp.sendEmail({ to: data[r][0], subject: subjectFor_(items), htmlBody: alertHtml_(items, String(data[r][2])), name: CFG.brand });
        led.appendRow([batch, email, new Date()]); done.add(key);
      } catch (err) { incomplete = true; console.error(data[r][0] + ': ' + err); }
    }
    al.getRange(i + 1, 4).setValue(incomplete ? 'partial' : 'sent');
  }
}

/* ---------- certificates (reads the Certificates tab; attaches the Drive file) ---------- */
function driveId_(link) { const m = String(link || '').match(/\/d\/([-\w]{20,})|[?&]id=([-\w]{20,})/); return m ? (m[1] || m[2]) : null; }
function certRows_() {
  const s = sh_(TAB.certs), v = s.getDataRange().getValues(), out = [];
  for (let i = 1; i < v.length; i++) {
    const st = String(v[i][4] || '');
    if (!v[i][0] && !v[i][1]) continue;
    if (st === '' || /^FAILED/.test(st)) out.push({ row: i + 1, name: String(v[i][0]).trim(), email: String(v[i][1]).trim().toLowerCase(), link: String(v[i][2]).trim(), quiz: String(v[i][3]).trim() });
  }
  return out;
}
function sendCert_(c) {
  if (!EMAIL_RE.test(c.email)) return 'FAILED: invalid email';
  const id = driveId_(c.link); if (!id) return 'FAILED: no Drive link';
  let blob; try { blob = DriveApp.getFileById(id).getBlob(); } catch (e) { return 'FAILED: cannot open file (check sharing)'; }
  try {
    MailApp.sendEmail({ to: c.email, subject: 'ನಿಮ್ಮ ಪ್ರಮಾಣಪತ್ರ' + (c.quiz ? ' — ' + c.quiz : ''), htmlBody: certHtml_(c.name, c.quiz, c.link), attachments: [blob], name: CFG.brand });
    return 'sent ' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd-MMM-yyyy HH:mm');
  } catch (e) { return 'FAILED: ' + String(e.message || e).slice(0, 80); }
}
function stuckCerts_() { const v = sh_(TAB.certs).getDataRange().getValues(); let n = 0; for (let i = 1; i < v.length; i++) if (/^SENDING/.test(String(v[i][4] || ''))) n++; return n; }
function previewCertificates() {
  ownerOnly_();
  const ui = SpreadsheetApp.getUi(), rows = certRows_(), bad = rows.filter(c => !EMAIL_RE.test(c.email) || !driveId_(c.link)).length, stuck = stuckCerts_();
  ui.alert('Certificates to send: ' + rows.length + '\nRows with a missing/invalid email or link: ' + bad + '\nRows stuck as SENDING (check the Gmail Sent folder, then clear Status to retry): ' + stuck + '\nMail quota left today: ' + MailApp.getRemainingDailyQuota());
}
function sendCertificates() {
  ownerOnly_();
  const ui = SpreadsheetApp.getUi(), first = certRows_();
  if (!first.length) { ui.alert('No unsent rows in the Certificates tab.'); return; }
  const quota = MailApp.getRemainingDailyQuota();
  if (ui.alert('Send ' + Math.min(first.length, quota) + ' certificate mails now?\n(Quota left today: ' + quota + ')', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { ui.alert('Another send is already running. Wait a few minutes and try again.'); return; }
  let msg;
  try {
    const rows = certRows_(), s = sh_(TAB.certs), t0 = Date.now(); let sent = 0, failed = 0;   // re-read inside the lock
    for (const c of rows) {
      if (Date.now() - t0 > 300000 || MailApp.getRemainingDailyQuota() < 1) break;
      s.getRange(c.row, 5).setValue('SENDING ' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd-MMM HH:mm'));   // claim first: a crash leaves a visible SENDING row, never a silent duplicate
      SpreadsheetApp.flush();
      const st = sendCert_(c); s.getRange(c.row, 5).setValue(st);
      if (st.indexOf('sent') === 0) sent++; else failed++;
    }
    msg = 'Sent: ' + sent + '\nFailed: ' + failed + '\nRemaining unsent: ' + certRows_().length + '\nStuck as SENDING: ' + stuckCerts_() + '\n(Run again to continue, or fix the FAILED rows first.)';
  } finally { lock.releaseLock(); }
  ui.alert(msg);
}

/* ---------- install, tests, menu ---------- */
function installMailer() {
  ownerOnly_();
  const p = PropertiesService.getScriptProperties(), active = SpreadsheetApp.getActive();
  if (active) p.setProperty('SHEET_ID', active.getId());   // the public web app and triggers need this id
  setupSheets_();
  if (!p.getProperty('MAILER_INSTALLED')) { appendSeen_(currentItems_().map(i => i.key)); p.setProperty('MAILER_INSTALLED', new Date().toISOString()); }   // baseline: existing content is never mailed
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'pollAlerts')) ScriptApp.newTrigger('pollAlerts').timeBased().everyMinutes(CFG.pollMinutes).create();
  console.log('Installed. Existing posts/quiz recorded as seen; checking every ' + CFG.pollMinutes + ' minutes.');
}
function sendTestMails() {
  ownerOnly_();
  const me = Session.getEffectiveUser().getEmail(), t = 'test-token', sample = currentItems_().slice(0, 2);
  MailApp.sendEmail({ to: me, subject: '[TEST] ಚಂದಾದಾರಿಕೆ ದೃಢೀಕರಣ', htmlBody: confirmHtml_('00000000-0000-0000-0000-000000000000'), name: CFG.brand });
  MailApp.sendEmail({ to: me, subject: '[TEST] ಸ್ವಾಗತ', htmlBody: welcomeHtml_('00000000-0000-0000-0000-000000000000'), name: CFG.brand });
  MailApp.sendEmail({ to: me, subject: '[TEST] ' + subjectFor_(sample), htmlBody: alertHtml_(sample, '00000000-0000-0000-0000-000000000000'), name: CFG.brand });
  console.log('3 test mails sent to ' + me);
}
function prepareImportedSubscribers() {   // migration: paste e-mails (only people still subscribed) into column A of Subscribers, then run this
  ownerOnly_();
  const ui = SpreadsheetApp.getUi(), s = sh_(TAB.subs), v = s.getDataRange().getValues(), seen = new Set(); let added = 0, dup = 0, bad = 0;
  for (let i = 1; i < v.length; i++) if (v[i][2]) seen.add(String(v[i][0]).toLowerCase());
  for (let i = 1; i < v.length; i++) {
    if (v[i][2] || !String(v[i][0]).trim()) continue;
    const email = String(v[i][0]).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { s.getRange(i + 1, 2).setValue('invalid'); bad++; continue; }
    if (seen.has(email)) { s.getRange(i + 1, 2).setValue('duplicate'); dup++; continue; }
    seen.add(email); s.getRange(i + 1, 1, 1, 5).setValues([[email, 'confirmed', Utilities.getUuid(), '', new Date()]]); added++;
  }
  ui.alert('Imported as confirmed: ' + added + '\nDuplicates skipped: ' + dup + '\nInvalid addresses: ' + bad);
}
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Blog Mailer')
    .addItem('Preview certificates', 'previewCertificates').addItem('Send certificates', 'sendCertificates')
    .addSeparator().addItem('Prepare imported subscribers', 'prepareImportedSubscribers').addItem('Send test mails to me', 'sendTestMails').addItem('Install / repair', 'installMailer').addToUi();
}
