import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  Camera,
  Check,
  Clock,
  Copy,
  Edit3,
  FileText,
  History,
  ImagePlus,
  MessageSquare,
  Mic,
  MicOff,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  SendHorizontal,
  Share2,
  ShieldAlert,
  Sparkles,
  Square,
  Stethoscope,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import api from '../services/api'
import { FormattedMessage } from '../components/MarkdownRenderer'
import { ModelSelector } from '../components/ModelSelector'
import { useChat, encodeChatCode } from '../context/ChatContext'

// Downscale high-resolution images to prevent upload failures and payload timeouts
function downscaleImage(file, maxDimension = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let width = img.width
        let height = img.height

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width)
            width = maxDimension
          } else {
            width = Math.round((width * maxDimension) / height)
            height = maxDimension
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        resolve({
          dataUrl,
          name: file.name,
          size: `${Math.round((dataUrl.length * 0.75) / 1024)} KB`,
        })
      }
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Camera Capture Modal for desktop webcam snapshot
function CameraCaptureModal({ isOpen, onClose, onCapture }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [capturedDataUrl, setCapturedDataUrl] = useState(null)
  const [cameraError, setCameraError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setCapturedDataUrl(null)
    setCameraError('')

    navigator.mediaDevices
      ?.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } },
      })
      .then((s) => {
        streamRef.current = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.play()
        }
      })
      .catch((err) => {
        console.error('Camera access error:', err)
        setCameraError(
          'Could not access camera. Please verify device permissions.',
        )
      })

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }
  }, [isOpen])

  if (!isOpen) return null

  const takeSnapshot = () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    setCapturedDataUrl(dataUrl)
  }

  const handleConfirm = () => {
    if (capturedDataUrl) {
      onCapture({
        dataUrl: capturedDataUrl,
        name: `camera_capture_${Date.now()}.jpg`,
        size: `${Math.round((capturedDataUrl.length * 0.75) / 1024)} KB`,
      })
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">
            Capture Medicine or Doctor Prescription
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {cameraError ? (
          <div className="my-5 rounded-xl bg-rose-50 p-4 text-xs text-rose-700">
            {cameraError}
          </div>
        ) : (
          <div className="my-3 overflow-hidden rounded-xl bg-black aspect-video flex items-center justify-center relative">
            {capturedDataUrl ? (
              <img
                src={capturedDataUrl}
                alt="Captured"
                className="w-full h-full object-contain"
              />
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          {capturedDataUrl ? (
            <>
              <button
                type="button"
                onClick={() => setCapturedDataUrl(null)}
                className="rounded-xl border border-slate-300 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition"
              >
                Retake
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="rounded-xl bg-teal-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 transition"
              >
                Use Photo
              </button>
            </>
          ) : (
            <>
              <span className="text-[11px] text-slate-500">
                Center medicine or prescription in view
              </span>
              <button
                type="button"
                onClick={takeSnapshot}
                disabled={!!cameraError}
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 transition disabled:opacity-50"
              >
                <Camera className="h-4 w-4" />
                <span>Snap Photo</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Encrypted / Encoded Chat Code helpers are imported from ../context/ChatContext

// Share Modal for Encrypted Share Links
function ShareModal({ isOpen, onClose, conversationId, chatTitle, chatCode }) {
  const [copied, setCopied] = useState(false)
  if (!isOpen) return null

  const activeCode = chatCode || encodeChatCode(conversationId)
  const shareUrl = `${window.location.origin}/chat?c=${encodeURIComponent(activeCode)}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch (err) {
      console.error('Failed to copy share link:', err)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <Share2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Share Clinical Conversation</h3>
              <p className="text-[11px] text-slate-500">Encrypted URL share link</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Conversation Title</p>
            <p className="text-xs font-semibold text-slate-800 truncate mt-0.5">{chatTitle || 'Clinical Consultation'}</p>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-700 block mb-1.5">
              Encrypted Shareable URL
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700 outline-none select-all"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-teal-800 transition shadow-xs"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {copied && (
            <p className="text-[11px] font-medium text-emerald-700 flex items-center gap-1">
              <Check className="h-3 w-3" /> Share link copied to clipboard! Anyone with this link can view this consultation.
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function formatTime(value) {
  let date
  if (!value || value === 'just now') {
    date = new Date()
  } else if (typeof value === 'string' && /^\d{2}-\d{2}-\d{4}/.test(value)) {
    return value
  } else {
    date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      date = new Date()
    }
  }

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const time = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })

  return `${day}-${month}-${year}, ${time}`
}

function getApiErrorMessage(error, fallback) {
  const detail = error.response?.data?.detail
  if (detail) {
    return typeof detail === 'string' ? detail : JSON.stringify(detail)
  }
  return fallback
}

// Individual Message Component with Feedback, Copy, Speak, and Edit options
const ChatMessageItem = memo(function ChatMessageItem({
  message,
  index,
  conversationId,
  isSpeaking,
  onSpeak,
  onEditMessage,
}) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const [userRating, setUserRating] = useState(null)
  const [showFeedbackInput, setShowFeedbackInput] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)

  const handleCopy = () => {
    if (!message.content) return
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleThumbsUp = async () => {
    setUserRating('thumbs_up')
    setShowFeedbackInput(false)
    try {
      await api.post('/api/chat/feedback', {
        conversation_id: conversationId,
        message_index: index,
        rating: 'thumbs_up',
      })
    } catch (e) {
      console.debug('Feedback error:', e)
    }
  }

  const handleThumbsDownClick = () => {
    setUserRating('thumbs_down')
    setShowFeedbackInput(true)
  }

  const submitNegativeFeedback = async (reason) => {
    const comment = reason || feedbackText.trim()
    try {
      await api.post('/api/chat/feedback', {
        conversation_id: conversationId,
        message_index: index,
        rating: 'thumbs_down',
        feedback_text: comment,
      })
      setFeedbackSubmitted(true)
      setTimeout(() => setShowFeedbackInput(false), 2000)
    } catch (e) {
      console.debug('Feedback submit error:', e)
    }
  }

  return (
    <div
      className={`group flex items-start gap-2.5 ${
        isUser ? 'justify-end' : 'justify-start'
      }`}
    >
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-50 shadow-2xs overflow-hidden mt-1">
          <img src="/logo.png" alt="PHA" className="h-6 w-6 object-contain" />
        </div>
      )}

      <div
        className={`relative max-w-2xl rounded-2xl px-4 py-3 shadow-2xs ${
          isUser
            ? 'rounded-tr-xs bg-teal-700 text-white'
            : 'rounded-tl-xs border border-slate-200/80 bg-white text-slate-800'
        }`}
      >
        {isUser ? (
          <div className="space-y-2">
            {message.image && (
              <div className="overflow-hidden rounded-xl border border-white/20 bg-black/10">
                <img
                  src={message.image}
                  alt="Uploaded prescription or medicine"
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

            {/* Edit Sent Message Button */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-teal-200">
                {formatTime(message.created_at)}
              </span>
              <button
                type="button"
                onClick={() => onEditMessage(message.content, message.image)}
                className="opacity-70 group-hover:opacity-100 inline-flex items-center gap-1 rounded-md bg-teal-800/60 px-2 py-0.5 text-[11px] font-medium text-teal-100 hover:bg-teal-800 hover:text-white transition"
                title="Edit message"
              >
                <Pencil className="h-3 w-3" />
                <span>Edit</span>
              </button>
            </div>
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
              <div className="mt-3 border-t border-slate-100 pt-2.5">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <span className="flex items-center gap-1 font-semibold text-slate-600">
                    <FileText className="h-3 w-3 text-teal-600" />
                    Sources:
                  </span>
                  {message.sources.map((source, sourceIndex) => (
                    <div
                      key={`${source.section || source.source || 'source'}-${sourceIndex}`}
                      className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                    >
                      <span>
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

            {/* Action Bar: Timestamp, Speak, Copy, Thumbs Up, Thumbs Down */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-400">
              <span>{formatTime(message.created_at)}</span>

              <div className="flex items-center gap-1">
                {/* Text-to-Speech Read Aloud */}
                <button
                  type="button"
                  onClick={() => onSpeak(message.content, index)}
                  className={`rounded-lg p-1.5 transition ${
                    isSpeaking
                      ? 'bg-teal-100 text-teal-800'
                      : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                  }`}
                  title={isSpeaking ? 'Stop speaking' : 'Read answer aloud'}
                >
                  {isSpeaking ? (
                    <VolumeX className="h-3.5 w-3.5 text-teal-700" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5" />
                  )}
                </button>

                {/* Copy Answer */}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                  title="Copy answer"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>

                {/* Thumbs Up */}
                <button
                  type="button"
                  onClick={handleThumbsUp}
                  className={`rounded-lg p-1.5 transition ${
                    userRating === 'thumbs_up'
                      ? 'bg-teal-50 text-teal-700 font-bold'
                      : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                  }`}
                  title="Helpful response"
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                </button>

                {/* Thumbs Down */}
                <button
                  type="button"
                  onClick={handleThumbsDownClick}
                  className={`rounded-lg p-1.5 transition ${
                    userRating === 'thumbs_down'
                      ? 'bg-rose-50 text-rose-600'
                      : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                  }`}
                  title="Provide feedback on this response"
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Inline Negative Feedback Drawer */}
            {showFeedbackInput && (
              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/90 p-2.5 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">
                    What could be improved?
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowFeedbackInput(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {feedbackSubmitted ? (
                  <p className="text-emerald-700 font-medium py-1">
                    ✓ Feedback saved. Thank you for helping improve clinical accuracy!
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        'Prescription transcription issue',
                        'Incomplete instructions',
                        'Inaccurate medicine details',
                        'Formatting / display error',
                      ].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => submitNegativeFeedback(chip)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-teal-50 hover:border-teal-300 transition"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        placeholder="Additional details (optional)…"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-600"
                      />
                      <button
                        type="button"
                        onClick={() => submitNegativeFeedback(null)}
                        className="shrink-0 rounded-lg bg-teal-700 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-800 transition"
                      >
                        Submit
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-600 mt-1">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  )
})

export default function ChatPage() {
  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    messages,
    setMessages,
    updateActiveConversation,
    startNewChat,
    renameConversation,
    setEditingConvId,
    setEditTitleText,
  } = useChat()

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)

  // Model Selection: default PHA 0.1.1
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem('pha_selected_model') || 'pha-0.1.1'
  })
  const [usage, setUsage] = useState(null)

  // Media Attachment state
  const [attachedImage, setAttachedImage] = useState(null)
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false)

  // Voice Input (Speech Recognition) state
  const [isListening, setIsListening] = useState(false)
  const speechRecognitionRef = useRef(null)

  // Speech Synthesis active index
  const [speakingIndex, setSpeakingIndex] = useState(null)

  const messagesContainerRef = useRef(null)
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const mobileCameraInputRef = useRef(null)
  const textareaRef = useRef(null)
  const abortControllerRef = useRef(null)
  const requestInProgressRef = useRef(false)

  // Handle Model Selection
  const handleSelectModel = (modelId) => {
    setSelectedModel(modelId)
    localStorage.setItem('pha_selected_model', modelId)
  }

  // Scroll to bottom
  const scrollToBottom = useCallback((smooth = false) => {
    if (!messagesContainerRef.current) return
    const container = messagesContainerRef.current
    if (!smooth) {
      container.scrollTop = container.scrollHeight
    } else {
      messagesEndRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
      })
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

  useEffect(() => {
    fetchUsage()
  }, [fetchUsage])

  // Scroll on message change
  useEffect(() => {
    requestAnimationFrame(() => scrollToBottom(false))
  }, [messages.length, loading, scrollToBottom])

  // Scroll on message change
  useEffect(() => {
    requestAnimationFrame(() => scrollToBottom(false))
  }, [messages.length, loading, scrollToBottom])

  // Stop generation in progress (single clean button)
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

  // Handle Image File Selection with auto-downscaling
  const handleImageFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (JPEG, PNG, WEBP).')
      return
    }

    try {
      const downscaled = await downscaleImage(file)
      setAttachedImage(downscaled)
    } catch (e) {
      console.error('Image compression failed:', e)
      setErrorMessage('Failed to process image. Please try another photo.')
    } finally {
      event.target.value = ''
    }
  }

  // Handle Camera Capture from Modal
  const handleCameraCapture = (capturedItem) => {
    setAttachedImage(capturedItem)
  }

  // Voice Message (Speech Recognition)
  const toggleSpeechRecognition = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      setErrorMessage(
        'Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.',
      )
      return
    }

    if (isListening) {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop()
      }
      setIsListening(false)
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = true
      recognition.lang = 'en-US'

      recognition.onstart = () => {
        setIsListening(true)
      }

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((res) => res[0].transcript)
          .join('')
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript))
      }

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error)
        setIsListening(false)
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      speechRecognitionRef.current = recognition
      recognition.start()
    } catch (err) {
      console.error('Speech recognition start failed:', err)
      setIsListening(false)
    }
  }

  // Text-to-Speech (Read Aloud)
  const handleSpeak = (text, index) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    if (speakingIndex === index) {
      window.speechSynthesis.cancel()
      setSpeakingIndex(null)
      return
    }

    window.speechSynthesis.cancel()

    // Strip markdown formatting for natural voice playback
    const cleanSpeech = text
      .replace(/[#*`>|~_]/g, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/```[\s\S]*?```/g, 'Prescription details provided.')
      .trim()

    const utterance = new SpeechSynthesisUtterance(cleanSpeech)
    utterance.rate = 1.0
    utterance.onend = () => setSpeakingIndex(null)
    utterance.onerror = () => setSpeakingIndex(null)
    setSpeakingIndex(index)
    window.speechSynthesis.speak(utterance)
  }

  // Edit sent message: load back into input
  const handleEditMessage = (content, image) => {
    setInput(content || '')
    if (image) {
      setAttachedImage({ dataUrl: image, name: 'attached_image.jpg', size: '' })
    }
    textareaRef.current?.focus()
  }

  // Send question
  const sendQuestion = async () => {
    const questionText = input.trim()
    const imageData = attachedImage?.dataUrl || null

    if (
      (!questionText && !imageData) ||
      requestInProgressRef.current ||
      loadingHistory
    ) {
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
          question:
            questionText ||
            'Please analyze this medical image / doctor prescription in detail.',
          conversation_id: activeConversationId,
          model: selectedModel,
          image: imageData,
        },
        { signal: controller.signal },
      )

      const nextConversationId =
        response.data?.conversation_id || activeConversationId
      const chatCode =
        response.data?.chat_code ||
        (nextConversationId ? encodeChatCode(nextConversationId) : '')

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
        model:
          response.data?.model ||
          (selectedModel === 'pha-0.1.1' ? 'PHA 0.1.1' : 'Gemini 3.8 Flash'),
        created_at: formatTime(),
      }

      updateActiveConversation(
        nextConversationId,
        userMsg,
        assistantMsg,
        questionText.slice(0, 48) || 'Clinical Consultation',
        chatCode,
      )
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

  const currentConversation = conversations.find(
    (c) => c.conversation_id === activeConversationId,
  )
  const currentTitle =
    currentConversation?.title ||
    (messages.length > 0 ? 'Clinical Consultation' : 'New Consultation')
  const currentChatCode =
    currentConversation?.chat_code || encodeChatCode(activeConversationId)

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
      {/* Top Header with crisp visible stroke */}
      <div className="flex items-center justify-between border-b border-slate-300 px-3 py-2.5 sm:px-4 bg-white shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 border border-slate-300 overflow-hidden">
            <img src="/logo.png" alt="PHA" className="h-6 w-6 object-contain" />
          </div>

          <div className="truncate">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Clinical Health Assistant
              </span>

              {selectedModel === 'pha-0.1.1' ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  PHA ∞ Unlimited
                </span>
              ) : (
                <span className="inline-flex items-center rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-800 border border-teal-200">
                  {usage ? `${usage.used || 0}/${usage.limit || 20} used` : 'Daily Quota'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 truncate">
              <h2 className="text-xs sm:text-sm font-bold text-slate-800 truncate">
                {currentTitle}
              </h2>
              {activeConversationId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingConvId(activeConversationId)
                    setEditTitleText(currentTitle)
                  }}
                  className="text-slate-400 hover:text-teal-700 transition p-0.5"
                  title="Rename chat"
                >
                  <Edit3 className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Share Chat Button */}
          {activeConversationId && messages.length > 0 && (
            <button
              type="button"
              onClick={() => setIsShareModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-xl border border-teal-300 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-100 transition shadow-2xs"
              title="Share this chat via encrypted URL"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Share</span>
            </button>
          )}

          {/* New Chat Button */}
          <button
            type="button"
            onClick={startNewChat}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition shadow-2xs"
            title="Start a new consultation"
          >
            <Plus className="h-3.5 w-3.5 text-teal-700" />
            <span className="hidden sm:inline">New Chat</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900"
        >
          {errorMessage}
        </div>
      )}

      {/* Message List */}
      <div
        ref={messagesContainerRef}
        className="flex-1 space-y-4 overflow-y-auto p-3.5 sm:p-5 overscroll-contain [-webkit-overflow-scrolling:touch]"
      >
        {loadingHistory && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
            <span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-teal-700/20 border-t-teal-700" />
            Loading conversation history…
          </div>
        )}

        {!loadingHistory && messages.length === 0 && !loading && (
          <div className="rounded-2xl border border-slate-300 bg-slate-50/70 p-4 sm:p-5 text-xs sm:text-sm text-slate-600 space-y-3 shadow-xs">
            <div>
              <p className="mb-1 font-semibold text-slate-900">
                Welcome to Personal Health Assistant
              </p>
              <p className="leading-relaxed">
                Ask a clinical health question, capture/upload a doctor prescription, or send a photo of your medicine.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  setInput(
                    'What are the key differences between cold and flu symptoms?',
                  )
                }
                className="rounded-xl border border-slate-300 bg-white p-2.5 text-left text-xs font-medium text-slate-700 hover:border-teal-400 hover:bg-teal-50/40 transition shadow-xs"
              >
                🌡️ Cold vs Flu Symptoms
              </button>
              <button
                type="button"
                onClick={() =>
                  setInput(
                    'What precautions should I take when taking antibiotics like amoxicillin?',
                  )
                }
                className="rounded-xl border border-slate-300 bg-white p-2.5 text-left text-xs font-medium text-slate-700 hover:border-teal-400 hover:bg-teal-50/40 transition shadow-xs"
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
            index={index}
            conversationId={activeConversationId}
            isSpeaking={speakingIndex === index}
            onSpeak={handleSpeak}
            onEditMessage={handleEditMessage}
          />
        ))}

        {/* Loading Indicator (Clean, without duplicate stop button) */}
        {loading && (
          <div className="flex items-end justify-start gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-50 border border-slate-300 shadow-xs overflow-hidden">
              <img src="/logo.png" alt="PHA" className="h-6 w-6 object-contain" />
            </div>
            <div className="rounded-2xl rounded-bl-xs border border-slate-300 bg-slate-50 px-4 py-2.5 shadow-xs">
              <div className="flex items-center gap-2 py-0.5">
                <span className="h-2 w-2 animate-bounce rounded-full bg-teal-600 [animation-delay:-0.3s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-teal-600 [animation-delay:-0.15s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-teal-600" />
                <span className="text-xs font-medium text-slate-500 ml-1">
                  Generating answer…
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar with crisp visible border */}
      <div className="border-t border-slate-300 bg-slate-50/80 p-2.5 sm:p-3 space-y-2 shrink-0">
        {/* Attached Image Preview */}
        {attachedImage && (
          <div className="rounded-xl border border-teal-300 bg-teal-50/70 p-2 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img
                  src={attachedImage.dataUrl}
                  alt="Preview"
                  className="h-11 w-11 rounded-lg border border-teal-300 object-cover"
                />
                <div>
                  <p className="text-xs font-semibold text-slate-800 truncate max-w-xs">
                    {attachedImage.name}
                  </p>
                  <p className="text-[10px] text-teal-700 font-medium">
                    {attachedImage.size} • Ready for analysis
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAttachedImage(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-teal-100 hover:text-slate-600 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={() =>
                  setInput(
                    'What is this medicine related to? Explain active ingredients, dosage, and side effects.',
                  )
                }
                className="rounded-lg border border-teal-300 bg-white px-2 py-0.5 text-[11px] font-medium text-teal-800 hover:bg-teal-100 transition shadow-2xs"
              >
                💊 What is this medicine?
              </button>
              <button
                type="button"
                onClick={() =>
                  setInput(
                    'Please transcribe and explain this doctor prescription in a table and structured snippet box.',
                  )
                }
                className="rounded-lg border border-teal-300 bg-white px-2 py-0.5 text-[11px] font-medium text-teal-800 hover:bg-teal-100 transition shadow-2xs"
              >
                📋 Transcribe prescription
              </button>
            </div>
          </div>
        )}

        {/* Text Input Row */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Hidden File Inputs */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageFileChange}
            accept="image/*"
            className="hidden"
          />
          <input
            type="file"
            ref={mobileCameraInputRef}
            onChange={handleImageFileChange}
            accept="image/*"
            capture="environment"
            className="hidden"
          />

          {/* Upload Image Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loadingHistory || loading}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 hover:border-teal-500 hover:text-teal-700 transition shadow-2xs"
            title="Upload photo of medicine or prescription"
          >
            <ImagePlus className="h-4 w-4" />
          </button>

          {/* Capture Image Button (Webcam / Mobile Camera) */}
          <button
            type="button"
            onClick={() => {
              const isMobile =
                /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
              if (isMobile && mobileCameraInputRef.current) {
                mobileCameraInputRef.current.click()
              } else {
                setIsCameraModalOpen(true)
              }
            }}
            disabled={loadingHistory || loading}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 hover:border-teal-500 hover:text-teal-700 transition shadow-2xs"
            title="Take photo with camera"
          >
            <Camera className="h-4 w-4" />
          </button>

          {/* Voice Input (Speech-to-Text) Button */}
          <button
            type="button"
            onClick={toggleSpeechRecognition}
            disabled={loadingHistory || loading}
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition shadow-2xs ${
              isListening
                ? 'border-rose-400 bg-rose-50 text-rose-600 animate-pulse'
                : 'border-slate-300 bg-white text-slate-600 hover:border-teal-500 hover:text-teal-700'
            }`}
            title={
              isListening
                ? 'Listening… Click to stop'
                : 'Send voice question (Speech-to-Text)'
            }
          >
            {isListening ? (
              <MicOff className="h-4 w-4 text-rose-600" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>

          <textarea
            ref={textareaRef}
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
            disabled={loadingHistory}
            enterKeyHint="send"
            autoCapitalize="sentences"
            className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 outline-none ring-0 transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 shadow-2xs"
            placeholder={
              isListening
                ? 'Listening… Speak your question now'
                : attachedImage
                ? 'Ask about this medicine or prescription…'
                : 'Ask a health question, attach a medicine photo, or use voice…'
            }
          />

          {/* SINGLE STOP or SEND Button */}
          {loading ? (
            <button
              type="button"
              onClick={stopGeneration}
              className="inline-flex shrink-0 items-center justify-center gap-1 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 transition"
              title="Stop response"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span className="hidden sm:inline">Stop</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={sendQuestion}
              disabled={
                loadingHistory || (!input.trim() && !attachedImage)
              }
              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-teal-700 px-3.5 py-2 text-white shadow-xs transition hover:bg-teal-800 disabled:opacity-40"
              title="Send message"
            >
              <SendHorizontal className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Bottom Toolbar: Model Selector & Status */}
        <div className="flex items-center justify-between pt-0.5">
          <ModelSelector
            selectedModelId={selectedModel}
            onSelectModel={handleSelectModel}
            usage={usage}
          />

          <span className="text-[11px] text-slate-400 font-medium">
            {selectedModel === 'pha-0.1.1'
              ? 'PHA 0.1.1 Clinical Engine'
              : 'Gemini 3.8 Flash Multimodal'}
          </span>
        </div>
      </div>

      {/* Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onCapture={handleCameraCapture}
      />

      {/* Share Conversation Modal */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        conversationId={activeConversationId}
        chatTitle={currentTitle}
        chatCode={currentChatCode}
      />
    </div>
  )
}
