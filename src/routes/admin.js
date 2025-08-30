import crypto from 'crypto';
import { getDb } from '../db.js';
import { sha256 } from '../fairness.js';
import { setSecret, getSecret } from '../secrets.js';

function requireAdmin(req, res, next) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '');
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  next();
}

export function registerAdmin(app) {
  // List raffles (admin)
  app.get('/api/admin/raffles', requireAdmin, async (req, res) => {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM raffles ORDER BY created_at DESC');
    res.json(rows);
  });

  app.post('/api/admin/raffles', requireAdmin, async (req, res) => {
    const { title, description, prize_name, image_url, prize_image_url, price_cents=0, currency='BRL',
      total_tickets=0, max_tickets_per_user=0, starts_at, ends_at, is_featured=0,
      weapon_name, skin_name, exterior_code, exterior_label_pt, float_value, float_min=0, float_max=1 } = req.body;
    const id = crypto.randomBytes(8).toString('hex');
    const db = await getDb();
    await db.run(`INSERT INTO raffles (id,title,description,prize_name,image_url,prize_image_url,price_cents,currency,total_tickets,max_tickets_per_user,starts_at,ends_at,status,is_featured,weapon_name,skin_name,exterior_code,exterior_label_pt,float_value,float_min,float_max)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'draft', ?,?,?,?,?,?,?)`,
      [id,title,description,prize_name,image_url,prize_image_url,price_cents,currency,total_tickets,max_tickets_per_user,starts_at,ends_at,is_featured?1:0,weapon_name,skin_name,exterior_code,exterior_label_pt,float_value,float_min,float_max]);
    res.json({ id });
  });

  app.post('/api/admin/raffles/:id/publish', requireAdmin, async (req, res) => {
    const db = await getDb();
    const raffle = await db.get('SELECT * FROM raffles WHERE id=?', [req.params.id]);
    if (!raffle) return res.status(404).end();
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const serverSeedHash = sha256(serverSeed);
    const clientSeed = `raffle:${raffle.id}:${Date.now()}`;
    await db.run('UPDATE raffles SET status="open" WHERE id=?', [raffle.id]);
    await db.run('INSERT OR REPLACE INTO fairness (raffle_id, server_seed_hash, client_seed, nonce) VALUES (?,?,?,0)', [raffle.id, serverSeedHash, clientSeed]);
    await setSecret(`seed:${raffle.id}`, serverSeed);
    res.json({ serverSeedHash, clientSeed });
  });

  app.post('/api/admin/raffles/:id/close', requireAdmin, async (req, res) => {
    const db = await getDb();
    const raffle = await db.get('SELECT * FROM raffles WHERE id=?', [req.params.id]);
    if (!raffle) return res.status(404).end();
    await db.run('UPDATE raffles SET status="closed" WHERE id=?', [raffle.id]);
    res.json({ ok: true });
  });

  app.post('/api/admin/raffles/:id/reveal', requireAdmin, async (req, res) => {
    const db = await getDb();
    const raffle = await db.get('SELECT * FROM raffles WHERE id=?', [req.params.id]);
    if (!raffle) return res.status(404).end();
    const f = await db.get('SELECT * FROM fairness WHERE raffle_id=?', [raffle.id]);
    const serverSeed = await getSecret(`seed:${raffle.id}`);
    if (!serverSeed) return res.status(500).json({ error: 'server seed missing' });
    const h = sha256(serverSeed);
    if (h !== f.server_seed_hash) return res.status(500).json({ error: 'hash mismatch' });
    const rows = await db.all('SELECT user_id, ticket_no FROM raffle_tickets WHERE raffle_id=? ORDER BY ticket_no ASC', [raffle.id]);
    const total = rows.length;
    if (!total) return res.status(400).json({ error: 'no tickets sold' });
    const nonce = (f.nonce || 0) + 1;
    const digest = crypto.createHmac('sha256', serverSeed).update(`${f.client_seed}:${nonce}`).digest('hex');
    const idx = Math.floor(parseInt(digest.slice(0,16), 16) / 0xFFFFFFFFFFFF * total);
    const winnerTicket = rows[idx];
    await db.run('UPDATE fairness SET server_seed_revealed=?, nonce=? WHERE raffle_id=?', [serverSeed, nonce, raffle.id]);
    await db.run('UPDATE raffles SET status="revealed" WHERE id=?', [raffle.id]);
    res.json({ winner: winnerTicket, proof: { server_seed_hash: f.server_seed_hash, server_seed: serverSeed, client_seed: f.client_seed, nonce, total, idx } });
  });

  app.post('/api/admin/raffles/:id/deliver', requireAdmin, async (req, res) => {
    const { evidence_url } = req.body || {};
    const db = await getDb();
    await db.run('UPDATE raffles SET status="delivered" WHERE id=?', [req.params.id]);
    await db.run('INSERT INTO audit_logs (raffle_id, action, meta) VALUES (?,?,?)', [req.params.id, 'delivered', JSON.stringify({ evidence_url })]);
    res.json({ ok: true });
  });
}
