const API_BASE_URL = import.meta.env.VITE_API_URL;

export const api = {
  get: async (endpoint) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });
      if (!response.ok) throw new Error('API request failed');
      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },
  post: async (endpoint, data) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('API request failed');
      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },
  put: async (endpoint, data) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'PUT',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('API request failed');
      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },
  delete: async (endpoint) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'DELETE',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });
      if (!response.ok) throw new Error('API request failed');
      // For HTTP 204 No Content responses, which are common for DELETE operations
      if (response.status === 204) return null;
      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }
};