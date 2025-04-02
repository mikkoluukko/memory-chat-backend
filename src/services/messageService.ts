import { supabase } from '../lib/supabase';
import type { Message, MessageRole } from '../types/database';

const HISTORY_LIMIT = 10;

export async function getRecentMessages(userId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('userId', userId)
    .order('timestamp', { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) {
    throw new Error(`Failed to fetch messages: ${error.message}`);
  }

  return data || [];
}

export async function saveMessage(
  userId: string,
  content: string,
  role: MessageRole
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert([
      {
        userId,
        content,
        role,
      },
    ])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save message: ${error.message}`);
  }

  return data;
}

export function buildPromptWithHistory(messages: Message[], newMessage: string): string {
  const historyPrompt = messages
    .reverse()
    .map((msg) => {
      if (msg.role === 'user') {
        return `[INST] ${msg.content} [/INST]`;
      }
      return msg.content;
    })
    .join('\n');

  return `<s>${historyPrompt}[INST] ${newMessage} [/INST]`;
} 