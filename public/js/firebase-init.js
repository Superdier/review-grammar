// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
// TODO: Add other SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCeHAn1Fr505-rgCN6iHupnnZ7ch-xE00Y",
  authDomain: "review-b5a7a.firebaseapp.com",
  projectId: "review-b5a7a",
  storageBucket: "review-b5a7a.firebasestorage.app",
  messagingSenderId: "182497057816",
  appId: "1:182497057816:web:b3276ffc381d37773df76d",
  measurementId: "G-62JTYNS734"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);

export { db };