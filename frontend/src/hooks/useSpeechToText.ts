import { useCallback, useEffect, useRef, useState } from 'react'

interface UseSpeechToTextOptions {
  onResult: (text: string) => void
}

type AnyRecognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: any) => void) | null
  onerror: ((event: any) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

export function useSpeechToText({ onResult }: UseSpeechToTextOptions) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const recognitionRef = useRef<AnyRecognition | null>(null)
  const onResultRef = useRef(onResult)

  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  useEffect(() => {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition

    if (!SpeechRecognitionCtor) {
      setIsSupported(false)
      return
    }
    setIsSupported(true)

    const rec: AnyRecognition = new SpeechRecognitionCtor()
    rec.continuous = true
    rec.interimResults = false
    rec.lang = 'en-US'

    rec.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          const text = String(result[0].transcript || '').trim()
          if (text) onResultRef.current(text)
        }
      }
    }

    rec.onend = () => {
      setIsListening(false)
    }

    rec.onerror = (event: any) => {
      console.error('SpeechRecognition error:', event.error || event)
      setIsListening(false)
    }

    recognitionRef.current = rec

    return () => {
      try {
        rec.abort()
      } catch {
        // ignore
      }
      recognitionRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    const rec = recognitionRef.current
    if (!rec) return
    try {
      rec.start()
      setIsListening(true)
    } catch (err) {
      console.error('Failed to start speech recognition:', err)
      setIsListening(false)
    }
  }, [])

  const stop = useCallback(() => {
    const rec = recognitionRef.current
    if (!rec) return
    try {
      rec.stop()
    } catch (err) {
      console.error('Failed to stop speech recognition:', err)
    }
  }, [])

  const toggle = useCallback(() => {
    if (isListening) stop()
    else start()
  }, [isListening, start, stop])

  return { isListening, isSupported, toggle, start, stop }
}
