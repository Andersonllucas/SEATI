import fs from 'node:fs';
import path from 'node:path';
import { AppUser } from '@/context/AuthContext';

const REGISTRY_DIR = path.join(process.cwd(), '.data');
const USERS_FILE = path.join(REGISTRY_DIR, 'users_registry.json');

function ensureDirExists() {
  if (!fs.existsSync(REGISTRY_DIR)) {
    try {
      fs.mkdirSync(REGISTRY_DIR, { recursive: true });
    } catch {}
  }
}

// Senhas padrão criptografadas com PBKDF2 (compatíveis também com verificação em texto simples)
// Senha padrão master: admin123 (ou 123456 ou admin)
export const DEFAULT_SYSTEM_USERS: AppUser[] = [
  {
    id: 'user_admin_campanha',
    nome: 'Administrador Geral',
    email: 'admin@campanha.com',
    senha: 'pbkdf2:sha256:100000:7a1b2c3d4e5f60718293a4b5c6d7e8f9:d627c265882b4dcabce04ce4999fe8d022fa59f3e09886a87754b5dfd468f3a2', // admin123
    perfil: 'Administrador',
    status: 'Ativo',
    cargo: 'Coordenador Geral',
    dataCadastro: new Date().toISOString()
  },
  {
    id: 'user_lucas_fernandes',
    nome: 'Lucas Fernandes (Master)',
    email: 'lucasfernandes819@gmail.com',
    senha: 'pbkdf2:sha256:100000:7a1b2c3d4e5f60718293a4b5c6d7e8f9:d627c265882b4dcabce04ce4999fe8d022fa59f3e09886a87754b5dfd468f3a2', // admin123
    perfil: 'Administrador',
    status: 'Ativo',
    cargo: 'Administrador Master',
    dataCadastro: new Date().toISOString()
  },
  {
    id: 'user_admin_seati',
    nome: 'Administrador SEATI',
    email: 'admin@seati.app.br',
    senha: 'pbkdf2:sha256:100000:7a1b2c3d4e5f60718293a4b5c6d7e8f9:d627c265882b4dcabce04ce4999fe8d022fa59f3e09886a87754b5dfd468f3a2', // admin123
    perfil: 'Administrador',
    status: 'Ativo',
    cargo: 'Suporte Técnico',
    dataCadastro: new Date().toISOString()
  },
  {
    id: 'user_operador_campanha',
    nome: 'Operador de Campanha',
    email: 'operador@campanha.com',
    senha: 'pbkdf2:sha256:100000:7a1b2c3d4e5f60718293a4b5c6d7e8f9:4a8bb3c290a61a0f9fa4356e82a6f2bb434d31eb495535359a5d117562692224', // 123456
    perfil: 'Operador',
    status: 'Ativo',
    cargo: 'Digitador de Campo',
    dataCadastro: new Date().toISOString()
  }
];

/**
 * Retorna todos os usuários persistidos em arquivo local
 */
export function getAllUsersFromFile(): AppUser[] {
  ensureDirExists();
  if (!fs.existsSync(USERS_FILE)) {
    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify(DEFAULT_SYSTEM_USERS, null, 2), 'utf8');
      return DEFAULT_SYSTEM_USERS;
    } catch {
      return DEFAULT_SYSTEM_USERS;
    }
  }

  try {
    const content = fs.readFileSync(USERS_FILE, 'utf8');
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Garante que os usuários padrão continuem acessíveis
      const emails = new Set(parsed.map((u: AppUser) => (u.email || '').toLowerCase().trim()));
      let updated = false;
      for (const def of DEFAULT_SYSTEM_USERS) {
        if (!emails.has(def.email.toLowerCase().trim())) {
          parsed.push(def);
          updated = true;
        }
      }
      if (updated) {
        try { fs.writeFileSync(USERS_FILE, JSON.stringify(parsed, null, 2), 'utf8'); } catch {}
      }
      return parsed;
    }
    return DEFAULT_SYSTEM_USERS;
  } catch {
    return DEFAULT_SYSTEM_USERS;
  }
}

/**
 * Busca um usuário por e-mail no registro local
 */
export function getUserByEmailFromFile(email: string): AppUser | null {
  const clean = email.trim().toLowerCase();
  const all = getAllUsersFromFile();
  return all.find((u) => (u.email || '').toLowerCase().trim() === clean) || null;
}

/**
 * Salva ou atualiza um usuário no arquivo local
 */
export function saveUserToFile(user: AppUser): void {
  ensureDirExists();
  const all = getAllUsersFromFile();
  const cleanEmail = (user.email || '').trim().toLowerCase();
  const index = all.findIndex((u) => (u.email || '').toLowerCase().trim() === cleanEmail || u.id === user.id);

  if (index >= 0) {
    all[index] = { ...all[index], ...user };
  } else {
    all.push({
      ...user,
      dataCadastro: user.dataCadastro || new Date().toISOString()
    });
  }

  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(all, null, 2), 'utf8');
  } catch (err) {
    console.warn('[userFileRegistry] Falha ao persistir usuário em arquivo:', err);
  }
}

/**
 * Exclui um usuário do arquivo local
 */
export function deleteUserFromFile(userIdOrEmail: string): boolean {
  ensureDirExists();
  const clean = userIdOrEmail.trim().toLowerCase();
  const all = getAllUsersFromFile();
  const filtered = all.filter((u) => u.id !== userIdOrEmail && (u.email || '').toLowerCase().trim() !== clean);

  if (filtered.length !== all.length) {
    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify(filtered, null, 2), 'utf8');
      return true;
    } catch {}
  }
  return false;
}
