(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
      (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.ApiClient = factory());
})(this, (function () {
  'use strict';

  class ApiClient {
    constructor(config = {}) {
      this.baseUrl = config.baseUrl || '/api';
      this.getToken = config.token || (() => null);
      this.defaultHeaders = config.headers || {};
      this.errorHandler = config.errorHandler || null;
      this.requestInterceptor = config.requestInterceptor || null;
      this.responseInterceptor = config.responseInterceptor || null;
    }

    // Build full URL
    buildUrl(path) {
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      return `${this.baseUrl}${cleanPath}`;
    }

    // Build headers with auth token
    buildHeaders(extraHeaders = {}) {
      const headers = {
        'Content-Type': 'application/json',
        ...this.defaultHeaders,
        ...extraHeaders
      };

      const token = this.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      return headers;
    }

    // Core request method
    async request(path, options = {}) {
      const url = this.buildUrl(path);
      const config = {
        credentials: 'include',
        ...options,
        headers: this.buildHeaders(options.headers)
      };

      // Run request interceptor
      if (this.requestInterceptor) {
        const intercepted = this.requestInterceptor(url, config);
        if (intercepted) {
          Object.assign(config, intercepted);
        }
      }

      try {
        const response = await fetch(url, config);
        
        // Run response interceptor
        if (this.responseInterceptor) {
          const intercepted = this.responseInterceptor(response);
          if (intercepted) {
            return intercepted;
          }
        }

        // Handle non-2xx responses
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          const error = new Error(
            errorData?.error || errorData?.message || `HTTP ${response.status}: ${response.statusText}`
          );
          error.status = response.status;
          error.data = errorData;
          
          // Call error handler
          if (error.status === 401 && typeof window !== 'undefined') {
            const hash = window.location.hash.replace('#', '') || '/';
            if (hash !== '/login') {
              window.location.replace('#/login');
            }
          }

          if (this.errorHandler) {
            this.errorHandler(error, response);
          } else if (typeof layout !== 'undefined' && layout.toast) {
            layout.toast(error.message, { type: 'error', title: 'API Error' });
          }
          
          throw error;
        }

        // Parse JSON response
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return await response.json();
        }

        return await response.text();
      } catch (error) {
        // Network errors
        if (error instanceof TypeError && error.message.includes('fetch')) {
          const networkError = new Error('Network error: Unable to connect to server');
          networkError.originalError = error;
          
          if (this.errorHandler) {
            this.errorHandler(networkError);
          } else if (typeof layout !== 'undefined' && layout.toast) {
            layout.toast(networkError.message, { type: 'error', title: 'Network Error' });
          }
          
          throw networkError;
        }
        
        throw error;
      }
    }

    // CRUD Helper Methods
    async create(resource, data) {
      return this.request(resource, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    }

    async read(resource) {
      return this.request(resource, {
        method: 'GET'
      });
    }

    async update(resource, data) {
      return this.request(resource, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    }

    async patch(resource, data) {
      return this.request(resource, {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    }

    async delete(resource) {
      return this.request(resource, {
        method: 'DELETE'
      });
    }

    // Raw HTTP methods
    async get(path) {
      return this.request(path, { method: 'GET' });
    }

    async post(path, data) {
      return this.request(path, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    }

    async put(path, data) {
      return this.request(path, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    }

    async patch(path, data) {
      return this.request(path, {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    }

    async deleteRaw(path) {
      return this.request(path, { method: 'DELETE' });
    }

    // Utility methods
    setToken(token) {
      if (typeof token === 'function') {
        this.getToken = token;
      } else {
        this.getToken = () => token;
      }
    }

    setErrorHandler(fn) {
      this.errorHandler = fn;
    }

    setRequestInterceptor(fn) {
      this.requestInterceptor = fn;
    }

    setResponseInterceptor(fn) {
      this.responseInterceptor = fn;
    }

    // Upload file
    async upload(path, formData, extraHeaders = {}) {
      const url = this.buildUrl(path);
      const headers = {
        ...this.defaultHeaders,
        ...extraHeaders
        // Don't set Content-Type for formData, let browser set it with boundary
      };

      const token = this.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      return this.request(path, {
        method: 'POST',
        body: formData,
        headers
      });
    }
  }

  return ApiClient;
}));
