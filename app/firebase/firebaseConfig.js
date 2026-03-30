// firebase/firebaseConfig.js

import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  getReactNativePersistence,
  initializeAuth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId:     process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Guard against duplicate app initialisation (Expo hot-reload / StrictMode)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Guard against duplicate Auth initialisation — initializeAuth throws if called twice
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
} catch {
  // Already initialised on a previous hot-reload — reuse existing instance
  auth = getAuth(app);
}

// Firestore
export const db = getFirestore(app);

export { auth };
export default firebaseConfig;
