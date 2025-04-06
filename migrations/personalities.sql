-- Create personalities table for custom character descriptions
CREATE TABLE IF NOT EXISTS personalities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Add index on user_id for faster lookups
  CONSTRAINT idx_personalities_user_id UNIQUE (user_id)
);

-- Add comment to the table
COMMENT ON TABLE personalities IS 'Stores custom character personalities for users';

-- Add trigger to update the updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_personalities_updated_at
BEFORE UPDATE ON personalities
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column(); 