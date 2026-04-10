import type { ApiResponse } from '@ai-writer/shared';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

class ApiClient {
  private apiKey: string;

  constructor() {
    // Use sessionStorage (cleared on tab close) instead of localStorage
    this.apiKey = sessionStorage.getItem('api_key') || '';
  }

  setApiKey(key: string) {
    this.apiKey = key;
    sessionStorage.setItem('api_key', key);
  }

  /** Returns masked key for display only */
  getMaskedKey(): string {
    if (!this.apiKey) return '';
    if (this.apiKey.length <= 8) return '****';
    return '****' + this.apiKey.slice(-4);
  }

  clearApiKey() {
    this.apiKey = '';
    sessionStorage.removeItem('api_key');
  }

  isAuthenticated(): boolean {
    return this.apiKey.length > 0;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${API_BASE}${endpoint}`;

    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    });

    let data: ApiResponse<T>;
    try {
      data = await res.json() as ApiResponse<T>;
    } catch {
      throw new ApiError(
        `Server returned non-JSON response (${res.status})`,
        res.status
      );
    }

    if (!res.ok) {
      throw new ApiError(data.error || `Request failed: ${res.status}`, res.status);
    }

    return data;
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint);
  }

  async post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = new ApiClient();
