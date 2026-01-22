"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, User } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      if (!api.isLoggedIn()) {
        router.push("/login");
        return;
      }

      try {
        const userData = await api.getMe();
        setUser(userData);
      } catch (error) {
        console.error("Failed to load user:", error);
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, [router]);

  const handleLogout = () => {
    api.logout();
    router.push("/");
  };

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

  const tierColors = {
    free: "bg-gray-500",
    pro: "bg-gradient-to-r from-cyan-500 to-blue-500",
    unlimited: "bg-gradient-to-r from-purple-500 to-pink-500",
  };

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg"></div>
              <span className="text-xl font-bold">Poolside Code</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-gray-400 text-sm">{user.email}</span>
              <button
                onClick={handleLogout}
                className="text-gray-400 hover:text-white transition text-sm"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

        {/* User Info Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold mb-1">
                {user.name || "Welcome!"}
              </h2>
              <p className="text-gray-400">{user.email}</p>
            </div>
            <span
              className={`${
                tierColors[user.subscription?.tier || "free"]
              } px-3 py-1 rounded-full text-sm font-medium capitalize`}
            >
              {user.subscription?.tier || "free"}
            </span>
          </div>
        </div>

        {/* Subscription Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Subscription</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Current Plan</span>
              <span className="capitalize">{user.subscription?.tier || "Free"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Status</span>
              <span className="capitalize text-green-400">
                {user.subscription?.status || "Active"}
              </span>
            </div>
            {user.subscription?.tier === "free" && (
              <div className="pt-4 border-t border-gray-800">
                <p className="text-gray-400 text-sm mb-4">
                  Upgrade to Pro for 500 AI requests/day and priority support.
                </p>
                <Link
                  href="/pricing"
                  className="inline-block bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white px-4 py-2 rounded-lg font-medium transition"
                >
                  Upgrade Plan
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* OneDrive Connection */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Cloud Storage</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              </div>
              <div>
                <p className="font-medium">Microsoft OneDrive</p>
                <p className="text-sm text-gray-400">
                  {user.hasOnedrive ? "Connected" : "Not connected"}
                </p>
              </div>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-sm ${
                user.hasOnedrive
                  ? "bg-green-500/20 text-green-400"
                  : "bg-gray-700 text-gray-400"
              }`}
            >
              {user.hasOnedrive ? "Connected" : "Disconnected"}
            </span>
          </div>
          {!user.hasOnedrive && (
            <p className="text-gray-500 text-sm mt-4">
              Connect OneDrive in the mobile app to sync your projects.
            </p>
          )}
        </div>

        {/* Quick Links */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Get Started</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-gray-800/50 rounded-lg p-4">
              <h4 className="font-medium mb-2">Download the App</h4>
              <p className="text-gray-400 text-sm mb-3">
                Get Poolside Code on your mobile device.
              </p>
              <span className="text-cyan-400 text-sm">Coming soon to App Store</span>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <h4 className="font-medium mb-2">Connect OneDrive</h4>
              <p className="text-gray-400 text-sm mb-3">
                Sync your projects across all devices.
              </p>
              <span className="text-gray-500 text-sm">Available in mobile app</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
