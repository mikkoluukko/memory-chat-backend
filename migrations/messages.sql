CREATE TABLE messages (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  role text not null check (role in ('user', 'model')),
  content text not null,
  timestamp timestamptz default now()
);

CREATE INDEX idx_messages_user_timestamp on messages(user_id, timestamp desc);
