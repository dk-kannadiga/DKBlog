import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJECT_ID = "dkblog-6c5e5";
const BLOG_URL = "https://kannadigadk.blogspot.com";
const FEED_URL = `${BLOG_URL}/feeds/posts/default?alt=json&max-results=500`;
const DRY_RUN = process.argv.includes("--dry-run");

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

function formatDate(value) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function alternateUrl(entry) {
  return entry.link?.find((link) => link.rel === "alternate")?.href || BLOG_URL;
}

function sourcePostId(entry) {
  const match = String(entry.id?.$t || "").match(/post-(\d+)$/);
  if (!match) throw new Error(`Could not determine the Blogger post ID for “${entry.title?.$t || "Untitled"}”.`);
  return match[1];
}

function migrateEntry(entry) {
  const publishedAt = entry.published?.$t;
  const numericId = Date.parse(publishedAt);
  if (!Number.isSafeInteger(numericId)) throw new Error(`Invalid publication date for “${entry.title?.$t || "Untitled"}”.`);

  const html = String(entry.content?.$t || "").trim();
  const body = htmlToText(html);
  if (!body) throw new Error(`No article text found for “${entry.title?.$t || "Untitled"}”.`);

  const labels = (entry.category || [])
    .filter((category) => category.scheme === "http://www.blogger.com/atom/ns#")
    .map((category) => String(category.term || "").trim())
    .filter(Boolean);
  const bloggerId = sourcePostId(entry);

  return {
    documentId: `blogger-${bloggerId}`,
    post: {
      id: numericId,
      title: String(entry.title?.$t || "Untitled").trim(),
      lang: "ಕನ್ನಡ",
      lc: "kn",
      cat: "ಲೇಖನ / Article",
      cc: "article",
      subcat: "",
      labels,
      date: formatDate(publishedAt),
      publishedAt,
      exc: excerpt(body),
      body,
      html,
      source: {
        provider: "Blogger",
        blog: BLOG_URL,
        postId: bloggerId,
        url: alternateUrl(entry),
      },
      importedFromBlogger: true,
    },
  };
}

function firestoreValue(value) {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === "number") return { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (value && typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, firestoreValue(child)])),
      },
    };
  }
  return { nullValue: null };
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

async function getFeed() {
  const response = await fetch(FEED_URL, {
    headers: { "User-Agent": "DK-Writings Blogger migration" },
  });
  if (!response.ok) throw new Error(`Could not download the Blogger feed (${response.status}).`);
  const feed = await response.json();
  const entries = feed.feed?.entry || [];
  const total = Number(feed.feed?.["openSearch$totalResults"]?.$t || entries.length);
  if (entries.length !== total) throw new Error(`The feed returned ${entries.length} of ${total} posts; pagination is needed before importing.`);
  return entries;
}

async function commit(posts) {
  const token = await accessToken();
  const endpoint = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`;
  const writes = posts.map(({ documentId, post }) => ({
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

const posts = (await getFeed()).map(migrateEntry);
console.log(`Prepared ${posts.length} Blogger posts (${posts.filter(({ post }) => /<img\b/i.test(post.html)).length} with images).`);

if (DRY_RUN) {
  console.log("Dry run complete; Firestore was not changed.");
} else {
  await commit(posts);
  console.log(`Imported ${posts.length} posts into Firestore. Comments were not imported.`);
}
