import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { buffer } from 'micro';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_LIVE);
const webhookSecret = process.env.STRIPE_WEBHOOK_SIGNING_SECRET;

// Decode the Base64 service account key
let serviceAccount;
try {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 environment variable is not set.');
  }
  const decodedKey = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8');
  serviceAccount = JSON.parse(decodedKey);
} catch (e) {
  console.error('Failed to decode or parse Firebase service account key:', e.message);
  throw new Error('Firebase service account key is invalid or not found.');
}

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}
const db = getFirestore();

// Vercel specific config to disable body parsing for this route
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    if (!webhookSecret) {
        throw new Error("Stripe webhook secret is not configured.");
    }
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.client_reference_id;
    const stripeCustomerId = session.customer;

    if (!userId) {
        console.error('Webhook Error: No client_reference_id (userId) in session.');
        return res.status(400).send('Webhook Error: Missing userId.');
    }
     if (!stripeCustomerId) {
        console.error('Webhook Error: No customer ID in session.');
        return res.status(400).send('Webhook Error: Missing customer ID.');
    }

    try {
        const appId = process.env.APP_ID || 'default-app-id';
        const userDocRef = db.collection(`artifacts/${appId}/users`).doc(userId);
        
        await userDocRef.update({
            stripeCustomerId: stripeCustomerId,
            'subscription.status': 'active',
            'subscription.plan': 'Genius',
            'subscription.subscribedAt': new Date(),
        });

        console.log(`Successfully updated user ${userId} with Stripe customer ID ${stripeCustomerId}`);
    } catch (dbError) {
        console.error(`Database update failed for user ${userId}:`, dbError);
        return res.status(500).send('Database error.');
    }
  }

  res.status(200).json({ received: true });
}
