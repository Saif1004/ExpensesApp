// firebase/firebaseConfig.js

import * as SecureStore from "expo-secure-store";
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

// SecureStore-backed persistence adapter for Firebase Auth.
// On iOS this uses the Keychain; on Android it uses the Keystore-backed
// EncryptedSharedPreferences — both are hardware-backed on modern devices.
// This replaces AsyncStorage (plaintext on rooted Android).
//
// Firebase Auth passes keys like "firebase:authUser:apiKey:[DEFAULT]" which
// contain characters SecureStore rejects (only alphanumeric, ".", "-", "_"
// are allowed). We replace every disallowed character with "_" to produce a
// stable, valid key without losing uniqueness in practice.
const sanitizeKey = (key) => key.replace(/[^a-zA-Z0-9._-]/g, "_");

const SecureStoreAdapter = {
  getItem:    (key) => SecureStore.getItemAsync(sanitizeKey(key)),
  setItem:    (key, value) => SecureStore.setItemAsync(sanitizeKey(key), value),
  removeItem: (key) => SecureStore.deleteItemAsync(sanitizeKey(key)),
};

// Guard against duplicate app initialisation (Expo hot-reload / StrictMode)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Guard against duplicate Auth initialisation — initializeAuth throws if called twice
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(SecureStoreAdapter),
  });
} catch {
  // Already initialised on a previous hot-reload — reuse existing instance
  auth = getAuth(app);
}

// Firestore
export const db = getFirestore(app);


export { auth };
export default firebaseConfig;
