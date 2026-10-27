import { useEffect, useRef, useState } from 'react'
import { Bot, FileText, SendHorizontal, ShieldAlert, Trash2, User } from 'lucide-react'
import api from '../services/api'

// Helper to render bold markdown and clean bullet points
function FormattedMessage({ content }) {
  if (!content) return null

  const lines = content.split('\n')
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, idx) => {
        const trimmed = line.trim()
        if (!trimmed) {
          return <div key={idx} className="h-1" />
        }

        // Section header (### Heading)
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={idx} className="font-semibold text-slate-900 pt-2 pb-0.5 text-[14px]">
              {trimmed.replace(/^###\s+/, '')}
            </h4>
          )
        }

        // Bullet point
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
          const itemText = trimmed.replace(/^[-\u2022*]\s+/, '')
          return (
            <div key={idx} className="flex items-start gap-2 text-slate-700 pl-1">
              <span className="text-brand-600 font-bold leading-5 select-none">•</span>
              <span className="flex-1">
                <BoldParser text={itemText} />
              </span>
            </div>
          )
        }

        // Regular paragraph
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
  const parts = text.split(/(\*\*.*?\*\*)/g)
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
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

export default function ChatPage() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState(null)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const response = await api.get('/api/chat/history')
        const history = response.data.conversations || []
        if (history.length > 0) {
          const latest = history[history.length - 1]
          setConversationId(latest.conversation_id)
          setMessages(latest.messages || [])
        }
      } catch (error) {
        console.error('Error loading history:', error)
      }
    }
    loadHistory()
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading])

  const sendQuestion = async () => {
    if (!input.trim() || loading) return
    const question = input.trim()
    setInput('')
    setLoading(true)

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const userMsg = { role: 'user', content: question, created_at: now }
    setMessages((current) => [...current, userMsg])

    try {
      const response = await api.post('/api/chat', { question, conversation_id: conversationId })
      const nextConversationId = response.data.conversation_id
      setConversationId(nextConversationId)

      const assistantMsg = {
        role: 'assistant',
        content: response.data.answer,
        sources: response.data.sources || [],
        safety_notice: response.data.safety_notice || '',
        created_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      setMessages((current) => [...current, assistantMsg])
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: 'I encountered an error while processing your question. Please ensure the backend server is running and try again.',
          created_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ])
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const resetThread = async () => {
    if (conversationId) {
      try {
        await api.delete(`/api/chat/history/${conversationId}`)
      } catch (e) {
        console.error('Error resetting thread:', e)
      }
    }
    setMessages([])
    setConversationId(null)
  }

  return (
    <div className="flex h-[76vh] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-brand-50 p-2 text-brand-700 shadow-sm">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Clinical Support Assistant</p>
            <h2 className="font-semibold text-slate-800">Health Support & RAG Knowledge Base</h2>
          </div>
        </div>
        <button
          onClick={resetThread}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          title="Clear current conversation"
        >
          <Trash2 className="h-3.5 w-3.5" /> Reset Chat
        </button>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.length === 0 && !loading && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5 text-sm text-slate-600">
            <p className="font-medium text-slate-800 mb-1">Welcome to your Personal Health Assistant!</p>
            <p className="leading-relaxed">
              Ask any health or symptom question (e.g. <em>"What should I do for a fever?"</em>, <em>"Cold vs Flu symptoms"</em>, or <em>"Blood pressure targets"</em>).
              Answers are grounded in your indexed clinical documents and personalized with your health profile.
            </p>
          </div>
        )}

        {messages.map((message, index) => {
          const isUser = message.role === 'user'

          return (
            <div key={`${message.role}-${index}`} className={`flex items-end gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
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
                  <p className="whitespace-pre-wrap leading-relaxed text-sm font-medium">{message.content}</p>
                ) : (
                  <div className="space-y-3">
                    <FormattedMessage content={message.content} />

                    {/* Sources Badge */}
                    {message.sources && message.sources.length > 0 && (
                      <div className="mt-3 border-t border-slate-200/70 pt-2">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <span className="font-semibold text-slate-600 flex items-center gap-1">
                            <FileText className="h-3 w-3 text-brand-600" /> Sources:
                          </span>
                          {message.sources.map((s, sIdx) => (
                            <span
                              key={sIdx}
                              className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200"
                            >
                              {s.section || s.source}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Safety Notice */}
                    {message.safety_notice && (
                      <div className="flex items-center gap-1.5 rounded-lg bg-amber-50/80 px-2.5 py-1.5 text-[11px] text-amber-800 border border-amber-200/60">
                        <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                        <span>{message.safety_notice}</span>
                      </div>
                    )}
                  </div>
                )}

                <p className={`mt-1.5 text-[10px] ${isUser ? 'text-brand-100 text-right' : 'text-slate-400'}`}>
                  {message.created_at}
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

        {/* Proper Animated Typing Indicator */}
        {loading && (
          <div className="flex items-end gap-2.5 justify-start">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 shadow-xs">
              <Bot className="h-4 w-4" />
            </div>
            <div className="rounded-2xl rounded-bl-xs border border-slate-200/80 bg-slate-50/80 px-4 py-3 shadow-xs">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1 py-1">
                  <span className="h-2 w-2 rounded-full bg-brand-600 animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="h-2 w-2 rounded-full bg-brand-600 animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="h-2 w-2 rounded-full bg-brand-600 animate-bounce"></span>
                </div>
                <span className="text-xs font-medium text-slate-500">
                  Assistant is typing...
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-slate-200 p-4 bg-slate-50/40">
        <div className="flex gap-3">
          <textarea
            rows={2}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                sendQuestion()
              }
            }}
            className="w-full resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none ring-0 transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            placeholder="Ask a health question (e.g. fever remedies, cold vs flu, hydration)..."
          />
          <button
            onClick={sendQuestion}
            className="inline-flex items-center justify-center rounded-2xl bg-brand-600 px-5 text-white transition hover:bg-brand-700 disabled:opacity-40 disabled:hover:bg-brand-600 shadow-sm"
            disabled={loading || !input.trim()}
            title="Send message"
          >
            <SendHorizontal className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
