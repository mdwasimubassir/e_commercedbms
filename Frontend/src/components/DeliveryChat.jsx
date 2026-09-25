import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import {
  getDeliveryMessages,
  sendDeliveryMessage,
  getOrderParticipants,
  deleteDeliveryMessage,
  deleteConversationMessages
} from "../services/deliveryService";
import Spinner from "./Spinner";
import { useLiveSync, triggerLiveSync } from "../hooks/useLiveSync";

function formatMessageDate(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined
  });
}

export default function DeliveryChat({
  orderId = null,
  initialRecipientRole = null,
  initialRecipientId = null,
  supportMode = false,
  initialText = "",
  onClose = null
}) {
  const { user } = useAuth();
  const [participants, setParticipants] = useState(null);
  const [selectedRole, setSelectedRole] = useState(initialRecipientRole);
  const [selectedId, setSelectedId] = useState(initialRecipientId);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState(initialText || "");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [deletingMessageId, setDeletingMessageId] = useState(null);

  // Modern scroll management states
  const messagesContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const [hasNewMessagesBelow, setHasNewMessagesBelow] = useState(false);
  const isInitialLoadRef = useRef(true);
  const prevMessagesCountRef = useRef(0);

  // If initialText changes from parent, sync it
  useEffect(() => {
    if (initialText) {
      setText(initialText);
      adjustTextareaHeight();
    }
  }, [initialText]);

  // Load participants if orderId is provided
  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    getOrderParticipants(orderId)
      .then((data) => {
        if (!isMounted) return;
        setParticipants(data);

        // Select default recipient if not set
        if (!selectedRole) {
          if (user?.role === "customer") {
            setSelectedRole("seller");
            if (data.sellers && data.sellers.length > 0) {
              setSelectedId(data.sellers[0].id);
            }
          } else if (user?.role === "seller") {
            setSelectedRole("customer");
            setSelectedId(data.customer?.id);
          } else if (user?.role === "deliveryman") {
            setSelectedRole("customer");
            setSelectedId(data.customer?.id);
          } else if (user?.role === "admin") {
            setSelectedRole("customer");
            setSelectedId(data.customer?.id);
          }
        }
      })
      .catch((err) => {
        if (isMounted) setError(err.message || "Failed to load order participants.");
      });

    return () => {
      isMounted = false;
    };
  }, [orderId, user?.role]);

  // Reset scroll flags when switching conversation / participant
  useEffect(() => {
    isInitialLoadRef.current = true;
    prevMessagesCountRef.current = 0;
    setHasNewMessagesBelow(false);
    setShowScrollBottomBtn(false);
  }, [orderId, selectedRole, selectedId]);

  // Smooth scroll helper
  const scrollToBottom = useCallback((behavior = "smooth") => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior
    });
    setHasNewMessagesBelow(false);
    setShowScrollBottomBtn(false);
  }, []);

  // Monitor user scrolling to detect if reading history
  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceToBottom < 80;
    setIsNearBottom(atBottom);
    setShowScrollBottomBtn(distanceToBottom > 140);
    if (atBottom) {
      setHasNewMessagesBelow(false);
    }
  };

  // Fetch messages for current selected participant / support
  const fetchMessages = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      let data = [];
      if (orderId) {
        data = await getDeliveryMessages({
          orderId,
          recipientRole: selectedRole,
          recipientId: selectedId
        });
      } else {
        // Direct support mode
        data = await getDeliveryMessages({
          support: "admin",
          recipientRole: selectedRole,
          recipientId: selectedId
        });
      }

      const list = Array.isArray(data) ? data : [];

      // Deduplication: only update state if messages actually changed
      setMessages((prev) => {
        if (prev.length === list.length) {
          const isIdentical = prev.every((m, idx) => {
            const next = list[idx];
            return (
              m.message_id === next?.message_id &&
              m.is_read === next?.is_read &&
              m.message === next?.message &&
              m.created_at === next?.created_at
            );
          });
          if (isIdentical) return prev; // Return exact same ref -> NO RE-RENDER, NO JITTER!
        }
        return list;
      });

      setError("");
    } catch (err) {
      if (isInitial) {
        setError(err.message || "Failed to load messages.");
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    if (orderId || supportMode) {
      fetchMessages(true);
    }
  }, [orderId, selectedRole, selectedId, supportMode]);

  // Live sync updates (Listen to message_sent, message_deleted, conversation_cleared, and order_updated)
  useLiveSync(["message_sent", "message_deleted", "conversation_cleared", "order_updated"], (payload) => {
    if (!payload || !payload.orderId || String(payload.orderId) === String(orderId)) {
      fetchMessages(false);
      // If deliveryman was assigned, refresh participants
      if (orderId && (!participants?.deliveryman || payload?.type === "order_updated")) {
        getOrderParticipants(orderId)
          .then((d) => setParticipants(d))
          .catch(() => {});
      }
    }
  }, 5000);

  const handleDeleteMessage = async (msgId) => {
    if (
      !window.confirm(
        "Delete this message from your account? It will remain visible to other participants unless they delete it too."
      )
    )
      return;
    setDeletingMessageId(msgId);
    try {
      await deleteDeliveryMessage(msgId);
      setMessages((prev) => prev.filter((m) => m.message_id !== msgId));
      triggerLiveSync("message_deleted", { orderId, messageId: msgId });
    } catch (err) {
      setError(err.message || "Failed to delete message.");
    } finally {
      setDeletingMessageId(null);
    }
  };

  const handleClearConversation = async () => {
    const isSupport = supportMode || !orderId;
    const target = isSupport
      ? `support_${selectedRole}_${selectedId}`
      : orderId;

    if (!target) return;

    const confirmMsg =
      user?.role === "admin"
        ? "Are you sure you want to delete this entire conversation? All messages will be permanently removed."
        : "Delete this conversation from your account? The messages will remain visible to other participants unless they delete them too.";

    if (!window.confirm(confirmMsg)) return;

    try {
      const params = isSupport
        ? { recipientRole: selectedRole, recipientId: selectedId }
        : {};
      await deleteConversationMessages(target, params);
      setMessages([]);
      triggerLiveSync("conversation_cleared", { orderId, target });
    } catch (err) {
      setError(err.message || "Failed to clear conversation.");
    }
  };

  // Smart Auto-Scroll Behavior:
  // 1. Initial load -> instant jump to bottom (behavior: 'auto')
  // 2. New message sent by me OR user was near bottom -> smooth scroll to bottom
  // 3. User was scrolled up reading history -> preserve position, show modern "↓ New message" pill
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    if (isInitialLoadRef.current) {
      if (messages.length > 0) {
        el.scrollTop = el.scrollHeight;
        isInitialLoadRef.current = false;
      }
    } else if (messages.length > prevMessagesCountRef.current) {
      const lastMsg = messages[messages.length - 1];
      const isMyMessage =
        user?.role === lastMsg?.sender_role && String(user?.id) === String(lastMsg?.sender_id);

      if (isMyMessage || isNearBottom) {
        scrollToBottom("smooth");
      } else {
        setHasNewMessagesBelow(true);
        setShowScrollBottomBtn(true);
      }
    }
    prevMessagesCountRef.current = messages.length;
  }, [messages, isNearBottom, user, scrollToBottom]);

  // Dynamic Auto-Resizing Textarea with comfortable multi-line height
  const adjustTextareaHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(Math.max(el.scrollHeight, 96), 220);
    el.style.height = `${newHeight}px`;
  };

  const handleTextChange = (e) => {
    setText(e.target.value);
    adjustTextareaHeight();
  };

  // Keyboard shortcut: Ctrl+Enter (or Cmd+Enter) to send, Enter creates newline
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  async function handleSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    if (orderId && selectedRole === "deliveryman" && !participants?.deliveryman) {
      setError("Cannot send message: No deliveryman assigned to this order yet.");
      return;
    }

    setSending(true);
    setError("");

    // Clear input immediately for instant responsiveness
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "96px";
      textareaRef.current.focus();
    }

    try {
      await sendDeliveryMessage({
        order_id: orderId || null,
        message: trimmed,
        recipient_role: selectedRole || (user?.role === "admin" ? null : "admin"),
        recipient_id: selectedId || null
      });

      triggerLiveSync("message_sent", { orderId });
      await fetchMessages(false);
      scrollToBottom("smooth");
    } catch (err) {
      // Restore draft text if sending failed
      setText(trimmed);
      adjustTextareaHeight();
      setError(err.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  }

  // Define tab buttons depending on user role
  const getTabs = () => {
    if (!orderId) return [];

    const tabs = [];
    const myRole = user?.role;

    // Buyer tab
    if (myRole !== "customer") {
      tabs.push({
        role: "customer",
        id: participants?.customer?.id,
        label: `Buyer (${participants?.customer?.name || "Customer"})`,
        available: true
      });
    }

    // Seller tab
    if (myRole !== "seller") {
      const seller = participants?.sellers?.[0];
      tabs.push({
        role: "seller",
        id: seller?.id,
        label: `Seller (${seller?.name || "Store"})`,
        available: true
      });
    }

    // Deliveryman tab
    if (myRole !== "deliveryman") {
      const hasDriver = !!participants?.deliveryman;
      tabs.push({
        role: "deliveryman",
        id: participants?.deliveryman?.id,
        label: hasDriver
          ? `Deliveryman (${participants.deliveryman.name})`
          : "Deliveryman (Not Assigned)",
        available: hasDriver,
        isUnassigned: !hasDriver
      });
    }

    // Admin tab
    if (myRole !== "admin") {
      tabs.push({
        role: "admin",
        id: null,
        label: "Admin Support",
        available: true
      });
    }

    return tabs;
  };

  const tabs = getTabs();
  const isDeliverymanUnassigned = orderId && selectedRole === "deliveryman" && !participants?.deliveryman;

  const headerTitle = orderId
    ? `Order #${orderId} Messages`
    : "Admin Support & Appeals";
  const headerSubtitle = orderId
    ? "Communicate directly with order participants"
    : "Direct communication with platform administrators";

  return (
    <section className="delivery-chat" aria-label={`Chat for ${headerTitle}`}>
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-main">
          <div>
            <h4>💬 {headerTitle}</h4>
            <span className="chat-sub">{headerSubtitle}</span>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {(user?.role === "admin" || (orderId && selectedRole !== "admin")) && messages.length > 0 && (
              <button
                type="button"
                className="text-button"
                style={{ fontSize: "0.82rem", color: "#dc2626" }}
                title={user?.role === "admin" ? "Delete conversation" : "Delete this conversation from your account"}
                onClick={handleClearConversation}
              >
                {user?.role === "admin" ? "🗑 Delete conversation" : "🗑 Clear chat for me"}
              </button>
            )}
            {onClose && (
              <button type="button" className="text-button" onClick={onClose}>
                ✕ Close
              </button>
            )}
          </div>
        </div>

        {/* Participant Switcher Tabs for Order */}
        {tabs.length > 0 && (
          <div className="chat-participant-tabs" role="tablist">
            {tabs.map((tab) => {
              const isActive = selectedRole === tab.role;
              return (
                <button
                  key={tab.role}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`chat-tab-btn ${isActive ? "active" : ""} ${tab.isUnassigned ? "unassigned-tab" : ""}`}
                  onClick={() => {
                    setSelectedRole(tab.role);
                    setSelectedId(tab.id);
                  }}
                >
                  {tab.role === "deliveryman" ? "🚚 " : tab.role === "admin" ? "🛡️ " : tab.role === "seller" ? "🏪 " : "👤 "}
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Message History Area with Smooth Scroll Anchor */}
      <div
        className="chat-messages-container"
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {loading ? (
          <div className="chat-loading">
            <Spinner label="Loading conversation…" />
          </div>
        ) : isDeliverymanUnassigned ? (
          <div className="chat-empty chat-no-driver">
            <span className="no-driver-icon">🚚</span>
            <p>No deliveryman assigned</p>
            <span className="hint">
              A deliveryman has not been assigned to this order yet. Once an approved deliveryman accepts the delivery request, messaging will become available immediately.
            </span>
          </div>
        ) : error && messages.length === 0 ? (
          <div className="chat-error">
            <p className="message error">{error}</p>
            <button
              type="button"
              className="text-button"
              onClick={() => fetchMessages(true)}
            >
              Retry
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <p>No messages yet.</p>
            <span className="hint">Send a message below to start this conversation.</span>
          </div>
        ) : (
          messages.map((m, idx) => {
            const isMe = user?.role === m.sender_role && String(user?.id) === String(m.sender_id);
            const senderLabel = isMe
              ? "You"
              : m.sender_role === "deliveryman"
              ? "🚚 Deliveryman"
              : m.sender_role === "seller"
              ? "🏪 Seller"
              : m.sender_role === "admin"
              ? "🛡️ Admin Support"
              : "👤 Customer";

            const timeStr = m.created_at
              ? new Date(m.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "";

            // Check if day changed from previous message for date dividers
            const currentDateStr = formatMessageDate(m.created_at);
            const prevDateStr = idx > 0 ? formatMessageDate(messages[idx - 1]?.created_at) : null;
            const showDateDivider = currentDateStr && currentDateStr !== prevDateStr;

            const isAdminSupportMessage =
              m.sender_role === "admin" ||
              m.recipient_role === "admin" ||
              m.order_id === null ||
              supportMode ||
              selectedRole === "admin";

            // Per-user soft deletion: anyone can delete their own text or any message from their account.
            // It will remain visible on the other end unless the other person deletes it.
            const canDelete = true;

            return (
              <div key={m.message_id || `msg_${idx}`} className="chat-message-group">
                    {showDateDivider && (
                      <div className="chat-date-divider">
                        <span>{currentDateStr}</span>
                      </div>
                    )}
                    <div className={`chat-message-row ${isMe ? "row-me" : "row-them"}`}>
                      <div className={`chat-bubble ${isMe ? "bubble-me" : "bubble-them"}`}>
                        <div className="bubble-meta">
                          <strong>{senderLabel}</strong>
                          <div className="bubble-time-status">
                            {timeStr && <span className="bubble-time">{timeStr}</span>}
                            {isMe && (
                              <span
                                className={`msg-status-check ${m.is_read ? "status-read" : "status-sent"}`}
                                title={m.is_read ? "Read" : "Sent"}
                              >
                                {m.is_read ? "✓✓" : "✓"}
                              </span>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                className="msg-delete-btn"
                                title="Delete message"
                                aria-label="Delete message"
                                onClick={() => handleDeleteMessage(m.message_id)}
                                disabled={deletingMessageId === m.message_id}
                              >
                                {deletingMessageId === m.message_id ? "…" : "🗑"}
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="bubble-text">{m.message}</p>
                      </div>
                    </div>
                  </div>
                );
          })
        )}

        {/* Floating Quick-Jump to Bottom Pill Button */}
        {showScrollBottomBtn && (
          <button
            type="button"
            className={`chat-scroll-bottom-pill ${hasNewMessagesBelow ? "has-new-alert" : ""}`}
            onClick={() => scrollToBottom("smooth")}
            title="Scroll to latest messages"
          >
            {hasNewMessagesBelow ? (
              <>
                <span className="scroll-pill-dot" />
                <span>New message ↓</span>
              </>
            ) : (
              <span>↓ Latest</span>
            )}
          </button>
        )}
      </div>

      {error && messages.length > 0 && (
        <p className="message error chat-inline-error">{error}</p>
      )}

      {/* Modern Texting Composer Area - Textarea ABOVE Send Button */}
      <form className="chat-composer" onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={
            isDeliverymanUnassigned
              ? "Messaging disabled: No deliveryman assigned yet."
              : "Write your message here..."
          }
          maxLength={2000}
          rows={4}
          disabled={sending || isDeliverymanUnassigned}
          required
        />
        <div className="chat-composer-footer">
          <span className="composer-hint">
            Press <strong>Ctrl + Enter</strong> to send
          </span>
          <button
            type="submit"
            className={`btn-send-message ${text.trim() ? "ready-to-send" : ""}`}
            disabled={sending || !text.trim() || isDeliverymanUnassigned}
            onMouseDown={(e) => e.preventDefault()} /* Prevents textarea blur before click! */
            title="Send message (Ctrl+Enter)"
            aria-label="Send message"
          >
            {sending ? (
              <>
                <span className="send-spinner" />
                <span>Sending…</span>
              </>
            ) : (
              <>
                <span>Send Message</span>
                <svg
                  className="send-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </>
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
