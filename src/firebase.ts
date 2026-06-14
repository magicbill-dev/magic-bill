import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBHhAIW8bt94JcdQrVTd8PLK5LOBQhoEnA",
  authDomain: "magicbill-db.firebaseapp.com",
  projectId: "magicbill-db",
  storageBucket: "magicbill-db.firebasestorage.app",
  messagingSenderId: "952351125596",
  appId: "1:952351125596:web:f9a63155f69cdbdfdcb699"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Ensure persistence is explicitly set for the Tauri environment
setPersistence(auth, browserLocalPersistence).catch(console.error);
export const firestore = getFirestore(app);
