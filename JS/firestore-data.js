import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  addDoc,
  collection,
  countFromServer,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  writeBatch,
  where,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCHuyfBo7zAKlYc6Gq9uOPQavv_bwxh4x4",
  authDomain: "dkblog-6c5e5.firebaseapp.com",
  projectId: "dkblog-6c5e5",
  storageBucket: "dkblog-6c5e5.firebasestorage.app",
  messagingSenderId: "37742053196",
  appId: "1:37742053196:web:3ef84ac8457d7b6274b1e9",
  measurementId: "G-ELQWHJP20S",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;
let owner = false;
const POST_PAGE_SIZE = 12;
const LIBRARY_PAGE_SIZE = 24;
let postPageCursor = null;
let postPageHasMore = true;
let libraryBookCursor = null;
let resolveAuthReady;
const authReady = new Promise((resolve) => {
  resolveAuthReady = resolve;
});
let authReadyResolved = false;

function finishAuthReady() {
  if (!authReadyResolved) {
    authReadyResolved = true;
    resolveAuthReady();
  }
}

async function refreshOwner(user) {
  if (!user || user.isAnonymous) return false;
  const role = await getDoc(doc(db, "admins", user.uid));
  return role.exists() && role.data().enabled === true;
}

async function becomeAnonymous() {
  if (!auth.currentUser) {
    const result = await signInAnonymously(auth);
    currentUser = result.user;
  } else {
    currentUser = auth.currentUser;
  }
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  owner = false;
  try {
    if (!user) {
      await becomeAnonymous();
      return;
    }
    owner = await refreshOwner(user);
  } catch (error) {
    console.error("Firebase authentication setup failed:", error);
  } finally {
    finishAuthReady();
    window.dispatchEvent(new CustomEvent("dk-auth-changed", { detail: { owner } }));
  }
});

async function requireUser() {
  await authReady;
  if (!currentUser) throw new Error("Unable to establish a secure visitor session.");
  return currentUser;
}

window.firebaseAuthReady = authReady;
window.getCurrentFirebaseUser = () => currentUser;
window.isFirebaseOwner = () => owner;
window.signInAdmin = async function () {
  await authReady;
  if (currentUser && !currentUser.isAnonymous) {
    owner = await refreshOwner(currentUser);
    if (owner) return currentUser;
    await signOut(auth);
    await becomeAnonymous();
  }
  if (!currentUser || currentUser.isAnonymous) {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const result = await signInWithPopup(auth, provider);
    currentUser = result.user;
  }
  owner = await refreshOwner(currentUser);
  if (!owner) {
    throw new Error("This Google account is not authorized to administer the site.");
  }
  return currentUser;
};
window.signOutAdmin = async function () {
  await signOut(auth);
  await becomeAnonymous();
};

window.getFirestorePosts = async function () {
  const snapshot = await getDocs(collection(db, "posts"));
  return snapshot.docs
    .map((post) => ({ ...post.data(), firestoreId: post.id }))
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
};
window.getFirestorePostsPage = async function (reset = false) {
  if (reset) {
    postPageCursor = null;
    postPageHasMore = true;
  }
  if (!postPageHasMore) return { posts: [], hasMore: false };
  const constraints = [orderBy("id", "desc")];
  if (postPageCursor) constraints.push(startAfter(postPageCursor));
  constraints.push(limit(POST_PAGE_SIZE + 1));
  const snapshot = await getDocs(query(collection(db, "posts"), ...constraints));
  const page = snapshot.docs.slice(0, POST_PAGE_SIZE);
  postPageCursor = page[page.length - 1] || postPageCursor;
  postPageHasMore = snapshot.docs.length > POST_PAGE_SIZE;
  return {
    posts: page.map((post) => ({ ...post.data(), firestoreId: post.id })),
    hasMore: postPageHasMore,
  };
};
window.getFirestorePostById = async function (postId) {
  const numericId = Number(postId);
  const candidates = Number.isFinite(numericId) ? [numericId, String(postId)] : [String(postId)];
  for (const candidate of [...new Set(candidates)]) {
    const snapshot = await getDocs(query(collection(db, "posts"), where("id", "==", candidate), limit(1)));
    const result = snapshot.docs[0];
    if (result) return { ...result.data(), firestoreId: result.id };
  }
  return null;
};
window.saveFirestorePost = async function (post) {
  const { firestoreId, ...postData } = post;
  await setDoc(
    doc(db, "posts", firestoreId || String(postData.id)),
    { ...postData, updatedAt: serverTimestamp() },
    { merge: true },
  );
};
window.deleteFirestorePost = async function (post) {
  await deleteDoc(doc(db, "posts", post.firestoreId || String(post.id)));
};

