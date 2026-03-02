// firebase/firebaseConfig.js

import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getReactNativePersistence,
  initializeAuth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBMlIPiP6tk52j1VrPQD7BVnybczhQAg6Y",
  authDomain: "expenseapp-3dafd.firebaseapp.com",
  projectId: "expenseapp-3dafd",
  storageBucket: "expenseapp-3dafd.firebasestorage.app",
  messagingSenderId: "349519496442",
  appId: "1:349519496442:web:f83819f84a47517995b543",
  measurementId: "G-2QKDWK0W3E",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ✅ Proper React Native Auth persistence
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});

// Firestore
export const db = getFirestore(app);

export default firebaseConfig;