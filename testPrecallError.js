const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  
  await page.goto('http://localhost:3000/login');
  await page.type('input[type="email"]', 'agent.test@gmail.com');
  await page.type('input[type="password"]', 'Test@123');
  await page.click('button[type="submit"]');
  
  await page.waitForNavigation();
  console.log("Logged in, at:", page.url());
  
  // Wait for status modal
  await page.waitForSelector('.status-option-label', { timeout: 5000 });
  const labels = await page.$$('.status-option-label');
  for (const label of labels) {
    const text = await page.evaluate(el => el.textContent, label);
    if (text === 'Active' || text === 'نشط') {
      await label.click();
      break;
    }
  }
  
  // Wait for redirection to precall
  await page.waitForSelector('.precall-container', { timeout: 10000 }).catch(() => console.log("Precall container not found"));
  console.log("At:", page.url());
  
  // Give it 3 seconds to fetch and render toasts
  await new Promise(r => setTimeout(r, 3000));
  
  const toasts = await page.$$eval('.Toastify__toast-body', els => els.map(e => e.textContent));
  console.log("Toasts found:", toasts);
  
  await browser.close();
})();
