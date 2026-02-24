/**
 * Clip Firestore operations.
 *
 * Collection: clips/{clipId}
 */

import { db } from "./firebase";
import {
  Clip,
  ClipCreateData,
  ClipUpdateData,
} from "../models/Clip";

const CLIPS = "clips";
const PAGE_SIZE = 20;

// ─── Helpers ────────────────────────────────────────────────────────────────
function clipFromDoc(
  doc: FirebaseFirestoreTypes.QueryDocumentSnapshot | FirebaseFirestoreTypes.DocumentSnapshot,
): Clip {
  return { id: doc.id, ...doc.data() } as Clip;
}

// We import the type only once here so the rest of the file doesn't need it.
import { FirebaseFirestoreTypes } from "@react-native-firebase/firestore";

// ─── Create ─────────────────────────────────────────────────────────────────
export async function createClip(data: ClipCreateData): Promise<string> {
  const ref = await db.collection(CLIPS).add(data);
  return ref.id;
}

// ─── Read (paginated, owner-scoped) ─────────────────────────────────────────
export async function getClips(
  uid: string,
  afterDoc?: FirebaseFirestoreTypes.QueryDocumentSnapshot,
): Promise<{ clips: Clip[]; lastDoc: FirebaseFirestoreTypes.QueryDocumentSnapshot | null }> {
  let query = db
    .collection(CLIPS)
    .where("ownerId", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(PAGE_SIZE);

  if (afterDoc) {
    query = query.startAfter(afterDoc);
  }

  const snapshot = await query.get();
  const clips = snapshot.docs.map(clipFromDoc);
  const lastDoc = snapshot.docs[snapshot.docs.length - 1] ?? null;

  return { clips, lastDoc };
}

// ─── Read single ────────────────────────────────────────────────────────────
export async function getClip(clipId: string): Promise<Clip | null> {
  const doc = await db.collection(CLIPS).doc(clipId).get();
  if (!doc.exists) return null;
  return clipFromDoc(doc);
}

// ─── Update (partial) ───────────────────────────────────────────────────────
export async function updateClip(
  clipId: string,
  data: ClipUpdateData,
): Promise<void> {
  await db.collection(CLIPS).doc(clipId).update(data);
}

// ─── Delete ─────────────────────────────────────────────────────────────────
export async function deleteClip(clipId: string): Promise<void> {
  await db.collection(CLIPS).doc(clipId).delete();
}
