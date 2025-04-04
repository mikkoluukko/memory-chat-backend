export type MessageRole = 'user' | 'bot';

export interface Message {
  id: string;
  user_id: string;
  role: MessageRole;
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
    };
  };
} 