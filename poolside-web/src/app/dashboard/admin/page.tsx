"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { useUser } from "@/hooks/useUser";
import { api, AdminUser } from "@/lib/api";

export default function AdminPage() {
  const router = useRouter();
  const { user, loading } = useUser();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user && !user.isAdmin) {
      router.push("/dashboard");
    }
  }, [loading, user, router]);

  useEffect(() => {
    const loadUsers = async () => {
      if (!user?.isAdmin) return;

      try {
        const userData = await api.getUsers();
        setUsers(userData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load users");
      } finally {
        setLoadingUsers(false);
      }
    };

    if (user?.isAdmin) {
      loadUsers();
    }
  }, [user]);

  const handleToggleAdmin = async (targetUser: AdminUser) => {
    if (targetUser.id === user?.id) {
      setError("You cannot remove your own admin access");
      return;
    }

    setActionLoading(targetUser.id);
    setError("");

    try {
      const updatedUser = await api.updateUserAdmin(targetUser.id, !targetUser.isAdmin);
      setUsers(users.map((u) => (u.id === targetUser.id ? updatedUser : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateTier = async (targetUser: AdminUser, tier: string) => {
    setActionLoading(targetUser.id);
    setError("");

    try {
      const updatedUser = await api.updateUserSubscription(targetUser.id, tier);
      setUsers(users.map((u) => (u.id === targetUser.id ? updatedUser : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update subscription");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (!user.isAdmin) {
    return null;
  }

  const tierColors: Record<string, string> = {
    free: "bg-gray-600",
    pro: "bg-cyan-600",
    unlimited: "bg-purple-600",
  };

  return (
    <DashboardLayout user={user}>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Admin Panel</h1>
            <p className="text-gray-400 mt-1">Manage users and subscriptions</p>
          </div>
          <div className="bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-lg text-sm font-medium">
            {users.length} total users
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm mb-6">
            {error}
          </div>
        )}

        {/* Users Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-800/50">
                <tr>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-400">User</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-400">Subscription</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-400">Joined</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-400">Admin</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {loadingUsers ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-cyan-500"></div>
                        Loading users...
                      </div>
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                      No users found
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-800/30 transition">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium">{u.name || "—"}</p>
                          <p className="text-sm text-gray-400">{u.email}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={u.subscription?.tier || "free"}
                          onChange={(e) => handleUpdateTier(u, e.target.value)}
                          disabled={actionLoading === u.id}
                          className={`${
                            tierColors[u.subscription?.tier || "free"]
                          } px-3 py-1 rounded-lg text-sm font-medium bg-opacity-100 border-0 cursor-pointer disabled:opacity-50`}
                        >
                          <option value="free">Free</option>
                          <option value="pro">Pro</option>
                          <option value="unlimited">Unlimited</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 text-gray-400 text-sm">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        {u.isAdmin ? (
                          <span className="bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded text-xs font-medium">
                            Admin
                          </span>
                        ) : (
                          <span className="text-gray-500 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggleAdmin(u)}
                          disabled={actionLoading === u.id || u.id === user.id}
                          className={`text-sm px-3 py-1 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${
                            u.isAdmin
                              ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                              : "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30"
                          }`}
                        >
                          {actionLoading === u.id ? (
                            "..."
                          ) : u.isAdmin ? (
                            "Remove Admin"
                          ) : (
                            "Make Admin"
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-4 mt-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-sm">Total Users</p>
            <p className="text-2xl font-bold">{users.length}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-sm">Free Users</p>
            <p className="text-2xl font-bold">
              {users.filter((u) => !u.subscription?.tier || u.subscription.tier === "free").length}
            </p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-sm">Pro Users</p>
            <p className="text-2xl font-bold text-cyan-400">
              {users.filter((u) => u.subscription?.tier === "pro").length}
            </p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-sm">Unlimited Users</p>
            <p className="text-2xl font-bold text-purple-400">
              {users.filter((u) => u.subscription?.tier === "unlimited").length}
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
