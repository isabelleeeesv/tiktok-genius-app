import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { buffer } from 'micro';

const stripe = new Stripe(process.env.VITE_STRIPE_SECRET_KEY);
const webhookSecret = process.env.VITE_STRIPE_WEBHOOK_SECRET;

// Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(process.env.VITE_FIREBASE_SERVICE_ACCOUNT_KEY);

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

    try {
        const appId = process.env.VITE_APP_ID || 'default-app-id';
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
