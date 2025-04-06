import request from 'supertest';
import { HfInference } from '@huggingface/inference';
import { app } from '../server';
import { supabase } from '../lib/supabase';
import * as messageService from '../services/messageService';
import * as personalityService from '../services/personalityService';

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

// Mock messageService and personalityService
jest.mock('../services/messageService', () => ({
  getRecentMessages: jest.fn().mockResolvedValue([]),
  saveMessage: jest.fn().mockImplementation((userId, content, role) => 
    Promise.resolve({
      id: '1',
      user_id: userId,
      role,
      content,
      timestamp: '2024-01-01T00:00:00Z',
    })
  ),
  buildPromptWithHistory: jest.fn().mockResolvedValue('<s>[INST] Test system prompt [/INST]\n\n[INST] Hello, how are you? [/INST]'),
  getMemorySummary: jest.fn().mockResolvedValue(null),
}));

jest.mock('../services/personalityService', () => ({
  getPersonalityDescription: jest.fn().mockResolvedValue('You are a helpful AI assistant.'),
  getPersonality: jest.fn().mockResolvedValue(null),
  savePersonality: jest.fn().mockResolvedValue({
    id: '1',
    user_id: 'test-user-123',
    description: 'Test personality',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }),
}));

describe('Chat API', () => {
  const mockTextGeneration = jest.fn();
  const mockUserId = 'test-user-123';

  beforeEach(() => {
    jest.clearAllMocks();
    (HfInference as jest.Mock).mockImplementation(() => ({
      textGeneration: mockTextGeneration,
    }));
    mockTextGeneration.mockResolvedValue({ generated_text: 'Test AI response' });
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
    // Override the mockImplementation to throw an error
    (messageService.saveMessage as jest.Mock).mockRejectedValueOnce(new Error('Failed to save message'));

    const response = await request(app)
      .post('/api/chat/message')
      .send({ message: 'Hello', userId: mockUserId });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to generate response' });
  });
}); 