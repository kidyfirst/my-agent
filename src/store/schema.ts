export const INIT_SQL = `
CREATE TABLE IF NOT EXISTS myagent_threads (
  id TEXT PRIMARY KEY,
  resourceId TEXT NOT NULL,
  title TEXT NOT NULL,
  metadata TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS myagent_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  content TEXT NOT NULL,
  role TEXT NOT NULL,
  type TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  resourceId TEXT,
  durationMs INTEGER
);

CREATE INDEX IF NOT EXISTS idx_messages_thread_created_at 
  ON myagent_messages (thread_id, createdAt);

CREATE INDEX IF NOT EXISTS idx_messages_thread_resource_created_at 
  ON myagent_messages (thread_id, resourceId, createdAt);

CREATE TABLE IF NOT EXISTS myagent_observational_memory (
  id TEXT PRIMARY KEY,
  lookupKey TEXT NOT NULL,
  scope TEXT NOT NULL,
  resourceId TEXT,
  threadId TEXT,
  activeObservations TEXT NOT NULL,
  activeObservationsPendingUpdate TEXT,
  originType TEXT NOT NULL DEFAULT 'observation',
  config TEXT NOT NULL DEFAULT '{}',
  generationCount INTEGER NOT NULL DEFAULT 0,
  supersededBy TEXT,
  lastObservedAt TEXT,
  lastReflectionAt TEXT,
  pendingMessageTokens INTEGER NOT NULL DEFAULT 0,
  totalTokensObserved INTEGER NOT NULL DEFAULT 0,
  observationTokenCount INTEGER NOT NULL DEFAULT 0,
  isObserving INTEGER NOT NULL DEFAULT 0,
  isReflecting INTEGER NOT NULL DEFAULT 0,
  observedMessageIds TEXT,
  observedTimezone TEXT,
  bufferedObservations TEXT,
  bufferedObservationTokens INTEGER,
  bufferedMessageIds TEXT,
  bufferedReflection TEXT,
  bufferedReflectionTokens INTEGER,
  bufferedReflectionInputTokens INTEGER,
  reflectedObservationLineCount INTEGER,
  bufferedObservationChunks TEXT,
  isBufferingObservation INTEGER NOT NULL DEFAULT 0,
  isBufferingReflection INTEGER NOT NULL DEFAULT 0,
  lastBufferedAtTokens INTEGER NOT NULL DEFAULT 0,
  lastBufferedAtTime TEXT,
  metadata TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_om_lookup_key 
  ON myagent_observational_memory (lookupKey);
`
