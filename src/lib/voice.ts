/**
 * Voice input (speech-to-text) for asking questions.
 *
 * Two backends, picked automatically:
 *   • Native (Android): the @capacitor-community/speech-recognition plugin —
 *     reliable on-device recognition with live partial results.
 *   • Web: the browser SpeechRecognition API (Chrome / desktop preview).
 *
 * Everything is loaded lazily so a browser without either backend still builds
 * and runs — the mic button simply hides when `voiceAvailable()` is false.
 */
import { isNative } from './native';

export type VoiceLang = 'hi' | 'en' | 'hinglish';

/** BCP-47 tag for the recognizer. Hinglish → Hindi engine (handles mixed speech best). */
function localeFor(lang: VoiceLang): string {
  return lang === 'en' ? 'en-IN' : 'hi-IN';
}

let webRec: any = null;      // active Web SpeechRecognition instance
let nativeListening = false; // whether the native plugin is mid-session

/** Is speech-to-text usable at all on this device/browser? */
export async function voiceAvailable(): Promise<boolean> {
  if (isNative) {
    try {
      const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
      const r = await SpeechRecognition.available();
      return !!r?.available;
    } catch { return false; }
  }
  return typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

interface VoiceHandlers {
  lang: VoiceLang;
  onPartial?: (text: string) => void; // live, as they speak
  onFinal: (text: string) => void;    // final transcript
  onError?: (msg: string) => void;
  onEnd?: () => void;                  // recognizer stopped (any reason)
}

/**
 * Start listening. Returns true if it actually started. Call `stopVoice()` to
 * end early; `onFinal`/`onEnd` fire when recognition completes.
 */
export async function startVoice(h: VoiceHandlers): Promise<boolean> {
  const locale = localeFor(h.lang);

  if (isNative) {
    try {
      const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
      const perm = await SpeechRecognition.checkPermissions();
      if (perm.speechRecognition !== 'granted') {
        const req = await SpeechRecognition.requestPermissions();
        if (req.speechRecognition !== 'granted') { h.onError?.('Microphone permission denied.'); return false; }
      }
      await SpeechRecognition.removeAllListeners();
      if (h.onPartial) {
        await SpeechRecognition.addListener('partialResults', (data: any) => {
          const m = data?.matches?.[0];
          if (m) h.onPartial!(m);
        });
      }
      await SpeechRecognition.addListener('listeningState', (data: any) => {
        if (data?.status === 'stopped') { nativeListening = false; h.onEnd?.(); }
      });
      nativeListening = true;
      // With partialResults the final transcript also comes back on resolve.
      SpeechRecognition.start({ language: locale, maxResults: 1, partialResults: true, popup: false })
        .then((res: any) => {
          const m = res?.matches?.[0];
          if (m) h.onFinal(m);
        })
        .catch((e: any) => { nativeListening = false; h.onError?.(e?.message || 'Could not hear that.'); h.onEnd?.(); });
      return true;
    } catch (e: any) {
      h.onError?.(e?.message || 'Voice input is unavailable.');
      return false;
    }
  }

  // Web backend
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) { h.onError?.('Voice input is not supported here.'); return false; }
  try {
    const rec = new Ctor();
    webRec = rec;
    rec.lang = locale;
    rec.interimResults = !!h.onPartial;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (ev: any) => {
      let finalText = '', interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0]?.transcript ?? '';
        if (ev.results[i].isFinal) finalText += t; else interim += t;
      }
      if (interim && h.onPartial) h.onPartial(interim);
      if (finalText) h.onFinal(finalText);
    };
    rec.onerror = (ev: any) => h.onError?.(ev?.error === 'not-allowed' ? 'Microphone permission denied.' : 'Could not hear that.');
    rec.onend = () => { webRec = null; h.onEnd?.(); };
    rec.start();
    return true;
  } catch (e: any) {
    h.onError?.(e?.message || 'Could not start voice input.');
    return false;
  }
}

/** Stop an active session (native or web). Safe to call anytime. */
export async function stopVoice(): Promise<void> {
  if (isNative) {
    if (!nativeListening) return;
    try {
      const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
      await SpeechRecognition.stop();
      await SpeechRecognition.removeAllListeners();
    } catch { /* ignore */ }
    nativeListening = false;
    return;
  }
  try { webRec?.stop(); } catch { /* ignore */ }
  webRec = null;
}
