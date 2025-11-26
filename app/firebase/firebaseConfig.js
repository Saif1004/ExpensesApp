// app/firebase/firebaseConfig.js

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBMlIPiP6tk52j1VrPQD7BVnybczhQAg6Y",
  authDomain: "expenseapp-3dafd.firebaseapp.com",
  projectId: "expenseapp-3dafd",
  storageBucket: "expenseapp-3dafd.firebasestorage.app",
  messagingSenderId: "349519496442",
  appId: "1:349519496442:web:f83819f84a47517995b543",
  measurementId: "G-2QKDWK0W3E",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// ⭐ THIS WAS MISSING
export const auth = getAuth(app);
