"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { useUser } from "@/hooks/useUser";
import { api } from "@/lib/api";

export default function OneDrivePage() {
  const { user, loading, refreshUser } = useUser();
  const searchParams = useSearchParams();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Handle OAuth callback
  useEffect(() => {
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setError("Failed to connect OneDrive: " + (searchParams.get("error_description") || errorParam));
      // Clear URL params
      window.history.replaceState({}, "", "/dashboard/onedrive");
      return;
    }

    if (code) {
      handleOAuthCallback(code);
    }
  }, [searchParams]);

  const handleOAuthCallback = async (code: string) => {
    setConnecting(true);
    setError("");

    try {
      await api.connectOneDrive(code, window.location.origin + "/dashboard/onedrive");
      setSuccess("OneDrive connected successfully!");
      await refreshUser();
      // Clear URL params
      window.history.replaceState({}, "", "/dashboard/onedrive");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect OneDrive");
    } finally {
      setConnecting(false);
    }
  };

  const handleConnect = async () => {
    setError("");
    setConnecting(true);

    try {
      const authUrl = await api.getOneDriveAuthUrl(window.location.origin + "/dashboard/onedrive");
      window.location.href = authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start OneDrive connection");
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect OneDrive? Your files will no longer be accessible from Poolside Code.")) {
      return;
    }

    setDisconnecting(true);
    setError("");
    setSuccess("");

    try {
      await api.disconnectOneDrive();
      setSuccess("OneDrive disconnected successfully");
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect OneDrive");
    } finally {
      setDisconnecting(false);
    }
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

  return (
    <DashboardLayout user={user}>
      <div className="p-8 max-w-2xl">
        <h1 className="text-3xl font-bold mb-2">OneDrive Connection</h1>
        <p className="text-gray-400 mb-8">
          Connect your Microsoft OneDrive to sync projects between your devices
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm mb-6">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-500/10 border border-green-500/50 text-green-400 px-4 py-3 rounded-lg text-sm mb-6">
            {success}
          </div>
        )}

        {/* Connection Status Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-4 mb-6">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
              user.hasOnedrive ? "bg-green-500/20" : "bg-gray-700"
            }`}>
              <svg className={`w-7 h-7 ${user.hasOnedrive ? "text-green-400" : "text-gray-400"}`} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.5 2C8.91 2 6 4.91 6 8.5c0 .34.03.67.08 1H6c-2.21 0-4 1.79-4 4s1.79 4 4 4h13c2.21 0 4-1.79 4-4 0-2.03-1.53-3.71-3.5-3.96-.24-2.16-1.83-3.87-3.93-4.19A6.47 6.47 0 0 0 12.5 2z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold">
                {user.hasOnedrive ? "OneDrive Connected" : "OneDrive Not Connected"}
              </h2>
              <p className="text-gray-400">
                {user.hasOnedrive
                  ? "Your OneDrive is linked to Poolside Code"
                  : "Connect to sync your code projects"
                }
              </p>
            </div>
          </div>

          {user.hasOnedrive ? (
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-400 py-3 px-4 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {disconnecting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-red-400"></div>
                  Disconnecting...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                  </svg>
                  Disconnect OneDrive
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {connecting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                  Connecting...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.5 2C8.91 2 6 4.91 6 8.5c0 .34.03.67.08 1H6c-2.21 0-4 1.79-4 4s1.79 4 4 4h13c2.21 0 4-1.79 4-4 0-2.03-1.53-3.71-3.5-3.96-.24-2.16-1.83-3.87-3.93-4.19A6.47 6.47 0 0 0 12.5 2z"/>
                  </svg>
                  Connect with Microsoft
                </>
              )}
            </button>
          )}
        </div>

        {/* Info Section */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="font-semibold mb-4">How it works</h3>
          <div className="space-y-4 text-sm text-gray-400">
            <div className="flex gap-3">
              <div className="w-6 h-6 bg-cyan-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-cyan-400 text-xs font-medium">1</span>
              </div>
              <p>Connect your Microsoft account to grant Poolside Code access to your OneDrive files</p>
            </div>
            <div className="flex gap-3">
              <div className="w-6 h-6 bg-cyan-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-cyan-400 text-xs font-medium">2</span>
              </div>
              <p>Create or open projects in the Poolside Code mobile app - they&apos;re stored in your OneDrive</p>
            </div>
            <div className="flex gap-3">
              <div className="w-6 h-6 bg-cyan-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-cyan-400 text-xs font-medium">3</span>
              </div>
              <p>Access those same files from your computer using the OneDrive folder on your desktop</p>
            </div>
          </div>

          <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-sm text-blue-400">
              <strong>Tip:</strong> Install the OneDrive desktop app on your computer to automatically sync your Poolside Code projects for seamless editing in VS Code or your favorite editor.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
