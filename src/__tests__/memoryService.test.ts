import { supabase } from '../lib/supabase';
import { generateMemorySummary, getMemorySummary } from '../services/messageService';
import type { Tables, MessageRole } from '../types/database';

type Message = Tables<'messages'>;
type MemorySummary = Tables<'memory_summary'>;

// Mock messageService functions used within memoryService tests if needed
// (generateMemorySummary is likely called internally, so its mock might need adjustment)
jest.mock('../services/messageService', () => ({
  ...jest.requireActual('../services/messageService'), // Keep original implementations unless mocked
  generateMemorySummary: jest.fn().mockResolvedValue('Test summary from mock'),
}));

// Mock Supabase client - Override .from in specific tests
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(), 
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

describe('Memory Service Tests (using messageService internally)', () => {
  const mockUserId = 'test-user-memory-123';
  const mockMessages: Message[] = [
    {
      id: 'm1',
      user_id: mockUserId,
      role: 'user',
      content: 'First user message',
      timestamp: new Date(Date.now() - 20000).toISOString(),
    },
    {
      id: 'm2',
      user_id: mockUserId,
      role: 'model', // Changed from 'bot'
      content: 'First model response',
      timestamp: new Date(Date.now() - 10000).toISOString(),
    },
    // Add more messages as needed for summary generation testing
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Note: Since generateMemorySummary and saveMemorySummary are internal to messageService,
  // testing them directly here might be redundant if messageService.test.ts covers them.
  // We focus on testing how messageService *uses* them, e.g., within saveMessage triggers.

  it('should correctly call getMemorySummary', async () => {
      const mockSummaryData = { id: 's1', user_id: mockUserId, content: 'Existing summary', updated_at: new Date().toISOString() };
      
      // Explicit mock for select -> eq -> order -> limit -> single chain
      const mockSingle = jest.fn().mockResolvedValue({ data: mockSummaryData, error: null });
      const mockLimit = jest.fn(() => ({ single: mockSingle }));
      const mockOrder = jest.fn(() => ({ limit: mockLimit }));
      const mockEq = jest.fn(() => ({ order: mockOrder }));
      const mockSelect = jest.fn(() => ({ eq: mockEq }));
      (supabase.from as jest.Mock).mockImplementationOnce(() => ({ select: mockSelect }));

      const summary = await getMemorySummary(mockUserId);
      
      expect(summary).toEqual(mockSummaryData);
      expect(supabase.from).toHaveBeenCalledWith('memory_summary');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockOrder).toHaveBeenCalledWith('updated_at', { ascending: false });
      expect(mockLimit).toHaveBeenCalledWith(1);
      expect(mockSingle).toHaveBeenCalled();
  });

  // Add more tests if specific memory service logic (not covered in messageService tests) exists
}); 