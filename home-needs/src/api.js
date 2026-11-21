
const API_URL = import.meta.env.DEV
  ? 'https://10.63.4.131:5000'
  : (import.meta.env.VITE_API_URL || 'https://home-needs-backend.onrender.com');

export default API_URL;
