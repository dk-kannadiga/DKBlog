import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJECT_ID = "dkblog-6c5e5";
const APPLY = process.argv.includes("--apply");
const CATEGORY_PATH = "siteSettings/categories";
const QUIZ_IDS = Array.from({ length: 14 }, (_, index) =>
  `archive-google-form-${String(900001 + index)}`,
);

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
  throw new Error("Unsupported Firestore field type.");
}

function toFirestore(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestore) } };
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, child]) => [key, toFirestore(child)]),
        ),
      },
    };
  }
  throw new Error(`Unsupported value type: ${typeof value}`);
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

function documentUrl(path) {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
}

async function readDocument(path, token) {
  const response = await fetch(documentUrl(path), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Firestore read failed for ${path} (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

async function patchField(path, field, value, token) {
  const params = new URLSearchParams({ "updateMask.fieldPaths": field });
  const response = await fetch(`${documentUrl(path)}?${params}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: { [field]: toFirestore(value) } }),
  });
  if (!response.ok) {
    throw new Error(`Firestore update failed for ${path}.${field} (${response.status}): ${await response.text()}`);
  }
}

function updateOtherLabels(items) {
  let changes = 0;
  for (const key of ["poem", "story", "article"]) {
    const subs = items?.[key]?.subs;
    if (!Array.isArray(subs)) throw new Error(`Missing category list: items.${key}.subs`);
    items[key].subs = subs.map((label) => {
      if (label === "Other") {
        changes += 1;
        return "ಇತರೆ";
      }
      return label;
    });
  }
  return changes;
}

async function verify(token) {
  const categoryDocument = await readDocument(CATEGORY_PATH, token);
  const items = fromFirestore(categoryDocument.fields?.items);
  const categoryLabels = ["poem", "story", "article"].map((key) => items?.[key]?.subs || []);
  if (categoryLabels.some((labels) => labels.includes("Other") || !labels.includes("ಇತರೆ"))) {
    throw new Error("Category localization verification failed.");
  }

  const quizDates = await Promise.all(
    QUIZ_IDS.map(async (id) => {
      const document = await readDocument(`quizzes/${id}`, token);
      return fromFirestore(document.fields?.date);
    }),
  );
  if (quizDates.some((date) => date !== "ಗೂಗಲ್ ಫಾರ್ಮ್ಸ್ ಸಂಗ್ರಹ")) {
    throw new Error("Google Forms archive label verification failed.");
  }
}

const token = await firebaseToken();
const categoryDocument = await readDocument(CATEGORY_PATH, token);
const items = fromFirestore(categoryDocument.fields?.items);
const categoryChanges = updateOtherLabels(items);

const quizChanges = [];
for (const id of QUIZ_IDS) {
  const document = await readDocument(`quizzes/${id}`, token);
  const date = fromFirestore(document.fields?.date);
  if (!["Google Forms archive", "ಗೂಗಲ್ ಫಾರ್ಮ್ಸ್ ಸಂಗ್ರಹ"].includes(date)) {
    throw new Error(`Unexpected archive label in quizzes/${id}: ${JSON.stringify(date)}`);
  }
  if (date === "Google Forms archive") quizChanges.push(id);
}

console.log(JSON.stringify({ mode: APPLY ? "apply" : "dry-run", categoryChanges, quizChanges }, null, 2));

if (APPLY) {
  if (categoryChanges) await patchField(CATEGORY_PATH, "items", items, token);
  await Promise.all(
    quizChanges.map((id) =>
      patchField(`quizzes/${id}`, "date", "ಗೂಗಲ್ ಫಾರ್ಮ್ಸ್ ಸಂಗ್ರಹ", token),
    ),
  );
  await verify(token);
  console.log("Firestore Kannada localization verified.");
}
