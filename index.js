import express from 'express';
import cron from 'node-cron';
import { refreshCookies } from './refresh.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint — Railway needs this
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'anime-cookie-refresh' });
});

// Manual trigger endpoint — useful for emergency refresh from Vercel
app.post('/refresh', async (req, res) => {
  // Simple auth so random people can't spam it
  if (req.headers['x-refresh-secret'] !== process.env.REFRESH_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const cookies = await refreshCookies();
    res.json({ success: true, cookies: cookies.map(c => c.name) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Run every 20 hours
cron.schedule('0 */20 * * *', async () => {
  try {
    await refreshCookies();
  } catch (err) {
    console.error('❌ Cron refresh failed:', err.message);
  }
});

app.listen(PORT, async () => {
  console.log(`🚀 Cookie refresh service running on port ${PORT}`);
  // Run once immediately on startup
  try {
    await refreshCookies();
  } catch (err) {
    console.error('❌ Initial refresh failed:', err.message);
  }
});