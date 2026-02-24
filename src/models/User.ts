import { FirebaseFirestoreTypes } from "@react-native-firebase/firestore";

// ─── Subscription cache (RevenueCat is source of truth — this is UX-only) ──
export type SubscriptionStatus = "active" | "expired" | "unknown";

export interface SubscriptionCache {
  status: SubscriptionStatus;
  expiration: FirebaseFirestoreTypes.Timestamp | null;
  lastCheckedAt: FirebaseFirestoreTypes.Timestamp | null;
}

// ─── User document (Firestore: users/{uid}) ─────────────────────────────────
export interface User {
  uid: string; // Firebase Auth UID — also the document ID
  createdAt: FirebaseFirestoreTypes.Timestamp;
  displayName: string | null;
  subscriptionCache: SubscriptionCache;
}

// ─── Write payload for first-time user creation ─────────────────────────────
export type UserCreateData = Omit<User, "uid">;
