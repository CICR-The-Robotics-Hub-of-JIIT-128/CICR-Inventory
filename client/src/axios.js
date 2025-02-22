import axios from 'axios';

const baseURL = 'https://cicr-inventory-api.onrender.com/api';

axios.defaults.baseURL = baseURL;
axios.defaults.withCredentials = true;

// Add interceptors for better error handling
axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 404) {
      console.error('API endpoint not found:', error.config.url);
    }
    return Promise.reject(error);
  }
);

export default axios;