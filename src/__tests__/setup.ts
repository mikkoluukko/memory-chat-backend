import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Mock HuggingFace API
jest.mock('@huggingface/inference', () => ({
  HfInference: jest.fn().mockImplementation(() => ({
    textGeneration: jest.fn().mockResolvedValue({
      generated_text: 'Test AI response'
    })
  }))
})); 