// utils/useSpeechRecognition.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { getSpeechRecognitionConstructor, ISpeechRecognition, SpeechRecognitionErrorEvent, SpeechRecognitionEvent } from './speechRecognitionTypes';

interface UseSpeechRecognitionOptions {
  lang?: string;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (errorMessage: string) => void;
}

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const { lang, onResult, onError } = options;
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const isManuallyStoppedRef = useRef(false);

  // Check support on mount
  useEffect(() => {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    setIsSupported(!!SpeechRecognition);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore cleanup abort errors
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  const stopListening = useCallback(() => {
    isManuallyStoppedRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    }
    setIsListening(false);
    setInterimText('');
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      onError?.('Speech recognition is not supported in this browser. Try Chrome, Edge, or Safari.');
      return;
    }

    // If an existing recognition is in progress, stop it first
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      isManuallyStoppedRef.current = false;

      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = lang || (typeof navigator !== 'undefined' ? navigator.language : 'en-ZA') || 'en-ZA';
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setInterimText('');
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let currentInterim = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          const transcriptPiece = result[0]?.transcript || '';
          if (result.isFinal) {
            finalTranscript += transcriptPiece;
          } else {
            currentInterim += transcriptPiece;
          }
        }

        const combined = (finalTranscript || currentInterim).trim();
        setInterimText(currentInterim);

        if (combined && onResult) {
          onResult(combined, Boolean(finalTranscript));
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        setIsListening(false);
        setInterimText('');

        if (isManuallyStoppedRef.current || event.error === 'aborted') {
          return;
        }

        let userFriendlyError = 'Speech recognition encountered an issue.';
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          userFriendlyError = 'Microphone permission was denied. Please allow microphone access in your browser.';
        } else if (event.error === 'no-speech') {
          userFriendlyError = 'No speech detected. Please tap the microphone and try again.';
        } else if (event.error === 'audio-capture') {
          userFriendlyError = 'No microphone detected on your device.';
        } else if (event.error === 'network') {
          userFriendlyError = 'Speech service network error. Please verify your connection.';
        }

        onError?.(userFriendlyError);
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimText('');
        recognitionRef.current = null;
      };

      recognition.start();
    } catch (err) {
      setIsListening(false);
      setInterimText('');
      recognitionRef.current = null;
      const message = err instanceof Error ? err.message : 'Could not activate microphone.';
      onError?.(message);
    }
  }, [lang, onError, onResult]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    isSupported,
    interimText,
    startListening,
    stopListening,
    toggleListening,
  };
}
