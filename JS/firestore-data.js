import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

import {
    getFirestore,
    collection,
    getDocs,
    addDoc,
    updateDoc,
    query,
    where,
    orderBy
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
const db = getFirestore(app);

window.getFirestorePosts = async function(){
    
    const q = query(
        collection(db, "posts"),
        orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => doc.data());
};
window.getFirestoreComments = async function(postId){

    const q = query(
        collection(db, "comments"),
        where("postId", "==", postId)
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => doc.data());
};

window.saveFirestoreComment = async function(postId, comment){

    await addDoc(collection(db, "comments"), {
        postId: postId,
        name: comment.name,
        txt: comment.txt,
        date: comment.date
    });

};
window.getFirestoreLikes = async function(postId){

    const q = query(
        collection(db, "likes"),
        where("postId", "==", postId)
    );

    const snapshot = await getDocs(q);

    if(snapshot.empty){
        return 0;
    }

    return snapshot.docs[0].data().count || 0;
};

window.saveFirestoreLikes = async function(postId,count){

    const q = query(
        collection(db, "likes"),
        where("postId", "==", postId)
    );

    const snapshot = await getDocs(q);

    if(snapshot.empty){
        return;
    }

    await updateDoc(
        snapshot.docs[0].ref,
        {
            count: count
        }
    );
};