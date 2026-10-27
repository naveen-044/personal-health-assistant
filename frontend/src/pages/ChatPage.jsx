import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bot,
  FileText,
  SendHorizontal,
  ShieldAlert,
  Trash2,
  User,
} from 'lucide-react'
import api from '../services/api'

// Render simple Markdown-style headings, bullets, and bold text safely.
function FormattedMessage({ content }) {
  if (!content) return null

  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {content.split('\n').map((line, idx) => {
        const trimmed = line.trim()

        if (!trimmed) {
          return <div key={idx} className="h-1" />
        }

        if (trimmed.startsWith('### ')) {
          return (
            <h4
              key={idx}
              className="pt-2 pb-0.5 text-[14px] font-semibold text-slate-900"
            >
              {trimmed.replace(/^###\s+/, '')}
            </h4>
          )
        }

        if (/^[-•*]\s+/.test(trimmed)) {
          const itemText = trimmed.replace(/^[-•*]\s+/, '')
          return (
            <div
              key={idx}
              className="flex items-start gap-2 pl-1 text-slate-700"
            >
              <span className="select-none font-bold leading-5 text-brand-600">
                •
              </span>
              <span className="flex-1">
                <BoldParser text={itemText} />
              </span>
            </div>
          )
        }

        return (
          <p key={idx} className="text-slate-700">
            <BoldParser text={trimmed} />
          </p>
        )
      })}
    </div>
  )
}

function BoldParser({ text }) {
  if (!text) return null

  // Split around **bold text** without interpreting HTML.
  const parts = text.split(/(\*\*.*?\*\*)/g)

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
          return (
            <strong key={index} className="font-semibold text-slate-900">
              {part.slice(2, -2)}
            </strong>
          )
        }

        return <span key={index}>{part}</span>
      })}
    </>
  )
}

