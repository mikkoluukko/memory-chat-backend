-- Create memory_summary table for long-term conversation memory
CREATE TABLE public.memory_summary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Add index on user_id for faster lookups
  CONSTRAINT idx_memory_summary_user_id UNIQUE (user_id)
);

-- Add comment to the table
COMMENT ON TABLE public.memory_summary IS 'Stores summarized conversation history for users';
