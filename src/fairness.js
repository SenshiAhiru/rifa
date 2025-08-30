import crypto from 'crypto';
export const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
export const hmac256 = (key, msg) => crypto.createHmac('sha256', key).update(msg, 'utf8').digest('hex');
export function rngFloat(serverSeed, clientSeed, nonce) {
  const digest = hmac256(serverSeed, `${clientSeed}:${nonce}`);
  const slice = digest.slice(0, 16);
  const int = parseInt(slice, 16);
  return int / 0xFFFFFFFFFFFF;
}
export function pickWinnerIndex(total, serverSeed, clientSeed, nonce) {
  if (total <= 0) throw new Error('no tickets');
  const x = rngFloat(serverSeed, clientSeed, nonce);
  return Math.floor(x * total);
}
