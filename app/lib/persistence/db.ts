import type { Message } from 'ai';
import type { ChatMetadata } from '../firebase/repositories/chatRepository';
import { ChatRepository } from '../firebase/repositories/chatRepository';
import { auth } from '../firebase/firebase.client';
import type { ChatHistoryItem } from './useChatHistory';

export type IChatMetadata = ChatMetadata;

export async function openDatabase(): Promise<any> {
  // Database is managed by Firebase. Just return a truthy value.
  return Promise.resolve(true);
}

const getUid = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("User must be authenticated to access database.");
  return uid;
};

export async function getAll(db: any): Promise<ChatHistoryItem[]> {
  return new Promise((resolve, reject) => {
    try {
      ChatRepository.subscribeToChats(getUid(), (chats) => {
        resolve(chats as any);
      });
    } catch (e) {
      reject(e);
    }
  });
}

export async function setMessages(
  db: any,
  id: string,
  messages: Message[],
  urlId?: string,
  description?: string,
  timestamp?: string,
  metadata?: any,
): Promise<void> {
  const uid = getUid();
  await ChatRepository.createChat(uid, id, description || 'Chat', 'gemini-1.5-flash', urlId);
  await ChatRepository.setMessages(uid, id, messages);
}

export async function getMessages(db: any, id: string): Promise<ChatHistoryItem> {
  // Firebase subscribe mechanism handles this better in modern React, 
  // but for backward compatibility we return a promise with latest state.
  return new Promise((resolve, reject) => {
    try {
      ChatRepository.subscribeToMessages(getUid(), id, (messages) => {
        resolve({ id, messages, urlId: id, description: 'Loaded Chat' } as any);
      });
    } catch(e) {
      reject(e);
    }
  });
}

export async function getMessagesByUrlId(db: any, id: string): Promise<ChatHistoryItem> {
  return getMessages(db, id);
}

export async function getMessagesById(db: any, id: string): Promise<ChatHistoryItem> {
  return getMessages(db, id);
}

export async function deleteById(db: any, id: string): Promise<void> {
  await ChatRepository.deleteChat(getUid(), id);
}

export async function getNextId(db: any): Promise<string> {
  return crypto.randomUUID();
}

export async function getUrlId(db: any, id: string): Promise<string> {
  return id;
}

export async function forkChat(db: any, chatId: string, messageId: string): Promise<string> {
  const chat = await getMessages(db, chatId);
  if (!chat) throw new Error('Chat not found');
  const messageIndex = chat.messages.findIndex((msg) => msg.id === messageId);
  if (messageIndex === -1) throw new Error('Message not found');
  const messages = chat.messages.slice(0, messageIndex + 1);
  return createChatFromMessages(db, chat.description ? `${chat.description} (fork)` : 'Forked chat', messages);
}

export async function duplicateChat(db: any, id: string): Promise<string> {
  const chat = await getMessages(db, id);
  if (!chat) throw new Error('Chat not found');
  return createChatFromMessages(db, `${chat.description || 'Chat'} (copy)`, chat.messages);
}

export async function createChatFromMessages(
  db: any,
  description: string,
  messages: Message[],
  metadata?: any,
): Promise<string> {
  const newId = await getNextId(db);
  const newUrlId = newId;
  await setMessages(db, newId, messages, newUrlId, description, undefined, metadata);
  return newUrlId;
}

export async function updateChatDescription(db: any, id: string, description: string): Promise<void> {
  await ChatRepository.updateChatMetadata(getUid(), id, { description });
}

export async function updateChatMetadata(
  db: any,
  id: string,
  metadata: any | undefined,
): Promise<void> {
  await ChatRepository.updateChatMetadata(getUid(), id, metadata);
}
