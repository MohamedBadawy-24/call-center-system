const axios = require('axios');

async function testAgentFlow() {
    const baseURL = 'http://localhost:3000';
    try {
        // 1. Login
        console.log('Logging in...');
        const loginRes = await axios.post(`${baseURL}/auth/login`, {
            email: 'mohhamed2581@gmail.com',
            password: '123456'
        });
        const token = loginRes.data.token;
        const authHeader = { headers: { Authorization: `Bearer ${token}` } };
        
        // 2. Set Status to Active (Crucial!)
        console.log('Setting status to active...');
        await axios.post(`${baseURL}/auth/status`, { status: 'active' }, authHeader);

        // 3. Check Surveys
        console.log('Fetching surveys...');
        const surveysRes = await axios.get(`${baseURL}/surveys`, authHeader);
        const latestSurvey = surveysRes.data.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        console.log('Survey:', latestSurvey?.title, 'ID:', latestSurvey?._id);

        // 4. Check Outbound Precall Config
        console.log('Fetching outbound precall config...');
        const precallRes = await axios.get(`${baseURL}/agent/outbound-precall?surveyId=${latestSurvey?._id}`, authHeader);
        console.log('Precall Config surveyId:', precallRes.data.surveyId);
        console.log('Has Phone Field:', !!precallRes.data.outboundPrecall?.fields.find(f => f.id === 'phone'));

        // 5. Check Next Number
        console.log('Fetching next number...');
        const numberRes = await axios.get(`${baseURL}/agent/next-number?surveyId=${latestSurvey?._id}`, authHeader);
        console.log('Next Number:', numberRes.data?.number || 'NULL');

    } catch (err) {
        console.error('Flow Error:', err.response?.data || err.message);
    }
}

testAgentFlow();
