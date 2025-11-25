import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyDVSRCzKJtApzAS7o1Q8eIFC2Sfku2lq_0",
  authDomain: "bethanyblooms-89dcc.firebaseapp.com",
  projectId: "bethanyblooms-89dcc",
  storageBucket: "bethanyblooms-89dcc.firebasestorage.app",
  messagingSenderId: "274838965032",
  appId: "1:274838965032:web:ec3ddae38ad60f665ede1d",
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