window.getFirestoreCollections = async function () {
  const snapshot = await getDocs(collection(db, "collections"));
  return snapshot.docs
    .map((item) => ({ ...item.data(), firestoreId: item.id }))
    .sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "kn"));
};
window.saveFirestoreCollection = async function (item) {
  const { firestoreId, ...collectionData } = item;
  await setDoc(
    doc(db, "collections", firestoreId || String(collectionData.id)),
    { ...collectionData, updatedAt: serverTimestamp() },
    { merge: true },
  );
};
window.deleteFirestoreCollection = async function (item) {
  await deleteDoc(doc(db, "collections", item.firestoreId || String(item.id)));
};

window.getFirestoreLibraryBooks = async function () {
  const snapshot = await getDocs(collection(db, "libraryBooks"));
  return snapshot.docs
    .map((item) => ({ ...item.data(), firestoreId: item.id, id: item.data().id || item.id }))
    .sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "kn"));
};
window.getFirestoreLibraryBooksPage = async function (reset = false) {
  if (reset) libraryBookCursor = null;
  const constraints = [orderBy("title"), limit(LIBRARY_PAGE_SIZE)];
  if (libraryBookCursor) constraints.splice(1, 0, startAfter(libraryBookCursor));
  const snapshot = await getDocs(query(collection(db, "libraryBooks"), ...constraints));
  if (snapshot.docs.length) libraryBookCursor = snapshot.docs[snapshot.docs.length - 1];
  return {
    books: snapshot.docs.map((item) => ({ ...item.data(), firestoreId: item.id, id: item.data().id || item.id })),
    hasMore: snapshot.docs.length === LIBRARY_PAGE_SIZE,
  };
};
window.getFirestoreLibraryStats = async function () {
  const books = collection(db, "libraryBooks");
  const [total, available, borrowed] = await Promise.all([
    countFromServer(books),
    countFromServer(query(books, where("status", "==", "available"))),
    countFromServer(query(books, where("status", "==", "borrowed"))),
  ]);
  return { total: total.data().count, available: available.data().count, borrowed: borrowed.data().count };
};
window.getFirestoreLibraryBookById = async function (bookId) {
  const snapshot = await getDoc(doc(db, "libraryBooks", String(bookId)));
  return snapshot.exists()
    ? { ...snapshot.data(), firestoreId: snapshot.id, id: snapshot.data().id || snapshot.id }
    : null;
};
window.saveFirestoreLibraryBook = async function (book) {
  const { firestoreId, ...bookData } = book;
  await setDoc(
    doc(db, "libraryBooks", firestoreId || String(bookData.id)),
    { ...bookData, updatedAt: serverTimestamp() },
    { merge: true },
  );
};
window.deleteFirestoreLibraryBook = async function (book) {
  await deleteDoc(doc(db, "libraryBooks", book.firestoreId || String(book.id)));
};
function libraryRequestId(bookId, userId) {
  return `${String(bookId)}_${userId}`;
}
window.getMyFirestoreLibraryRequest = async function (bookId) {
  const user = await requireUser();
  const snapshot = await getDoc(doc(db, "libraryRequests", libraryRequestId(bookId, user.uid)));
  return snapshot.exists() ? { ...snapshot.data(), firestoreId: snapshot.id } : null;
};
window.saveFirestoreLibraryRequest = async function (book, request) {
  const user = await requireUser();
  const bookId = String(book.id);
  await setDoc(doc(db, "libraryRequests", libraryRequestId(bookId, user.uid)), {
    bookId,
    bookTitle: String(book.title || "").trim().slice(0, 160),
    userId: user.uid,
    name: String(request.name || "").trim().slice(0, 80),
    contact: String(request.contact || "").trim().slice(0, 120),
    message: String(request.message || "").trim().slice(0, 500),
    status: "requested",
    requestedAt: serverTimestamp(),
  });
};
window.getFirestoreLibraryRequests = async function () {
  const snapshot = await getDocs(collection(db, "libraryRequests"));
  return snapshot.docs.map((item) => ({ ...item.data(), firestoreId: item.id }));
};
window.setFirestoreLibraryRequestStatus = async function (requestId, bookId, status, bookStatus, details = {}) {
  const batch = writeBatch(db);
  batch.set(
    doc(db, "libraryRequests", String(requestId)),
    { status, ...details, updatedAt: serverTimestamp() },
    { merge: true },
  );
  if (bookStatus) {
    batch.set(
      doc(db, "libraryBooks", String(bookId)),
      { status: bookStatus, updatedAt: serverTimestamp() },
      { merge: true },
    );
  }
  await batch.commit();
};
window.deleteFirestoreLibraryRequest = async function (requestId) {
  await deleteDoc(doc(db, "libraryRequests", String(requestId)));
};

