import request from 'supertest';
import { HfInference } from '@huggingface/inference';
import { app } from '../server';
import { supabase } from '../lib/supabase';

jest.mock('@huggingface/inference');
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    single: jest.fn(),
  },
}));

describe('Chat API', () => {
  const mockTextGeneration = jest.fn();
  const mockUserId = 'test-user-123';
  const mockMessage = {
    id: '1',
    userId: mockUserId,
    role: 'user',
    content: 'Hello',
    timestamp: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (HfInference as jest.Mock).mockImplementation(() => ({
      textGeneration: mockTextGeneration,
    }));
    mockTextGeneration.mockResolvedValue({ generated_text: 'Test AI response' });

    // Mock Supabase responses
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: mockMessage, error: null }),
    });
  });

  it('should return error for missing message', async () => {
    const response = await request(app)
      .post('/api/chat/message')
      .send({ userId: mockUserId });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Message is required' });
  });

  it('should return error for missing userId', async () => {
    const response = await request(app)
      .post('/api/chat/message')
      .send({ message: 'Hello' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'User ID is required' });
  });

  it('should return AI response for valid message', async () => {
    const response = await request(app)
      .post('/api/chat/message')
      .send({ message: 'Hello, how are you?', userId: mockUserId });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ response: 'Test AI response' });
  });

  it('should handle API errors gracefully', async () => {
    mockTextGeneration.mockRejectedValue(new Error('API Error'));
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn().mockRejectedValue(new Error('Database error')),
    });

    const response = await request(app)
      .post('/api/chat/message')
      .send({ message: 'Hello', userId: mockUserId });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to generate response' });
  });
}); 