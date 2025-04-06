import { supabase } from '../lib/supabase';
import { generateMemorySummary, saveMemorySummary, getMemorySummary } from '../services/messageService';
import type { Message } from '../types/database';

// Mock Supabase client
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    single: jest.fn(),
  },
}));

// Mock HuggingFace client
jest.mock('@huggingface/inference', () => {
  return {
    HfInference: jest.fn().mockImplementation(() => {
      return {
        textGeneration: jest.fn().mockResolvedValue({
          generated_text: 'The user and Elina discussed various topics including the user\'s hobbies and interests. The user mentioned enjoying programming and AI. Elina provided helpful information and asked follow-up questions.',
        }),
      };
    }),
  };
});

describe('Memory Service', () => {
  const mockUserId = 'demo-user';
  
  const mockSummary = {
    id: '1',
    user_id: mockUserId,
    content: 'Test summary content',
    updated_at: '2024-01-01T00:00:00Z',
  };
  
  const mockMessages: Message[] = [
    {
      id: '1',
      user_id: mockUserId,
      role: 'user',
      content: 'Hello!',
      timestamp: '2024-01-01T00:00:00Z',
    },
    {
      id: '2',
      user_id: mockUserId,
      role: 'bot',
      content: 'Hi there! How can I help you today?',
      timestamp: '2024-01-01T00:00:01Z',
    },
    {
      id: '3',
      user_id: mockUserId,
      role: 'user',
      content: 'I love programming and AI.',
      timestamp: '2024-01-01T00:00:02Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMemorySummary', () => {
    it('should fetch memory summary for a user', async () => {
      const mockQuery = {
        data: mockSummary,
        error: null,
      };
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue(mockQuery),
      });

      const summary = await getMemorySummary(mockUserId);
      expect(summary).toEqual(mockSummary);
    });

    it('should return null when no summary exists', async () => {
      const mockQuery = {
        data: null,
        error: { code: 'PGRST116' },
      };
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue(mockQuery),
      });

      const summary = await getMemorySummary(mockUserId);
      expect(summary).toBeNull();
    });
  });

  describe('saveMemorySummary', () => {
    it('should update existing summary', async () => {
      // Mock existing summary check
      const mockExistingQuery = {
        data: { id: '1' },
        error: null,
      };
      (supabase.from as jest.Mock).mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue(mockExistingQuery),
      });

      // Mock update
      const mockUpdateQuery = {
        data: mockSummary,
        error: null,
      };
      (supabase.from as jest.Mock).mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue(mockUpdateQuery),
      });

      const savedSummary = await saveMemorySummary(mockUserId, 'Test summary content');
      expect(savedSummary).toEqual(mockSummary);
    });

    it('should create new summary when none exists', async () => {
      // Mock existing summary check (not found)
      const mockExistingQuery = {
        data: null,
        error: { code: 'PGRST116' },
      };
      (supabase.from as jest.Mock).mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue(mockExistingQuery),
      });

      // Mock insert
      const mockInsertQuery = {
        data: mockSummary,
        error: null,
      };
      (supabase.from as jest.Mock).mockReturnValueOnce({
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue(mockInsertQuery),
      });

      const savedSummary = await saveMemorySummary(mockUserId, 'Test summary content');
      expect(savedSummary).toEqual(mockSummary);
    });
  });

  describe('generateMemorySummary', () => {
    it('should generate a summary from messages', async () => {
      const summary = await generateMemorySummary(mockMessages);
      expect(summary).toContain('user');
      expect(summary).toContain('Elina');
    });

    it('should handle empty messages', async () => {
      const summary = await generateMemorySummary([]);
      expect(summary).toBe('No previous conversation history.');
    });
  });
}); 