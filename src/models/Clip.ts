import { FirebaseFirestoreTypes } from "@react-native-firebase/firestore";

// ─── Storage file reference ─────────────────────────────────────────────────
export interface StorageFileRef {
  storagePath: string;
  sizeBytes: number;
}

export interface ProcessedFileRef extends StorageFileRef {
  width: number;
  height: number;
  bitrateKbps: number;
}

export interface ThumbnailRef {
  storagePath: string;
}

// ─── Share ───────────────────────────────────────────────────────────────────
export interface ClipShare {
  token: string | null;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
  revokedAt: FirebaseFirestoreTypes.Timestamp | null;
}

// ─── Clip document (Firestore: clips/{clipId}) ─────────────────────────────
export interface Clip {
  id: string; // Firestore document ID, not stored in doc — attached after read
  ownerId: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  recordedAt: FirebaseFirestoreTypes.Timestamp | null;
  title: string | null;
  sport: string | null;
  athlete: string | null;
  tags: string[];
  notes: string;
  durationSec: number;
  originalFile: StorageFileRef;
  processedFile: ProcessedFileRef;
  thumbnail: ThumbnailRef;
  share: ClipShare;
}

// ─── Write payload (what we send to Firestore — no `id` field) ─────────────
export type ClipCreateData = Omit<Clip, "id">;

// ─── Partial update payload ─────────────────────────────────────────────────
export type ClipUpdateData = Partial<
  Pick<Clip, "title" | "sport" | "athlete" | "tags" | "notes">
>;

// ─── Annotation (Firestore: clips/{clipId}/annotations/{annotationId}) ──────
export type AnnotationType = "line" | "free_draw";

export interface LineData {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  strokeWidth: number;
}

export interface FreeDrawData {
  points: Array<{ x: number; y: number }>;
  color: string;
  strokeWidth: number;
}

export interface Annotation {
  id: string;
  type: AnnotationType;
  timeMs: number;
  data: LineData | FreeDrawData;
  createdAt: FirebaseFirestoreTypes.Timestamp;
}
