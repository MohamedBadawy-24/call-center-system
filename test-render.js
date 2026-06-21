const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Print all page errors
  page.on('pageerror', (err) => {
    console.log('PAGE ERROR:', err.message);
    console.log('STACK:', err.stack);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('CONSOLE ERROR:', msg.text());
    }
  });

  try {
    console.log('Navigating to login page...');
    await page.goto('http://localhost:3001/login');
    
    console.log('Filling login form...');
    await page.fill('input[type="email"]', 'mohhamed242@gmail.com');
    await page.fill('input[type="password"]', 'Baseera@123');
    
    console.log('Clicking sign in...');
    await page.click('button[type="submit"]');
    
    // Wait for redirect to dashboard
    await page.waitForURL('**/');
    console.log('Successfully logged in.');

    console.log('Navigating to take-survey page...');
    await page.goto('http://localhost:3001/take-survey/6a254d84819f294001ec8b4d');
    
    // Wait to capture rendering crashes
    await page.waitForTimeout(5000);

    // Get page content to see if error boundary content is visible
    const content = await page.textContent('body');
    if (content.includes('Survey Render Error')) {
      console.log('RENDER ERROR VISIBLE ON PAGE:');
      console.log(content);
    } else {
      console.log('No error boundary message visible in body.');
    }

  } catch (error) {
    console.error('Test script crashed:', error);
  } finally {
    await browser.close();
  }
})();
