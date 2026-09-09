const axios = require('axios');
const API_BASE = 'http://localhost:3000/api';

async function test() {
  try {
    const loginRes = await axios.post(`${API_BASE}/auth/login`, {
      email: 'agent.test@gmail.com',
      password: 'Test@123',
    });
    const token = loginRes.data.token;

    const client = axios.create({
      baseURL: API_BASE,
      headers: { Authorization: `Bearer ${token}` }
    });

    const precallRes = await client.get('/agent/outbound-precall');
    console.log('GET /agent/outbound-precall response:');
    console.log(JSON.stringify(precallRes.data, null, 2));
  } catch (err) {
    console.error(err.response?.data || err.message);
  }
}

test();
