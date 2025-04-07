import { supabase } from '../lib/supabase';
import { getRecentMessages, saveMessage, buildPromptWithHistory, generateMemorySummary } from '../services/messageService';
import { getPersonalityDescription } from '../services/personalityService';
import type { Tables } from '../types/database';
import { GoogleGenerativeAI, Content } from '@google/generative-ai';

type Message = Tables<'messages'>;
type MemorySummary = Tables<'memory_summary'>;

// Updated Supabase mock helper
const createSupabaseMock = (data: any = null, error: any = null, chain: string[] = []) => {
  const mock: any = {};
  const queryMethods = ['select', 'eq', 'order', 'limit', 'insert', 'single', 'upsert'];

  queryMethods.forEach(method => {
    mock[method] = jest.fn().mockImplementation(() => {
      const newChain = [...chain, method];
      // Check if this is the expected end of a chain and resolve
      if (method === 'limit' || method === 'single' || method === 'upsert') {
        // console.log(`Resolving mock chain: ${newChain.join('.')} with data: ${JSON.stringify(data)}`);
        return Promise.resolve({ data, error });
      }
      // Return 'this' (the mock object) to allow further chaining
      return createSupabaseMock(data, error, newChain); 
    });
  });
  return mock;
};

// Mock Supabase client using the helper factory
jest.mock('../lib/supabase', () => ({
  supabase: {
    // The factory function will be called each time supabase.from() is invoked
    from: jest.fn(() => createSupabaseMock()), 
  },
}));

// Mock personalityService
jest.mock('../services/personalityService', () => ({
  getPersonalityDescription: jest.fn().mockResolvedValue('You are a helpful AI assistant. Be concise and clear in your responses.'),
}));

// Mock GoogleGenerativeAI
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({ 
        response: { text: () => 'Generated test summary.' } 
      }),
    }),
  })),
  HarmCategory: {
    HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
    HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
  },
  HarmBlockThreshold: {
    BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE',
  },
}));

