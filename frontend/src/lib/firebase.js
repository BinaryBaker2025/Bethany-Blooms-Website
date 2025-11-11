import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyARCqLWDWgWo5wX5fSrFKR4WCXgiyYexx8",
  authDomain: "bethanyblooms-771da.firebaseapp.com",
  projectId: "bethanyblooms-771da",
  storageBucket: "bethanyblooms-771da.firebasestorage.app",
  messagingSenderId: "619954160581",
  appId: "1:619954160581:web:cec6308d71f903c82081ac",
};

function assertConfig(config) {
  const missing = Object.entries(config)
    .filter(([, value]) => value === undefined || value === "")
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(
      `Missing Firebase environment variables: ${missing.join(", ")}. ` +
        "Copy .env.example to .env and supply your Firebase credentials.",
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
