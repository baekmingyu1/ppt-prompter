import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const PORT = Number(process.env.PORT || 3001);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'audience-ui',
    port: PORT
  });
});

app.listen(PORT, () => {
  console.log(`[audience-ui] running on http://localhost:${PORT}`);
});
