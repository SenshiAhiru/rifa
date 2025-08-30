import { getDb } from '../db.js';
import { genId } from '../utils.js';

export function registerPayments(app) {
  app.post('/api/payments/create', async (req, res) => {
    const { raffle_id, user, quantity=1 } = req.body || {};
    if (!raffle_id || !user?.id) return res.status(400).json({ error: 'missing data' });
    const db = await getDb();
    const r = await db.get('SELECT * FROM raffles WHERE id=?', [raffle_id]);
    if (!r || r.status !== 'open') return res.status(400).json({ error: 'raffle not open' });

    const u = await db.get('SELECT * FROM users WHERE id=?', [user.id]);
    if (!u) {
      await db.run('INSERT INTO users (id,email,name,phone_e164,steam_friend_code,steam_id64) VALUES (?,?,?,?,?,?)', [user.id,user.email||null,user.name||null,user.phone_e164||null,user.steam_friend_code||null,user.steam_id64||null]);
    } else {
      await db.run('UPDATE users SET email=?, name=?, phone_e164=?, steam_friend_code=?, steam_id64=? WHERE id=?', [user.email||u.email,user.name||u.name,user.phone_e164||u.phone_e164,user.steam_friend_code||u.steam_friend_code,user.steam_id64||u.steam_id64,user.id]);
    }

    const qty = Math.max(1, parseInt(quantity));
    const amount_cents = (r.price_cents || 0) * qty;
    const payId = genId();
    await db.run('INSERT INTO payments (id, raffle_id, user_id, provider, amount_cents, currency, quantity, status) VALUES (?,?,?,?,?,?,?,?)', [payId, raffle_id, user.id, 'mercadopago', amount_cents, r.currency || 'BRL', qty, 'created']);

    const mp = await import('mercadopago');
    const MercadoPagoConfig = mp.MercadoPagoConfig;
    const Payment = mp.Payment;
    const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN });
    const payments = new Payment(client);

    const desc = `Rifa ${r.title || r.prize_name} (${r.id}) - ${qty} ticket(s)`;
    const value = Number((amount_cents / 100).toFixed(2));
    const payer = { email: user.email || `user-${user.id}@example.com`, first_name: user.name || 'Participante' };
    const mpResp = await payments.create({
      body: {
        transaction_amount: value,
        description: desc,
        payment_method_id: 'pix',
        payer,
        notification_url: `${process.env.PUBLIC_BASE_URL}/api/payments/webhook`,
        external_reference: payId
      }
    });

    const mpId = mpResp.id?.toString();
    await db.run('UPDATE payments SET provider_intent_id=?, status=? WHERE id=?', [mpId, 'pending', payId]);
    const tx = mpResp.point_of_interaction?.transaction_data || {};
    res.json({
      payment_id: payId,
      provider: 'mercadopago',
      method: 'pix',
      qr_code_base64: tx.qr_code_base64 || null,
      copy_paste: tx.qr_code || null,
      status_url: `${process.env.PUBLIC_BASE_URL}/api/payments/${payId}/status`
    });
  });

  app.post('/api/payments/webhook', async (req, res) => {
    try {
      const event = req.body || {};
      if (event.type !== 'payment') return res.status(200).json({ ok: true });

      const mp = await import('mercadopago');
      const MercadoPagoConfig = mp.MercadoPagoConfig;
      const Payment = mp.Payment;
      const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN });
      const payments = new Payment(client);

      const mpId = event?.data?.id || event?.data?.['id'];
      if (!mpId) return res.status(200).json({ ok: true });

      const detail = await payments.get({ id: mpId.toString() });
      const externalRef = detail.external_reference;
      const status = detail.status;

      const db = await getDb();
      const payment = await db.get('SELECT * FROM payments WHERE id=?', [externalRef]);
      if (!payment) return res.status(200).json({ ok: true });

      if (status === 'approved') {
        await allocateTickets(db, payment);
      }
      return res.json({ ok: true });
    } catch (e) {
      console.error('WEBHOOK ERROR', e);
      return res.status(200).json({ ok: true });
    }
  });

  app.get('/api/payments/:id/status', async (req, res) => {
    const db = await getDb();
    const p = await db.get('SELECT status FROM payments WHERE id=?', [req.params.id]);
    if (!p) return res.status(404).end();
    res.json({ status: p.status });
  });
}

async function allocateTickets(db, payment) {
  const already = await db.get('SELECT status FROM payments WHERE id=?', [payment.id]);
  if (already.status === 'paid') return;
  await db.run('BEGIN');
  try {
    const r = await db.get('SELECT * FROM raffles WHERE id=?', [payment.raffle_id]);
    const soldByUser = await db.get('SELECT COUNT(*) c FROM raffle_tickets WHERE raffle_id=? AND user_id=?', [r.id, payment.user_id]);
    if (r.status !== 'open') throw new Error('raffle closed');
    if (r.total_tickets && (r.tickets_sold + payment.quantity) > r.total_tickets) throw new Error('sold out');
    if (r.max_tickets_per_user && (soldByUser.c + payment.quantity) > r.max_tickets_per_user) throw new Error('user limit');

    const startNo = (r.tickets_sold || 0) + 1;
    for (let i = 0; i < payment.quantity; i++) {
      const ticketNo = startNo + i;
      await db.run('INSERT INTO raffle_tickets (id, raffle_id, ticket_no, user_id, payment_id) VALUES (?,?,?,?,?)', [Math.random().toString(16).slice(2,10), r.id, ticketNo, payment.user_id, payment.id]);
    }
    await db.run('UPDATE raffles SET tickets_sold = tickets_sold + ? WHERE id=?', [payment.quantity, r.id]);
    await db.run('UPDATE payments SET status="paid", confirmed_at=datetime("now") WHERE id=?', [payment.id]);
    await db.run('COMMIT');
  } catch (e) {
    await db.run('ROLLBACK');
    throw e;
  }
}
