import express, { Request, Response, RequestHandler } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { HfInference } from '@huggingface/inference';
import { getRecentMessages, saveMessage, buildPromptWithHistory } from './services/messageService';

dotenv.config();

export const app = express();
const port = process.env.PORT || 3001;

// Initialize HuggingFace client
const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

app.use(cors());
app.use(express.json());

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

    // Build prompt with history
    const prompt = buildPromptWithHistory(history, message);

    // Get AI response
    const response = await hf.textGeneration({
      model: 'mistralai/Mistral-7B-Instruct-v0.2',
      inputs: prompt,
      parameters: {
        max_new_tokens: 250,
        temperature: 0.7,
        top_p: 0.95,
      },
    });

    const botResponse = response.generated_text;

    // Save bot response
    await saveMessage(userId, botResponse, 'bot');

    res.json({ response: botResponse });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
};

app.post('/api/chat/message', chatHandler);

// Only start the server if we're not in a test environment
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
} 