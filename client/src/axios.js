import axios from 'axios';

const baseURL = import.meta.env.MODE === 'production' 
  ? 'https://cicr-inventory-api.onrender.com/api'
  : 'http://localhost:5000/api';

const instance = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

instance.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', {
      url: error.config?.url,
      status: error.response?.status,
      message: error.message
    });
    return Promise.reject(error);
  }
);

export default instance;