import express, { Request, Response, RequestHandler } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { HfInference } from '@huggingface/inference';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Initialize HuggingFace client
const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

app.use(cors());
app.use(express.json());

// Chat endpoint
export const chatHandler: RequestHandler = async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const response = await hf.textGeneration({
      model: 'mistralai/Mistral-7B-Instruct-v0.2',
      inputs: `<s>[INST] ${message} [/INST]`,
      parameters: {
        max_new_tokens: 250,
        temperature: 0.7,
        top_p: 0.95,
      },
    });

    res.json({ response: response.generated_text });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
};

app.post('/api/chat/message', chatHandler);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 