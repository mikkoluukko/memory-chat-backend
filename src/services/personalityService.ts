import { supabase } from '../lib/supabase';
import type { Personality } from '../types/database';

// Default personality if none is set
export const DEFAULT_PERSONALITY = "You are a helpful AI assistant. Be concise and clear in your responses.";

/**
 * Get the personality for a specific user
 */
export async function getPersonality(userId: string): Promise<Personality | null> {
  const { data, error } = await supabase
    .from('personalities')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    // If no personality exists yet, return null instead of throwing an error
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to fetch personality: ${error.message}`);
  }

  return data;
}

/**
 * Save or update a personality for a user
 */
export async function savePersonality(
  userId: string,
  description: string
): Promise<Personality> {
  // Check if a personality already exists for this user
  const { data: existingPersonality, error: fetchError } = await supabase
    .from('personalities')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    throw new Error(`Failed to check for existing personality: ${fetchError.message}`);
  }

  let result;
  if (existingPersonality) {
    // Update existing personality
    const { data, error } = await supabase
      .from('personalities')
      .update({ description })
      .eq('id', existingPersonality.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update personality: ${error.message}`);
    }
    result = data;
  } else {
    // Create new personality
    const { data, error } = await supabase
      .from('personalities')
      .insert([{ user_id: userId, description }])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create personality: ${error.message}`);
    }
    result = data;
  }

  return result;
}

/**
 * Get the personality description for a user, or return the default if none exists
 */
export async function getPersonalityDescription(userId: string): Promise<string> {
  try {
    const personality = await getPersonality(userId);
    return personality?.description || DEFAULT_PERSONALITY;
  } catch (error) {
    console.error('Error fetching personality:', error);
    return DEFAULT_PERSONALITY;
  }
} 