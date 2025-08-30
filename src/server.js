import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { registerPublic } from './routes/public.js';
import { registerAdmin } from './routes/admin.js';
import { registerPayments } from './routes/payments.js';

dotenv.config();
const app = express();
const allowed = (process.env.FRONTEND_BASE_URL || '').split(',').map(s=>s.trim()).filter(Boolean);
app.use(cors({ origin: (o, cb) => cb(null, allowed.length? allowed : true), credentials: true }));
app.use(morgan('dev'));
app.use(bodyParser.json({ limit: '1mb' }));

registerPublic(app);
registerAdmin(app);
registerPayments(app);

app.get('/api/health', (req,res)=>res.json({ ok: true }));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log('API listening on ' + port));
