import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ID = "dkblog-6c5e5";
const SITE_URL = "https://dkblog-6c5e5.web.app";
const SITE_TITLE = "ಡೀಕೆಯ ಬರಹಗಳು · ಬರಹಗಳ ಜಗತ್ತು";
const FEED_LIMIT = 20;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdata(value) {
  return String(value ?? "").replace(/]]>/g, "]]]]><![CDATA[>");
}

function textToHtml(value) {
  return String(value ?? "")
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph) => `<p>${xmlEscape(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function fromFirestore(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(fromFirestore);
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields || {}).map(([key, child]) => [key, fromFirestore(child)]),
    );
  }
  return null;
}

function firestoreDocument(document) {
  const data = Object.fromEntries(
    Object.entries(document.fields || {}).map(([key, value]) => [key, fromFirestore(value)]),
  );
  return { ...data, firestoreId: String(document.name || "").split("/").at(-1) };
}

async function firebaseToken() {
  const paths = [
    join(homedir(), ".config", "configstore", "firebase-tools.json"),
    join(process.env.APPDATA || "", "configstore", "firebase-tools.json"),
  ];
  for (const path of paths) {
    try {
      const token = JSON.parse(await readFile(path, "utf8")).tokens?.access_token;
      if (token) return token;
    } catch {
      // Try the next Firebase CLI credential location.
    }
  }
  throw new Error("No Firebase CLI access token was found. Run firebase login and retry.");
}

async function firestoreFetch(path, token) {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Firestore read failed for ${path} (${response.status}).`);
  return response.json();
}

async function listCollection(collectionName, token) {
  const documents = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ pageSize: "500" });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await firestoreFetch(`${collectionName}?${params}`, token);
    documents.push(...(data.documents || []).map(firestoreDocument));
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return documents;
}

function itemDate(item, fallback) {
  for (const candidate of [item.publishedAt, item.updatedAt, item.date]) {
    const date = new Date(candidate);
    if (!Number.isNaN(date.valueOf())) return date;
  }
  return fallback;
}

function postUrl(post) {
  return `${SITE_URL}/post/${encodeURIComponent(String(post.id))}`;
}

function renderRss(posts, generatedAt) {
  const items = [...posts]
    .sort((a, b) => itemDate(b, generatedAt) - itemDate(a, generatedAt))
    .slice(0, FEED_LIMIT)
    .map((post) => {
      const url = postUrl(post);
      const description = post.exc || String(post.body || "").slice(0, 240);
      const article = textToHtml(post.body || post.exc || "");
      return `    <item>
      <title>${xmlEscape(post.title || "ಶೀರ್ಷಿಕೆಯಿಲ್ಲ")}</title>
      <link>${xmlEscape(url)}</link>
      <guid isPermaLink="true">${xmlEscape(url)}</guid>
      <pubDate>${itemDate(post, generatedAt).toUTCString()}</pubDate>
      <description>${xmlEscape(description)}</description>
      <content:encoded><![CDATA[${cdata(article)}]]></content:encoded>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${xmlEscape(SITE_TITLE)}</title>
    <link>${SITE_URL}/</link>
    <description>ಡೀಕೆಯ ಕವನಗಳು, ಕಥೆಗಳು, ಲೇಖನಗಳು ಮತ್ತು ಕ್ವಿಜ಼್‌ಗಳು</description>
    <language>kn</language>
    <lastBuildDate>${generatedAt.toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
}

function sitemapEntry(location, date, priority) {
  return `  <url>
    <loc>${xmlEscape(location)}</loc>
    <lastmod>${date.toISOString().slice(0, 10)}</lastmod>
    <priority>${priority}</priority>
  </url>`;
}

function renderSitemap({ posts, collections, books, quizzes, activeQuiz }, generatedAt) {
  const entries = new Map();
  const add = (path, date, priority) => {
    const location = `${SITE_URL}${path}`;
    const current = entries.get(location);
    if (!current || date > current.date) entries.set(location, { date, priority });
  };

  add("/", generatedAt, "1.0");
  ["/index", "/collections", "/library", "/about", "/quiz"].forEach((path) => add(path, generatedAt, "0.7"));
  posts.forEach((post) => add(`/post/${encodeURIComponent(String(post.id))}`, itemDate(post, generatedAt), "0.8"));
  collections.forEach((collection) => add(`/collection/${encodeURIComponent(String(collection.id))}`, itemDate(collection, generatedAt), "0.6"));
  books.forEach((book) => add(`/library/book/${encodeURIComponent(String(book.id))}`, itemDate(book, generatedAt), "0.6"));
  quizzes
    .filter((quiz) => Array.isArray(quiz.questions))
    .forEach((quiz) => add(`/quiz/${encodeURIComponent(String(quiz.id))}`, itemDate(quiz, generatedAt), "0.5"));
  if (activeQuiz?.id && Array.isArray(activeQuiz.questions)) {
    add(`/quiz/${encodeURIComponent(String(activeQuiz.id))}`, itemDate(activeQuiz, generatedAt), "0.5");
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...entries.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([location, entry]) => sitemapEntry(location, entry.date, entry.priority))
  .join("\n")}
</urlset>
`;
}

const token = await firebaseToken();
const [posts, collections, books, quizzes, activeQuizDocument] = await Promise.all([
  listCollection("posts", token),
  listCollection("collections", token),
  listCollection("libraryBooks", token),
  listCollection("quizzes", token),
  firestoreFetch("siteSettings/activeQuiz", token).catch(() => null),
]);
const activeQuiz = activeQuizDocument ? firestoreDocument(activeQuizDocument).quiz : null;
function latestContentDate(items) {
  return items
    .flatMap((item) => item ? [item.publishedAt, item.updatedAt, item.date] : [])
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.valueOf()))
    .reduce((latest, date) => date > latest ? date : latest, new Date("2024-01-01T00:00:00.000Z"));
}
const rssGeneratedAt = latestContentDate(posts);
const sitemapGeneratedAt = latestContentDate([...posts, ...collections, ...books, ...quizzes, activeQuiz]);

