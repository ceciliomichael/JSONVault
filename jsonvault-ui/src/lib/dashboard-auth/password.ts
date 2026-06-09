import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";

const PASSWORD_SCHEME = "scrypt";
const PASSWORD_VERSION = "1";
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derivePassword(password, salt);

  return [
    PASSWORD_SCHEME,
    PASSWORD_VERSION,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    encodeBase64Url(salt),
    encodeBase64Url(hash),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const parsed = parsePasswordHash(encodedHash);
  if (!parsed) {
    return false;
  }

  const actualHash = await derivePassword(password, parsed.salt, {
    n: parsed.n,
    r: parsed.r,
    p: parsed.p,
  });

  if (actualHash.length !== parsed.hash.length) {
    return false;
  }

  return timingSafeEqual(actualHash, parsed.hash);
}

async function derivePassword(
  password: string,
  salt: Buffer,
  options: { n: number; r: number; p: number } = {
    n: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      KEY_LENGTH,
      {
        N: options.n,
        r: options.r,
        p: options.p,
        maxmem: 64 * 1024 * 1024,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

function parsePasswordHash(value: string): {
  salt: Buffer;
  hash: Buffer;
  n: number;
  r: number;
  p: number;
} | null {
  const [scheme, version, n, r, p, salt, hash, extra] = value.split("$");
  if (
    scheme !== PASSWORD_SCHEME ||
    version !== PASSWORD_VERSION ||
    !n ||
    !r ||
    !p ||
    !salt ||
    !hash ||
    extra !== undefined
  ) {
    return null;
  }

  const parsed = {
    n: Number.parseInt(n, 10),
    r: Number.parseInt(r, 10),
    p: Number.parseInt(p, 10),
  };
  if (
    !Number.isFinite(parsed.n) ||
    !Number.isFinite(parsed.r) ||
    !Number.isFinite(parsed.p)
  ) {
    return null;
  }

  return {
    ...parsed,
    salt: decodeBase64Url(salt),
    hash: decodeBase64Url(hash),
  };
}

function encodeBase64Url(value: Buffer): string {
  return value
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function decodeBase64Url(value: string): Buffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}
