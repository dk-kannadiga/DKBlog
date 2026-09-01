import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJECT_ID = "dkblog-6c5e5";
const PROFILE_URL = "https://kannada.pratilipi.com/user/%E0%B2%A6%E0%B2%B0%E0%B3%8D%E0%B2%B6%E0%B2%A8-%E0%B2%95%E0%B2%A8%E0%B3%8D%E0%B2%A8%E0%B2%A1%E0%B2%BF%E0%B2%97-aiwuywlowz";
const ORIGIN = "https://kannada.pratilipi.com";
const DRY_RUN = process.argv.includes("--dry-run");
const USER_AGENT = "Mozilla/5.0 (compatible; DK-Writings Pratilipi migration)";

const CATEGORY = {
  article: { cc: "article", cat: "ಲೇಖನ / Article" },
  story: { cc: "story", cat: "ಕಥೆ / Story" },
  poem: { cc: "poem", cat: "ಕವನ / Poem" },
};

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function decodePratilipiValue(value) {
  return String(value || "")
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function htmlToText(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|blockquote|h[1-6]|ol|ul)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "• ")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function excerpt(text) {
  if (text.length <= 180) return text;
  const sample = text.slice(0, 180);
  const cutAt = Math.max(sample.lastIndexOf(" "), sample.lastIndexOf("\n"));
  return `${sample.slice(0, cutAt > 100 ? cutAt : 160).trim()}...`;
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(timestamp));
}

function extractStringField(record, field) {
  const match = record.match(new RegExp(`${field}:"((?:\\\\.|[^\"])*)"`));
  return match ? decodePratilipiValue(match[1]) : "";
}

function extractNumberField(record, field) {
  const match = record.match(new RegExp(`${field}:(\\d+)`));
  return match ? Number(match[1]) : 0;
}

function profileWorks(profile) {
  const marker = /"Pratilipi:(\d+)":\{writable:true,enumerable:true,value:\{/g;
  const works = [];
  for (const match of profile.matchAll(marker)) {
    const start = match.index;
    const end = profile.indexOf('"Pratilipi:', start + match[0].length);
    const record = profile.slice(start, end === -1 ? undefined : end);
    const readPath = extractStringField(record, "readPageUrl");
    const title = extractStringField(record, "title");
    const createdAt = extractNumberField(record, "createdAt");
    const coverImage = extractStringField(record, "coverImageUrl");
    if (!readPath || !title || !createdAt) continue;
    works.push({
      contentId: match[1],
      title,
      createdAt,
      coverImage,
      readerUrl: new URL(readPath, ORIGIN).href,
    });
  }
  return [...new Map(works.map((work) => [work.contentId, work])).values()];
}

function extractDivInner(html, className) {
  const opening = new RegExp(`<div\\b[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>`, "i").exec(html);
  if (!opening || opening.index === undefined) return "";
  const openingEnd = opening.index + opening[0].length;
  const div = /<\/?div\b[^>]*>/gi;
  div.lastIndex = opening.index;
  let depth = 0;
  for (let match = div.exec(html); match; match = div.exec(html)) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) return html.slice(openingEnd, match.index);
    } else {
      depth += 1;
    }
  }
  return "";
}

function readerType(html) {
  const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/<[^>]*>/g, ""));
  const type = title.match(/Read Kannada (article|story|poem)/i)?.[1]?.toLowerCase();
  if (!type || !CATEGORY[type]) throw new Error(`Could not identify a work type from reader title: ${title}`);
  return type;
}

async function getPage(url) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "kn-IN,kn;q=0.9,en;q=0.8" } });
  if (!response.ok) throw new Error(`Could not fetch ${url} (${response.status}).`);
  return response.text();
}

