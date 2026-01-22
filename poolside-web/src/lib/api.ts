const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://poolside-backend-nine.vercel.app';

export interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  subscription: Subscription | null;
  hasOnedrive: boolean;
  hasPassword: boolean;
  isAdmin: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  isAdmin: boolean;
  subscription: Subscription | null;
}

export interface Subscription {
  id: string;
  tier: 'free' | 'pro' | 'unlimited';
  status: 'active' | 'cancelled' | 'past_due';
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface AuthResponse {
  message: string;
  user: User;
  accessToken: string;
  refreshToken: string;
}

class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('accessToken');
      this.refreshToken = localStorage.getItem('refreshToken');
    }
  }

  setTokens(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    if (typeof window !== 'undefined') {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
    }
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    }
  }

  private async fetch(endpoint: string, options: RequestInit = {}) {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.accessToken) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    // Handle 401/403 - try to refresh token
    if ((response.status === 401 || response.status === 403) && this.refreshToken) {
      const refreshed = await this.refreshTokens();
      if (refreshed) {
        // Retry the request
        (headers as Record<string, string>)['Authorization'] = `Bearer ${this.accessToken}`;
        return fetch(`${API_BASE}${endpoint}`, { ...options, headers });
      }
    }

    return response;
  }

  private async refreshTokens(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        this.setTokens(data.accessToken, data.refreshToken);
        return true;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
    }
    this.clearTokens();
    return false;
  }

  async register(email: string, password: string, name?: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  async loginWithGoogle(credential: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Google login failed');
    }

    this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  async getMe(): Promise<User> {
    const response = await this.fetch('/auth/me');
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to get user');
    }
    return data;
  }

  async updateProfile(name: string | null): Promise<User> {
    const response = await this.fetch('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to update profile');
    }
    return data;
  }

  async changePassword(currentPassword: string | null, newPassword: string): Promise<void> {
    const response = await this.fetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to change password');
    }
  }

  async getStripePortalUrl(returnUrl?: string): Promise<string> {
    const response = await this.fetch('/stripe/portal', {
      method: 'POST',
      body: JSON.stringify({ returnUrl }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to get portal URL');
    }
    return data.url;
  }

  // Admin endpoints
  async getUsers(): Promise<AdminUser[]> {
    const response = await this.fetch('/admin/users');
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to get users');
    }
    return data.users;
  }

  async updateUserAdmin(userId: string, isAdmin: boolean): Promise<AdminUser> {
    const response = await this.fetch(`/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isAdmin }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to update user');
    }
    return data.user;
  }

  async updateUserSubscription(userId: string, tier: string): Promise<AdminUser> {
    const response = await this.fetch(`/admin/users/${userId}/subscription`, {
      method: 'PATCH',
      body: JSON.stringify({ tier }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to update subscription');
    }
    return data.user;
  }

  // OneDrive endpoints
  async getOneDriveAuthUrl(redirectUri: string): Promise<string> {
    const response = await this.fetch('/auth/onedrive/url', {
      method: 'POST',
      body: JSON.stringify({ redirectUri }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to get OneDrive auth URL');
    }
    return data.url;
  }

  async connectOneDrive(code: string, redirectUri: string): Promise<void> {
    const response = await this.fetch('/auth/onedrive/connect', {
      method: 'POST',
      body: JSON.stringify({ code, redirectUri }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to connect OneDrive');
    }
  }

  async disconnectOneDrive(): Promise<void> {
    const response = await this.fetch('/auth/onedrive/disconnect', {
      method: 'POST',
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to disconnect OneDrive');
    }
  }

  // Stripe checkout for new subscriptions
  async createCheckoutSession(priceId: string, returnUrl?: string): Promise<string> {
    const response = await this.fetch('/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({ priceId, returnUrl }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to create checkout session');
    }
    return data.url;
  }

  // Password reset
  async forgotPassword(email: string): Promise<void> {
    const response = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to send reset email');
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const response = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to reset password');
    }
  }

  logout() {
    this.clearTokens();
  }

  isLoggedIn(): boolean {
    return !!this.accessToken;
  }
}

export const api = new ApiClient();
