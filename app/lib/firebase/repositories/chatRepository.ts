import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  addDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase.client';
import type { Message } from 'ai';

export interface ChatMetadata {
  id: string;
  title: string;
  createdAt: any;
  updatedAt: any;
  modelUsed?: string;
  urlId?: string; // Ported from the indexeddb implementation for backward compat if needed
  description?: string;
  gitUrl?: string;
}

export class ChatRepository {
  /**
   * Subscribe to all chats for a given user in real-time.
   */
  static subscribeToChats(uid: string, onUpdate: (chats: ChatMetadata[]) => void) {
    const chatsRef = collection(db, `users/${uid}/chats`);
    const q = query(chatsRef, orderBy('updatedAt', 'desc'));

    return onSnapshot(q, (snapshot) => {
      const chats: ChatMetadata[] = [];
      snapshot.forEach((docSnap) => {
        chats.push({ id: docSnap.id, ...docSnap.data() } as ChatMetadata);
      });
      onUpdate(chats);
    });
  }

  /**
   * Create a new chat session for a user.
   */
  static async createChat(
    uid: string,
    chatId: string,
    title: string,
    modelUsed: string = 'gemini-1.5-flash',
    urlId?: string
  ): Promise<void> {
    const chatRef = doc(db, `users/${uid}/chats`, chatId);
    await setDoc(chatRef, {
      title,
      description: title,
      modelUsed,
      urlId: urlId || chatId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Update chat description or metadata.
   */
  static async updateChatMetadata(uid: string, chatId: string, updates: Partial<ChatMetadata>): Promise<void> {
    const chatRef = doc(db, `users/${uid}/chats`, chatId);
    await updateDoc(chatRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Delete a chat and all its messages.
   */
  static async deleteChat(uid: string, chatId: string): Promise<void> {
    // Note: In a production app with subcollections, it is better to delete subcollections
    // from a Cloud Function or batch them. Here we just delete the root doc for brevity, 
    // but the subcollection data will still exist unreferenced unless strictly deleted.
    const chatRef = doc(db, `users/${uid}/chats`, chatId);
    
    // We fetch messages first to delete them
    const messagesRef = collection(db, `users/${uid}/chats/${chatId}/messages`);
    const msgs = await getDocs(messagesRef);
    
    // Simple loop delete (Consider batch if many messages)
    for (const mDoc of msgs.docs) {
      // In Firestore v10, you can't delete directly from the document snapshot,
      // you must reference the doc: doc(db, path) but we can use the snapshot's ref
      await updateDoc(mDoc.ref, { deleted: true }); // Soft delete or we can use deleteDoc(mDoc.ref)
    }

    const { deleteDoc } = await import('firebase/firestore');
    
    for (const mDoc of msgs.docs) {
      await deleteDoc(mDoc.ref);
    }
    
    await deleteDoc(chatRef);
  }

  /**
   * Subscribe to messages within a specific chat in real-time.
   */
  static subscribeToMessages(uid: string, chatId: string, onUpdate: (messages: Message[]) => void) {
    const messagesRef = collection(db, `users/${uid}/chats/${chatId}/messages`);
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    return onSnapshot(q, (snapshot) => {
      const messages: Message[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        messages.push({
          id: docSnap.id,
          role: data.role,
          content: data.content,
          toolInvocations: data.toolInvocations,
          // Add any other specific ai SDK Message fields
        } as Message);
      });
      onUpdate(messages);
    });
  }

  /**
   * Replace or set entire message history for a chat.
   * Useful when migrating from IndexedDB logic.
   */
  static async setMessages(uid: string, chatId: string, messages: Message[]): Promise<void> {
    const { writeBatch } = await import('firebase/firestore');
    const batch = writeBatch(db);

    const chatRef = doc(db, `users/${uid}/chats`, chatId);
    batch.update(chatRef, { updatedAt: serverTimestamp() });

    // Since we are setting all messages, a simple approach is to delete old and insert new,
    // or just overwrite by ID. We overwrite by message ID.
    messages.forEach((msg, idx) => {
      const msgRef = doc(db, `users/${uid}/chats/${chatId}/messages`, msg.id || `msg_${idx}`);
      batch.set(msgRef, {
        role: msg.role,
        content: msg.content,
        toolInvocations: msg.toolInvocations || null,
        timestamp: new Date().getTime() + idx, // sequential timestamping
      });
    });

    await batch.commit();
  }
}
