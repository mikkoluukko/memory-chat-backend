import { supabase } from '../lib/supabase';
import type { Database, Tables } from '../types/database';
import { getPersonalityDescription } from './personalityService';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Content } from '@google/generative-ai';

type Message = Tables<'messages'>;
type MemorySummary = Tables<'memory_summary'>;
type SalientMemory = Tables<'salient_memories'>;

const MAX_RECENT_MESSAGES = 10; // Max messages to fetch for recent history
const MAX_MESSAGES_FOR_SUMMARY = 50; // Messages to consider for summarization
const SUMMARY_THRESHOLD = 40; // Trigger summary if message count exceeds this
const SALIENT_EXTRACTION_INTERVAL = 5; // Extract salient facts every 5 messages

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
  processBackgroundMemory(userId).catch(err => console.error("Background memory processing failed:", err));

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
 * Handles background memory tasks like summarization and salient fact extraction.
 */
async function processBackgroundMemory(userId: string): Promise<void> {
  // Count messages first to decide which tasks to run
  const { count, error: countError } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (countError) {
    console.error('Error counting messages for background tasks:', countError);
    return; // Don't proceed if count fails
  }

  const messageCount = count || 0;

  // a) Trigger salient fact extraction periodically
  if (messageCount > 0 && messageCount % SALIENT_EXTRACTION_INTERVAL === 0) {
    console.log(`Triggering salient fact extraction for user ${userId} (message count: ${messageCount})...`);
    await extractAndSaveSalientMemories(userId);
  }

  // b) Trigger conventional memory summarization if threshold is met
  if (messageCount >= SUMMARY_THRESHOLD) {
    console.log(`Triggering conventional summary for user ${userId} (message count: ${messageCount})...`);
    await checkAndSummarizeMemory(userId); // Reuse existing summarization logic
  }
}

/**
 * Fetches all salient memories for a user.
 */
export async function getSalientMemories(userId: string): Promise<SalientMemory[]> {
  const { data, error } = await supabase
    .from('salient_memories')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: true });

  if (error) {
    console.error('Error fetching salient memories:', error);
    // Don't throw, return empty array on error
    return [];
  }
  return data || [];
}

/**
 * Builds conversation history for Gemini, including salient memories.
 */
export async function buildPromptWithHistory(userId: string, messages: Message[], newMessage: string): Promise<Content[]> {
  const systemInstruction = await getPersonalityDescription(userId);
  const memorySummary = await getMemorySummary(userId);
  const salientMemories = await getSalientMemories(userId);

  const history: Content[] = [];

  // 1. System Instruction & Salient Memory Prompt
  let initialUserPrompt = `System Prompt: ${systemInstruction}`;
  if (salientMemories.length > 0) {
    initialUserPrompt += `\n\nThings to remember about the user:\n${salientMemories.map(m => `- ${m.content}`).join('\n')}`;
  }
  history.push({
      role: "user", 
      parts: [{ text: initialUserPrompt }]
  });
  history.push({
      role: "model",
      parts: [{ text: "Understood. I will act according to this personality and remember the provided facts about the user." }]
  });

  // 2. Add Conventional Memory Summary (if exists)
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

  // 3. Add Recent Messages
  messages.forEach(msg => {
    history.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    });
  });

  // 4. Add the New User Message
  history.push({
    role: 'user',
    parts: [{ text: newMessage }]
  });

  return history;
}

/**
 * Extracts salient facts from recent messages using Gemini.
 */
