-- Create salient_memories table
CREATE TABLE public.salient_memories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    content text NOT NULL,
    timestamp timestamptz DEFAULT now() NOT NULL
);

-- Add foreign key constraint if users table exists (optional but recommended)
-- ALTER TABLE public.salient_memories
-- ADD CONSTRAINT salient_memories_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Index for faster user memory retrieval
CREATE INDEX idx_salient_memories_user_id ON public.salient_memories(user_id);

-- Enable RLS
ALTER TABLE public.salient_memories ENABLE ROW LEVEL SECURITY;

-- Policies (adjust based on your auth setup - e.g., allow users to manage their own memories)
CREATE POLICY "Allow users to manage their own salient memories" 
ON public.salient_memories
FOR ALL
USING (auth.uid()::text = user_id); -- Example using Supabase Auth uid
-- Or if using a simple userId string without Supabase Auth:
-- USING (true); -- Allows wider access, secure appropriately

-- Grant permissions (adjust roles as needed)
GRANT ALL ON TABLE public.salient_memories TO authenticated;
GRANT ALL ON TABLE public.salient_memories TO service_role; 