import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

function assertConfig(config) {
  const missing = Object.entries(config)
    .filter(([, value]) => value === undefined || value === "")
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(
      `Missing Firebase environment variables: ${missing.join(", ")}. ` +
        "Copy .env.example to .env.local and supply your Firebase credentials.",
    );
  }
}

let app;

export function getFirebaseApp() {
  if (app) return app;
  assertConfig(firebaseConfig);
  app = initializeApp(firebaseConfig);
  return app;
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

export function getFirebaseDb() {
  return getFirestore(getFirebaseApp());
}

export function getFirebaseStorage() {
  return getStorage(getFirebaseApp());
}

export function getFirebaseFunctions() {
  return getFunctions(getFirebaseApp(), "us-central1");
}
