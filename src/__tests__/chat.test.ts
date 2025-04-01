import request from 'supertest';
import express from 'express';
import { HfInference } from '@huggingface/inference';
import { chatHandler } from '../server';

const app = express();
app.use(express.json());
app.post('/api/chat/message', chatHandler);

describe('Chat API', () => {
  it('should return 400 if message is missing', async () => {
    const response = await request(app)
      .post('/api/chat/message')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Message is required' });
  });

  it('should return AI response for valid message', async () => {
    const response = await request(app)
      .post('/api/chat/message')
      .send({ message: 'Hello, how are you?' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ response: 'Test AI response' });
  });

  it('should handle API errors gracefully', async () => {
    // Mock API error
    (HfInference as jest.Mock).mockImplementationOnce(() => ({
      textGeneration: jest.fn().mockRejectedValue(new Error('API Error'))
    }));

    const response = await request(app)
      .post('/api/chat/message')
      .send({ message: 'Hello' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to generate response' });
  });
}); 