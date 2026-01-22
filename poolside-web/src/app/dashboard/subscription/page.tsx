"use client";

import { useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import { useUser } from "@/hooks/useUser";
import { api } from "@/lib/api";

const plans = [
  {
    tier: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    features: [
      "5 AI requests per day",
      "Basic code editing",
      "OneDrive sync",
    ],
  },
  {
    tier: "pro",
    name: "Pro",
    price: "$6.99",
    period: "per month",
    features: [
      "500 AI requests per day",
      "Priority support",
      "All Free features",
    ],
  },
  {
    tier: "unlimited",
    name: "Unlimited",
    price: "$14.99",
    period: "per month",
    features: [
      "Unlimited AI requests",
      "Priority support",
      "Early access to new features",
      "All Pro features",
    ],
  },
];

export default function SubscriptionPage() {
  const { user, loading, refreshUser } = useUser();
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [error, setError] = useState("");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const currentPlan = plans.find((p) => p.tier === user.subscription?.tier) || plans[0];
  const hasPaidSubscription = user.subscription?.tier !== "free" && user.subscription?.stripeCustomerId;

  const handleManageSubscription = async () => {
    setError("");
    setLoadingPortal(true);

    try {
      const portalUrl = await api.getStripePortalUrl();
      window.location.href = portalUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open billing portal");
      setLoadingPortal(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <DashboardLayout user={user}>
      <div className="p-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-8">Subscription</h1>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm mb-6">
            {error}
          </div>
        )}

        {/* Current Plan Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold mb-1">Current Plan</h2>
              <p className="text-gray-400 text-sm">Your active subscription</p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                user.subscription?.status === "active"
                  ? "bg-green-500/20 text-green-400"
                  : user.subscription?.status === "past_due"
                  ? "bg-yellow-500/20 text-yellow-400"
                  : "bg-gray-700 text-gray-400"
              }`}
            >
              {user.subscription?.status === "active"
                ? "Active"
                : user.subscription?.status === "past_due"
                ? "Past Due"
                : user.subscription?.status === "cancelled"
                ? "Cancelled"
                : "Active"}
            </span>
          </div>

          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-4xl font-bold">{currentPlan.price}</span>
            <span className="text-gray-400">/{currentPlan.period}</span>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${
                currentPlan.tier === "free"
                  ? "bg-gray-700"
                  : currentPlan.tier === "pro"
                  ? "bg-gradient-to-r from-cyan-500 to-blue-500"
                  : "bg-gradient-to-r from-purple-500 to-pink-500"
              }`}
            >
              {currentPlan.name}
            </span>
          </div>

          <ul className="space-y-2 mb-6">
            {currentPlan.features.map((feature, i) => (
              <li key={i} className="flex items-center gap-2 text-gray-300">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {feature}
              </li>
            ))}
          </ul>

          {/* Subscription Details */}
          {hasPaidSubscription && (
            <div className="border-t border-gray-800 pt-4 mb-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                {user.subscription?.currentPeriodEnd && (
                  <div>
                    <p className="text-gray-400">
                      {user.subscription.cancelAtPeriodEnd ? "Access Until" : "Next Billing Date"}
                    </p>
                    <p className="font-medium">{formatDate(user.subscription.currentPeriodEnd)}</p>
                  </div>
                )}
                {user.subscription?.cancelAtPeriodEnd && (
                  <div>
                    <p className="text-yellow-400 text-sm">
                      Your subscription will be cancelled at the end of the billing period.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            {hasPaidSubscription ? (
              <button
                onClick={handleManageSubscription}
                disabled={loadingPortal}
                className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingPortal ? "Loading..." : "Manage Subscription"}
              </button>
            ) : (
              <Link
                href="/pricing"
                className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white px-6 py-2 rounded-lg font-medium transition"
              >
                Upgrade Plan
              </Link>
            )}
          </div>
        </div>

        {/* Plan Comparison */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Compare Plans</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const isCurrentPlan = plan.tier === currentPlan.tier;
              return (
                <div
                  key={plan.tier}
                  className={`rounded-xl p-4 border ${
                    isCurrentPlan
                      ? "border-cyan-500 bg-cyan-500/10"
                      : "border-gray-700 bg-gray-800/50"
                  }`}
                >
                  <h3 className="font-semibold mb-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-2xl font-bold">{plan.price}</span>
                    <span className="text-gray-400 text-sm">/{plan.period}</span>
                  </div>
                  <ul className="space-y-2 text-sm">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-gray-300">
                        <svg className="w-4 h-4 text-green-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {isCurrentPlan && (
                    <div className="mt-4 text-center">
                      <span className="text-cyan-400 text-sm font-medium">Current Plan</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-6 text-center">
          <p className="text-gray-400 text-sm">
            Have questions about billing?{" "}
            <a href="mailto:support@akoolai.com" className="text-cyan-400 hover:text-cyan-300 transition">
              Contact support
            </a>
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
