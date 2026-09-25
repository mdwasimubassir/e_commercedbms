-- Migration 011: Conversation Deletions (Per-user conversation dismissal)
-- Tracks when a user dismisses/deletes a conversation from their list
-- while preserving it on the other participant's end.

CREATE TABLE IF NOT EXISTS conversation_deletions (
    deletion_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    user_role VARCHAR(20) NOT NULL CHECK (user_role IN ('customer', 'seller', 'deliveryman', 'admin')),
    user_id BIGINT NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_conv_deletion UNIQUE (order_id, user_role, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_deletions_lookup ON conversation_deletions (order_id, user_role, user_id);
