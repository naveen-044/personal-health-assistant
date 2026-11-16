import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  FileText,
  SendHorizontal,
  ShieldAlert,
  Trash2,
  User,
} from 'lucide-react'
import api from '../services/api'

// Safely parse **bold text** without dangerouslySetInnerHTML.
const BoldParser = memo(function BoldParser({ text }) {
  if (!text) return null
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
})

// Render simple Markdown: headings, tables, bullets, and bold text cleanly.
const FormattedMessage = memo(function FormattedMessage({ content }) {
  if (!content) return null

  const lines = content.split('\n')
  const blocks = []
  let tableBuffer = []

  const flushTable = () => {
    if (tableBuffer.length > 0) {
      blocks.push({ type: 'table', rows: [...tableBuffer] })
      tableBuffer = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const trimmed = rawLine.trim()

    // Detect markdown table rows: | col | col |
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2) {
      // Check if it's a separator row like |---|---|
      const isSeparator = /^\|[\s-:]+\|[\s-:]+\|?/.test(trimmed)
      if (!isSeparator) {
        const cells = trimmed
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim())
        tableBuffer.push(cells)
      }
      continue
    }

    flushTable()

    if (!trimmed) {
      blocks.push({ type: 'space' })
    } else if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'h3', text: trimmed.replace(/^###\s+/, '') })
    } else if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h2', text: trimmed.replace(/^##\s+/, '') })
    } else if (trimmed.startsWith('# ')) {
      blocks.push({ type: 'h1', text: trimmed.replace(/^#\s+/, '') })
    } else if (/^[-•*]\s+/.test(trimmed)) {
      blocks.push({ type: 'bullet', text: trimmed.replace(/^[-•*]\s+/, '') })
    } else {
      blocks.push({ type: 'p', text: trimmed })
    }
  }
  flushTable()

  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {blocks.map((block, idx) => {
        if (block.type === 'space') {
          return <div key={idx} className="h-1" />
        }

        if (block.type === 'h1' || block.type === 'h2' || block.type === 'h3') {
          return (
            <h4
              key={idx}
              className="pt-2 pb-0.5 text-[14px] font-semibold text-slate-900"
            >
              <BoldParser text={block.text} />
            </h4>
          )
        }

        if (block.type === 'table') {
          if (block.rows.length === 0) return null
          const header = block.rows[0]
          const bodyRows = block.rows.slice(1)

          return (
            <div
              key={idx}
              className="my-2 max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs [-webkit-overflow-scrolling:touch]"
            >
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                {header && (
                  <thead className="bg-slate-50 font-semibold text-slate-800">
                    <tr>
                      {header.map((col, colIdx) => (
                        <th key={colIdx} className="px-3 py-2 whitespace-nowrap">
                          <BoldParser text={col} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {bodyRows.map((row, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-slate-50/50">
                      {row.map((cell, cellIdx) => (
                        <td key={cellIdx} className="px-3 py-2 align-top">
                          <BoldParser text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }

        if (block.type === 'bullet') {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 text-slate-700">
              <span className="select-none font-bold leading-5 text-brand-600">
                •
              </span>
              <span className="flex-1">
                <BoldParser text={block.text} />
              </span>
            </div>
          )
        }

        return (
          <p key={idx} className="text-slate-700">
            <BoldParser text={block.text} />
          </p>
        )
      })}
    </div>
  )
})

function formatTime(value) {
  if (!value) {
    return new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (typeof value === 'string' && /am|pm/i.test(value)) return value

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getApiErrorMessage(error, fallback) {
  const detail = error.response?.data?.detail
  if (import.meta.env.DEV && detail) {
    return `${fallback} Details: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`
  }
  return fallback
}

// Memoized individual message item to prevent re-rendering when typing
const ChatMessageItem = memo(function ChatMessageItem({ message }) {
  const isUser = message.role === 'user'

  return (
    <div
      className={`flex items-end gap-2.5 ${
        isUser ? 'justify-end' : 'justify-start'
      }`}
    >
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-50 shadow-xs overflow-hidden">
          <img src="/logo.png" alt="PHA" className="h-6 w-6 object-contain" />
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

            {Array.isArray(message.sources) && message.sources.length > 0 && (
              <div className="mt-3 border-t border-slate-200/70 pt-2">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <span className="flex items-center gap-1 font-semibold text-slate-600">
                    <FileText className="h-3 w-3 text-brand-600" />
                    Sources:
                  </span>
                  {message.sources.map((source, sourceIndex) => (
                    <div
                      key={`${source.section || source.source || 'source'}-${sourceIndex}`}
                      className="flex flex-col gap-1"
                    >
                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {source.section || source.source || 'Health document'}
                      </span>
                      {Array.isArray(source.references) &&
                        source.references.map((reference) =>
                          /^https?:\/\//i.test(reference) ? (
                            <a
                              key={reference}
                              href={reference}
                              target="_blank"
                              rel="noreferrer"
                              className="max-w-64 truncate text-[10px] text-brand-700 underline"
                            >
                              {reference}
                            </a>
                          ) : null,
                        )}
                    </div>
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
})

export default function ChatPage() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [conversationId, setConversationId] = useState(null)
  const messagesContainerRef = useRef(null)
  const messagesEndRef = useRef(null)
  const requestInProgressRef = useRef(false)

  // Scroll to bottom smoothly on desktop, instantly without jank on mobile
  const scrollToBottom = useCallback((smooth = false) => {
    if (!messagesContainerRef.current) return
    const container = messagesContainerRef.current

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    if (isMobile || !smooth) {
      container.scrollTop = container.scrollHeight
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
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
            getApiErrorMessage(
              error,
              'Could not load saved chat history. Check that the backend is running, then refresh the page.',
            ),
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

  // Scroll when messages count changes or loading flips
  useEffect(() => {
    requestAnimationFrame(() => scrollToBottom(false))
  }, [messages.length, loading, scrollToBottom])

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
          content: getApiErrorMessage(
            error,
            'I could not connect to the chat service. Please check that the backend is running and try again.',
          ),
          created_at: formatTime(),
        },
      ])
    } finally {
      requestInProgressRef.current = false
      setLoading(false)
    }
  }

  const resetThread = async () => {
    if (loading || resetting || historyLoading) return

    setErrorMessage('')
    setResetting(true)

    try {
      if (conversationId) {
        try {
          await api.delete(
            `/api/chat/history/${encodeURIComponent(conversationId)}`,
          )
        } catch (delErr) {
          if (delErr.response?.status !== 404) {
            throw delErr
          }
        }
      }

      setMessages([])
      setConversationId(null)
      setInput('')
    } catch (error) {
      console.error('Error resetting chat:', error)
      setErrorMessage(
        getApiErrorMessage(
          error,
          'The chat could not be deleted from saved history. Please try again.',
        ),
      )
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[380px] md:h-[76vh] flex-col overflow-hidden rounded-2xl md:rounded-3xl border border-slate-200 bg-white shadow-soft">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 md:px-5 md:py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 shadow-xs overflow-hidden">
            <img src="/logo.png" alt="PHA" className="h-8 w-8 object-contain" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500">
              Clinical Support Assistant
            </p>
            <h2 className="text-sm font-semibold text-slate-800 md:text-base">
              Health Support &amp; RAG Knowledge Base
            </h2>
          </div>
        </div>

        <button
          type="button"
          onClick={resetThread}
          disabled={loading || resetting || historyLoading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          title="Delete the current saved conversation"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{resetting ? 'Resetting…' : 'Reset Chat'}</span>
        </button>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs md:text-sm text-amber-900"
        >
          {errorMessage}
        </div>
      )}

      {/* Message List */}
      <div
        ref={messagesContainerRef}
        className="flex-1 space-y-4 overflow-y-auto px-3.5 py-4 sm:px-5 sm:py-5 overscroll-contain will-change-scroll [-webkit-overflow-scrolling:touch]"
      >
        {historyLoading && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-xs sm:text-sm text-slate-600">
            <span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-teal-700/20 border-t-teal-700" />
            Loading saved conversation…
          </div>
        )}

        {!historyLoading && messages.length === 0 && !loading && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 sm:p-5 text-xs sm:text-sm text-slate-600">
            <p className="mb-1 font-semibold text-slate-800">
              Welcome to your Personal Health Assistant!
            </p>
            <p className="leading-relaxed">
              Ask a general health question, such as “What should I do for a
              fever?”, “Cold vs flu symptoms”, or “What is hydration?”. Answers
              are grounded in medical references. Educational only; does not replace professional medical care.
            </p>
          </div>
        )}

        {messages.map((message, index) => (
          <ChatMessageItem
            key={`${message.role}-${message.created_at || index}-${index}`}
            message={message}
          />
        ))}

        {loading && (
          <div className="flex items-end justify-start gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-50 shadow-xs overflow-hidden">
              <img src="/logo.png" alt="PHA" className="h-6 w-6 object-contain" />
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

      {/* Input Bar */}
      <div className="border-t border-slate-200 bg-slate-50/40 p-2.5 sm:p-4">
        <div className="flex gap-2 sm:gap-3">
          <textarea
            rows={1}
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
            enterKeyHint="send"
            autoCapitalize="sentences"
            className="w-full resize-none rounded-xl sm:rounded-2xl border border-slate-300 bg-white px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-slate-800 outline-none ring-0 transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:opacity-60"
            placeholder="Ask a health question (e.g. fever remedies, cold vs flu, hydration)…"
          />
          <button
            type="button"
            onClick={sendQuestion}
            disabled={loading || resetting || historyLoading || !input.trim()}
            className="inline-flex shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-brand-600 px-3.5 py-2 sm:px-5 sm:py-3 text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-brand-600"
            title="Send message"
          >
            <SendHorizontal className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
