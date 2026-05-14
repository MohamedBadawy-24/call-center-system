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
        
        // 2. Check Surveys
        console.log('Fetching surveys...');
        const surveysRes = await axios.get(`${baseURL}/surveys`, authHeader);
        console.log('Surveys found:', surveysRes.data.length);
        const latestSurvey = surveysRes.data.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        console.log('Latest survey ID:', latestSurvey?._id, 'Active:', latestSurvey?.isActive);

        // 3. Check Outbound Precall Config
        console.log('Fetching outbound precall config...');
        const precallRes = await axios.get(`${baseURL}/agent/outbound-precall?surveyId=${latestSurvey?._id}`, authHeader);
        console.log('Precall Config surveyId:', precallRes.data.surveyId);
        console.log('Has fields:', !!precallRes.data.outboundPrecall?.fields);

        // 4. Check Next Number
        console.log('Fetching next number...');
        const numberRes = await axios.get(`${baseURL}/agent/next-number?surveyId=${latestSurvey?._id}`, authHeader);
        console.log('Next Number:', numberRes.data?.number || 'NULL');

    } catch (err) {
        console.error('Flow Error:', err.response?.data || err.message);
    }
}

testAgentFlow();
