/**
 * Centralized API helper module.
 * All HTTP calls should go through this module to ensure consistent auth,
 * error handling, and base URL resolution via the axios interceptor.
 *
 * The axios interceptor is configured in main.tsx and handles:
 * - Auto-injection of Bearer token
 * - 401 response → automatic token refresh (or redirect to login)
 * - Session timeout detection
 * - Deactivated/locked account redirect
 */
import axios, { AxiosRequestConfig } from 'axios';

const api = {
  get: <TResponse = any>(url: string, params?: Record<string, any>, config?: AxiosRequestConfig) =>
    axios.get<TResponse>(url, { params, ...config }),

  post: <TResponse = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
    axios.post<TResponse>(url, data, config),

  put: <TResponse = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
    axios.put<TResponse>(url, data, config),

  patch: <TResponse = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
    axios.patch<TResponse>(url, data, config),

  delete: <TResponse = any>(url: string, config?: AxiosRequestConfig) =>
    axios.delete<TResponse>(url, config),

  /** Upload file(s) via FormData — Content-Type with boundary is set automatically by axios */
  upload: <TResponse = any>(url: string, formData: FormData, config?: AxiosRequestConfig) =>
    axios.post<TResponse>(url, formData, config),

  /** Upload file(s) via PUT with FormData */
  uploadPut: <TResponse = any>(url: string, formData: FormData, config?: AxiosRequestConfig) =>
    axios.put<TResponse>(url, formData, config),
};

export default api;