window.getFirestoreCategories = async function () {
  const categories = await getDoc(doc(db, "siteSettings", "categories"));
  return categories.exists() ? categories.data().items : null;
};
window.saveFirestoreCategories = async function (items) {
  await setDoc(doc(db, "siteSettings", "categories"), { items, updatedAt: serverTimestamp() });
};

window.getFirestoreComments = async function (postId) {
  const snapshot = await getDocs(query(collection(db, "comments"), where("postId", "==", postId)));
  return snapshot.docs
    .map((comment) => ({ id: comment.id, ...comment.data() }))
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
};
window.saveFirestoreComment = async function (postId, comment) {
  const user = await requireUser();
  await addDoc(collection(db, "comments"), {
    postId,
    name: comment.name.trim(),
    txt: comment.txt.trim(),
    date: comment.date,
    userId: user.uid,
    createdAt: serverTimestamp(),
  });
};
window.updateFirestoreComment = async function (commentId, comment) {
  await requireUser();
  await updateDoc(doc(db, "comments", String(commentId)), {
    name: comment.name.trim(),
    txt: comment.txt.trim(),
  });
};
window.deleteFirestoreComment = async function (commentId) {
  await requireUser();
  await deleteDoc(doc(db, "comments", String(commentId)));
};

window.getFirestoreLikes = async function (postId) {
  const [legacy, reactions] = await Promise.all([
    getDocs(query(collection(db, "likes"), where("postId", "==", postId))),
    getDocs(query(collection(db, "reactions"), where("postId", "==", postId))),
  ]);
  const legacyTotal = legacy.docs.reduce((total, like) => total + Number(like.data().count || 0), 0);
  return legacyTotal + reactions.size;
};
window.getMyFirestoreLike = async function (postId) {
  const user = await requireUser();
  return (await getDoc(doc(db, "reactions", `${postId}_${user.uid}`))).exists();
};
window.toggleFirestoreLike = async function (postId, liked) {
  const user = await requireUser();
  const reaction = doc(db, "reactions", `${postId}_${user.uid}`);
  if (liked) {
    await setDoc(reaction, { postId, userId: user.uid, createdAt: serverTimestamp() });
  } else {
    await deleteDoc(reaction);
  }
};

