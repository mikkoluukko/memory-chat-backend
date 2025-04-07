import dotenv from 'dotenv';
dotenv.config(); // Loads .env by default - MUST be first

import express from 'express';
import cors from 'cors';

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
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



// If you have specific production/staging .env files, load them conditionally:
// if (process.env.NODE_ENV === 'production') { 
//   dotenv.config({ path: '.env.production', override: true });
// } else if (process.env.NODE_ENV === 'staging') {
//   dotenv.config({ path: '.env.staging', override: true });
// }

export const app = express();
const port = process.env.PORT || 3001;

// --- Gemini Client Initialization (Delayed) ---
let genAI: GoogleGenerativeAI | null = null;
let model: GenerativeModel | null = null;

function initializeGeminiClient() {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY environment variable is not set.");
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    console.log("Gemini Client Initialized");
  }
  return { genAI, model };
}
// --- End Gemini Client Initialization ---

// Middleware
app.use(cors());
app.use(express.json());

// --- API Routes ---

/**
 * GET /api/personality
 * Retrieves the personality setting for a user.
 */
app.get('/api/personality', async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const personality = await getPersonality(userId);
    res.json({ personality });
  } catch (error) {
    console.error('Failed to get personality:', error);
    res.status(500).json({ error: 'Failed to retrieve personality' });
  }
});

/**
 * POST /api/personality
 * Saves or updates the personality setting for a user.
 */
app.post('/api/personality', async (req, res) => {
  const { userId, description } = req.body;
  if (!userId || typeof description !== 'string') {
    return res.status(400).json({ error: 'User ID and description are required' });
  }

  try {
    const savedPersonality = await savePersonality(userId, description);
    res.json({ personality: savedPersonality });
  } catch (error) {
    console.error('Failed to save personality:', error);
    res.status(500).json({ error: 'Failed to save personality' });
  }
});

/**
 * POST /api/chat/message
 * Handles incoming chat messages, gets response from Gemini, and saves messages.
 */
export const chatHandler = async (req: express.Request, res: express.Response) => {
  const { message, userId } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    // Ensure Gemini client is initialized before handling the request
    const { model: geminiModel } = initializeGeminiClient();
    if (!geminiModel) { // Check if model is initialized
      throw new Error('Gemini model failed to initialize.');
    }
    
    // 1. Save user message
    await saveMessage(userId, message, 'user');

    // 2. Get recent messages
    const recentMessages = await getRecentMessages(userId);

    // 3. Build prompt for Gemini
    const history = await buildPromptWithHistory(userId, recentMessages, message);

    // 4. Get response from Gemini
    const chat = geminiModel.startChat({
      history,
    });
    const result = await chat.sendMessage(message); 
    const botResponseText = result.response.text();

    // 5. Save bot response
    await saveMessage(userId, botResponseText, 'model');

    // 6. Send response back to client
    res.json({ response: botResponseText });

  } catch (error) { // Added type annotation for error
    console.error('Error in chatHandler:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
};

app.post('/api/chat/message', chatHandler);

// --- Server Start ---

// Only start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  // Initialize client when server starts in non-test environments
  initializeGeminiClient(); 
  app.listen(port, () => {
    console.log(`Backend server listening on port ${port}`);
  });
} 