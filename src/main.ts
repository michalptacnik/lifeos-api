import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'lifeos-api' });
});

app.get('/dashboard', (_req, res) => {
  res.json({
    message: 'Dashboard aggregate endpoint placeholder',
    modules: ['tasks', 'budgets', 'inventory', 'obligations']
  });
});

app.post('/auth/signup', (_req, res) => res.status(501).json({ message: 'Not implemented' }));
app.post('/auth/login', (_req, res) => res.status(501).json({ message: 'Not implemented' }));
app.get('/tasks', (_req, res) => res.status(501).json({ message: 'Not implemented' }));
app.post('/tasks', (_req, res) => res.status(501).json({ message: 'Not implemented' }));
app.get('/budgets', (_req, res) => res.status(501).json({ message: 'Not implemented' }));
app.post('/budgets', (_req, res) => res.status(501).json({ message: 'Not implemented' }));
app.get('/inventory', (_req, res) => res.status(501).json({ message: 'Not implemented' }));
app.post('/inventory', (_req, res) => res.status(501).json({ message: 'Not implemented' }));
app.get('/obligations', (_req, res) => res.status(501).json({ message: 'Not implemented' }));
app.post('/obligations', (_req, res) => res.status(501).json({ message: 'Not implemented' }));

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`LifeOS API listening on :${port}`);
});
