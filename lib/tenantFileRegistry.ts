import fs from 'node:fs';
import path from 'node:path';
import { TenantClient } from './tenantTypes';
import { CENTRAL_FIREBASE_CONFIG } from './centralFirebaseConfig';

const REGISTRY_DIR = path.join(process.cwd(), '.data');
const REGISTRY_FILE = path.join(REGISTRY_DIR, 'tenants_registry.json');

function ensureDirExists() {
  if (!fs.existsSync(REGISTRY_DIR)) {
    try {
      fs.mkdirSync(REGISTRY_DIR, { recursive: true });
    } catch {}
  }
}

/**
 * Lê todos os clientes do registro local em arquivo
 */
export function getAllTenantsFromFile(): TenantClient[] {
  ensureDirExists();
  if (!fs.existsSync(REGISTRY_FILE)) {
    // Cria com os clientes padrão conhecidos
    const initial: TenantClient[] = [
      {
        id: 'demo',
        subdominio: 'demo',
        nome: 'Campanha Teresina (Cliente Padrão)',
        status: 'ativo',
        firebaseConfig: CENTRAL_FIREBASE_CONFIG,
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString()
      },
      {
        id: 'marcelo',
        subdominio: 'marcelo',
        nome: 'Campanha Marcelo',
        status: 'ativo',
        firebaseConfig: CENTRAL_FIREBASE_CONFIG,
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString()
      }
    ];
    try {
      fs.writeFileSync(REGISTRY_FILE, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    } catch {
      return initial;
    }
  }

  try {
    const content = fs.readFileSync(REGISTRY_FILE, 'utf8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Busca um cliente pelo subdomínio ou ID no arquivo
 */
export function getTenantFromFile(subdomain: string): TenantClient | null {
  const clean = subdomain.trim().toLowerCase();
  const all = getAllTenantsFromFile();
  return all.find((c) => c.subdominio.toLowerCase() === clean || c.id.toLowerCase() === clean) || null;
}

/**
 * Salva ou atualiza um cliente no registro local em arquivo
 */
export function saveTenantToFile(client: TenantClient): void {
  ensureDirExists();
  const all = getAllTenantsFromFile();
  const cleanSub = client.subdominio.trim().toLowerCase();
  const index = all.findIndex((c) => c.subdominio.toLowerCase() === cleanSub || c.id === client.id);

  if (index >= 0) {
    all[index] = { ...all[index], ...client, atualizadoEm: new Date().toISOString() };
  } else {
    all.push({
      ...client,
      criadoEm: client.criadoEm || new Date().toISOString(),
      atualizadoEm: new Date().toISOString()
    });
  }

  try {
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(all, null, 2), 'utf8');
  } catch (err) {
    console.warn('[tenantFileRegistry] Falha ao persistir em arquivo:', err);
  }
}

/**
 * Exclui um cliente do arquivo
 */
export function deleteTenantFromFile(subdomainOrId: string): boolean {
  ensureDirExists();
  const clean = subdomainOrId.trim().toLowerCase();
  const all = getAllTenantsFromFile();
  const filtered = all.filter((c) => c.subdominio.toLowerCase() !== clean && c.id.toLowerCase() !== clean);

  try {
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(filtered, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}
