import "server-only";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";

/**
 * File storage. In production files go to a private Cloud Storage bucket (GCS_BUCKET);
 * locally they are written under .data/uploads.
 */
const bucketName = process.env.GCS_BUCKET;
const localRoot = path.join(process.cwd(), ".data", "uploads");
let storage: Storage | undefined;

function bucket() {
  storage ??= new Storage();
  return storage.bucket(bucketName!);
}

export async function putFile(prefix: string, fileName: string, contentType: string, data: Buffer): Promise<string> {
  const safe = fileName.replace(/[^\w.\-]+/g, "_").slice(-120);
  const key = `${prefix}/${randomUUID()}-${safe}`;
  if (bucketName) {
    await bucket().file(key).save(data, { contentType, resumable: false });
  } else {
    const full = path.join(localRoot, key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }
  return key;
}

export async function getFile(key: string): Promise<Buffer> {
  if (bucketName) {
    const [buf] = await bucket().file(key).download();
    return buf;
  }
  return readFile(path.join(localRoot, key));
}

export async function deleteFile(key: string): Promise<void> {
  try {
    if (bucketName) await bucket().file(key).delete({ ignoreNotFound: true });
    else await unlink(path.join(localRoot, key));
  } catch {
    // already gone
  }
}
