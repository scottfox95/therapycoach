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

interface MessageBubbleProps {
  message: Message
  isLatest?: boolean
}

export default function MessageBubble({ message, isLatest }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div
      className={`${isLatest ? 'animate-slide-up' : ''}`}
    >
      {isUser ? (
        // User message - right aligned, subtle
        <div className="flex justify-end">
          <div className="max-w-[85%] md:max-w-[75%]">
            {/* Document attachment badge */}
            {message.documents && message.documents.length > 0 && (
              <div className="flex justify-end mb-2">
                {message.documents.map(doc => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-2 px-3 py-1.5
                               bg-ink-800/80 border border-ember-400/20 rounded-lg"
                  >
                    <svg className="w-3.5 h-3.5 text-ember-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-parchment-200 text-xs">
                      {doc.filename}
                    </span>
                    <span className="text-ember-400/40 text-xs">
                      shared
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-parchment-200 font-body text-base leading-relaxed text-right">
              {message.content}
            </p>
            <div className="flex justify-end mt-1">
              <span className="text-parchment-300/30 text-xs uppercase tracking-wider">you</span>
            </div>
          </div>
        </div>
      ) : (
        // Assistant message - left aligned, prominent
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-ember-400 rounded-full" />
            <span className="text-ember-400/80 text-xs uppercase tracking-wider font-medium">therapist</span>
          </div>
          <div className="pl-3.5 border-l border-ink-600">
            <p className="text-parchment-100 font-body text-lg leading-relaxed prose-therapy whitespace-pre-wrap">
              {message.content}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
