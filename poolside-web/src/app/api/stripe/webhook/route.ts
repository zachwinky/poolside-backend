import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

// Backend API URL
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "https://poolside-backend-nine.vercel.app";

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  const body = await request.text();
  const signature = request.headers.get("stripe-signature")!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const { userId, tier } = session.metadata || {};

        if (userId && tier) {
          // Update user subscription in our backend
          await fetch(`${BACKEND_URL}/webhooks/stripe/subscription`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-webhook-secret": process.env.INTERNAL_WEBHOOK_SECRET || "",
            },
            body: JSON.stringify({
              userId,
              tier,
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: session.subscription as string,
              status: "active",
            }),
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const { userId, tier } = subscription.metadata || {};

        if (userId) {
          const status = subscription.status === "active" ? "active" :
                        subscription.status === "past_due" ? "past_due" : "cancelled";

          await fetch(`${BACKEND_URL}/webhooks/stripe/subscription`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-webhook-secret": process.env.INTERNAL_WEBHOOK_SECRET || "",
            },
            body: JSON.stringify({
              userId,
              tier,
              stripeSubscriptionId: subscription.id,
              status,
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            }),
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const { userId } = subscription.metadata || {};

        if (userId) {
          // Downgrade to free
          await fetch(`${BACKEND_URL}/webhooks/stripe/subscription`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-webhook-secret": process.env.INTERNAL_WEBHOOK_SECRET || "",
            },
            body: JSON.stringify({
              userId,
              tier: "free",
              status: "active",
              stripeSubscriptionId: null,
            }),
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subscriptionId = (invoice as { subscription?: string }).subscription;

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const { userId } = subscription.metadata || {};

          if (userId) {
            await fetch(`${BACKEND_URL}/webhooks/stripe/subscription`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-webhook-secret": process.env.INTERNAL_WEBHOOK_SECRET || "",
              },
              body: JSON.stringify({
                userId,
                status: "past_due",
              }),
            });
          }
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
