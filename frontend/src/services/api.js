import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle token expiration
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authService = {
  login: (identifier, password) => api.post('/auth/login', { identifier, password }),
  signup: (name, email, password) => api.post('/auth/signup', { name, email, password }),
  logout: () => localStorage.removeItem('token'),
};

export const studentService = {
  getProfile: () => api.get('/students/profile'),
  updateProfile: (data) => api.put('/students/profile', data),
  getDashboard: () => api.get('/portal/dashboard'),
  getAcademics: () => api.get('/academics'),
  getFinance: () => api.get('/fees/summary'),
  getExams: () => api.get('/results'),
  getTranscript: () => api.get('/transcript'),
};

export const adminService = {
  getDashboard: () => api.get('/admin/dashboard'),
  getStudents: () => api.get('/admin/students'),
  getClasses: () => api.get('/admin/classes'),
  getCourses: () => api.get('/admin/courses'),
};

export default api;
