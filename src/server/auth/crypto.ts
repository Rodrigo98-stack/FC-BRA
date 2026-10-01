import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scryptAsync(password: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number }) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keylen, { ...opts, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [scheme, n, r, p, saltB64, keyB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scryptAsync(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Política mínima de senha. Retorna a mensagem de erro ou null. */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "A senha precisa ter pelo menos 10 caracteres.";
  if (password.length > 200) return "Senha longa demais.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use letras e números na senha.";
  return null;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** CPF: guarda só hash (com pepper) + 2 últimos dígitos para exibição mascarada. */
export function protectCpf(
  cpf: string | null | undefined,
  pepper: string,
): { cpfHash: string | null; cpfLastDigits: string | null } {
  const digits = (cpf ?? "").replace(/\D/g, "");
  if (digits.length !== 11) return { cpfHash: null, cpfLastDigits: null };
  return { cpfHash: sha256(`${pepper}:${digits}`), cpfLastDigits: digits.slice(-2) };
}
