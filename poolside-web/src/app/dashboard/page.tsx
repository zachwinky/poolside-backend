"use client";

import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import { useUser } from "@/hooks/useUser";

export default function DashboardPage() {
  const { user, loading } = useUser();

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

  return (
    <DashboardLayout user={user}>
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

        {/* Welcome Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mb-2">
            Welcome{user.name ? `, ${user.name}` : ""}!
          </h2>
          <p className="text-gray-400">
            Manage your account and subscription from this dashboard.
          </p>
        </div>

        {/* Admin Quick Access - Only for admins */}
        {user.isAdmin && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-yellow-400">Admin Access</p>
                  <p className="text-sm text-gray-400">Manage users and subscriptions</p>
                </div>
              </div>
              <Link
                href="/dashboard/admin"
                className="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 px-4 py-2 rounded-lg font-medium transition flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
                Manage Users
              </Link>
            </div>
          </div>
        )}

        {/* Quick Stats Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-6">
          {/* Subscription Status */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-400">Current Plan</p>
                <p className="text-lg font-semibold capitalize">{user.subscription?.tier || "Free"}</p>
              </div>
            </div>
            {user.subscription?.tier === "free" && (
              <Link
                href="/pricing"
                className="text-cyan-400 hover:text-cyan-300 text-sm transition"
              >
                Upgrade for more features →
              </Link>
            )}
            {user.subscription?.tier !== "free" && (
              <Link
                href="/dashboard/subscription"
                className="text-cyan-400 hover:text-cyan-300 text-sm transition"
              >
                Manage subscription →
              </Link>
            )}
          </div>

          {/* Cloud Storage */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                user.hasOnedrive ? "bg-green-500/20" : "bg-gray-700"
              }`}>
                <svg className={`w-5 h-5 ${user.hasOnedrive ? "text-green-400" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-400">OneDrive</p>
                <p className="text-lg font-semibold">{user.hasOnedrive ? "Connected" : "Not Connected"}</p>
              </div>
            </div>
            {!user.hasOnedrive && (
              <p className="text-gray-500 text-sm">Connect via mobile app</p>
            )}
          </div>

          {/* Account */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-400">Account</p>
                <p className="text-lg font-semibold truncate">{user.email}</p>
              </div>
            </div>
            <Link
              href="/dashboard/settings"
              className="text-cyan-400 hover:text-cyan-300 text-sm transition"
            >
              Edit profile →
            </Link>
          </div>
        </div>

        {/* Get Started Section */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Get Started</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <h4 className="font-medium">Download the App</h4>
              </div>
              <p className="text-gray-400 text-sm mb-3">
                Get Poolside Code on your mobile device and start coding anywhere.
              </p>
              <span className="text-cyan-400 text-sm">Coming soon to App Store</span>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                  </svg>
                </div>
                <h4 className="font-medium">Connect OneDrive</h4>
              </div>
              <p className="text-gray-400 text-sm mb-3">
                Sync your projects seamlessly between your phone and computer.
              </p>
              <span className="text-gray-500 text-sm">Available in mobile app</span>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