async function extractSalientFacts(userId: string): Promise<string[]> {
    // Fetch slightly more messages for context, similar to summarization check
    const { data: recentMessages, error } = await supabase
      .from('messages')
      .select('role, content') 
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(SALIENT_EXTRACTION_INTERVAL * 2); // Get last ~10 messages for better context

    if (error || !recentMessages || recentMessages.length === 0) {
        console.error('Error fetching messages for salient fact extraction or no messages found:', error);
        return [];
    }

    // Reverse to chronological order
    const conversationText = recentMessages.reverse().map(msg => `${msg.role}: ${msg.content}`).join('\n');
    
    const prompt = `Here is a conversation between a user and an assistant. Extract any important facts stated explicitly or implicitly about the **user** that the assistant should remember across sessions (like preferences, personal details, key life events mentioned). List each distinct fact on a new line, starting with '- '. If no new important facts are found, respond ONLY with the text: "No new important facts."

Conversation:
${conversationText}

Important facts about the user:`;

    try {
        console.log('Calling Gemini for salient fact extraction...');
        const result = await model.generateContent(prompt);
        const response = result.response;
        const rawText = response.text().trim();
        console.log('Gemini raw response for facts:', rawText);

        if (rawText === "No new important facts." || rawText === "") {
            return [];
        }

        // Parse the response, expecting lines starting with '- '
        const facts = rawText.split('\n')
                           .map(line => line.trim())
                           .filter(line => line.startsWith('- '))
                           .map(line => line.substring(2).trim()); // Remove '- '
                           
        console.log('Extracted facts:', facts);
        return facts;
    } catch (error) {
        console.error('Error generating salient facts with Gemini:', error);
        return []; // Return empty on error
    }
}

/**
 * Saves new salient facts to the database, avoiding duplicates.
 */
async function saveNewSalientFacts(userId: string, facts: string[]): Promise<void> {
    if (facts.length === 0) {
        return;
    }

    // Fetch existing facts to check for duplicates
    const { data: existingFacts, error: fetchError } = await supabase
        .from('salient_memories')
        .select('content')
        .eq('user_id', userId);

    if (fetchError) {
        console.error('Error fetching existing salient facts for duplication check:', fetchError);
        return; // Don't save if we can't check duplicates
    }

    const existingContent = new Set((existingFacts || []).map(f => f.content));
    const factsToInsert = facts
        .filter(fact => !existingContent.has(fact)) // Filter out duplicates
        .map(fact => ({ user_id: userId, content: fact }));

    if (factsToInsert.length > 0) {
        console.log(`Saving ${factsToInsert.length} new salient facts for user ${userId}...`);
        const { error: insertError } = await supabase
            .from('salient_memories')
            .insert(factsToInsert);

        if (insertError) {
            console.error('Error inserting new salient facts:', insertError);
        }
    }
}

/**
 * Orchestrates the extraction and saving of salient memories.
 */
async function extractAndSaveSalientMemories(userId: string): Promise<void> {
    try {
        const facts = await extractSalientFacts(userId);
        await saveNewSalientFacts(userId, facts);
    } catch (error) {
        console.error('Error in extractAndSaveSalientMemories process:', error);
    }
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
 * Checks if CONVENTIONAL memory summarization is needed and performs it.
 */
async function checkAndSummarizeMemory(userId: string): Promise<void> {
  try {
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, role, content, timestamp, user_id') // Ensure user_id is selected
      .eq('user_id', userId)
      .order('timestamp', { ascending: false }) 
      .limit(MAX_MESSAGES_FOR_SUMMARY);

    if (error) {
      console.error('Error fetching messages for summarization check:', error);
      return;
    }

    if (!messages || messages.length < SUMMARY_THRESHOLD) {
      return;
    }

    console.log(`Generating conventional summary for user ${userId}...`);
    // Ensure the message objects passed to generateMemorySummary match the Message type
    const validMessages: Message[] = messages.map(msg => ({ 
      id: msg.id, // Ensure all fields are present
      user_id: msg.user_id, 
      role: msg.role as 'user' | 'model', // Type assertion might be needed depending on DB schema
      content: msg.content,
      timestamp: msg.timestamp
    }));
    const summary = await generateMemorySummary(validMessages.reverse());
    await saveMemorySummaryInternal(userId, summary);
    console.log(`Conventional summary saved for user ${userId}.`);

  } catch (error) {
    console.error('Error in checkAndSummarizeMemory:', error);
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