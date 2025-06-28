import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';

// Initialize Firebase Admin SDK only if it hasn't been already
if (!getApps().length) {
  try {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!serviceAccountKey) {
      throw new Error('Firebase service account key is not available.');
    }
    const decodedKey = Buffer.from(serviceAccountKey, 'base64').toString('utf-8');
    const serviceAccount = JSON.parse(decodedKey);

    initializeApp({
      credential: cert(serviceAccount),
    });
  } catch (e) {
    console.error('CRITICAL: Firebase Admin SDK initialization failed.', e);
  }
}

const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_LIVE);
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
