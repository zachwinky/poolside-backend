"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);

  const handleSubscribe = async (tier: "pro" | "unlimited") => {
    setLoading(tier);
    try {
      // Check if user is logged in
      if (!api.isLoggedIn()) {
        // Redirect to register with tier intent
        window.location.href = `/register?plan=${tier}`;
        return;
      }

      // Get user info
      const user = await api.getMe();

      // Create checkout session
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          userId: user.id,
          email: user.email,
        }),
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Failed to create checkout session");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950/80 backdrop-blur-lg border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg"></div>
              <span className="text-xl font-bold">Poolside Code</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/login" className="text-gray-400 hover:text-white transition">
                Log in
              </Link>
              <Link
                href="/register"
                className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white px-4 py-2 rounded-lg font-medium transition"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="pt-32 pb-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">
              Choose Your Plan
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Start free and upgrade when you need more AI power.
              All plans include full device sync.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Free Plan */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
              <h3 className="text-xl font-semibold mb-2">Free</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold">$0</span>
                <span className="text-gray-400">/month</span>
              </div>
              <p className="text-gray-400 mb-6">
                Perfect for trying out mobile coding with AI assistance.
              </p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>10 AI requests per day</span>
                </li>
                <li className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Full OneDrive sync</span>
                </li>
                <li className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>All 100+ languages</span>
                </li>
                <li className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Phone to desktop sync</span>
                </li>
              </ul>
              <Link
                href="/register"
                className="block w-full border border-gray-700 hover:border-gray-600 py-3 rounded-lg font-medium transition text-center"
              >
                Get Started Free
              </Link>
            </div>

            {/* Pro Plan */}
            <div className="bg-gradient-to-b from-cyan-500/10 to-blue-500/10 border-2 border-cyan-500/50 rounded-2xl p-8 relative">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm px-4 py-1 rounded-full font-medium">
                Most Popular
              </div>
              <h3 className="text-xl font-semibold mb-2">Pro</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold">$6.99</span>
                <span className="text-gray-400">/month</span>
              </div>
              <p className="text-gray-400 mb-6">
                For developers who code on the go regularly.
              </p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span><strong>500 AI requests</strong> per day</span>
                </li>
                <li className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Priority AI responses</span>
                </li>
                <li className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Full OneDrive sync</span>
                </li>
                <li className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Email support</span>
                </li>
              </ul>
              <button
                onClick={() => handleSubscribe("pro")}
                disabled={loading === "pro"}
                className="block w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 py-3 rounded-lg font-medium transition text-center disabled:opacity-50"
              >
                {loading === "pro" ? "Loading..." : "Subscribe to Pro"}
              </button>
            </div>

            {/* Unlimited Plan */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
              <h3 className="text-xl font-semibold mb-2">Unlimited</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold">$14.99</span>
                <span className="text-gray-400">/month</span>
              </div>
              <p className="text-gray-400 mb-6">
                For power users who need unlimited AI assistance.
              </p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span><strong>Unlimited</strong> AI requests</span>
                </li>
                <li className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Fastest AI responses</span>
                </li>
                <li className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Priority support</span>
                </li>
                <li className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Early access to new features</span>
                </li>
              </ul>
              <button
                onClick={() => handleSubscribe("unlimited")}
                disabled={loading === "unlimited"}
                className="block w-full border border-gray-700 hover:border-gray-600 py-3 rounded-lg font-medium transition text-center disabled:opacity-50"
              >
                {loading === "unlimited" ? "Loading..." : "Subscribe to Unlimited"}
              </button>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="mt-20">
            <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
            <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h3 className="font-semibold mb-2">Can I switch plans later?</h3>
                <p className="text-gray-400 text-sm">
                  Yes! You can upgrade or downgrade at any time. Changes take effect at your next billing cycle.
                </p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h3 className="font-semibold mb-2">What counts as an AI request?</h3>
                <p className="text-gray-400 text-sm">
                  Each message you send to the AI assistant counts as one request. Reading files, syntax highlighting, and syncing are free.
                </p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h3 className="font-semibold mb-2">Do I need OneDrive?</h3>
                <p className="text-gray-400 text-sm">
                  OneDrive is required for the phone-to-desktop sync feature. You can use the app without it, but your files won&apos;t sync across devices.
                </p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h3 className="font-semibold mb-2">Is there a refund policy?</h3>
                <p className="text-gray-400 text-sm">
                  Yes, we offer a 7-day money-back guarantee. If you&apos;re not satisfied, contact us for a full refund.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-gray-800">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-br from-cyan-400 to-blue-500 rounded"></div>
            <span className="font-semibold">Poolside Code</span>
          </div>
          <p className="text-gray-500 text-sm">&copy; 2025 Poolside Code. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