function formatTime(value) {
  if (!value) {
    return new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Preserve an already formatted time such as "03:17 PM".
  if (typeof value === 'string' && /am|pm/i.test(value)) return value

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ChatPage() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [conversationId, setConversationId] = useState(null)
  const messagesEndRef = useRef(null)
  const requestInProgressRef = useRef(false)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Restore the most recent saved conversation after a page refresh.
  useEffect(() => {
    let cancelled = false

    async function loadHistory() {
      setHistoryLoading(true)
      setErrorMessage('')

      try {
        const response = await api.get('/api/chat/history')
        if (cancelled) return

        const conversations = Array.isArray(response.data?.conversations)
          ? response.data.conversations
          : []

        // Ignore malformed entries and use the most recent conversation.
        const latest = [...conversations]
          .filter((item) => item && item.conversation_id)
          .sort((a, b) => {
            const aTime = new Date(a.updated_at || a.created_at || 0).getTime()
            const bTime = new Date(b.updated_at || b.created_at || 0).getTime()
            return aTime - bTime
          })
          .at(-1)

        if (latest) {
          setConversationId(latest.conversation_id)
          setMessages(Array.isArray(latest.messages) ? latest.messages : [])
        } else {
          setConversationId(null)
          setMessages([])
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Error loading chat history:', error)
          setErrorMessage(
            'Could not load saved chat history. Check that the backend is running, then refresh the page.',
          )
        }
      } finally {
        if (!cancelled) setHistoryLoading(false)
      }
    }

    loadHistory()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading, scrollToBottom])

  const sendQuestion = async () => {
    const question = input.trim()
    if (!question || requestInProgressRef.current || resetting || historyLoading) {
      return
    }

    requestInProgressRef.current = true
    setInput('')
    setLoading(true)
    setErrorMessage('')

    const userMsg = {
      role: 'user',
      content: question,
      created_at: formatTime(),
    }

    setMessages((current) => [...current, userMsg])

    try {
      const response = await api.post('/api/chat', {
        question,
        conversation_id: conversationId,
      })

      const nextConversationId = response.data?.conversation_id
      if (nextConversationId) setConversationId(nextConversationId)

      const assistantMsg = {
        role: 'assistant',
        content:
          response.data?.answer ||
          'I could not generate an answer. Please try asking again.',
        sources: Array.isArray(response.data?.sources)
          ? response.data.sources
          : [],
        safety_notice: response.data?.safety_notice || '',
        created_at: formatTime(),
      }

      setMessages((current) => [...current, assistantMsg])
    } catch (error) {
      console.error('Error sending chat question:', error)
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content:
            'I could not connect to the chat service. Please check that the backend is running and try again.',
          created_at: formatTime(),
        },
      ])
    } finally {
      requestInProgressRef.current = false
      setLoading(false)
    }
  }

  // Delete the saved conversation first. Only clear the screen if deletion succeeds.
  // Otherwise a refresh would load the still-saved conversation again.
  const resetThread = async () => {
    if (loading || resetting || historyLoading) return

    setErrorMessage('')
    setResetting(true)

    try {
      if (conversationId) {
        await api.delete(
          `/api/chat/history/${encodeURIComponent(conversationId)}`,
        )
      }

      setMessages([])
      setConversationId(null)
      setInput('')
    } catch (error) {
      console.error('Error resetting chat:', error)
      setErrorMessage(
        'The chat could not be deleted from saved history, so it may return after refresh. Check the backend DELETE /api/chat/history/{conversation_id} route and try again.',
      )
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="flex h-[76vh] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-brand-50 p-2 text-brand-700 shadow-sm">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">
              Clinical Support Assistant
            </p>
            <h2 className="font-semibold text-slate-800">
              Health Support &amp; RAG Knowledge Base
            </h2>
          </div>
        </div>

        <button
          type="button"
          onClick={resetThread}
          disabled={loading || resetting || historyLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          title="Delete the current saved conversation"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {resetting ? 'Resetting…' : 'Reset Chat'}
        </button>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900"
        >
          {errorMessage}
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {historyLoading && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5 text-sm text-slate-600">
            Loading saved conversation…
          </div>
        )}

        {!historyLoading && messages.length === 0 && !loading && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5 text-sm text-slate-600">
            <p className="mb-1 font-medium text-slate-800">
              Welcome to your Personal Health Assistant!
            </p>
            <p className="leading-relaxed">
              Ask a general health question, such as “What should I do for a
              fever?”, “Cold vs flu symptoms”, or “What is hydration?”. Answers
              may be based on indexed health documents. This chatbot is
              educational and does not replace professional medical advice.
            </p>
          </div>
        )}

        {messages.map((message, index) => {
          const isUser = message.role === 'user'

          return (
            <div
              key={`${message.role}-${message.created_at || index}-${index}`}
              className={`flex items-end gap-2.5 ${
                isUser ? 'justify-end' : 'justify-start'
              }`}
            >
              {!isUser && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 shadow-xs">
                  <Bot className="h-4 w-4" />
                </div>
              )}

              <div
                className={`max-w-2xl rounded-2xl px-4 py-3 shadow-xs ${
                  isUser
                    ? 'rounded-br-xs bg-brand-600 text-white'
                    : 'rounded-bl-xs border border-slate-200/80 bg-slate-50/80 text-slate-800'
                }`}
              >
                {isUser ? (
                  <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed">
                    {message.content}
                  </p>
                ) : (
                  <div className="space-y-3">
                    <FormattedMessage content={message.content} />

                    {Array.isArray(message.sources) &&
                      message.sources.length > 0 && (
                        <div className="mt-3 border-t border-slate-200/70 pt-2">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            <span className="flex items-center gap-1 font-semibold text-slate-600">
                              <FileText className="h-3 w-3 text-brand-600" />
                              Sources:
                            </span>
                            {message.sources.map((source, sourceIndex) => (
                              <span
                                key={`${source.section || source.source || 'source'}-${sourceIndex}`}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600"
                              >
                                {source.section || source.source || 'Health document'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                    {message.safety_notice && (
                      <div className="flex items-center gap-1.5 rounded-lg border border-amber-200/60 bg-amber-50/80 px-2.5 py-1.5 text-[11px] text-amber-800">
                        <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                        <span>{message.safety_notice}</span>
                      </div>
                    )}
                  </div>
                )}

                <p
                  className={`mt-1.5 text-[10px] ${
                    isUser ? 'text-right text-brand-100' : 'text-slate-400'
                  }`}
                >
                  {formatTime(message.created_at)}
                </p>
              </div>

              {isUser && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-600">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          )
        })}

        {loading && (
          <div className="flex items-end justify-start gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 shadow-xs">
              <Bot className="h-4 w-4" />
            </div>
            <div className="rounded-2xl rounded-bl-xs border border-slate-200/80 bg-slate-50/80 px-4 py-3 shadow-xs">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1 py-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-brand-600 [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-brand-600 [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-brand-600" />
                </div>
                <span className="text-xs font-medium text-slate-500">
                  Assistant is typing…
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-slate-200 bg-slate-50/40 p-4">
        <div className="flex gap-3">
          <textarea
            rows={2}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                sendQuestion()
              }
            }}
            disabled={historyLoading || resetting}
            className="w-full resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none ring-0 transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:opacity-60"
            placeholder="Ask a health question (e.g. fever remedies, cold vs flu, hydration)…"
          />
          <button
            type="button"
            onClick={sendQuestion}
            disabled={loading || resetting || historyLoading || !input.trim()}
            className="inline-flex items-center justify-center rounded-2xl bg-brand-600 px-5 text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-brand-600"
            title="Send message"
          >
            <SendHorizontal className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
