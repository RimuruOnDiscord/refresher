import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import { refreshCookies } from './refresh.js';

process.on('uncaughtException', err => console.error('UNCAUGHT:', err));
process.on('unhandledRejection', err => console.error('UNHANDLED:', err));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'anime-cookie-refresh' });
});

app.post('/refresh', async (req, res) => {
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

cron.schedule('0 */20 * * *', async () => {
  console.log('⏰ Cron triggered cookie refresh');
  try {
    await refreshCookies();
  } catch (err) {
    console.error('❌ Cron refresh failed:', err.message);
  }
});

app.listen(PORT, async () => {
  console.log(`🚀 Cookie refresh service running on port ${PORT}`);
  try {
    await refreshCookies();
  } catch (err) {
    console.error('❌ Initial refresh failed:', err.message);
  }
});