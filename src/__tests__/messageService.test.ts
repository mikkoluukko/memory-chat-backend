import { supabase } from '../lib/supabase';
import { getRecentMessages, saveMessage, buildPromptWithHistory } from '../services/messageService';
import { getPersonalityDescription } from '../services/personalityService';
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
    single: jest.fn(),
  },
}));

// Mock personalityService
jest.mock('../services/personalityService', () => ({
  getPersonalityDescription: jest.fn().mockResolvedValue('You are a helpful AI assistant. Be concise and clear in your responses.'),
}));

describe('Message Service', () => {
  const mockUserId = 'test-user-123';
  const mockMessage: Message = {
    id: '1',
    user_id: mockUserId,
    role: 'user',
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
    it('should build prompt with message history', async () => {
      const messages: Message[] = [
        { ...mockMessage, role: 'user', content: 'Hello' },
        { ...mockMessage, role: 'bot', content: 'Hi there!' },
      ];
      const newMessage = 'How are you?';

      const prompt = await buildPromptWithHistory(mockUserId, messages, newMessage);
      
      // Check that it starts with the system message
      expect(prompt).toContain('[INST] You are a helpful AI assistant. Be concise and clear in your responses. [/INST]');
      
      // Check that it contains user message with INST tags
      expect(prompt).toContain('[INST] Hello [/INST]');
      
      // Check that it contains bot message without INST tags
      expect(prompt).toContain('Hi there!');
      
      // Check that it ends with the new message
      expect(prompt).toContain(`[INST] ${newMessage} [/INST]`);
      
      // Verify the complete expected structure
      const expectedPrompt = '<s>[INST] You are a helpful AI assistant. Be concise and clear in your responses. [/INST]\n\n[INST] Hello [/INST]\nHi there!\n\n[INST] How are you? [/INST]';
      expect(prompt).toBe(expectedPrompt);
    });
  });
}); 