await Promise.all([
  writeFile(join(ROOT, "rss.xml"), renderRss(posts, rssGeneratedAt), "utf8"),
  writeFile(join(ROOT, "sitemap.xml"), renderSitemap({ posts, collections, books, quizzes, activeQuiz }, sitemapGeneratedAt), "utf8"),
]);

console.log(`Generated rss.xml with ${Math.min(posts.length, FEED_LIMIT)} posts and sitemap.xml with ${posts.length} post URLs.`);
// Static route documents expose previews to crawlers without extra database records.
const shell=await readFile(join(ROOT,'index.html'),'utf8');
const previewItems=[...posts.map(p=>({path:`post/${p.id}`,title:p.title,description:p.exc||p.body||p.html,image:p.coverImage})),...books.map(b=>({path:`library/book/${b.id}`,title:b.title,description:b.author})),...collections.map(c=>({path:`collection/${c.id}`,title:c.title,description:c.description,image:c.coverImage})),...quizzes.map(q=>({path:`quiz/${q.id}`,title:q.title,description:q.description})),...(activeQuiz?.id?[{path:`quiz/${activeQuiz.id}`,title:activeQuiz.title,description:activeQuiz.description}]:[])];
for(const item of previewItems){
  if(!/^(post|library\/book|collection|quiz)\/[\w-]+$/.test(item.path))continue;
  const title=xmlEscape(item.title||SITE_TITLE),description=xmlEscape(String(item.description||'ಡೀಕೆಯ ಬರಹಗಳು').replace(/<[^>]*>/g,' ').slice(0,220)),url=`${SITE_URL}/${item.path}`;
  const metadata={'og:title':title,'og:description':description,'og:url':url,'twitter:title':title,'twitter:description':description};
  if(item.path.startsWith('post/')){
    metadata['og:type']='article';
  }
  if(item.image){try{const image=new URL(item.image,SITE_URL);if(image.protocol==='https:'&&!image.username&&!image.password)metadata['og:image']=metadata['twitter:image']=xmlEscape(image.href)}catch{/* Keep the site preview image. */}}
  let html=shell.replace(/<title>[\s\S]*?<\/title>/,()=>`<title>${title}</title>`).replace(/(<meta (?:property|name)="([^"]+)" content=")[^"]*/g,(match,prefix,key)=>Object.hasOwn(metadata,key)?prefix+metadata[key]:match);
  if(metadata['og:image'])html=html.replace(/^\s*<meta property="og:image:(?:width|height|alt)"[^>]+>/gm,'');
  html=html.replace('</head>',`<link rel="canonical" href="${url}"></head>`);
  const folder=join(ROOT,...item.path.split('/'));await mkdir(folder,{recursive:true});await writeFile(join(folder,'index.html'),html,'utf8');
}
console.log(`Generated ${previewItems.length} route preview documents.`);
