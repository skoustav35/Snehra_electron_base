import puppeteer from 'puppeteer';

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.on('console', msg => console.log('BROWSER CONSOLE LOG:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER EXCEPTION:', error.message));
  page.on('requestfailed', request => console.log('BROWSER NETWORK ERROR:', request.url(), request.failure()?.errorText));

  console.log('Navigating to http://localhost:5173...');
  try {
    // Wait until dom content loaded
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('Page loaded successfully.');
    
    // Wait for 3 seconds to let React render and potentially throw
    await new Promise(r => setTimeout(r, 3000));
    
    // Also print out the DOM tree root to see if it's empty
    const rootHtml = await page.evaluate(() => document.getElementById('root')?.innerHTML || 'No root element found');
    console.log('Root HTML length:', rootHtml.length);
    if (rootHtml.length < 500) {
      console.log('Root HTML snippet:', rootHtml.substring(0, 500));
    }
  } catch (err) {
    console.log('Error navigating:', err.message);
  }

  await browser.close();
})();
