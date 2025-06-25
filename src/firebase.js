import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Safely read the configuration from environment variables
let firebaseConfig = {};
try {
    const configString = import.meta.env?.VITE_FIREBASE_CONFIG;
    if (configString) {
        firebaseConfig = JSON.parse(configString);
    } else {
        console.error("CRITICAL: VITE_FIREBASE_CONFIG environment variable not found.");
    }
} catch (e) {
    console.error("CRITICAL: Failed to parse VITE_FIREBASE_CONFIG.", e);
}

// Initialize Firebase App only once
let app;
if (!getApps().length) {
    app = initializeApp(firebaseConfig);
} else {
    app = getApps()[0];
}

// Export the initialized services
export const auth = getAuth(app);
export const db = getFirestore(app);
