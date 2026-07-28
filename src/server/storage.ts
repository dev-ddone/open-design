import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { config } from "./config.js";

export interface StoredObject {
  data: ArrayBuffer;
  contentType: string;
}

const localRoot = resolve(process.cwd(), config.storage.localPath);
let s3: S3Client | null = null;

function s3Client(): S3Client {
  if (s3) return s3;
  const { endpoint, region, accessKey, secretKey, forcePathStyle } = config.storage.s3;
  if (!accessKey || !secretKey) {
    throw new Error("S3_ACCESS_KEY and S3_SECRET_KEY are required when STORAGE_DRIVER=s3");
  }
  s3 = new S3Client({
    endpoint,
    region,
    forcePathStyle,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });
  return s3;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

export async function initializeStorage(): Promise<void> {
  if (config.storage.driver === "local") {
    await mkdir(localRoot, { recursive: true });
    return;
  }

  const client = s3Client();
  let lastError: unknown;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: config.storage.s3.bucket }));
      return;
    } catch (headError) {
      lastError = headError;
      try {
        await client.send(new CreateBucketCommand({ Bucket: config.storage.s3.bucket }));
        return;
      } catch (createError) {
        lastError = createError;
      }
    }
    if (attempt < 20) await delay(Math.min(attempt * 500, 3_000));
  }
  throw new Error("Unable to initialize object storage after 20 attempts", {
    cause: lastError,
  });
}

function safeLocalPath(key: string): string {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.includes("..")) throw new Error("Invalid storage key");
  return resolve(localRoot, normalized);
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return Uint8Array.from(data).buffer;
}

function validateSvg(data: Uint8Array): void {
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    throw new Error("SVG must be valid UTF-8");
  }
  if (!/<svg(?:\s|>)/i.test(source)) throw new Error("Invalid SVG document");

  const forbidden = [
    /<\s*(?:[a-z0-9_-]+:)?(?:script|foreignobject|iframe|object|embed|audio|video|link|meta)\b/i,
    /\bon[a-z0-9_-]+\s*=/i,
    /\b(?:href|xlink:href)\s*=\s*["']\s*(?!#)/i,
    /\burl\s*\(\s*["']?\s*(?!#)/i,
    /\bjavascript\s*:/i,
    /\bexpression\s*\(/i,
    /@import\b/i,
    /<!doctype\b/i,
    /<\?xml-stylesheet\b/i,
  ];
  if (forbidden.some((pattern) => pattern.test(source))) {
    throw new Error("SVG contains unsupported active or external content");
  }
}

function validateObject(data: Uint8Array, contentType: string): void {
  if (contentType === "image/svg+xml") validateSvg(data);
}

export async function putObject(
  key: string,
  data: Uint8Array,
  contentType: string,
): Promise<void> {
  validateObject(data, contentType);
  if (config.storage.driver === "local") {
    const path = safeLocalPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    return;
  }
  await s3Client().send(
    new PutObjectCommand({
      Bucket: config.storage.s3.bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
      CacheControl: "private, max-age=31536000, immutable",
    }),
  );
}

export async function getObject(key: string, fallbackContentType: string): Promise<StoredObject | null> {
  if (config.storage.driver === "local") {
    try {
      const data = await readFile(safeLocalPath(key));
      return { data: toArrayBuffer(data), contentType: fallbackContentType };
    } catch {
      return null;
    }
  }
  try {
    const response = await s3Client().send(
      new GetObjectCommand({ Bucket: config.storage.s3.bucket, Key: key }),
    );
    if (!response.Body) return null;
    return {
      data: toArrayBuffer(await response.Body.transformToByteArray()),
      contentType: response.ContentType ?? fallbackContentType,
    };
  } catch {
    return null;
  }
}
