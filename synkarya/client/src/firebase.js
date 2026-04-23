import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAEP2AwFwEsANjYHMUuhR75UNu8Bz_5uQk",
  authDomain: "synkarya.firebaseapp.com",
  projectId: "synkarya",
  appId: "1:1054898034003:web:bf5a09a92426220c963da6"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);