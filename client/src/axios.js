import axios from 'axios';

const baseURL = import.meta.env.PROD 
  ? 'https://cicr-inventory-api.onrender.com/api'
  : 'http://localhost:5000/api';

axios.defaults.baseURL = baseURL;
axios.defaults.withCredentials = true;

export default axios;