CREATE TABLE IF NOT EXISTS raffles (
  id TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  image_url TEXT,
  prize_name TEXT NOT NULL,
  prize_image_url TEXT,
  status TEXT CHECK (status IN ('draft','open','closed','revealed','delivered')) NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  price_cents INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  total_tickets INTEGER DEFAULT 0,
  tickets_sold INTEGER DEFAULT 0,
  max_tickets_per_user INTEGER DEFAULT 0,
  is_featured INTEGER DEFAULT 0,
  weapon_name TEXT,
  skin_name TEXT,
  exterior_code TEXT,
  exterior_label_pt TEXT,
  float_value REAL,
  float_min REAL DEFAULT 0,
  float_max REAL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  phone_e164 TEXT,
  steam_friend_code TEXT,
  steam_id64 TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS raffle_tickets (
  id TEXT PRIMARY KEY,
  raffle_id TEXT NOT NULL,
  ticket_no INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  purchased_at TEXT DEFAULT (datetime('now')),
  payment_id TEXT,
  UNIQUE (raffle_id, ticket_no)
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  raffle_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT,
  provider_intent_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'BRL',
  quantity INTEGER NOT NULL,
  status TEXT CHECK (status IN ('created','pending','paid','failed','refunded')) NOT NULL,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  confirmed_at TEXT
);
CREATE TABLE IF NOT EXISTS fairness (
  raffle_id TEXT PRIMARY KEY,
  server_seed_hash TEXT NOT NULL,
  server_seed_revealed TEXT,
  client_seed TEXT,
  nonce INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raffle_id TEXT,
  action TEXT,
  meta TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
