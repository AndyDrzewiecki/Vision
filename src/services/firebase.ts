/**
 * Firebase initialization.
 *
 * With @react-native-firebase the native SDKs initialize themselves from
 * google-services.json (Android) and GoogleService-Info.plist (iOS) at app
 * start — there is no JS-side `initializeApp()` call.  This module simply
 * re-exports the singleton instances so the rest of the app imports Firebase
 * from one place.
 *
 * Usage:
 *   import { auth, db, storage } from "@/services/firebase";
 */

import auth from "@react-native-firebase/auth";
import firestore from "@react-native-firebase/firestore";
import storage from "@react-native-firebase/storage";

const db = firestore();

export { auth, db, storage };
