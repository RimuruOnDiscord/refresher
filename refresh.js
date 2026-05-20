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

    // 1. Hide automation first
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = { runtime: {} };
    });

    // 2. Inject known working Laravel cookies
    await page.setCookie(
      {
        name: 'anime_nexus_session',
        value: 'eyJpdiI6InZtRzJnNmUyMWVuSy9nWTRyZUFtMUE9PSIsInZhbHVlIjoidmRyNFlKNXNhd0lMNmZaMEVXSllEYklISWpNK0hueUhoZXV1RTdzTFdjU3R6RmpXS1VxclZJNFJwYkFGRDVzQWN5aEZaM3VmWXp0bXhxNG1HZ0I4aFZRWlFwMWdpdEIxRk1LR1hZNFpsOW5qUG9obGZFMVJtRmU4Wjgxd2l6ODAiLCJtYWMiOiJhMzExYzdhZGQ0ODhmYmM2YTE5YjUzY2RmNDY2ZmM2ZGJlM2U1MTM4MGVmZWYyOTY1ZDdlZGUwNmNjY2FjODU3IiwidGFnIjoiIn0%3D',
        domain: '.anime.nexus',
        path: '/',
        httpOnly: true,
        secure: true,
      },
      {
        name: 'application_viewable',
        value: 'eyJpdiI6Im9iL3pYTmVtUDFvWGRPVVN1UGlHb1E9PSIsInZhbHVlIjoiNFBMeDNBWlA3TmJCblFBc0dXems3TU5vczVKNmM2MkluRm94NnNsa00raDVrZWxsMjJSQUtPOFdJQ1NOVVRsdm14SDhwVTBYdFh2enJ1Z0NiT2s2VnZMcjZNaTVXWFJRWk1IbjFaeW90NWZXMmRQS1ZnekFOc0g0Z1psdTBKUG1RODMraGNXam5zZi9FWVMxRFpFVk1VNkN1Q3Njc05UY21Yaysyc1NCdGhVPSIsIm1hYyI6IjRjMzdiNGFkNmE3Y2JkODdiNzIwYzliYTlkYjgyZWQxOGZkM2ExZmM3NmY2MjQwOTcwZGVmOTU2MmExN2I3NDciLCJ0YWciOiIifQ%3D%3D',
        domain: '.anime.nexus',
        path: '/',
        httpOnly: true,
        secure: true,
      }
    );

    // 3. Set up watchers BEFORE navigating
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

    await sessionDone;
    console.log('✅ Session handshake complete');

    await viewDone;
    console.log('✅ View ping complete');

    // Buffer to let cookies settle
    await new Promise(r => setTimeout(r, 2000));

    // 4. Grab cookies from both domains
    const cookies = await page.cookies('https://anime.nexus', 'https://api.anime.nexus');
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