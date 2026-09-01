import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
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
    .map((post) => post.data())
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
};
window.saveFirestorePost = async function (post) {
  await setDoc(
    doc(db, "posts", String(post.id)),
    { ...post, updatedAt: serverTimestamp() },
    { merge: true },
  );
};
window.deleteFirestorePost = async function (postId) {
  await deleteDoc(doc(db, "posts", String(postId)));
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
    .map((comment) => comment.data())
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
window.saveFirestoreActiveQuiz = async function (quiz) {
  await setDoc(doc(db, "siteSettings", "activeQuiz"), { quiz: quiz || null, updatedAt: serverTimestamp() });
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
