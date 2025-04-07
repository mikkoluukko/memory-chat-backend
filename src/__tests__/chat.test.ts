// Define mocks FIRST
const mockSendMessage = jest.fn();
const mockStartChat = jest.fn(() => ({ sendMessage: mockSendMessage }));
const mockGetGenerativeModel = jest.fn(() => ({ startChat: mockStartChat }));

// Mock GoogleGenerativeAI BEFORE other imports
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
  HarmCategory: {},
  HarmBlockThreshold: {},
}));

// Now import other modules
import request from 'supertest';
import { app } from '../server'; // This imports server.ts, which imports messageService.ts
import * as messageService from '../services/messageService';
import * as personalityService from '../services/personalityService';
// GoogleGenerativeAI is already mocked, no need to import it directly here

// Mock the services AFTER other imports but before describe block
jest.mock('../services/messageService');
jest.mock('../services/personalityService');

describe('Chat API', () => {
  const mockUserId = 'test-user-123';

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear the globally defined mocks
    mockSendMessage.mockClear(); 
    mockStartChat.mockClear();
    mockGetGenerativeModel.mockClear();

    // Reset service mocks
    (messageService.saveMessage as jest.Mock).mockResolvedValue({ id: 'msg1', content: 'saved', role: 'user' });
    (messageService.getRecentMessages as jest.Mock).mockResolvedValue([
        { id: 'hist1', content: 'History 1', role: 'user', timestamp: new Date().toISOString() },
        { id: 'hist2', content: 'History 2', role: 'model', timestamp: new Date().toISOString() },
    ]);
    (messageService.buildPromptWithHistory as jest.Mock).mockResolvedValue([
        { role: 'user', parts: [{ text: 'System Prompt' }] }, 
        { role: 'model', parts: [{ text: 'Ack' }] },
        { role: 'user', parts: [{ text: 'History 1' }] },
        { role: 'model', parts: [{ text: 'History 2' }] },
        { role: 'user', parts: [{ text: 'Hello' }] },
    ]);

    // Reset Gemini mock default behavior
    mockSendMessage.mockResolvedValue({ 
        response: { text: () => 'Test AI response' } 
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
    const userMessage = 'Hello, how are you?';
    const aiResponse = 'Test AI response';
    
    mockSendMessage.mockResolvedValueOnce({ 
        response: { text: () => aiResponse } 
    });

    const response = await request(app)
      .post('/api/chat/message')
      .send({ message: userMessage, userId: mockUserId });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ response: aiResponse });

    // Assertions using the directly accessible mock functions
    expect(messageService.saveMessage).toHaveBeenCalledTimes(2);
    expect(messageService.saveMessage).toHaveBeenCalledWith(mockUserId, userMessage, 'user');
    expect(messageService.getRecentMessages).toHaveBeenCalledWith(mockUserId);
    expect(messageService.buildPromptWithHistory).toHaveBeenCalledWith(mockUserId, expect.any(Array), userMessage);
    expect(mockGetGenerativeModel).toHaveBeenCalled(); 
    expect(mockStartChat).toHaveBeenCalledWith({ history: expect.any(Array) }); 
    expect(mockSendMessage).toHaveBeenCalledWith(userMessage);
    expect(messageService.saveMessage).toHaveBeenCalledWith(mockUserId, aiResponse, 'model');
  });

  it('should handle Gemini API errors gracefully', async () => {
    const apiError = new Error('Gemini API Error');
    mockSendMessage.mockRejectedValueOnce(apiError);

    const response = await request(app)
      .post('/api/chat/message')
      .send({ message: 'Hello', userId: mockUserId });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to generate response' });
    expect(messageService.saveMessage).toHaveBeenCalledTimes(1); 
    expect(messageService.saveMessage).toHaveBeenCalledWith(mockUserId, 'Hello', 'user');
    expect(mockSendMessage).toHaveBeenCalled(); // Gemini was called, but failed
    expect(messageService.saveMessage).not.toHaveBeenCalledWith(mockUserId, expect.any(String), 'model');
  });

  it('should handle database errors during user message save gracefully', async () => {
    const dbError = new Error('Database save error');
    (messageService.saveMessage as jest.Mock).mockRejectedValueOnce(dbError);

    const response = await request(app)
      .post('/api/chat/message')
      .send({ message: 'Hello', userId: mockUserId });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to generate response' });
    expect(mockSendMessage).not.toHaveBeenCalled(); // Gemini should not be called if DB save fails first
  });
}); 