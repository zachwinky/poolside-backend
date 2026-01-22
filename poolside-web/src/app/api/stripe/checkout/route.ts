import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const PRICES = {
  pro: process.env.STRIPE_PRICE_PRO!,
  unlimited: process.env.STRIPE_PRICE_UNLIMITED!,
};

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export async function POST(request: NextRequest) {
  try {
    const { tier, userId, email } = await request.json();

    if (!tier || !PRICES[tier as keyof typeof PRICES]) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    if (!userId || !email) {
      return NextResponse.json({ error: "Missing user info" }, { status: 400 });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price: PRICES[tier as keyof typeof PRICES],
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?canceled=true`,
      customer_email: email,
      metadata: {
        userId,
        tier,
      },
      subscription_data: {
        metadata: {
          userId,
          tier,
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
