import { supabase } from '../lib/supabase';
import type { Database, Tables } from '../types/database';
import { getPersonalityDescription } from './personalityService';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Content } from '@google/generative-ai';

type Message = Tables<'messages'>;
type MemorySummary = Tables<'memory_summary'>;

const MAX_RECENT_MESSAGES = 10; // Max messages to fetch for recent history
const MAX_MESSAGES_FOR_SUMMARY = 50; // Messages to consider for summarization
const SUMMARY_THRESHOLD = 40; // Trigger summary if message count exceeds this

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const model = genAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
  // Ensure safety settings are appropriate
  safetySettings: [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  ]
});

/**
 * Fetches recent messages for a specific user.
 */
export async function getRecentMessages(userId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: true })
    .limit(MAX_RECENT_MESSAGES);

  if (error) {
    console.error('Error fetching messages:', error);
    throw new Error('Failed to fetch messages');
  }
  return data || [];
}

/**
 * Saves a message to the database.
 */
export async function saveMessage(userId: string, content: string, role: 'user' | 'model'): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ user_id: userId, content, role })
    .select()
    .single();

  if (error) {
    console.error('Error saving message:', error);
    throw new Error('Failed to save message');
  }

  // Trigger memory summarization check in the background (fire and forget)
  checkAndSummarizeMemory(userId).catch(err => console.error("Background summarization failed:", err));

  return data;
}

/**
 * Fetches the latest memory summary for a user.
 */
export async function getMemorySummary(userId: string): Promise<MemorySummary | null> {
  const { data, error } = await supabase
    .from('memory_summary')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single(); // Fetch only the latest summary

  if (error && error.code !== 'PGRST116') { // Ignore 'range not found' error
    console.error('Error fetching memory summary:', error);
    // Don't throw, just return null if fetch fails
  }
  return data || null;
}


/**
 * Builds a conversation history suitable for the Gemini API.
 */
export async function buildPromptWithHistory(userId: string, messages: Message[], newMessage: string): Promise<Content[]> {
  const systemInstruction = await getPersonalityDescription(userId);
  const memorySummary = await getMemorySummary(userId);

  const history: Content[] = [];

  // Add system instruction
  history.push({
      role: "user", // System instructions are often put in the first 'user' turn
      parts: [{ text: `System Prompt: ${systemInstruction}` }]
  });
  history.push({
      role: "model",
      parts: [{ text: "Understood. I will act according to this personality." }] // Simple ack from model
  });


  // Add memory summary if it exists
  if (memorySummary?.content) {
      history.push({
          role: "user",
          parts: [{ text: `Previous Conversation Summary: ${memorySummary.content}` }]
      });
      history.push({
          role: "model",
          parts: [{ text: "Okay, I have reviewed the summary of our previous conversation." }]
      });
  }

  // Add recent messages
  messages.forEach(msg => {
    history.push({
      role: msg.role === 'user' ? 'user' : 'model', // Map role directly
      parts: [{ text: msg.content }]
    });
  });

  // Add the new user message
  history.push({
    role: 'user',
    parts: [{ text: newMessage }]
  });

  return history;
}


/**
 * Generates a concise summary of the provided messages using Gemini.
 */
export async function generateMemorySummary(messages: Message[]): Promise<string> {
  const conversationText = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
  const prompt = `Summarize the key points and topics discussed in the following conversation. Be concise and focus on information that would be useful context for future interactions. Conversation:\n\n${conversationText}\n\nSummary:`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const summary = response.text();
    return summary.trim();
  } catch (error) {
    console.error('Error generating memory summary with Gemini:', error);
    throw new Error('Failed to generate memory summary');
  }
}

/**
 * Saves or updates the memory summary for a user.
 */
async function saveMemorySummaryInternal(userId: string, summary: string): Promise<void> {
  const { error } = await supabase
    .from('memory_summary')
    .upsert({ user_id: userId, content: summary, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

  if (error) {
    console.error('Error saving memory summary:', error);
    throw new Error('Failed to save memory summary');
  }
}

/**
 * Checks if memory summarization is needed and performs it.
 * Fetches more messages than needed for context to decide if summarization should occur.
 */
async function checkAndSummarizeMemory(userId: string): Promise<void> {
  try {
    // Fetch a larger chunk of messages to decide if summarization is needed
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, role, content, timestamp') // Select only needed fields
      .eq('user_id', userId)
      .order('timestamp', { ascending: false }) // Get latest messages first
      .limit(MAX_MESSAGES_FOR_SUMMARY);

    if (error) {
      console.error('Error fetching messages for summarization check:', error);
      return; // Don't proceed if messages can't be fetched
    }

    if (!messages || messages.length < SUMMARY_THRESHOLD) {
      // Not enough messages to trigger summarization yet
      return;
    }

    // We have enough messages, generate and save a summary
    console.log(`Generating memory summary for user ${userId}...`);
    // Ensure the message objects passed to generateMemorySummary match the Message type
    const validMessages: Message[] = messages.map(msg => ({ 
      ...msg, 
      user_id: userId // Explicitly add user_id if it was missing from select
    }));
    const summary = await generateMemorySummary(validMessages.reverse());
    await saveMemorySummaryInternal(userId, summary);
    console.log(`Memory summary saved for user ${userId}.`);

    // Optional: Consider deleting older messages that are now summarized,
    // but be careful about data retention policies and potential issues.
    // Example (use with caution):
    // const oldestMessageTimestamp = messages[messages.length - 1].timestamp;
    // await supabase.from('messages').delete().eq('user_id', userId).lt('timestamp', oldestMessageTimestamp);

  } catch (error) {
    console.error('Error in checkAndSummarizeMemory:', error);
    // Don't throw here - this is a background operation that shouldn't break the main flow
  }
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

function filterUnexpectedContent(response: string): string {
  // Remove any base64-encoded data or unexpected tokens
  return response.replace(/\[.*?\]\(data:image\/.*?\)/g, '').trim();
} 