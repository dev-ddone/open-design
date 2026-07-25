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
  data: Uint8Array;
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

export async function initializeStorage(): Promise<void> {
  if (config.storage.driver === "local") {
    await mkdir(localRoot, { recursive: true });
    return;
  }

  const client = s3Client();
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.storage.s3.bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: config.storage.s3.bucket }));
  }
}

function safeLocalPath(key: string): string {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.includes("..")) throw new Error("Invalid storage key");
  return resolve(localRoot, normalized);
}

export async function putObject(
  key: string,
  data: Uint8Array,
  contentType: string,
): Promise<void> {
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
      return { data, contentType: fallbackContentType };
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
      data: await response.Body.transformToByteArray(),
      contentType: response.ContentType ?? fallbackContentType,
    };
  } catch {
    return null;
  }
}
