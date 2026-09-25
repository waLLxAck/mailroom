const encoder = new TextEncoder();
export const encode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
export const decode = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
export const random = () => encode(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(value: string) {
  return encode(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  );
}
async function key(secret: string) {
  if (!/^[0-9a-f]{64}$/i.test(secret || ""))
    throw new Error("Encryption is not configured.");
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(secret.match(/../g)!, (s) => parseInt(s, 16)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encrypt(value: unknown, secret: string, owner: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(owner) },
    await key(secret),
    encoder.encode(JSON.stringify(value)),
  );
  return `${encode(iv)}.${encode(new Uint8Array(data))}`;
}
export async function decrypt(value: string, secret: string, owner: string) {
  const [iv, data] = value.split(".");
  const raw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decode(iv), additionalData: encoder.encode(owner) },
    await key(secret),
    decode(data),
  );
  return JSON.parse(new TextDecoder().decode(raw));
}
