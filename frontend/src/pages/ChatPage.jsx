import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  FileText,
  ImagePlus,
  SendHorizontal,
  ShieldAlert,
  Sparkles,
  Square,
  Trash2,
  User,
  X,
} from 'lucide-react'
import api from '../services/api'
import { FormattedMessage } from '../components/MarkdownRenderer'
import { ModelSelector } from '../components/ModelSelector'

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
  if (detail) {
    return typeof detail === 'string' ? detail : JSON.stringify(detail)
  }
  return fallback
}

// Individual Message Component
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
          <div className="space-y-2">
            {message.image && (
              <div className="overflow-hidden rounded-xl border border-white/20 bg-black/10">
                <img
                  src={message.image}
                  alt="User uploaded prescription or medicine"
                  className="max-h-60 max-w-xs object-cover rounded-xl cursor-pointer hover:opacity-95 transition"
                  onClick={() => window.open(message.image, '_blank')}
                  title="Click to view full image"
                />
              </div>
            )}
            {message.content && (
              <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed">
                {message.content}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {message.model && (
              <div className="flex items-center gap-1.5 pb-1 text-[11px] font-semibold text-teal-700">
                <Sparkles className="h-3 w-3" />
                <span>{message.model}</span>
              </div>
            )}

            <FormattedMessage content={message.content} />

            {Array.isArray(message.sources) && message.sources.length > 0 && (
              <div className="mt-3 border-t border-slate-200/70 pt-2.5">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <span className="flex items-center gap-1 font-semibold text-slate-600">
                    <FileText className="h-3 w-3 text-teal-600" />
                    Sources:
                  </span>
                  {message.sources.map((source, sourceIndex) => (
                    <div
                      key={`${source.section || source.source || 'source'}-${sourceIndex}`}
                      className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 shadow-2xs"
                    >
                      <span className="font-semibold text-slate-800">
                        {source.section || source.source || 'Medical Document'}
                      </span>
                      {Array.isArray(source.references) &&
                        source.references.map((reference, refIdx) =>
                          /^https?:\/\//i.test(reference) ? (
                            <a
                              key={refIdx}
                              href={reference}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-teal-700 underline hover:text-teal-900"
                            >
                              [Ref {refIdx + 1}]
                            </a>
                          ) : null,
                        )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {message.safety_notice && (
              <div className="flex items-start gap-1.5 rounded-lg border border-amber-200/60 bg-amber-50/80 px-2.5 py-1.5 text-[11px] text-amber-900 leading-relaxed">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" />
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

  // Model Selection & Gemini Usage state
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem('pha_selected_model') || 'gemini-3.8-flash'
  })
  const [customApiKey, setCustomApiKey] = useState(() => {
    return localStorage.getItem('pha_custom_gemini_key') || ''
  })
  const [usage, setUsage] = useState(null)

  // Media Attachment state (Prescriptions / Medicines)
  const [attachedImage, setAttachedImage] = useState(null)

  const messagesContainerRef = useRef(null)
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const abortControllerRef = useRef(null)
  const requestInProgressRef = useRef(false)

  // Save selected model
  const handleSelectModel = (modelId) => {
    setSelectedModel(modelId)
    localStorage.setItem('pha_selected_model', modelId)
  }

  // Save custom API key
  const handleSaveApiKey = (key) => {
    setCustomApiKey(key)
    if (key) {
      localStorage.setItem('pha_custom_gemini_key', key)
    } else {
      localStorage.removeItem('pha_custom_gemini_key')
    }
  }

  // Scroll to bottom
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

  // Fetch daily Gemini usage
  const fetchUsage = useCallback(async () => {
    try {
      const response = await api.get('/api/chat/usage')
      if (response.data) {
        setUsage(response.data)
      }
    } catch (err) {
      console.debug('Could not fetch daily usage:', err)
    }
  }, [])

  // Restore history & load initial usage
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
    fetchUsage()

    return () => {
      cancelled = true
    }
  }, [fetchUsage])

  // Scroll on update
  useEffect(() => {
    requestAnimationFrame(() => scrollToBottom(false))
  }, [messages.length, loading, scrollToBottom])

  // Stop generation in progress
  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    requestInProgressRef.current = false
    setLoading(false)
    setMessages((current) => [
      ...current,
      {
        role: 'assistant',
        content: '_Response generation was stopped by the user._',
        created_at: formatTime(),
      },
    ])
  }

  // Handle Image File Selection
  const handleImageFileChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (JPEG, PNG, WEBP).')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('Image size must be under 10MB.')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      setAttachedImage({
        dataUrl: e.target?.result,
        name: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
      })
      // If user had default model, auto-switch to Gemini because image analysis is vision-based
      if (selectedModel !== 'gemini-3.8-flash') {
        handleSelectModel('gemini-3.8-flash')
      }
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  // Quick suggestions for attached media
  const applyPromptSuggestion = (text) => {
    setInput(text)
  }

  // Send question
  const sendQuestion = async () => {
    const questionText = input.trim()
    const imageData = attachedImage?.dataUrl || null

    if ((!questionText && !imageData) || requestInProgressRef.current || resetting || historyLoading) {
      return
    }

    requestInProgressRef.current = true
    setInput('')
    setAttachedImage(null)
    setLoading(true)
    setErrorMessage('')

    const controller = new AbortController()
    abortControllerRef.current = controller

    const userMsg = {
      role: 'user',
      content: questionText,
      image: imageData,
      created_at: formatTime(),
    }

    setMessages((current) => [...current, userMsg])

    try {
      const response = await api.post(
        '/api/chat',
        {
          question: questionText || 'Please analyze this medical image / doctor prescription in detail.',
          conversation_id: conversationId,
          model: selectedModel,
          image: imageData,
          custom_api_key: customApiKey || undefined,
        },
        { signal: controller.signal },
      )

      const nextConversationId = response.data?.conversation_id
      if (nextConversationId) setConversationId(nextConversationId)

      if (response.data?.usage) {
        setUsage(response.data.usage)
      }

      const assistantMsg = {
        role: 'assistant',
        content:
          response.data?.answer ||
          'I could not generate an answer. Please try asking again.',
        sources: Array.isArray(response.data?.sources)
          ? response.data.sources
          : [],
        safety_notice: response.data?.safety_notice || '',
        model: response.data?.model || 'Clinical Assistant',
        created_at: formatTime(),
      }

      setMessages((current) => [...current, assistantMsg])
    } catch (error) {
      if (controller.signal.aborted) {
        return
      }

      console.error('Error sending chat question:', error)
      const errorDetail = getApiErrorMessage(
        error,
        'I could not connect to the chat service. Please check that the backend is running and try again.',
      )

      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: `⚠️ **Request Error:** ${errorDetail}`,
          created_at: formatTime(),
        },
      ])
    } finally {
      abortControllerRef.current = null
      requestInProgressRef.current = false
      setLoading(false)
    }
  }

  // Reset thread
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
      setAttachedImage(null)
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
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 md:px-5 md:py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 shadow-xs overflow-hidden">
            <img src="/logo.png" alt="PHA" className="h-8 w-8 object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-medium text-slate-500">
                Clinical Support Assistant
              </p>
              {usage && (
                <span className="hidden sm:inline-flex items-center rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">
                  Gemini: {usage.used}/{usage.limit || 20} today
                </span>
              )}
            </div>
            <h2 className="text-sm font-semibold text-slate-800 md:text-base">
              Health Support &amp; RAG Knowledge Base
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 sm:p-5 text-xs sm:text-sm text-slate-600 space-y-3">
            <div>
              <p className="mb-1 font-semibold text-slate-800">
                Welcome to your Personal Health Assistant!
              </p>
              <p className="leading-relaxed">
                Ask a clinical health question, or attach a photo of your medicine or doctor prescription to transcribe dosages and understand what was prescribed.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 pt-1">
              <button
                type="button"
                onClick={() => setInput('What are the key differences between cold and flu symptoms?')}
                className="rounded-xl border border-slate-200 bg-white p-2.5 text-left text-xs font-medium text-slate-700 hover:border-teal-300 hover:bg-teal-50/50 transition shadow-2xs"
              >
                🌡️ Cold vs Flu Symptoms
              </button>
              <button
                type="button"
                onClick={() => setInput('What precautions should I take when taking antibiotics like amoxicillin?')}
                className="rounded-xl border border-slate-200 bg-white p-2.5 text-left text-xs font-medium text-slate-700 hover:border-teal-300 hover:bg-teal-50/50 transition shadow-2xs"
              >
                💊 Antibiotic Usage &amp; Precautions
              </button>
            </div>
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
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 py-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-teal-600 [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-teal-600 [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-teal-600" />
                </div>
                <span className="text-xs font-medium text-slate-500">
                  Assistant is generating answer…
                </span>
                <button
                  type="button"
                  onClick={stopGeneration}
                  className="ml-2 inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition"
                  title="Stop generating response"
                >
                  <Square className="h-2.5 w-2.5 fill-current" /> Stop
                </button>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="border-t border-slate-200 bg-slate-50/60 p-2.5 sm:p-3.5 space-y-2">
        {/* Attached Image Preview & Quick Suggestion Chips */}
        {attachedImage && (
          <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img
                  src={attachedImage.dataUrl}
                  alt="Preview"
                  className="h-12 w-12 rounded-xl border border-teal-300 object-cover shadow-2xs"
                />
                <div>
                  <p className="text-xs font-semibold text-slate-800 truncate max-w-xs">
                    {attachedImage.name}
                  </p>
                  <p className="text-[10px] text-teal-700 font-medium">
                    {attachedImage.size} • Ready for Gemini Vision Analysis
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAttachedImage(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-teal-100 hover:text-slate-600 transition"
                title="Remove image"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Smart Action Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800">
                Ask:
              </span>
              <button
                type="button"
                onClick={() =>
                  applyPromptSuggestion(
                    'What is this medicine related to? Please explain its active ingredient, uses, dosage, and side effects.',
                  )
                }
                className="rounded-lg border border-teal-300 bg-white px-2 py-0.5 text-[11px] font-medium text-teal-800 hover:bg-teal-100 transition shadow-2xs"
              >
                💊 What is this medicine?
              </button>
              <button
                type="button"
                onClick={() =>
                  applyPromptSuggestion(
                    'Please transcribe and explain this doctor prescription. What medications and dosages are written, and what instructions should I follow?',
                  )
                }
                className="rounded-lg border border-teal-300 bg-white px-2 py-0.5 text-[11px] font-medium text-teal-800 hover:bg-teal-100 transition shadow-2xs"
              >
                📋 Explain doctor prescription
              </button>
            </div>
          </div>
        )}

        {/* Text Input Row */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageFileChange}
            accept="image/*"
            className="hidden"
          />

          {/* Attach Image Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={historyLoading || resetting || loading}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl border border-slate-300 bg-white text-slate-600 shadow-2xs hover:border-teal-500 hover:bg-teal-50/50 hover:text-teal-700 transition disabled:opacity-50"
            title="Attach medicine photo or doctor prescription"
          >
            <ImagePlus className="h-5 w-5" />
          </button>

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
            className="w-full resize-none rounded-xl sm:rounded-2xl border border-slate-300 bg-white px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm text-slate-800 outline-none ring-0 transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 disabled:opacity-60"
            placeholder={
              attachedImage
                ? 'Ask about this medicine or prescription…'
                : 'Ask a health question (e.g. fever remedies, cold vs flu, hydration)…'
            }
          />

          {/* Send or Stop Button */}
          {loading ? (
            <button
              type="button"
              onClick={stopGeneration}
              className="inline-flex shrink-0 items-center justify-center gap-1 rounded-xl sm:rounded-2xl bg-rose-600 px-3.5 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700"
              title="Stop response"
            >
              <Square className="h-4 w-4 fill-current" />
              <span className="hidden sm:inline">Stop</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={sendQuestion}
              disabled={historyLoading || resetting || (!input.trim() && !attachedImage)}
              className="inline-flex shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-teal-700 px-3.5 py-2 sm:px-4 sm:py-2.5 text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40"
              title="Send message"
            >
              <SendHorizontal className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          )}
        </div>

        {/* Bottom Toolbar: Model Selector & Usage */}
        <div className="flex items-center justify-between pt-1">
          <ModelSelector
            selectedModelId={selectedModel}
            onSelectModel={handleSelectModel}
            usage={usage}
            customApiKey={customApiKey}
            onSaveApiKey={handleSaveApiKey}
          />

          <span className="text-[11px] text-slate-400">
            {selectedModel.includes('gemini')
              ? 'Gemini Multimodal Active (20/day limit)'
              : 'Default RAG Knowledge Base'}
          </span>
        </div>
      </div>
    </div>
  )
}
