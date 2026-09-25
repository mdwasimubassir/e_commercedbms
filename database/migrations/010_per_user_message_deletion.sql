-- Migration 010: Per-User Message Deletions (Notification-style dismissal)
-- Allows a user to delete a message or conversation from their own account
-- without removing it from other participants' accounts.

CREATE TABLE IF NOT EXISTS message_deletions (
    deletion_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    message_id BIGINT NOT NULL REFERENCES delivery_messages(message_id) ON DELETE CASCADE,
    user_role VARCHAR(20) NOT NULL CHECK (user_role IN ('customer', 'seller', 'deliveryman', 'admin')),
    user_id BIGINT NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_message_deletion_per_user UNIQUE (message_id, user_role, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_deletions_lookup ON message_deletions (message_id, user_role, user_id);
CREATE INDEX IF NOT EXISTS idx_message_deletions_user ON message_deletions (user_role, user_id);
