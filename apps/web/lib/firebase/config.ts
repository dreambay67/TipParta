import type { FirebaseOptions } from "firebase/app";

const requiredFirebaseEnv = {
  apiKey: "NEXT_PUBLIC_FIREBASE_API_KEY",
  authDomain: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  projectId: "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  storageBucket: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  appId: "NEXT_PUBLIC_FIREBASE_APP_ID"
} as const;

const publicFirebaseFallbacks = {
  [requiredFirebaseEnv.apiKey]: "AIzaSyARSmvzevyUt6czb9quy_wYl3P8fAAuAOc",
  [requiredFirebaseEnv.authDomain]: "tipparta-ab58e.firebaseapp.com",
  [requiredFirebaseEnv.projectId]: "tipparta-ab58e",
  [requiredFirebaseEnv.storageBucket]: "tipparta-ab58e.firebasestorage.app",
  [requiredFirebaseEnv.messagingSenderId]: "121780976520",
  [requiredFirebaseEnv.appId]: "1:121780976520:web:11e0c0109f3e6b1411583d"
} as const;

function readFirebaseEnv(name: keyof typeof publicFirebaseFallbacks): string {
  return process.env[name] ?? publicFirebaseFallbacks[name];
}

export const firebaseConfig: FirebaseOptions = {
  apiKey: readFirebaseEnv(requiredFirebaseEnv.apiKey),
  authDomain: readFirebaseEnv(requiredFirebaseEnv.authDomain),
  projectId: readFirebaseEnv(requiredFirebaseEnv.projectId),
  storageBucket: readFirebaseEnv(requiredFirebaseEnv.storageBucket),
  messagingSenderId: readFirebaseEnv(requiredFirebaseEnv.messagingSenderId),
  appId: readFirebaseEnv(requiredFirebaseEnv.appId)
};
