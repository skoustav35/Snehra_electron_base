/**
 * Functions for managing chat data in IndexedDB
 */

import type { Message } from 'ai';
import type { IChatMetadata } from './db';
import { ChatRepository } from '../firebase/repositories/chatRepository';
import { auth } from '../firebase/firebase.client';

const getUid = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("User must be authenticated to access database.");
  return uid;
};

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface Chat {
  id: string;
  description?: string;
  messages: Message[];
  timestamp: string;
  urlId?: string;
  metadata?: IChatMetadata;
}

/**
 * Get all chats from the database
 * @param db The IndexedDB database instance
 * @returns A promise that resolves to an array of chats
 */
export async function getAllChats(db: IDBDatabase | any): Promise<Chat[]> {
  console.log(`getAllChats: Fetching from Firebase`);
  return new Promise((resolve, reject) => {
    try {
      const unsubscribe = ChatRepository.subscribeToChats(getUid(), (chats) => {
        unsubscribe(); // immediately unsubscribe after first fetch
        // Convert ChatMetadata to Chat
        const mappedChats = chats.map((c) => ({
          id: c.id,
          description: c.description || c.title,
          messages: [], // To get all messages, we would need to fetch them individually, but export typically needs them
          timestamp: new Date(c.createdAt?.toMillis ? c.createdAt.toMillis() : Date.now()).toISOString(),
          urlId: c.urlId,
          metadata: c,
        }));
        
        // Fetch all messages for all chats
        Promise.all(mappedChats.map(chat => 
          new Promise<Message[]>((resolveMsg) => {
            const unsubMsg = ChatRepository.subscribeToMessages(getUid(), chat.id, (msgs) => {
              unsubMsg();
              resolveMsg(msgs);
            });
          })
        )).then(messagesArrays => {
          messagesArrays.forEach((msgs, i) => {
            mappedChats[i].messages = msgs;
          });
          resolve(mappedChats as Chat[]);
        }).catch(reject);
      });
    } catch (err) {
      console.error(`getAllChats: Error fetching from Firebase:`, err);
      reject(err);
    }
  });
}

/**
 * Get a chat by ID
 * @param db The IndexedDB database instance
 * @param id The ID of the chat to get
 * @returns A promise that resolves to the chat or null if not found
 */
export async function getChatById(db: IDBDatabase | any, id: string): Promise<Chat | null> {
  return new Promise((resolve, reject) => {
    try {
      const unsubscribe = ChatRepository.subscribeToChats(getUid(), (chats) => {
        unsubscribe();
        const chatMeta = chats.find(c => c.id === id);
        if (!chatMeta) {
          resolve(null);
          return;
        }
        const unsubMsg = ChatRepository.subscribeToMessages(getUid(), id, (msgs) => {
          unsubMsg();
          resolve({
            id: chatMeta.id,
            description: chatMeta.description || chatMeta.title,
            messages: msgs,
            timestamp: new Date(chatMeta.createdAt?.toMillis ? chatMeta.createdAt.toMillis() : Date.now()).toISOString(),
            urlId: chatMeta.urlId,
            metadata: chatMeta
          } as Chat);
        });
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Save a chat to the database
 * @param db The IndexedDB database instance
 * @param chat The chat to save
 * @returns A promise that resolves when the chat is saved
 */
export async function saveChat(db: IDBDatabase | any, chat: Chat): Promise<void> {
  try {
    const uid = getUid();
    await ChatRepository.createChat(uid, chat.id, chat.description || 'Imported Chat', 'gemini-1.5-flash', chat.urlId);
    await ChatRepository.setMessages(uid, chat.id, chat.messages);
  } catch (err) {
    throw err;
  }
}

/**
 * Delete a chat by ID
 * @param db The IndexedDB database instance
 * @param id The ID of the chat to delete
 * @returns A promise that resolves when the chat is deleted
 */
export async function deleteChat(db: IDBDatabase | any, id: string): Promise<void> {
  try {
    await ChatRepository.deleteChat(getUid(), id);
  } catch (err) {
    throw err;
  }
}

/**
 * Delete all chats
 * @param db The IndexedDB database instance
 * @returns A promise that resolves when all chats are deleted
 */
export async function deleteAllChats(db: IDBDatabase | any): Promise<void> {
  try {
    const chats = await getAllChats(db);
    for (const chat of chats) {
      await deleteChat(db, chat.id);
    }
  } catch (err) {
    throw err;
  }
}
