import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase.client';

export class SettingsRepository {
  /**
   * Fetch the current preferences for a user.
   */
  static async getPreferences(uid: string): Promise<Record<string, any>> {
    const prefRef = doc(db, `users/${uid}/settings/preferences`);
    const snap = await getDoc(prefRef);
    if (snap.exists()) {
      return snap.data();
    }
    return {};
  }

  /**
   * Update specific preferences for a user.
   */
  static async updatePreferences(uid: string, updates: Record<string, any>): Promise<void> {
    const prefRef = doc(db, `users/${uid}/settings/preferences`);
    await setDoc(prefRef, updates, { merge: true });
  }

  /**
   * Store an API key securely in Firestore.
   * Note: This subcollection will be protected by security rules.
   */
  static async setApiKey(uid: string, provider: string, key: string): Promise<void> {
    const keyRef = doc(db, `users/${uid}/settings/api_keys`);
    await setDoc(keyRef, { [provider]: key }, { merge: true });
  }

  /**
   * Retrieve an API key. 
   * In a real architecture, keys might only be retrieved on the server side (Edge Functions)
   * to avoid exposing them to the client, but if client-side AI SDK is used, we load them into memory.
   */
  static async getApiKeys(uid: string): Promise<Record<string, string>> {
    const keyRef = doc(db, `users/${uid}/settings/api_keys`);
    const snap = await getDoc(keyRef);
    if (snap.exists()) {
      return snap.data() as Record<string, string>;
    }
    return {};
  }

  /**
   * Store a third-party connection token securely in Firestore.
   */
  static async setConnection(uid: string, provider: string, data: any): Promise<void> {
    const connRef = doc(db, `users/${uid}/settings/connections`);
    await setDoc(connRef, { [provider]: data }, { merge: true });
  }

  /**
   * Retrieve a third-party connection securely.
   */
  static async getConnection(uid: string, provider: string): Promise<any | null> {
    const connRef = doc(db, `users/${uid}/settings/connections`);
    const snap = await getDoc(connRef);
    if (snap.exists()) {
      return snap.data()[provider] || null;
    }
    return null;
  }
}
