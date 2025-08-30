import { getDb } from '../db.js';

export function registerPublic(app) {
  app.get('/api/raffles', async (req, res) => {
    const { status='open', page=1, page_size=20, featured } = req.query;
    const db = await getDb();
    const where = [];
    const params = [];
    if (status) { where.push('status = ?'); params.push(status); }
    if (featured) { where.push('is_featured = 1'); }
    const wsql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const offset = (parseInt(page)-1)*parseInt(page_size);
    const rows = await db.all(`SELECT id,title,description,prize_name,prize_image_url,price_cents,currency,tickets_sold,total_tickets,ends_at,weapon_name,skin_name,exterior_code,exterior_label_pt,float_value,float_min,float_max FROM raffles ${wsql} ORDER BY ends_at ASC LIMIT ? OFFSET ?`, [parseInt(page_size), offset]);
    res.json(rows);
  });

  app.get('/api/raffles/:id', async (req, res) => {
    const db = await getDb();
    const r = await db.get('SELECT * FROM raffles WHERE id=?', [req.params.id]);
    if (!r) return res.status(404).end();
    res.json(r);
  });

  app.get('/api/raffles/:id/proof', async (req, res) => {
    const db = await getDb();
    const f = await db.get('SELECT * FROM fairness WHERE raffle_id=?', [req.params.id]);
    if (!f) return res.status(404).json({ error: 'no fairness record' });
    const proof = { server_seed_hash: f.server_seed_hash, client_seed: f.client_seed, nonce: f.nonce };
    if (f.server_seed_revealed) proof.server_seed = f.server_seed_revealed;
    const total = await db.get('SELECT COUNT(*) c FROM raffle_tickets WHERE raffle_id=?', [req.params.id]);
    proof.total_tickets = total.c || 0;
    res.json(proof);
  });

  app.get('/api/raffles/:id/tickets/count', async (req, res) => {
    const db = await getDb();
    const total = await db.get('SELECT COUNT(*) c FROM raffle_tickets WHERE raffle_id=?', [req.params.id]);
    const r = await db.get('SELECT total_tickets FROM raffles WHERE id=?', [req.params.id]);
    res.json({ sold: total.c || 0, total: r?.total_tickets || 0 });
  });
}
