import { supabase } from '../lib/supabase';
import type { Message, MessageRole } from '../types/database';
import { cleanModelResponse } from '../server';

const HISTORY_LIMIT = 10;

export async function getRecentMessages(userId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: true })
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
        user_id: userId,
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
  // Start with system message
  let prompt = '<s>[INST] You are a helpful AI assistant. Be concise and clear in your responses. [/INST]\n\n';

  // Add conversation history
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'user') {
      prompt += `[INST] ${msg.content} [/INST]\n`;
    } else {
      prompt += `${msg.content}\n\n`;
    }
  }

  // Add the new message
  prompt += `[INST] ${newMessage} [/INST]`;

  return prompt;
}

function filterUnexpectedContent(response: string): string {
  // Remove any base64-encoded data or unexpected tokens
  return response.replace(/\[.*?\]\(data:image\/.*?\)/g, '').trim();
} 