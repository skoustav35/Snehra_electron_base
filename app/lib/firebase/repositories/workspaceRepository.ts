import { doc, setDoc, deleteDoc, getDocs, collection, query } from 'firebase/firestore';
import { db } from '../firebase.client';

export class WorkspaceRepository {
  /**
   * Helper to make file paths safe for Firestore Document IDs.
   * Replaces slashes with a custom delimiter (e.g. __) or uses encodeURIComponent.
   * We use encodeURIComponent to ensure any path is valid as a single Doc ID.
   */
  static sanitizePath(filePath: string): string {
    return encodeURIComponent(filePath);
  }

  static desanitizePath(docId: string): string {
    return decodeURIComponent(docId);
  }

  /**
   * Saves a file's content to the cloud workspace.
   */
  static async saveFileToCloud(
    uid: string,
    chatId: string,
    filePath: string,
    content: string,
    isBinary: boolean
  ): Promise<void> {
    if (!uid || !chatId || !filePath) return;

    const safeId = this.sanitizePath(filePath);
    const docRef = doc(db, `users/${uid}/chats/${chatId}/workspace`, safeId);
    
    await setDoc(
      docRef,
      {
        filePath,
        content,
        isBinary,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  /**
   * Deletes a file from the cloud workspace.
   */
  static async deleteFileFromCloud(uid: string, chatId: string, filePath: string): Promise<void> {
    if (!uid || !chatId || !filePath) return;

    const safeId = this.sanitizePath(filePath);
    const docRef = doc(db, `users/${uid}/chats/${chatId}/workspace`, safeId);
    
    await deleteDoc(docRef);
  }

  /**
   * Loads the entire workspace for a specific chat.
   */
  static async loadWorkspace(uid: string, chatId: string): Promise<Record<string, { content: string; isBinary: boolean }>> {
    if (!uid || !chatId) return {};

    const workspaceRef = collection(db, `users/${uid}/chats/${chatId}/workspace`);
    const snapshot = await getDocs(query(workspaceRef));
    
    const files: Record<string, { content: string; isBinary: boolean }> = {};
    
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.filePath && data.content !== undefined) {
        files[data.filePath] = {
          content: data.content,
          isBinary: data.isBinary || false,
        };
      }
    });

    return files;
  }
}
