export interface ApiErrorResponse {
  errorCode?: string;
  message: string;
  errors?: Array<{ field: string; message: string }>;
  statusCode?: number;
}

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly data: ApiErrorResponse,
  ) {
    super(data.message || 'Error en la solicitud');
    this.name = 'ApiError';
  }
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private isRefreshing = false;
  private refreshSubscribers: Array<(token: string) => void> = [];

  constructor() {
    this.baseUrl = import.meta.env?.VITE_API_BASE_URL || '/api/v1';
    this.token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null;
  }

  public setToken(token: string | null) {
    this.token = token;
    if (typeof localStorage !== 'undefined') {
      if (token) {
        localStorage.setItem('access_token', token);
      } else {
        localStorage.removeItem('access_token');
      }
    }
  }

  public getToken(): string | null {
    if (this.token) return this.token;
    return typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null;
  }

  private onTokenRefreshed(newToken: string) {
    this.refreshSubscribers.forEach((cb) => cb(newToken));
    this.refreshSubscribers = [];
  }

  private addRefreshSubscriber(cb: (token: string) => void) {
    this.refreshSubscribers.push(cb);
  }

  private async tryRefreshToken(): Promise<string | null> {
    try {
      const res = await fetch(`${this.baseUrl}/auth/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        this.setToken(null);
        return null;
      }

      const data = await res.json();
      if (data.accessToken) {
        this.setToken(data.accessToken);
        return data.accessToken;
      }
      return null;
    } catch {
      this.setToken(null);
      return null;
    }
  }

  public async request<T = any>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const token = this.getToken();
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    // Manejo de expiración o token inválido (401)
    if (response.status === 401 && !endpoint.includes('/auth/session') && !endpoint.includes('/auth/login')) {
      if (!this.isRefreshing) {
        this.isRefreshing = true;
        const newToken = await this.tryRefreshToken();
        this.isRefreshing = false;

        if (newToken) {
          this.onTokenRefreshed(newToken);
          headers['Authorization'] = `Bearer ${newToken}`;
          const retryRes = await fetch(url, { ...options, headers, credentials: 'include' });
          if (!retryRes.ok) {
            const errData = await retryRes.json().catch(() => ({ message: 'Error de servidor' }));
            throw new ApiError(retryRes.status, errData);
          }
          return retryRes.json();
        } else {
          // Sesión cerrada
          window.location.href = '/login';
          throw new ApiError(401, { message: 'Sesión expirada' });
        }
      } else {
        // Encolar solicitud mientras refresca
        return new Promise<T>((resolve, reject) => {
          this.addRefreshSubscriber(async (newToken) => {
            headers['Authorization'] = `Bearer ${newToken}`;
            try {
              const retryRes = await fetch(url, { ...options, headers, credentials: 'include' });
              if (!retryRes.ok) {
                const errData = await retryRes.json().catch(() => ({ message: 'Error de servidor' }));
                reject(new ApiError(retryRes.status, errData));
              } else {
                if (retryRes.status === 204) {
                  resolve(null as T);
                  return;
                }
                const retryText = await retryRes.text();
                if (!retryText || !retryText.trim()) {
                  resolve(null as T);
                  return;
                }
                try {
                  resolve(JSON.parse(retryText));
                } catch {
                  resolve(retryText as unknown as T);
                }
              }
            } catch (e) {
              reject(e);
            }
          });
        });
      }
    }

    if (!response.ok) {
      const errData: ApiErrorResponse = await response.json().catch(() => ({
        message: response.statusText || 'Error en la petición',
      }));

      // Redirección especial si el usuario debe cambiar contraseña temporal
      if (errData.errorCode === 'PASSWORD_CHANGE_REQUIRED') {
        if (!window.location.pathname.includes('/change-password')) {
          window.location.href = '/change-password';
        }
      }

      throw new ApiError(response.status, errData);
    }

    // 204 No Content o cuerpo vacío
    if (response.status === 204) {
      return null as T;
    }

    const text = await response.text();
    if (!text || !text.trim()) {
      return null as T;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text as unknown as T;
    }
  }

  public get<T = any>(endpoint: string, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  public post<T = any>(endpoint: string, body?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public patch<T = any>(endpoint: string, body?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public put<T = any>(endpoint: string, body?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public delete<T = any>(endpoint: string, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
