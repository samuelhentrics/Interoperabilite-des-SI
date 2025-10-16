-- Init SQL for webhook DB

-- Create extension for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Subscribers table
CREATE TABLE IF NOT EXISTS subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  who TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (who, url)
);

-- Events table (each trigger)
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event TEXT NOT NULL,
  payload JSONB,
  sender TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'pending'
);

-- Event results (per subscriber)
CREATE TABLE IF NOT EXISTS event_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  subscriber_id UUID REFERENCES subscribers(id) ON DELETE SET NULL,
  status TEXT,
  response TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_subscribers_who ON subscribers(who);
CREATE INDEX IF NOT EXISTS idx_events_sent_at ON events(sent_at);
CREATE INDEX IF NOT EXISTS idx_event_results_event_id ON event_results(event_id);
