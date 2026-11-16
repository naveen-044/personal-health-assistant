import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../auth/useAuth'

export function encodeChatCode(conversationId) {
  if (!conversationId) return ''
  try {
    return (
      'pha_' +
      btoa(conversationId)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    )
  } catch (e) {
    return 'pha_' + conversationId
  }
}

export function decodeChatCode(code) {
  if (!code) return ''
  let cleaned = code.startsWith('pha_') ? code.slice(4) : code
  cleaned = cleaned.replace(/-/g, '+').replace(/_/g, '/')
  while (cleaned.length % 4) cleaned += '='
  try {
    return atob(cleaned)
  } catch (e) {
    return cleaned
  }
}

const ChatContext = createContext(null)

export function ChatProvider({ children }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [conversations, setConversations] = useState([])
  const [activeConversationId, setActiveConversationId] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [editingConvId, setEditingConvId] = useState(null)
  const [editTitleText, setEditTitleText] = useState('')

  // Fetch all conversations for current user
  const fetchConversations = useCallback(async () => {
    if (!user) return []
    setLoadingHistory(true)
    try {
      const res = await api.get('/api/chat/history')
      const convs = Array.isArray(res.data?.conversations)
        ? res.data.conversations
        : []
      setConversations(convs)
      return convs
    } catch (err) {
      console.debug('Error fetching chat history:', err)
      return []
    } finally {
      setLoadingHistory(false)
    }
  }, [user])

  // Select a conversation and load its messages
  const selectConversation = useCallback(
    (convOrId) => {
      const convId =
        typeof convOrId === 'string' ? convOrId : convOrId?.conversation_id
      if (!convId) return

      setActiveConversationId(convId)
      const target = conversations.find((c) => c.conversation_id === convId)
      if (target) {
        setMessages(Array.isArray(target.messages) ? target.messages : [])
      }

      const code = target?.chat_code || encodeChatCode(convId)
      navigate(`/chat?c=${encodeURIComponent(code)}`, { replace: true })
    },
    [conversations, navigate],
  )

  // Start new blank chat
  const startNewChat = useCallback(() => {
    setActiveConversationId(null)
    setMessages([])
    navigate('/chat', { replace: true })
  }, [navigate])

  // Inline rename conversation
  const renameConversation = useCallback(async (convId, newTitle) => {
    const trimmed = (newTitle || '').trim()
    if (!trimmed) {
      setEditingConvId(null)
      return
    }

    try {
      await api.patch(`/api/chat/history/${encodeURIComponent(convId)}`, {
        title: trimmed,
      })
      setConversations((prev) =>
        prev.map((c) =>
          c.conversation_id === convId ? { ...c, title: trimmed } : c,
        ),
      )
    } catch (err) {
      console.error('Failed to rename conversation:', err)
    } finally {
      setEditingConvId(null)
    }
  }, [])

  // Delete conversation
  const deleteConversation = useCallback(
    async (convId) => {
      try {
        await api.delete(`/api/chat/history/${encodeURIComponent(convId)}`)
        setConversations((prev) => {
          const next = prev.filter((c) => c.conversation_id !== convId)
          if (activeConversationId === convId) {
            if (next.length > 0) {
              selectConversation(next[0])
            } else {
              startNewChat()
            }
          }
          return next
        })
      } catch (err) {
        console.error('Failed to delete conversation:', err)
      }
    },
    [activeConversationId, selectConversation, startNewChat],
  )

  // Append turns to active conversation and keep history synced
  const updateActiveConversation = useCallback(
    (convId, userMsg, assistantMsg, title, chatCode) => {
      setActiveConversationId(convId)
      setMessages((prev) => [...prev, assistantMsg])
      const activeCode = chatCode || encodeChatCode(convId)
      window.history.replaceState(
        null,
        '',
        `/chat?c=${encodeURIComponent(activeCode)}`,
      )

      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.conversation_id === convId)
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = {
            ...updated[idx],
            chat_code: activeCode,
            updated_at: 'just now',
            messages: [
              ...(updated[idx].messages || []),
              userMsg,
              assistantMsg,
            ],
          }
          return updated
        } else {
          return [
            {
              conversation_id: convId,
              title: title || 'Clinical Consultation',
              chat_code: activeCode,
              updated_at: 'just now',
              messages: [userMsg, assistantMsg],
            },
            ...prev,
          ]
        }
      })
    },
    [],
  )

  // Initial load
  useEffect(() => {
    fetchConversations().then((loadedConvs) => {
      if (location.pathname !== '/chat') return

      const urlParams = new URLSearchParams(location.search)
      const codeParam = urlParams.get('c') || urlParams.get('share')
      let target = null

      if (codeParam && loadedConvs.length > 0) {
        const decodedId = decodeChatCode(codeParam)
        target = loadedConvs.find(
          (c) =>
            c.conversation_id === decodedId ||
            c.chat_code === codeParam ||
            c.conversation_id === codeParam,
        )
      }

      if (!target && loadedConvs.length > 0) {
        const sorted = [...loadedConvs].sort((a, b) => {
          const aTime = new Date(a.updated_at || a.created_at || 0).getTime()
          const bTime = new Date(b.updated_at || b.created_at || 0).getTime()
          return bTime - aTime
        })
        target = sorted[0]
      }

      if (target) {
        setActiveConversationId(target.conversation_id)
        setMessages(Array.isArray(target.messages) ? target.messages : [])
        const code = target.chat_code || encodeChatCode(target.conversation_id)
        window.history.replaceState(
          null,
          '',
          `/chat?c=${encodeURIComponent(code)}`,
        )
      }
    })
  }, [fetchConversations, location.pathname, location.search])

  return (
    <ChatContext.Provider
      value={{
        conversations,
        setConversations,
        activeConversationId,
        setActiveConversationId,
        messages,
        setMessages,
        loadingHistory,
        fetchConversations,
        selectConversation,
        startNewChat,
        renameConversation,
        deleteConversation,
        updateActiveConversation,
        editingConvId,
        setEditingConvId,
        editTitleText,
        setEditTitleText,
      }}
    >
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider')
  }
  return context
}