window.getFirestoreActiveQuiz = async function () {
  const active = await getDoc(doc(db, "siteSettings", "activeQuiz"));
  return active.exists() ? active.data().quiz || null : null;
};
window.getFirestoreAdminQuiz = async function () {
  await authReady;
  if (!owner) throw new Error("Owner authentication required.");
  const quiz = await window.getFirestoreActiveQuiz();
  if (!quiz) return null;
  const key = await getDoc(doc(db, "quizKeys", String(quiz.id)));
  if (!key.exists()) throw new Error("Private quiz key is missing. Do not publish this quiz.");
  return { ...quiz, questions: key.data().questions };
};
window.saveFirestoreActiveQuiz = async function (quiz) {
  await authReady;
  if (!owner) throw new Error("Owner authentication required.");
  const activeRef = doc(db, "siteSettings", "activeQuiz");
  if (!quiz) {
    await setDoc(activeRef, { quiz: null, updatedAt: serverTimestamp() });
    return;
  }
  const version = crypto.randomUUID();
  const publicQuiz = window.DKQuizSecurity.publicQuiz(quiz, version);
  if (quiz.state === 'live') {
    const service = await getDoc(doc(db, 'siteSettings', 'quizService'));
    if (!service.exists() || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(service.data().url || '')) throw new Error('Secure grading must be activated before this quiz can go live.');
  }
  const keyRef = doc(db, "quizKeys", String(quiz.id));
  await runTransaction(db, async transaction => {
    const current = await transaction.get(keyRef);
    // Keep questions fixed for a quiz ID once it has gone live, including after closure.
    const old = current.exists() ? current.data() : null;
    if (old?.locked && JSON.stringify(old.questions) !== JSON.stringify(quiz.questions)) {
      throw new Error("Questions cannot change after publication. Close/archive this quiz and create a repeat with a new ID.");
    }
    transaction.set(keyRef, { questions: quiz.questions, version, locked: !!old?.locked || quiz.state === 'live', updatedAt: serverTimestamp() });
    transaction.set(activeRef, { quiz: publicQuiz, updatedAt: serverTimestamp() });
  });
  quiz.version = version;
  quiz.securityVersion = 2;
};
function quizSubmissionId(quizId, userId) {
  return `${String(quizId)}_${userId}`;
}
window.hasFirestoreQuizSubmission = async function (quizId) {
  const user = await requireUser();
  return (await getDoc(doc(db, "quizSubmissions", quizSubmissionId(quizId, user.uid)))).exists();
};
window.getMyFirestoreQuizSubmission = async function (quizId) {
  const user = await requireUser();
  const saved = await getDoc(doc(db, "quizSubmissions", quizSubmissionId(quizId, user.uid)));
  return saved.exists() ? saved.data() : null;
};
window.saveFirestoreQuizSubmission = async function (quizId, answers, participantName, prizeEntry = null) {
  const user = await requireUser();
  const config = await getDoc(doc(db, "siteSettings", "quizService"));
  const url = config.exists() ? config.data().url : '';
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) throw new Error("Secure grading is not configured.");
  const requestId = crypto.randomUUID();
  // Apps Script's cross-origin response is opaque. Read the server-owned receipt instead.
  await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({
    idToken: await user.getIdToken(), requestId, quizId: String(quizId), answers,
    participantName: String(participantName || '').trim(), contact: prizeEntry?.contact || '',
  }) });
  const receiptRef = doc(db, "quizReceipts", `${requestId}_${user.uid}`);
  for (let attempt = 0; attempt < 45; attempt++) {
    const receipt = await getDoc(receiptRef);
    if (receipt.exists()) {
      if (receipt.data().status !== 'ok') throw new Error(receipt.data().code || 'Quiz submission rejected.');
      const result = await window.getMyFirestoreQuizSubmission(quizId);
      if (!result || result.gradingVersion !== 2 || !Number.isInteger(result.score)) throw new Error('Trusted result unavailable.');
      return result;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  // A lost receipt must never produce a locally fabricated score.
  const saved = await window.getMyFirestoreQuizSubmission(quizId);
  if (saved?.gradingVersion === 2) return saved;
  throw new Error('Secure grading timed out. Please retry.');
};
window.getFirestoreQuizSubmissions = async function (quizId) {
  const snapshot = await getDocs(
    query(collection(db, "quizSubmissions"), where("quizId", "==", String(quizId))),
  );
  return snapshot.docs.map((submission) => submission.data());
};
window.getFirestorePrizeQuizEntries = async function (quizId) {
  const snapshot = await getDocs(
    query(collection(db, "prizeQuizEntries"), where("quizId", "==", String(quizId))),
  );
  return snapshot.docs.map((entry) => entry.data());
};
window.getFirestoreQuizzes = async function () {
  const snapshot = await getDocs(collection(db, "quizzes"));
  return snapshot.docs.map((quiz) => quiz.data()).sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
};
window.saveFirestoreQuizArchive = async function (quiz) {
  await setDoc(doc(db, "quizzes", `archive-${quiz.id}`), { ...quiz, state: "archived", updatedAt: serverTimestamp() });
};
window.deleteFirestoreQuizArchive = async function (quizId) {
  await deleteDoc(doc(db, "quizzes", `archive-${quizId}`));
};
