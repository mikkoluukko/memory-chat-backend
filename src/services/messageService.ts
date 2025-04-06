import { supabase } from '../lib/supabase';
import type { Message, MessageRole, MemorySummary } from '../types/database';
import { HfInference } from '@huggingface/inference';
import { cleanModelResponse } from '../server';
import { getPersonalityDescription } from './personalityService';

const HISTORY_LIMIT = 10;
const SUMMARIZE_THRESHOLD = 10; // Number of messages before we should summarize

// Initialize HuggingFace client for summarization
const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

// Fallback character personality definition (used only if custom personality and default both fail)
const FALLBACK_SYSTEM_PROMPT = "You are a helpful AI assistant. Be concise and clear in your responses.";

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

export async function getAllMessages(userId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch all messages: ${error.message}`);
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

  // After saving a message, check if we need to summarize old messages
  if (role === 'user') {
    await checkAndSummarizeMemory(userId);
  }

  return data;
}

export async function getMemorySummary(userId: string): Promise<MemorySummary | null> {
  const { data, error } = await supabase
    .from('memory_summary')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    // If no summary exists yet, return null instead of throwing an error
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to fetch memory summary: ${error.message}`);
  }

  return data;
}

export async function saveMemorySummary(
  userId: string,
  content: string
): Promise<MemorySummary> {
  // Check if a summary already exists for this user
  const { data: existingSummary, error: fetchError } = await supabase
    .from('memory_summary')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    throw new Error(`Failed to check for existing memory summary: ${fetchError.message}`);
  }

  let result;
  if (existingSummary) {
    // Update existing summary
    const { data, error } = await supabase
      .from('memory_summary')
      .update({ content })
      .eq('id', existingSummary.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update memory summary: ${error.message}`);
    }
    result = data;
  } else {
    // Create new summary
    const { data, error } = await supabase
      .from('memory_summary')
      .insert([{ user_id: userId, content }])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create memory summary: ${error.message}`);
    }
    result = data;
  }

  return result;
}

export async function generateMemorySummary(messages: Message[]): Promise<string> {
  if (messages.length === 0) {
    return "No previous conversation history.";
  }

  // Create a conversation history string for summarization
  const conversationText = messages
    .map(msg => `${msg.role === 'user' ? 'User' : 'Elina'}: ${msg.content}`)
    .join('\n');

  // Generate a summary using HuggingFace
  const summaryPrompt = `
    <s>[INST] You are an AI assistant that summarizes conversations. Please provide a concise summary of the following conversation between a user and Elina (an AI assistant). Focus on key topics, user interests, and important information shared. This summary will be used as memory context for future conversations.

    Conversation:
    ${conversationText}
    
    Please summarize in a paragraph: [/INST]
  `;

  try {
    const response = await hf.textGeneration({
      model: 'mistralai/Mistral-7B-Instruct-v0.2',
      inputs: summaryPrompt,
      parameters: {
        max_new_tokens: 150,
        temperature: 0.3,
        top_p: 0.9,
      },
    });

    // Extract the summary from the response
    let summary = response.generated_text;
    const lastInstIndex = summary.lastIndexOf('[/INST]');
    if (lastInstIndex !== -1) {
      summary = summary.substring(lastInstIndex + 7).trim();
    }
    summary = summary.replace(/\[INST\]|\[\/INST\]/g, '').trim();

    return summary;
  } catch (error) {
    console.error('Error generating summary:', error);
    return "Failed to generate conversation summary.";
  }
}

export async function checkAndSummarizeMemory(userId: string): Promise<void> {
  try {
    // Get message count for this user
    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to count messages: ${error.message}`);
    }

    // If we have enough messages, create or update a summary
    if (count && count >= SUMMARIZE_THRESHOLD) {
      // Get all messages except the most recent HISTORY_LIMIT
      const { data: oldMessages, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: true })
        .limit(count - HISTORY_LIMIT);

      if (messagesError) {
        throw new Error(`Failed to fetch old messages: ${messagesError.message}`);
      }

      if (oldMessages && oldMessages.length > 0) {
        // Generate summary of old messages
        const summary = await generateMemorySummary(oldMessages);
        
        // Save the summary
        await saveMemorySummary(userId, summary);
      }
    }
  } catch (error) {
    console.error('Error in checkAndSummarizeMemory:', error);
    // Don't throw here - this is a background operation that shouldn't break the main flow
  }
}

export async function buildPromptWithHistory(
  userId: string,
  messages: Message[], 
  newMessage: string, 
  memorySummary?: string | null
): Promise<string> {
  // Get the user's custom personality if available
  const personalityDescription = await getPersonalityDescription(userId);
  
  // Start with character system prompt
  let prompt = `<s>[INST] ${personalityDescription} [/INST]\n\n`;

  // Add memory summary if available
  if (memorySummary) {
    prompt += `[INST] Previous conversation summary: ${memorySummary} [/INST]\n\n`;
  }

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