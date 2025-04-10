-- Create messages table
CREATE TABLE public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    timestamp timestamptz DEFAULT now() NOT NULL
);

-- Add check constraint for role if needed, allowing 'user' or 'model'
-- ALTER TABLE public.messages ADD CONSTRAINT messages_role_check CHECK (role IN ('user', 'model'));

-- Index for efficient retrieval of messages by user, ordered by timestamp
CREATE INDEX idx_messages_user_timestamp on public.messages(user_id, timestamp desc);
