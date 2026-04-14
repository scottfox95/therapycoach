import { useState, useRef, useEffect, useCallback } from 'react'
import MessageBubble from './MessageBubble'
import FileDropZone, { AttachedFile } from './FileDropZone'
import DocumentPicker from './DocumentPicker'
import MicButton from './MicButton'
import { useSpeechToText } from '../hooks/useSpeechToText'

interface ContextDocument {
  id: string
  filename: string
  summary: string | null
}

interface DocumentMeta {
  id: string
  filename: string
  size_bytes: number
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  documents?: DocumentMeta[]
}

interface SessionWrapUp {
  summary: string | null
  patterns: string[] | null
}

interface ChatWindowProps {
  sessionId: string | null
  onSessionCreated: (id: string) => void
  onSessionEnded?: () => void
  pendingDocumentId?: string | null
  onPendingDocumentConsumed?: () => void
}

export default function ChatWindow({ sessionId, onSessionCreated, onSessionEnded, pendingDocumentId, onPendingDocumentConsumed }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isEnding, setIsEnding] = useState(false)
  const [wrapUp, setWrapUp] = useState<SessionWrapUp | null>(null)
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null)
  const [showDocPicker, setShowDocPicker] = useState(false)
  const [contextDocs, setContextDocs] = useState<ContextDocument[]>([])
  const [contextExpanded, setContextExpanded] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSpeechResult = useCallback((text: string) => {
    setInput(prev => (prev ? `${prev} ${text}` : text))
  }, [])
  const { isListening, isSupported: isSpeechSupported, toggle: toggleSpeech } =
    useSpeechToText({ onResult: handleSpeechResult })

  useEffect(() => {
    if (sessionId) {
      loadSession(sessionId)
    } else {
      setMessages([])
    }
    // Clear wrap-up and attachment when session changes
    setWrapUp(null)
    setAttachedFile(null)
  }, [sessionId])

  // Load all documents for context awareness indicator
  useEffect(() => {
    const loadContextDocs = async () => {
      try {
        const res = await fetch('/api/documents/')
        if (res.ok) {
          const data = await res.json()
          setContextDocs(data.map((d: any) => ({ id: d.id, filename: d.filename, summary: d.summary })))
        }
      } catch (err) {
        console.error('Failed to load context documents:', err)
      }
    }
    loadContextDocs()
  }, [sessionId])

  // When a processed transcript is ready, pre-attach it
  useEffect(() => {
    if (pendingDocumentId) {
      // Create a virtual attached file for the already-uploaded document
      const virtualFile = new File([], 'Labeled Transcript')
      setAttachedFile({ file: virtualFile, documentId: pendingDocumentId, uploading: false })
      setInput("I'd like to discuss this group therapy session transcript. What patterns and dynamics do you see?")
      onPendingDocumentConsumed?.()
    }
  }, [pendingDocumentId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
    }
  }, [input])

  const loadSession = async (id: string) => {
    try {
      const res = await fetch(`/api/sessions/${id}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
        // If session is already ended, show the wrap-up
        if (data.ended_at && data.summary) {
          setWrapUp({
            summary: data.summary,
            patterns: data.patterns,
          })
        }
      }
    } catch (err) {
      console.error('Failed to load session:', err)
    }
  }

  const uploadFile = async (file: File): Promise<{ documentId: string; sessionId: string }> => {
    const formData = new FormData()
    formData.append('file', file)
    if (sessionId) {
      formData.append('session_id', sessionId)
    }

    const res = await fetch('/api/documents/upload', {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.detail || 'Upload failed')
    }

    const data = await res.json()
    return { documentId: data.document.id, sessionId: data.session_id }
  }

  const sendMessage = async () => {
    const messageText = input.trim() || (attachedFile ? "I'd like to discuss this document." : '')
    if (!messageText || isLoading) return

    let documentIds: string[] | undefined
    let uploadedSessionId: string | undefined

    // Upload file if attached and not yet uploaded
    if (attachedFile) {
      if (!attachedFile.documentId) {
        try {
          setAttachedFile(prev => prev ? { ...prev, uploading: true } : null)
          const result = await uploadFile(attachedFile.file)
          documentIds = [result.documentId]
          uploadedSessionId = result.sessionId
          setAttachedFile(prev =>
            prev ? { ...prev, documentId: result.documentId, uploading: false } : null
          )
        } catch (err) {
          console.error('Upload failed:', err)
          setAttachedFile(prev =>
            prev ? { ...prev, uploading: false, error: 'Upload failed' } : null
          )
          return
        }
      } else {
        documentIds = [attachedFile.documentId]
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
      documents: attachedFile
        ? [{ id: attachedFile.documentId || '', filename: attachedFile.file.name, size_bytes: attachedFile.file.size }]
        : undefined,
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setAttachedFile(null)
    setIsLoading(true)

    // Use the uploaded session ID if we just created one, otherwise use existing
    const effectiveSessionId = uploadedSessionId && !sessionId ? uploadedSessionId : sessionId

    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          session_id: effectiveSessionId,
          document_ids: documentIds,
        }),
      })

      if (!res.ok) throw new Error('Failed to send message')

      const data = await res.json()

      if (!sessionId && data.session_id) {
        onSessionCreated(data.session_id)
      }

      setMessages(prev => [
        ...prev.slice(0, -1),
        data.message,
        data.response,
      ])
    } catch (err) {
      console.error('Failed to send message:', err)
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const endSession = async () => {
    if (!sessionId || isEnding || messages.length === 0) return

    setIsEnding(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/end`, {
        method: 'POST',
      })

      if (!res.ok) throw new Error('Failed to end session')

      const data = await res.json()
      setWrapUp({
        summary: data.summary,
        patterns: data.patterns,
      })
      // Notify parent to refresh sidebar
      onSessionEnded?.()
    } catch (err) {
      console.error('Failed to end session:', err)
    } finally {
      setIsEnding(false)
    }
  }

  const handleFileAttached = (file: File) => {
    setAttachedFile({ file, uploading: false })
  }

  const handleDocumentSelected = (doc: { id: string; filename: string; size_bytes: number }) => {
    // Attach an existing document (already uploaded, has an ID)
    const virtualFile = new File([], doc.filename)
    setAttachedFile({ file: virtualFile, documentId: doc.id, uploading: false })
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          {/* Document context indicator */}
          {contextDocs.length > 0 && (
            <div className="mb-6">
              <button
                onClick={() => setContextExpanded(prev => !prev)}
                className="flex items-center gap-2 text-parchment-300/40 hover:text-parchment-300/60
                           transition-colors duration-200 text-xs"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>{contextDocs.length} document{contextDocs.length !== 1 ? 's' : ''} in context</span>
                <svg
                  className={`w-3 h-3 transition-transform duration-200 ${contextExpanded ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {contextExpanded && (
                <div className="mt-2 pl-5 space-y-1.5 animate-fade-in">
                  <p className="text-parchment-300/30 text-xs mb-2">
                    The therapist has awareness of these documents across all sessions
                  </p>
                  {contextDocs.map(doc => (
                    <div key={doc.id} className="flex items-center gap-2">
                      <span className="w-1 h-1 bg-parchment-300/30 rounded-full flex-shrink-0" />
                      <span className="text-parchment-300/50 text-xs truncate">
                        {doc.filename}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.length === 0 && (
            <div className="h-full min-h-[60vh] flex flex-col items-center justify-center animate-fade-in">
              <div className="text-center space-y-6">
                <p className="font-display text-2xl md:text-3xl text-parchment-100 leading-relaxed">
                  What's weighing on you?
                </p>
                <p className="text-parchment-300 text-sm tracking-wide uppercase">
                  I'm here to challenge you, not comfort you
                </p>
                <p className="text-parchment-300/40 text-xs mt-4">
                  Drop a file here or use the paperclip to attach transcripts
                </p>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                isLatest={index === messages.length - 1}
              />
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 py-4 animate-fade-in">
                <span className="w-1.5 h-1.5 bg-ember-400 rounded-full animate-pulse-subtle" />
                <span className="w-1.5 h-1.5 bg-ember-400 rounded-full animate-pulse-subtle" style={{ animationDelay: '0.2s' }} />
                <span className="w-1.5 h-1.5 bg-ember-400 rounded-full animate-pulse-subtle" style={{ animationDelay: '0.4s' }} />
              </div>
            )}

            {/* Session Wrap-Up Panel */}
            {wrapUp && (
              <div className="mt-8 p-6 bg-ink-800/50 border border-ink-600/50 rounded-lg animate-fade-in">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 bg-ember-400 rounded-full" />
                  <h3 className="font-display text-parchment-100 text-lg">Session Complete</h3>
                </div>

                {wrapUp.summary && (
                  <div className="mb-4">
                    <p className="text-parchment-300/60 text-xs uppercase tracking-wider mb-2">Summary</p>
                    <p className="text-parchment-200 text-sm leading-relaxed">{wrapUp.summary}</p>
                  </div>
                )}

                {wrapUp.patterns && wrapUp.patterns.length > 0 && (
                  <div>
                    <p className="text-parchment-300/60 text-xs uppercase tracking-wider mb-2">Patterns Identified</p>
                    <div className="flex flex-wrap gap-2">
                      {wrapUp.patterns.map(pattern => (
                        <span
                          key={pattern}
                          className="text-xs px-3 py-1 bg-ink-900/60 rounded-full
                                     text-ember-300 border border-ember-400/30"
                        >
                          {pattern.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-ink-700/50 bg-ink-900/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-6 py-5">
          <FileDropZone
            attachedFile={attachedFile}
            onFileAttached={handleFileAttached}
            onFileRemoved={() => setAttachedFile(null)}
            disabled={!!wrapUp}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={attachedFile ? "Add a message about this file..." : "Speak honestly..."}
              rows={1}
              className={`w-full bg-ink-800 border border-ink-600 rounded-lg pl-20 ${isSpeechSupported ? 'pr-20' : 'pr-12'} py-4
                         text-parchment-100 placeholder-parchment-300/50
                         font-body text-base leading-relaxed
                         resize-none transition-colors duration-200
                         focus:outline-none focus:border-ember-400/60
                         hover:border-ink-600/80`}
            />
            {/* Document picker button — left of paperclip */}
            {!wrapUp && (
              <button
                onClick={() => setShowDocPicker(true)}
                className="absolute left-10 bottom-3 p-2
                           text-parchment-300/50 hover:text-ember-400
                           transition-colors duration-200"
                aria-label="Browse documents"
                title="Browse saved documents"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </button>
            )}
            {isSpeechSupported && !wrapUp && (
              <MicButton
                isListening={isListening}
                onToggle={toggleSpeech}
                disabled={isLoading}
                className="absolute right-10 bottom-3"
              />
            )}
            <button
              onClick={sendMessage}
              disabled={(!input.trim() && !attachedFile) || isLoading}
              className="absolute right-3 bottom-3 p-2
                         text-parchment-300 hover:text-ember-400
                         disabled:opacity-30 disabled:cursor-not-allowed
                         transition-colors duration-200"
              aria-label="Send message"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 5l7 7-7 7M5 12h14" />
              </svg>
            </button>
          </FileDropZone>
          <div className="flex items-center justify-between mt-3">
            <p className="text-parchment-300/40 text-xs">
              Press Enter to send, Shift+Enter for new line
            </p>

            {/* End Session button - only show when there's an active session with messages and not already ended */}
            {sessionId && messages.length > 0 && !wrapUp && (
              <button
                onClick={endSession}
                disabled={isEnding || isLoading}
                className="text-parchment-300/50 hover:text-parchment-200 text-xs
                           transition-colors duration-200
                           disabled:opacity-30 disabled:cursor-not-allowed
                           flex items-center gap-1.5"
              >
                {isEnding ? (
                  <>
                    <span className="w-1 h-1 bg-parchment-300 rounded-full animate-pulse" />
                    Ending...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                    </svg>
                    End session
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Document picker modal */}
      <DocumentPicker
        isOpen={showDocPicker}
        onClose={() => setShowDocPicker(false)}
        onSelect={handleDocumentSelected}
      />
    </div>
  )
}