async function readWorks() {
  const profile = await getPage(PROFILE_URL);
  const works = profileWorks(profile);
  if (works.length !== 9) throw new Error(`Expected 9 public works but found ${works.length}. The profile structure may have changed.`);

  const imported = [];
  for (const work of works) {
    const reader = await getPage(work.readerUrl);
    const html = extractDivInner(reader, "content-section").trim();
    const body = htmlToText(html);
    if (!html || !body) throw new Error(`No readable article text found for “${work.title}”.`);
    const type = readerType(reader);
    imported.push({
      documentId: `pratilipi-${work.contentId}`,
      post: {
        id: work.createdAt,
        title: work.title,
        lang: "ಕನ್ನಡ",
        lc: "kn",
        ...CATEGORY[type],
        subcat: "",
        labels: [],
        date: formatDate(work.createdAt),
        publishedAt: new Date(work.createdAt).toISOString(),
        exc: excerpt(body),
        body,
        html,
        coverImage: work.coverImage,
        source: {
          provider: "Pratilipi",
          authorProfile: PROFILE_URL,
          contentId: work.contentId,
          url: work.readerUrl,
        },
        importedFromPratilipi: true,
      },
    });
  }
  return imported;
}

function firestoreValue(value) {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === "number") return { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (value && typeof value === "object") {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, firestoreValue(child)])) } };
  }
  return { nullValue: null };
}

function fromFirestoreValue(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, child]) => [key, fromFirestoreValue(child)]));
  return null;
}

async function accessToken() {
  const candidates = [
    join(homedir(), ".config", "configstore", "firebase-tools.json"),
    join(process.env.APPDATA || "", "configstore", "firebase-tools.json"),
  ];
  for (const path of candidates) {
    try {
      const config = JSON.parse(await readFile(path, "utf8"));
      if (config.tokens?.access_token) return config.tokens.access_token;
    } catch {
      // Try the next Firebase CLI credential location.
    }
  }
  throw new Error("No Firebase CLI access token was found. Run `firebase login` and retry.");
}

async function firestorePosts(token) {
  const endpoint = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/posts?pageSize=100`;
  const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Could not read existing Firestore posts (${response.status}).`);
  const result = await response.json();
  return (result.documents || []).map((document) => ({
    id: document.name.split("/").pop(),
    ...Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, fromFirestoreValue(value)])),
  }));
}

function wordSet(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .split(/\s+/u)
      .map((word) => word.replace(/[^\p{L}\p{M}\p{N}]+/gu, ""))
      .filter((word) => word.length > 1),
  );
}

function similarity(left, right) {
  const a = wordSet(left);
  const b = wordSet(right);
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.max(1, a.size + b.size - shared);
}

function existingBloggerDuplicate(post, existingPosts) {
  const candidates = existingPosts.filter((item) => item.source?.provider === "Blogger");
  const best = candidates
    .map((candidate) => ({ candidate, score: similarity(post.body, candidate.body) }))
    .sort((a, b) => b.score - a.score)[0];
  return best?.score >= 0.8 ? best : null;
}

async function commit(token, works) {
  const endpoint = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`;
  const writes = works.map(({ documentId, post }) => ({
    update: {
      name: `projects/${PROJECT_ID}/databases/(default)/documents/posts/${documentId}`,
      fields: Object.fromEntries(Object.entries(post).map(([key, value]) => [key, firestoreValue(value)])),
    },
  }));
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ writes }),
  });
  if (!response.ok) throw new Error(`Firestore import failed (${response.status}): ${await response.text()}`);
}

const token = await accessToken();
const existingPosts = await firestorePosts(token);
const works = await readWorks();
const duplicates = works
  .map((work) => ({ work, duplicate: existingBloggerDuplicate(work.post, existingPosts) }))
  .filter(({ duplicate }) => duplicate);
const imports = works.filter((work) => !duplicates.some(({ work: duplicate }) => duplicate.documentId === work.documentId));

const byType = Object.groupBy(works, ({ post }) => post.cc);
console.log(`Prepared ${works.length} Pratilipi works (${byType.article?.length || 0} articles, ${byType.story?.length || 0} stories, ${byType.poem?.length || 0} poems).`);
for (const { work, duplicate } of duplicates) console.log(`Skipping Blogger duplicate: ${work.post.title} → ${duplicate.candidate.title} (${Math.round(duplicate.score * 100)}% text overlap).`);
console.log(`Ready to import ${imports.length} new works.`);

if (DRY_RUN) {
  console.log("Dry run complete; Firestore was not changed.");
} else {
  await commit(token, imports);
  console.log(`Imported ${imports.length} Pratilipi works into Firestore. Comments were not imported.`);
}
