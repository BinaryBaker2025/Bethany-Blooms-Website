import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

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
let functionsInstance = null;
let functionsEmulatorConnected = false;

function parseBooleanEnv(value) {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return false;
}

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
  if (functionsInstance) return functionsInstance;
  functionsInstance = getFunctions(getFirebaseApp(), "us-central1");

  const useLocalFunctions = parseBooleanEnv(import.meta.env.VITE_USE_LOCAL_FUNCTIONS);
  if (useLocalFunctions && !functionsEmulatorConnected) {
    const host = (import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST || "127.0.0.1")
      .toString()
      .trim();
    const parsedPort = Number.parseInt(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || "5001", 10);
    const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 5001;
    try {
      connectFunctionsEmulator(functionsInstance, host || "127.0.0.1", port);
      functionsEmulatorConnected = true;
    } catch {
      // Ignore duplicate emulator connection attempts.
    }
  }

  return functionsInstance;
}
