export interface SpeechRecognitionHandlers {
  onSpeechStart: () => void;
  onTranscript: (transcript: string, isFinal: boolean) => void;
  onError: (error: string) => void;
  onMisfire: () => void;
  onEnd: () => void;
}

// Browser SpeechRecognition interface polyfill
interface IWindowSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
}

export class ClientBargeInController {
  private recognition: IWindowSpeechRecognition | null = null;
  private isListening: boolean = false;
  private misfireTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers: SpeechRecognitionHandlers;
  private hasReceivedSpeech: boolean = false;

  constructor(handlers: SpeechRecognitionHandlers) {
    this.handlers = handlers;
    this.initRecognition();
  }

  private initRecognition(): void {
    if (typeof window === 'undefined') return;

    const SpeechRecClass =
      (window as unknown as { SpeechRecognition?: new () => IWindowSpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => IWindowSpeechRecognition }).webkitSpeechRecognition;

    if (!SpeechRecClass) {
      return;
    }

    try {
      const rec = new SpeechRecClass();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onspeechstart = () => {
        this.hasReceivedSpeech = true;
        this.clearMisfireTimer();
        this.handlers.onSpeechStart();
      };

      rec.onresult = (event: SpeechRecognitionEvent) => {
        this.hasReceivedSpeech = true;
        this.clearMisfireTimer();

        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (res.isFinal) {
            final += res[0].transcript;
          } else {
            interim += res[0].transcript;
          }
        }

        const text = (final || interim).trim();
        if (text) {
          this.handlers.onTranscript(text, Boolean(final));
        }
      };

      rec.onerror = (ev) => {
        this.handlers.onError(ev.error);
      };

      rec.onend = () => {
        this.isListening = false;
        this.handlers.onEnd();
      };

      this.recognition = rec;
    } catch {
      this.recognition = null;
    }
  }

  public isSupported(): boolean {
    return this.recognition !== null;
  }

  public startListening(): boolean {
    if (this.isListening) return true;

    this.hasReceivedSpeech = false;
    this.handlers.onSpeechStart(); // Instant <50ms client-side mute callback

    // Set 1.2s misfire detection timer: if no speech starts within 1.2s, auto-resume
    this.misfireTimer = setTimeout(() => {
      if (!this.hasReceivedSpeech) {
        this.handlers.onMisfire();
        this.stopListening();
      }
    }, 1200);

    if (this.recognition) {
      try {
        this.recognition.start();
        this.isListening = true;
        return true;
      } catch {
        // Fallback or restart
      }
    }

    this.isListening = true;
    return false;
  }

  public stopListening(): void {
    this.clearMisfireTimer();
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore
      }
    }
  }

  private clearMisfireTimer(): void {
    if (this.misfireTimer) {
      clearTimeout(this.misfireTimer);
      this.misfireTimer = null;
    }
  }
}
