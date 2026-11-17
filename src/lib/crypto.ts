/**
 * Private messages over a channel everyone can read (charades: only the performer may see the title).
 * Each player makes an ECDH key pair and sends the public half when joining; the host encrypts for it
 * (ECDH P-256 → AES-GCM). WebCrypto needs https or localhost; without it a player simply can't be the performer.
 */
import type { SecretMessage } from "./game/types";

const subtle = () => (typeof globalThis.crypto === "undefined" ? undefined : globalThis.crypto.subtle);
const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;

export const canEncrypt = () => !!subtle();

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) : b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function makeKeyPair(): Promise<{ publicJwk: string; privateKey: CryptoKey } | null> {
  const s = subtle();
  if (!s) return null;
  try {
    const pair = await s.generateKey(ECDH, false, ["deriveKey"]);
    return { publicJwk: JSON.stringify(await s.exportKey("jwk", pair.publicKey)), privateKey: pair.privateKey };
  } catch {
    return null;
  }
}

const aesKey = (priv: CryptoKey, pub: CryptoKey, use: "encrypt" | "decrypt") =>
  subtle()!.deriveKey({ name: "ECDH", public: pub }, priv, { name: "AES-GCM", length: 256 }, false, [use]);
const importPub = (jwk: string) => subtle()!.importKey("jwk", JSON.parse(jwk), ECDH, false, []);

/** Host side: encrypt `text` so only the owner of `playerPublicJwk` can read it. */
export async function encryptFor(playerPublicJwk: string, text: string): Promise<Omit<SecretMessage, "to" | "turn">> {
  const s = subtle()!;
  const eph = await s.generateKey(ECDH, false, ["deriveKey"]);
  const key = await aesKey(eph.privateKey, await importPub(playerPublicJwk), "encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await s.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  return { epk: JSON.stringify(await s.exportKey("jwk", eph.publicKey)), iv: b64(iv), ct: b64(ct) };
}

/** Player side. Throws when the message isn't for this key. */
export async function decryptWith(privateKey: CryptoKey, m: Pick<SecretMessage, "epk" | "iv" | "ct">): Promise<string> {
  const key = await aesKey(privateKey, await importPub(m.epk), "decrypt");
  const plain = await subtle()!.decrypt({ name: "AES-GCM", iv: unb64(m.iv) }, key, unb64(m.ct));
  return new TextDecoder().decode(plain);
}
