/**
 * BillingService — Stripe & Razorpay checkout and webhook verification.
 * Uses raw fetch() against provider REST APIs (no external SDKs).
 */
import { AdminConfig } from './admin-config';

interface StripeCheckoutResult {
    sessionId: string;
    url: string;
}

interface RazorpayOrderResult {
    orderId: string;
    keyId: string;
    amount: number;
    currency: string;
}

interface StripeWebhookEvent {
    id: string;
    type: string;
    data: {
        object: {
            id: string;
            metadata?: Record<string, string>;
            amount_total?: number;
            [key: string]: unknown;
        };
    };
}

interface RazorpayWebhookEvent {
    event: string;
    payload: {
        payment?: {
            entity: {
                id: string;
                amount: number;
                currency: string;
                notes?: Record<string, string>;
                status: string;
                [key: string]: unknown;
            };
        };
        order?: {
            entity: {
                id: string;
                notes?: Record<string, string>;
                [key: string]: unknown;
            };
        };
    };
}

async function hmacSha256(key: string, message: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const msgData = encoder.encode(message);

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    return Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
        return false;
    }
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
}

export class BillingService {
    /**
     * Create a Stripe Checkout Session.
     */
    static async createStripeCheckout(
        userId: string,
        creditAmount: number,
        priceUsd: number
    ): Promise<StripeCheckoutResult> {
        const config = AdminConfig.getStripeConfig();
        if (!config) {
            throw new Error('Stripe is not configured');
        }

        const params = new URLSearchParams();
        params.set('mode', 'payment');
        params.set('success_url', config.successUrl + '?session_id={CHECKOUT_SESSION_ID}');
        params.set('cancel_url', config.cancelUrl);
        params.set('line_items[0][price_data][currency]', 'usd');
        params.set('line_items[0][price_data][unit_amount]', String(Math.round(priceUsd * 100)));
        params.set('line_items[0][price_data][product_data][name]', `${creditAmount} CodeSmith Credits`);
        params.set(
            'line_items[0][price_data][product_data][description]',
            `Top up ${creditAmount} credits for CodeSmith AI agent builds`
        );
        params.set('line_items[0][quantity]', '1');
        params.set('metadata[user_id]', userId);
        params.set('metadata[credit_amount]', String(creditAmount));

        const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.secretKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Stripe checkout creation failed: ${response.status} ${errorBody}`);
        }

        const session = (await response.json()) as { id: string; url: string };
        return {
            sessionId: session.id,
            url: session.url,
        };
    }

    /**
     * Create a Razorpay Order.
     */
    static async createRazorpayOrder(
        userId: string,
        creditAmount: number,
        priceInr: number
    ): Promise<RazorpayOrderResult> {
        const config = AdminConfig.getRazorpayConfig();
        if (!config) {
            throw new Error('Razorpay is not configured');
        }

        const amountInPaise = Math.round(priceInr * 100);
        const authHeader = 'Basic ' + btoa(`${config.keyId}:${config.keySecret}`);

        const response = await fetch('https://api.razorpay.com/v1/orders', {
            method: 'POST',
            headers: {
                Authorization: authHeader,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                amount: amountInPaise,
                currency: 'INR',
                notes: {
                    user_id: userId,
                    credit_amount: String(creditAmount),
                },
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Razorpay order creation failed: ${response.status} ${errorBody}`);
        }

        const order = (await response.json()) as { id: string; amount: number; currency: string };
        return {
            orderId: order.id,
            keyId: config.keyId,
            amount: order.amount,
            currency: order.currency,
        };
    }

    /**
     * Verify a Stripe webhook signature and parse the event.
     */
    static async verifyStripeWebhook(
        payload: string,
        signatureHeader: string
    ): Promise<StripeWebhookEvent> {
        const config = AdminConfig.getStripeConfig();
        if (!config || !config.webhookSecret) {
            throw new Error('Stripe webhook secret is not configured');
        }

        // Parse the Stripe-Signature header
        const elements = signatureHeader.split(',');
        let timestamp = '';
        let v1Signature = '';

        for (const element of elements) {
            const [key, value] = element.split('=');
            if (key === 't') {
                timestamp = value;
            }
            if (key === 'v1') {
                v1Signature = value;
            }
        }

        if (!timestamp || !v1Signature) {
            throw new Error('Invalid Stripe signature header');
        }

        // Verify tolerance (5 minutes)
        const timestampSeconds = parseInt(timestamp, 10);
        const now = Math.floor(Date.now() / 1000);
        if (Math.abs(now - timestampSeconds) > 300) {
            throw new Error('Stripe webhook timestamp is too old');
        }

        // Compute expected signature
        const signedPayload = `${timestamp}.${payload}`;
        const expectedSignature = await hmacSha256(config.webhookSecret, signedPayload);

        if (!timingSafeEqual(expectedSignature, v1Signature)) {
            throw new Error('Stripe webhook signature verification failed');
        }

        return JSON.parse(payload) as StripeWebhookEvent;
    }

    /**
     * Verify a Razorpay webhook signature.
     */
    static async verifyRazorpayWebhook(
        payload: string,
        signatureHeader: string
    ): Promise<RazorpayWebhookEvent> {
        const config = AdminConfig.getRazorpayConfig();
        if (!config || !config.webhookSecret) {
            throw new Error('Razorpay webhook secret is not configured');
        }

        const expectedSignature = await hmacSha256(config.webhookSecret, payload);

        if (!timingSafeEqual(expectedSignature, signatureHeader)) {
            throw new Error('Razorpay webhook signature verification failed');
        }

        return JSON.parse(payload) as RazorpayWebhookEvent;
    }

    /**
     * Check which payment gateways are available.
     */
    static getAvailableGateways(): { stripe: boolean; razorpay: boolean } {
        return {
            stripe: AdminConfig.getStripeConfig() !== null,
            razorpay: AdminConfig.getRazorpayConfig() !== null,
        };
    }
}
