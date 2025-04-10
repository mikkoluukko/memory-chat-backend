// Helper type to get the Table type from the Database definition
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];

export type MessageRole = 'user' | 'model';

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

export interface SalientMemory {
  id: string;
  user_id: string;
  content: string;
  timestamp: string;
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
      salient_memories: {
        Row: SalientMemory;
        Insert: Omit<SalientMemory, 'id' | 'timestamp'>;
        Update: Partial<Omit<SalientMemory, 'id' | 'timestamp'>>;
      };
    };
  };
} 