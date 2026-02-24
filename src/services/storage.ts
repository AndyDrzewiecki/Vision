/**
 * Firebase Storage helpers — upload spine.
 *
 * All paths follow the convention:
 *   /users/{uid}/clips/{clipId}/processed.mp4
 *   /users/{uid}/clips/{clipId}/thumb.jpg
 *   /users/{uid}/clips/{clipId}/original.mp4   (optional, v1 may skip)
 */

import { storage } from "./firebase";
import { FirebaseStorageTypes } from "@react-native-firebase/storage";

// ─── Path builders ──────────────────────────────────────────────────────────
export function clipProcessedPath(uid: string, clipId: string): string {
  return `users/${uid}/clips/${clipId}/processed.mp4`;
}

export function clipThumbnailPath(uid: string, clipId: string): string {
  return `users/${uid}/clips/${clipId}/thumb.jpg`;
}

export function clipOriginalPath(uid: string, clipId: string): string {
  return `users/${uid}/clips/${clipId}/original.mp4`;
}

// ─── Upload progress callback ───────────────────────────────────────────────
export type UploadProgressCallback = (progress: number) => void;

export interface UploadResult {
  storagePath: string;
  sizeBytes: number;
  downloadUrl: string;
}

// ─── Upload a single file ───────────────────────────────────────────────────
/**
 * Uploads a local file to Firebase Storage with progress reporting.
 *
 * Returns the storage path, byte size, and a download URL.  The returned
 * `FirebaseStorageTypes.Task` is also exposed so callers can pause/resume
 * (needed for the foreground-resumable upload pipeline in Phase 2).
 */
export async function uploadFile(
  localUri: string,
  storagePath: string,
  onProgress?: UploadProgressCallback,
): Promise<UploadResult> {
  const ref = storage().ref(storagePath);
  const task: FirebaseStorageTypes.Task = ref.putFile(localUri);

  if (onProgress) {
    task.on("state_changed", (snapshot) => {
      const pct = snapshot.bytesTransferred / snapshot.totalBytes;
      onProgress(pct);
    });
  }

  const snapshot = await task;
  const downloadUrl = await ref.getDownloadURL();

  return {
    storagePath,
    sizeBytes: snapshot.totalBytes,
    downloadUrl,
  };
}

// ─── Delete helpers (used by clip deletion) ─────────────────────────────────
/**
 * Deletes a file at `storagePath`. Swallows "object-not-found" errors so
 * callers don't need to check existence first.
 */
export async function deleteFile(storagePath: string): Promise<void> {
  try {
    await storage().ref(storagePath).delete();
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "storage/object-not-found") return;
    throw err;
  }
}
