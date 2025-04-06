import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, RequestHandler } from 'express';
import cors from 'cors';
import { HfInference } from '@huggingface/inference';
import { 
  getRecentMessages, 
  saveMessage, 
  buildPromptWithHistory, 
  getMemorySummary 
} from './services/messageService';
import { 
  getPersonality, 
  savePersonality 
} from './services/personalityService';

export const app = express();
const port = process.env.PORT || 3001;

// Initialize HuggingFace client
const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

app.use(cors());
app.use(express.json());

export function cleanModelResponse(response: string): string {
  // Extract only the assistant's response by:
  // 1. Remove everything up to the last [/INST] tag
  // 2. Remove any remaining [INST] or [/INST] tags
  // 3. Cut off response at first occurrence of markdown link or base64 data
  const lastInstIndex = response.lastIndexOf('[/INST]');
  if (lastInstIndex !== -1) {
    response = response.substring(lastInstIndex + 7).trim();
  }
  
  // Remove any remaining instruction tags
  response = response.replace(/\[INST\]|\[\/INST\]/g, '').trim();
  
  // Cut off response at the first occurrence of a markdown link or unusual pattern
  const markdownLinkIndex = response.indexOf('[');
  if (markdownLinkIndex !== -1) {
    response = response.substring(0, markdownLinkIndex).trim();
  }
  
  return response;
}

function filterUnexpectedContent(response: string): string {
  // More aggressive cleaning of unwanted content:
  // 1. Remove any content within square brackets followed by parentheses (markdown links)
  response = response.replace(/\[.*?\]\(.*?\)/g, '');
  
  // 2. Remove any content containing base64 data
  response = response.replace(/data:image\/[^"')\s]+/g, '');
  
  // 3. Remove any trailing square brackets that might be left
  response = response.replace(/\[\s*\]/g, '');
  
  // 4. Clean up any double spaces and trim
  return response.replace(/\s+/g, ' ').trim();
}

// Chat endpoint
export const chatHandler: RequestHandler = async (req, res) => {
  try {
    const { message, userId } = req.body;
    
    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    // Save user message
    await saveMessage(userId, message, 'user');

    // Get conversation history
    const history = await getRecentMessages(userId);
    
    // Get memory summary if available
    const memorySummary = await getMemorySummary(userId);
    
    // Build prompt with history, memory summary, and custom personality
    const prompt = await buildPromptWithHistory(userId, history, message, memorySummary?.content);

    // Get AI response
    const response = await hf.textGeneration({
      model: 'mistralai/Mistral-7B-Instruct-v0.2',
      inputs: prompt,
      parameters: {
        max_new_tokens: 100,
        temperature: 0.3,
        top_p: 0.85,
        repetition_penalty: 1.2,
      },
    });

    const botResponse = filterUnexpectedContent(cleanModelResponse(response.generated_text));

    // Save bot response
    await saveMessage(userId, botResponse, 'bot');

    res.json({ response: botResponse });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
};

// Get personality endpoint
export const getPersonalityHandler: RequestHandler = async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ error: 'User ID is required as a query parameter' });
      return;
    }

    const personality = await getPersonality(userId);
    
    if (personality) {
      res.json({ personality });
    } else {
      res.json({ personality: null });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch personality' });
  }
};

// Save personality endpoint
export const savePersonalityHandler: RequestHandler = async (req, res) => {
  try {
    const { userId, description } = req.body;
    
    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    if (!description) {
      res.status(400).json({ error: 'Personality description is required' });
      return;
    }

    const personality = await savePersonality(userId, description);
    
    res.json({ personality });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to save personality' });
  }
};

// Register routes
app.post('/api/chat/message', chatHandler);
app.get('/api/personality', getPersonalityHandler);
app.post('/api/personality', savePersonalityHandler);

// Only start the server if we're not in a test environment
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
} 