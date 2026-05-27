import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import Stripe from 'stripe';
import { SignJWT, importPKCS8 } from 'jose';

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const env = process.env as any;
  const stripeSecret = env.STRIPE_SECRET_KEY;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecret || !webhookSecret) {
    return new Response('Stripe configuration missing', { status: 500 });
  }

  const stripe = new Stripe(stripeSecret, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(), // Support for Cloudflare Workers
  });

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return new Response('No signature provided', { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, webhookSecret);
  } catch (err: any) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    
    // The client_reference_id contains the Firebase UID
    const uid = session.client_reference_id;
    if (!uid) {
      console.error('No client_reference_id found in session', session.id);
      return new Response('Missing client_reference_id', { status: 400 });
    }

    // Calculate credits: $0.50 (50 cents) = 1 credit
    const amountTotal = session.amount_total || 0;
    const creditsToAdd = Math.floor(amountTotal / 50);

    if (creditsToAdd > 0) {
      try {
        await addCreditsToFirebase(env, uid, creditsToAdd);
      } catch (err: any) {
        console.error('Failed to add credits to Firebase:', err);
        return new Response(`Firebase Error: ${err.message}`, { status: 500 });
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function addCreditsToFirebase(env: any, uid: string, creditsToAdd: number) {
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const privateKey = (env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;

  if (!projectId || !privateKey || !clientEmail) {
    throw new Error('Firebase Service Account credentials missing in .env');
  }

  // 1. Mint OAuth2 Access Token for Firestore using jose
  const key = await importPKCS8(privateKey, 'RS256');
  const jwt = await new SignJWT({
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/datastore'
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
    
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  
  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Failed to get access token: ${err}`);
  }
  
  const tokenData = (await tokenRes.json()) as any;
  const accessToken = tokenData.access_token;

  // 2. Fetch current user document
  const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`;
  const getDocRes = await fetch(docUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  let currentCredits = 0;
  let docData: any = { fields: {} };
  
  if (getDocRes.ok) {
    docData = await getDocRes.json();
    currentCredits = parseInt(docData.fields?.credits?.integerValue || '0', 10);
  }

  // 3. Patch the credits
  const patchRes = await fetch(`${docUrl}?updateMask.fieldPaths=credits`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        ...docData.fields,
        credits: { integerValue: (currentCredits + creditsToAdd).toString() }
      }
    })
  });

  if (!patchRes.ok) {
    const err = await patchRes.text();
    throw new Error(`Failed to patch credits: ${err}`);
  }
}
