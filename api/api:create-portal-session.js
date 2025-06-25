import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';

// Use new, unique environment variable names for server-side code
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_LIVE);

// Initialize Firebase Admin SDK
let serviceAccount;
try {
  if (!process.env.GC_SERVICE_ACCOUNT_KEY) {
    throw new Error('GC_SERVICE_ACCOUNT_KEY environment variable is not set.');
  }
  serviceAccount = JSON.parse(process.env.GC_SERVICE_ACCOUNT_KEY);
} catch (e) {
  console.error('Failed to parse Firebase service account key:', e.message);
  throw new Error('Firebase service account key is invalid or not found.');
}

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required.' });
    }

    const appId = process.env.APP_ID || 'default-app-id';
    const userDocRef = db.collection(`artifacts/${appId}/users`).doc(userId);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const userData = userDoc.data();
    const stripeCustomerId = userData.stripeCustomerId;

    if (!stripeCustomerId) {
      return res.status(400).json({ error: 'Stripe customer ID not found for this user. Please complete a subscription to manage it.' });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${req.headers.origin}`,
    });

    res.status(200).json({ url: portalSession.url });
  } catch (error) {
    console.error('Error creating portal session:', error.message);
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
}
