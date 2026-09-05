import axios from 'axios';
import { auth } from '../config/firebase';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach JWT Token
api.interceptors.request.use(
  async (config) => {
    // Firebase ID tokens expire. Refresh before protected admin requests so a
    // normal save never sends an old token and unexpectedly returns to login.
    const token = auth.currentUser
      ? await auth.currentUser.getIdToken()
      : localStorage.getItem('bachat_token');
    if (token) {
      localStorage.setItem('bachat_token', token);
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle 401 Unauthorized
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = String(error.response?.data?.message || '').toLowerCase();
    const isDefinitiveTokenFailure = error.response?.status === 401 &&
      (message.includes('token has expired') || message.includes('invalid firebase id token'));

    // A member-management API error must not destroy a valid Firebase browser
    // session. Only clear local login state for a definitive token failure.
    if (isDefinitiveTokenFailure) {
      localStorage.removeItem('bachat_token');
      localStorage.removeItem('bachat_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