describe('Message Service', () => {
  const mockUserId = 'test-user-123';
  const mockMessage: Message = {
    id: '1',
    user_id: mockUserId,
    role: 'user',
    content: 'Hello',
    timestamp: new Date().toISOString(),
  };

  beforeEach(() => {
    // Clear all mocks, including the implementations set by mockImplementationOnce
    jest.clearAllMocks(); 
    // Re-apply the default factory for supabase.from
    (supabase.from as jest.Mock).mockImplementation(() => createSupabaseMock());
  });

  describe('getRecentMessages', () => {
    it('should fetch recent messages for a user', async () => {
      const mockData = [mockMessage];
      // Explicit mock for the select -> eq -> order -> limit chain
      const mockLimit = jest.fn().mockResolvedValue({ data: mockData, error: null });
      const mockOrder = jest.fn(() => ({ limit: mockLimit }));
      const mockEq = jest.fn(() => ({ order: mockOrder }));
      const mockSelect = jest.fn(() => ({ eq: mockEq }));
      (supabase.from as jest.Mock).mockImplementationOnce(() => ({ select: mockSelect }));

      const messages = await getRecentMessages(mockUserId);
      
      expect(messages).toEqual(mockData);
      expect(supabase.from).toHaveBeenCalledWith('messages');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockOrder).toHaveBeenCalledWith('timestamp', { ascending: true });
      expect(mockLimit).toHaveBeenCalledWith(10);
    });

    it('should throw error when fetch fails', async () => {
      const dbError = new Error('Database error');
      // Explicit mock for the chain ending in error
      const mockLimit = jest.fn().mockResolvedValue({ data: null, error: dbError });
      const mockOrder = jest.fn(() => ({ limit: mockLimit }));
      const mockEq = jest.fn(() => ({ order: mockOrder }));
      const mockSelect = jest.fn(() => ({ eq: mockEq }));
      (supabase.from as jest.Mock).mockImplementationOnce(() => ({ select: mockSelect }));

      await expect(getRecentMessages(mockUserId)).rejects.toThrow('Failed to fetch messages');
    });
  });

  describe('saveMessage', () => {
    it('should save a message and trigger background summarization check', async () => {
      const insertData = { ...mockMessage, id: 'newMessageId' };
      const summaryCheckData: Message[] = []; 

      // 1. Mock for insert -> select -> single (save chain)
      const mockSaveSingle = jest.fn().mockResolvedValue({ data: insertData, error: null });
      const mockSaveSelect = jest.fn(() => ({ single: mockSaveSingle }));
      const mockSaveInsert = jest.fn(() => ({ select: mockSaveSelect }));
      
      // 2. Mock for select -> eq -> order -> limit (summary check chain)
      const mockSummaryLimit = jest.fn().mockResolvedValue({ data: summaryCheckData, error: null });
      const mockSummaryOrder = jest.fn(() => ({ limit: mockSummaryLimit }));
      const mockSummaryEq = jest.fn(() => ({ order: mockSummaryOrder }));
      const mockSummarySelect = jest.fn(() => ({ eq: mockSummaryEq }));

      // Provide mocks sequentially for the two .from calls
      (supabase.from as jest.Mock)
        .mockImplementationOnce(() => ({ insert: mockSaveInsert })) // For the save
        .mockImplementationOnce(() => ({ select: mockSummarySelect })); // For the summary check

      const savedMessage = await saveMessage(mockUserId, 'Hello again', 'user');
      
      expect(savedMessage).toEqual(insertData);
      expect(supabase.from).toHaveBeenCalledTimes(2);
      expect(supabase.from).toHaveBeenNthCalledWith(1, 'messages');
      expect(supabase.from).toHaveBeenNthCalledWith(2, 'messages');
      
      // Verify save chain calls
      expect(mockSaveInsert).toHaveBeenCalledWith({ user_id: mockUserId, content: 'Hello again', role: 'user' });
      expect(mockSaveSelect).toHaveBeenCalled();
      expect(mockSaveSingle).toHaveBeenCalled();

      // Verify summary check chain calls
      expect(mockSummarySelect).toHaveBeenCalledWith('id, role, content, timestamp');
      expect(mockSummaryEq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSummaryOrder).toHaveBeenCalledWith('timestamp', { ascending: false });
      expect(mockSummaryLimit).toHaveBeenCalledWith(50);
    });

    it('should throw error when save fails', async () => {
       const dbError = new Error('Database save error');
       // Mock only the save chain to fail
       const mockSaveSingle = jest.fn().mockResolvedValue({ data: null, error: dbError });
       const mockSaveSelect = jest.fn(() => ({ single: mockSaveSingle }));
       const mockSaveInsert = jest.fn(() => ({ select: mockSaveSelect }));
       (supabase.from as jest.Mock).mockImplementationOnce(() => ({ insert: mockSaveInsert }));

       await expect(saveMessage(mockUserId, 'Hello', 'user')).rejects.toThrow('Failed to save message');
       expect(supabase.from).toHaveBeenCalledTimes(1); // Summary check should not have been called
    });
  });

  describe('buildPromptWithHistory', () => {
    it('should build prompt with system message, history, and new message (no summary)', async () => {
      const messages: Message[] = [
        { ...mockMessage, id: '2', role: 'user', content: 'Hello' },
        { ...mockMessage, id: '3', role: 'model', content: 'Hi there!' },
      ];
      const newMessage = 'How are you?';
      const systemPrompt = 'You are a helpful AI assistant. Be concise and clear in your responses.';

      // Mock getMemorySummary call within buildPromptWithHistory to return null
      const mockSummarySingle = jest.fn().mockResolvedValue({ data: null, error: null });
      const mockSummaryLimit = jest.fn(() => ({ single: mockSummarySingle }));
      const mockSummaryOrder = jest.fn(() => ({ limit: mockSummaryLimit }));
      const mockSummaryEq = jest.fn(() => ({ order: mockSummaryOrder }));
      const mockSummarySelect = jest.fn(() => ({ eq: mockSummaryEq }));
      (supabase.from as jest.Mock).mockImplementationOnce((tableName) => 
        tableName === 'memory_summary' ? { select: mockSummarySelect } : {}
      );

      const promptHistory: Content[] = await buildPromptWithHistory(mockUserId, messages, newMessage);
      
      expect(supabase.from).toHaveBeenCalledWith('memory_summary');
      expect(promptHistory).toHaveLength(5); 
      // ... other assertions ...
    });

    it('should include memory summary when available', async () => {
      const messages: Message[] = [
        { ...mockMessage, id: '4', role: 'user', content: 'Another message' },
      ];
      const newMessage = 'Anything new?';
      const summaryContent = 'Previously discussed topics A and B.';
      const mockSummaryData = { id: 's1', user_id: mockUserId, content: summaryContent, updated_at: new Date().toISOString() };

      // Mock getMemorySummary call within buildPromptWithHistory to return summary
      const mockSummarySingle = jest.fn().mockResolvedValue({ data: mockSummaryData, error: null });
      const mockSummaryLimit = jest.fn(() => ({ single: mockSummarySingle }));
      const mockSummaryOrder = jest.fn(() => ({ limit: mockSummaryLimit }));
      const mockSummaryEq = jest.fn(() => ({ order: mockSummaryOrder }));
      const mockSummarySelect = jest.fn(() => ({ eq: mockSummaryEq }));
      (supabase.from as jest.Mock).mockImplementationOnce((tableName) => 
        tableName === 'memory_summary' ? { select: mockSummarySelect } : {}
      );
      
      const promptHistory: Content[] = await buildPromptWithHistory(mockUserId, messages, newMessage);
      
      expect(supabase.from).toHaveBeenCalledWith('memory_summary');
      expect(promptHistory).toHaveLength(6); 
      // ... other assertions checking summary content ...
    });
  });

  describe('generateMemorySummary', () => {
    // Implementation of generateMemorySummary test case
  });
}); 