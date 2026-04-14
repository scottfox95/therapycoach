interface MicButtonProps {
  isListening: boolean
  onToggle: () => void
  disabled?: boolean
  className?: string
}

export default function MicButton({
  isListening,
  onToggle,
  disabled,
  className = '',
}: MicButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
      title={isListening ? 'Stop recording' : 'Voice input'}
      className={`p-2 transition-colors duration-200
                  disabled:opacity-30 disabled:cursor-not-allowed
                  ${isListening
                    ? 'text-ember-400 animate-pulse-subtle'
                    : 'text-parchment-300/50 hover:text-ember-400'}
                  ${className}`}
    >
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M19 11a7 7 0 01-14 0M12 18v4m-4 0h8"
        />
      </svg>
    </button>
  )
}
