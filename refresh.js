import 'dotenv/config';
import puppeteer from 'puppeteer';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN,
});

export async function refreshCookies() {
  console.log(`🔄 Starting cookie refresh at ${new Date().toISOString()}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ]
  });

  try {
    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = { runtime: {} };
    });

    // Set up ALL watchers BEFORE navigating
    const sessionDone = page.waitForResponse(
      res => res.url().includes('/api/auth/session') && res.status() === 204,
      { timeout: 60000 }
    );

    const viewDone = page.waitForResponse(
      res => res.url().includes('/api/anime/details/view') && res.status() === 200,
      { timeout: 60000 }
    ).catch(() => console.log('⚠️ view ping did not fire, continuing anyway'));

    await page.goto(
      'https://anime.nexus/series/998f3ad3-1324-4456-a49d-0ca24f29aad3/sword-art-online',
      { waitUntil: 'networkidle2', timeout: 60000 }
    );

    // Wait for session first, then view
    await sessionDone;
    console.log('✅ Session handshake complete');

    await viewDone;
    console.log('✅ View ping complete');

    // Small buffer to let Laravel set its cookies
    await new Promise(r => setTimeout(r, 2000));

    const cookies = await page.cookies();
    console.log(`🍪 All cookies found: ${cookies.map(c => c.name).join(', ')}`);

    const relevant = cookies.filter(c =>
      ['anime_nexus_session', 'application_viewable', 'cf_clearance'].includes(c.name)
    );

    if (relevant.length === 0) throw new Error('No cookies extracted — CF challenge may have failed');

    await redis.set('anime_nexus_cookies', JSON.stringify(relevant), { ex: 72000 });
    console.log(`✅ Stored ${relevant.length} cookies: ${relevant.map(c => c.name).join(', ')}`);

    return relevant;

  } finally {
    await browser.close();
  }
}
