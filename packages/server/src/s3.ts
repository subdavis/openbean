import type { Bindings } from "./types.ts";

type S3Env = Pick<
  Bindings,
  "S3_ENDPOINT" | "S3_BUCKET" | "S3_REGION" | "S3_ACCESS_KEY_ID" | "S3_SECRET_ACCESS_KEY"
>;

const hex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function hmac(key: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
  const raw = typeof key === "string" ? new TextEncoder().encode(key) : key;
  const k = await crypto.subtle.importKey("raw", raw, { hash: "SHA-256", name: "HMAC" }, false, [
    "sign",
  ]);
  return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
}

const sha256 = async (s: string) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

// RFC3986: encodeURIComponent leaves these alone, S3's canonical form does not.
const encodeSegment = (s: string) =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/**
 * SigV4 query-string presigning against any S3-compatible endpoint (R2, GCS interop, MinIO).
 * Only `host` is signed, so the client may send whatever headers it likes on the upload.
 */
export function s3(env: S3Env) {
  const region = env.S3_REGION || "auto";
  // Trimmed: a stray space in an env var becomes %20 in the signed URL, which fails
  // as an opaque 403 rather than anything that points back at the config.
  const bucket = env.S3_BUCKET.trim();
  const endpoint = env.S3_ENDPOINT.trim().replace(/\/$/, "");
  const signingKeys = new Map<string, Promise<ArrayBuffer>>();

  function signingKey(dateStamp: string) {
    let key = signingKeys.get(dateStamp);
    if (!key) {
      key = (async () => {
        let k: ArrayBuffer | string = `AWS4${env.S3_SECRET_ACCESS_KEY}`;
        for (const part of [dateStamp, region, "s3", "aws4_request"]) k = await hmac(k, part);
        return k as ArrayBuffer;
      })();
      signingKeys.set(dateStamp, key);
    }
    return key;
  }

  async function presign(method: string, storageKey: string, expiresIn: number): Promise<string> {
    const path = storageKey.split("/").map(encodeSegment).join("/");
    const url = new URL(`${endpoint}/${bucket}/${path}`);
    const amzDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/${region}/s3/aws4_request`;

    const query = new URLSearchParams({
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${env.S3_ACCESS_KEY_ID}/${scope}`,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": String(expiresIn),
      "X-Amz-SignedHeaders": "host",
    });
    query.sort();

    const canonical = [
      method,
      url.pathname,
      query.toString(),
      `host:${url.host}\n`,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");
    const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256(canonical)].join("\n");
    const signature = hex(await hmac(await signingKey(dateStamp), toSign));

    url.search = `${query}&X-Amz-Signature=${signature}`;
    return url.toString();
  }

  return {
    /** Delete an object. Presigned DELETE avoids a second, header-signing code path. */
    async delete(storageKey: string) {
      const res = await fetch(await presign("DELETE", storageKey, 60), { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        console.error("s3 delete failed", storageKey, res.status, await res.text());
      }
    },
    readUrl: (storageKey: string, ttl = 3600) => presign("GET", storageKey, ttl),
    uploadUrl: (storageKey: string, ttl = 600) => presign("PUT", storageKey, ttl),
  };
}

export type S3 = ReturnType<typeof s3>;
