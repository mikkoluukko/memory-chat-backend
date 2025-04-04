import { supabase } from '../lib/supabase';
import { getRecentMessages, saveMessage, buildPromptWithHistory } from '../services/messageService';

// Mock Supabase client
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

describe('Message Service', () => {
  const mockUserId = 'test-user-123';
  const mockMessage = {
    id: '1',
    userId: mockUserId,
    role: 'user' as const,
    content: 'Hello',
    timestamp: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getRecentMessages', () => {
    it('should fetch recent messages for a user', async () => {
      const mockQuery = {
        data: [mockMessage],
        error: null,
      };
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockQuery),
      });

      const messages = await getRecentMessages(mockUserId);
      expect(messages).toEqual([mockMessage]);
    });

    it('should throw error when fetch fails', async () => {
      const mockQuery = {
        data: null,
        error: new Error('Database error'),
      };
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockQuery),
      });

      await expect(getRecentMessages(mockUserId)).rejects.toThrow('Failed to fetch messages');
    });
  });

  describe('saveMessage', () => {
    it('should save a message', async () => {
      const mockQuery = {
        data: mockMessage,
        error: null,
      };
      (supabase.from as jest.Mock).mockReturnValue({
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue(mockQuery),
      });

      const savedMessage = await saveMessage(mockUserId, 'Hello', 'user');
      expect(savedMessage).toEqual(mockMessage);
    });

    it('should throw error when save fails', async () => {
      const mockQuery = {
        data: null,
        error: new Error('Database error'),
      };
      (supabase.from as jest.Mock).mockReturnValue({
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue(mockQuery),
      });

      await expect(saveMessage(mockUserId, 'Hello', 'user')).rejects.toThrow('Failed to save message');
    });
  });

  describe('buildPromptWithHistory', () => {
    it('should build prompt with message history', () => {
      const messages = [
        { ...mockMessage, role: 'user' as const, content: 'Hello' },
        { ...mockMessage, role: 'bot' as const, content: 'Hi there!' },
      ];
      const newMessage = 'How are you?';

      const prompt = buildPromptWithHistory(messages, newMessage);
      expect(prompt).toBe('<s>Hi there!\n[INST] Hello [/INST][INST] How are you? [/INST]');
    });
  });
}); 