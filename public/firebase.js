// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "YOUR_KEY",
  authDomain: "cement-dashboard.firebaseapp.com",
  projectId: "cement-dashboard",
  storageBucket: "cement-dashboard.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123",
  measurementId: "G-XXXX"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
