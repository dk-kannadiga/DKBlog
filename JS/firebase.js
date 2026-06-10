import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCHuyfBo7zAKlYc6Gq9uOPQavv_bwxh4x4",
  authDomain: "dkblog-6c5e5.firebaseapp.com",
  projectId: "dkblog-6c5e5",
  storageBucket: "dkblog-6c5e5.firebasestorage.app",
  messagingSenderId: "37742053196",
  appId: "1:37742053196:web:3ef84ac8457d7b6274b1e9",
  measurementId: "G-ELQWHJP20S"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);