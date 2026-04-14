import { useCallback, useEffect, useRef, useState } from 'react'
import MicButton from './MicButton'
import { useSpeechToText } from '../hooks/useSpeechToText'

interface IntakeMessage {
  role: 'user' | 'assistant'
  content: string
}

interface IntakeFlowProps {
  onComplete: () => void
}

export default function IntakeFlow({ onComplete }: IntakeFlowProps) {
  const [messages, setMessages] = useState<IntakeMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [intakeReady, setIntakeReady] = useState(false)
  const [isFinalizing, setIsFinalizing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const openingRequested = useRef(false)

  const handleSpeechResult = useCallback((text: string) => {
    setInput(prev => (prev ? `${prev} ${text}` : text))
  }, [])
  const { isListening, isSupported: isSpeechSupported, toggle: toggleSpeech } =
    useSpeechToText({ onResult: handleSpeechResult })

  useEffect(() => {
    if (openingRequested.current) return
    openingRequested.current = true
    requestTurn([])
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
    }
  }, [input])

  const requestTurn = async (history: IntakeMessage[]) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/profile/intake/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history }),
      })
      if (!res.ok) throw new Error('Intake request failed')
      const data = await res.json()
      const assistantMessage: IntakeMessage = {
        role: 'assistant',
        content: data.assistant_message,
      }
      setMessages(prev => [...prev, assistantMessage])
      if (data.intake_ready) setIntakeReady(true)
    } catch (err) {
      console.error(err)
      setError('Something went wrong. Try sending again.')
    } finally {
      setIsLoading(false)
    }
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || isLoading || isFinalizing) return

    const userMessage: IntakeMessage = { role: 'user', content: text }
    const nextHistory = [...messages, userMessage]
    setMessages(nextHistory)
    setInput('')
    await requestTurn(nextHistory)
  }

  const finalizeIntake = async () => {
    if (isFinalizing || isLoading) return
    setIsFinalizing(true)
    setError(null)
    try {
      const res = await fetch('/api/profile/intake/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: messages }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Finalize failed')
      }
      onComplete()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to finalize intake')
      setIsFinalizing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="border-b border-ink-700/50 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-ember-400/80 text-xs uppercase tracking-wider font-medium">
              Intake
            </p>
            <p className="text-parchment-300/60 text-xs mt-0.5">
              A one-time conversation so future sessions can be useful
            </p>
          </div>
          {intakeReady && (
            <button
              onClick={finalizeIntake}
              disabled={isFinalizing}
              className="text-xs px-4 py-2 rounded-lg
                         bg-ember-400/10 text-ember-300 border border-ember-400/30
                         hover:bg-ember-400/20 transition-colors duration-200
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isFinalizing ? 'Building profile…' : 'Complete intake'}
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
          {messages.map((message, i) => (
            <div key={i} className="animate-fade-in">
              {message.role === 'assistant' ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-ember-400 rounded-full" />
                    <span className="text-ember-400/80 text-xs uppercase tracking-wider font-medium">
                      intake
                    </span>
                  </div>
                  <div className="pl-3.5 border-l border-ink-600">
                    <p className="text-parchment-100 font-body text-lg leading-relaxed whitespace-pre-wrap">
                      {message.content}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end">
                  <div className="max-w-[85%]">
                    <p className="text-parchment-200 font-body text-base leading-relaxed text-right whitespace-pre-wrap">
                      {message.content}
                    </p>
                    <div className="flex justify-end mt-1">
                      <span className="text-parchment-300/30 text-xs uppercase tracking-wider">
                        you
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 py-2 animate-fade-in">
              <span className="w-1.5 h-1.5 bg-ember-400 rounded-full animate-pulse-subtle" />
              <span
                className="w-1.5 h-1.5 bg-ember-400 rounded-full animate-pulse-subtle"
                style={{ animationDelay: '0.2s' }}
              />
              <span
                className="w-1.5 h-1.5 bg-ember-400 rounded-full animate-pulse-subtle"
                style={{ animationDelay: '0.4s' }}
              />
            </div>
          )}

          {error && (
            <div className="text-ember-300/80 text-sm border border-ember-400/30 rounded-lg p-3 bg-ember-400/5">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-ink-700/50 bg-ink-900/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-6 py-5">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Answer honestly — this shapes everything that follows…"
              rows={1}
              disabled={isLoading || isFinalizing}
              className={`w-full bg-ink-800 border border-ink-600 rounded-lg pl-4 ${isSpeechSupported ? 'pr-20' : 'pr-12'} py-4
                         text-parchment-100 placeholder-parchment-300/50
                         font-body text-base leading-relaxed
                         resize-none transition-colors duration-200
                         focus:outline-none focus:border-ember-400/60
                         hover:border-ink-600/80
                         disabled:opacity-50`}
            />
            {isSpeechSupported && (
              <MicButton
                isListening={isListening}
                onToggle={toggleSpeech}
                disabled={isLoading || isFinalizing}
                className="absolute right-10 bottom-3"
              />
            )}
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading || isFinalizing}
              className="absolute right-3 bottom-3 p-2
                         text-parchment-300 hover:text-ember-400
                         disabled:opacity-30 disabled:cursor-not-allowed
                         transition-colors duration-200"
              aria-label="Send message"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M13 5l7 7-7 7M5 12h14"
                />
              </svg>
            </button>
          </div>
          <p className="text-parchment-300/40 text-xs mt-3">
            {intakeReady
              ? "You can click 'Complete intake' above whenever you're ready."
              : 'Press Enter to send, Shift+Enter for a new line'}
          </p>
        </div>
      </div>
    </div>
  )
}
