import { ref, set, onValue, off, serverTimestamp, remove } from 'firebase/database';
import { rtdb } from '../firebase.client';

export class StateRepository {
  /**
   * Update the execution status or ephemeral state for a user.
   * Path example: /status/{uid}/terminalOutput
   */
  static async setEphemeralState(uid: string, pathSegment: string, data: any): Promise<void> {
    const stateRef = ref(rtdb, `status/${uid}/${pathSegment}`);
    await set(stateRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Clear the ephemeral state.
   */
  static async clearEphemeralState(uid: string, pathSegment: string): Promise<void> {
    const stateRef = ref(rtdb, `status/${uid}/${pathSegment}`);
    await remove(stateRef);
  }

  /**
   * Subscribe to ephemeral state changes (e.g. live terminal output streams).
   */
  static subscribeToState(uid: string, pathSegment: string, onUpdate: (data: any) => void): () => void {
    const stateRef = ref(rtdb, `status/${uid}/${pathSegment}`);
    const callback = onValue(stateRef, (snapshot) => {
      onUpdate(snapshot.val());
    });

    // Return an unsubscribe function
    return () => off(stateRef, 'value', callback);
  }
}
