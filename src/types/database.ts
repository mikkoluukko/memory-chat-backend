export type MessageRole = 'user' | 'bot';

export interface Message {
  id: string;
  user_id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
}

export interface MemorySummary {
  id: string;
  user_id: string;
  content: string;
  updated_at: string;
}

export interface Personality {
  id: string;
  user_id: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      messages: {
        Row: Message;
        Insert: Omit<Message, 'id' | 'timestamp'>;
        Update: Partial<Omit<Message, 'id' | 'timestamp'>>;
      };
      memory_summary: {
        Row: MemorySummary;
        Insert: Omit<MemorySummary, 'id' | 'updated_at'>;
        Update: Partial<Omit<MemorySummary, 'id' | 'updated_at'>>;
      };
      personalities: {
        Row: Personality;
        Insert: Omit<Personality, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Personality, 'id' | 'created_at' | 'updated_at'>>;
      };
    };
  };
} 