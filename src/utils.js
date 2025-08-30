import crypto from 'crypto';
export const genId = () => crypto.randomBytes(8).toString('hex');
