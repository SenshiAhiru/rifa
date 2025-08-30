import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const secretsPath = path.join(__dirname, '..', '..', 'data', 'secrets.json');
function load() { try { return JSON.parse(fs.readFileSync(secretsPath,'utf8')); } catch { return {}; } }
function save(o) { fs.mkdirSync(path.dirname(secretsPath), { recursive: true }); fs.writeFileSync(secretsPath, JSON.stringify(o,null,2)); }
export async function setSecret(k,v){ const s=load(); s[k]=v; save(s); }
export async function getSecret(k){ const s=load(); return s[k]; }
