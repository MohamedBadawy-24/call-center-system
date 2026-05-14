const axios = require('axios');

async function testAgentFlow() {
    const baseURL = 'http://localhost:3000';
    const TEST_SID = '69e77380cff9bdce6007f336';
    try {
        // 1. Login
        console.log('Logging in...');
        const loginRes = await axios.post(`${baseURL}/auth/login`, {
            email: 'mohhamed2581@gmail.com',
            password: '123456'
        });
        const token = loginRes.data.token;
        const authHeader = { headers: { Authorization: `Bearer ${token}` } };
        
        // 2. Set Status to Active
        console.log('Setting status to active...');
        await axios.post(`${baseURL}/auth/status`, { status: 'active' }, authHeader);

        // 3. Check Outbound Precall Config (FORCED ID)
        console.log('Fetching outbound precall config for SID:', TEST_SID);
        const precallRes = await axios.get(`${baseURL}/agent/outbound-precall?surveyId=${TEST_SID}`, authHeader);
        console.log('Precall Config surveyId:', precallRes.data.surveyId);
        console.log('Has Phone Field:', !!precallRes.data.outboundPrecall?.fields.find(f => f.id === 'phone'));

        // 4. Check Next Number (FORCED ID)
        console.log('Fetching next number...');
        const numberRes = await axios.get(`${baseURL}/agent/next-number?surveyId=${TEST_SID}`, authHeader);
        console.log('Next Number:', numberRes.data?.number || 'NULL');

    } catch (err) {
        console.error('Flow Error:', err.response?.data || err.message);
    }
}

testAgentFlow();
