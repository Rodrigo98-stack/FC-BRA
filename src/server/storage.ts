/**
 * Armazenamento de arquivos enviados pelo painel (imagens de produtos,
 * banners, logos). No Netlify: Netlify Blobs (store "fc-bra-media").
 * Localmente: .data/media. Servidos por /api/media/[chave].
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomToken } from "./auth/crypto";
import { AppError } from "./errors";

const MAX_BYTES = 6 * 1024 * 1024;
export const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

type MediaStore = {
  put: (key: string, data: ArrayBuffer, contentType: string) => Promise<void>;
  get: (key: string) => Promise<{ data: ArrayBuffer; contentType: string } | null>;
};

let storePromise: Promise<MediaStore> | null = null;

async function createStore(): Promise<MediaStore> {
  if (process.env.NODE_ENV === "production" || process.env.NETLIFY_BLOBS_CONTEXT) {
    try {
      const { getStore } = await import("@netlify/blobs");
      const store = getStore({ name: "fc-bra-media", consistency: "strong" });
      await store.getMetadata("__probe__"); // valida o acesso (fora do Netlify, lança erro)
      return {
        put: async (key, data, contentType) => {
          await store.set(key, data, { metadata: { contentType } });
        },
        get: async (key) => {
          const res = await store.getWithMetadata(key, { type: "arrayBuffer" });
          if (!res) return null;
          return { data: res.data, contentType: String(res.metadata?.contentType ?? "application/octet-stream") };
        },
      };
    } catch (err) {
      console.warn("[media] Netlify Blobs indisponível:", (err as Error).message);
    }
  }
  const { tmpdir } = await import("node:os");
  let dir = path.join(process.cwd(), ".data", "media");
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    dir = path.join(tmpdir(), "fc-bra-media");
  }
  return {
    put: async (key, data, contentType) => {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, key), Buffer.from(data));
      await fs.writeFile(path.join(dir, `${key}.type`), contentType);
    },
    get: async (key) => {
      try {
        const [data, type] = await Promise.all([fs.readFile(path.join(dir, key)), fs.readFile(path.join(dir, `${key}.type`), "utf8")]);
        return { data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer, contentType: type };
      } catch {
        return null;
      }
    },
  };
}

function getStore() {
  storePromise ??= createStore();
  return storePromise;
}

function sniffType(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "image/avif";
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return "image/x-icon";
  return null;
}

/** Valida (tipo real pelos bytes + tamanho) e grava. Devolve a URL pública. */
export async function saveUpload(file: File): Promise<string> {
  if (!file || file.size === 0) throw new AppError("Arquivo vazio.");
  if (file.size > MAX_BYTES) throw new AppError("Imagem maior que 6 MB.");
  const data = await file.arrayBuffer();
  const type = sniffType(new Uint8Array(data.slice(0, 16)));
  if (!type || !ALLOWED_TYPES[type]) throw new AppError("Formato não suportado. Use JPG, PNG, WebP, AVIF, GIF ou ICO.");
  const key = `${Date.now().toString(36)}-${randomToken(9)}.${ALLOWED_TYPES[type]}`;
  await (await getStore()).put(key, data, type);
  return `/api/media/${key}`;
}

export async function readUpload(key: string) {
  if (!/^[a-z0-9]+-[A-Za-z0-9_-]+\.(jpg|png|webp|avif|gif|ico)$/.test(key)) return null;
  return (await getStore()).get(key);
}
