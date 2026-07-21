import { useEffect, useId, useState } from "react";
import { Volume2, Pause, Play, Loader2 } from "lucide-react";
import { subscribe, toggle, stop, type TtsState } from "@/lib/tts";

/**
 * Small "Listen" button. Reads `text` aloud through the app's TTS controller
 * (natural Gemini voice from the server, browser voice as fallback).
 *
 * `context` chooses the voice:
 *   • "main"  → main-app voice   (default)
 *   • "chat"  → astrologer-chat voice
 *
 * Tap to play → tap to pause → tap to resume. Starting any other Speak button
 * stops this one automatically.
 */
export default function SpeakButton({
  text,
  lang = "en",
  context = "main",
  className = "",
}: {
  text: string;
  lang?: string;
  context?: "main" | "chat";
  className?: string;
}) {
  const id = useId();
  const [state, setState] = useState<TtsState>("idle");
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribe((aid, s) => { setActiveId(aid); setState(s); });
    return unsub;
  }, []);

  // stop playback if this button unmounts while it's the active one
  useEffect(() => () => { if (activeId === id) stop(); }, [activeId, id]);

  if (!text?.trim()) return null;

  const mine = activeId === id;
  const st: TtsState = mine ? state : "idle";

  const onClick = () => toggle(id, text, { context, lang });

  const icon =
    st === "loading" ? <Loader2 className="w-4 h-4 animate-spin" />
    : st === "playing" ? <Pause className="w-4 h-4" />
    : st === "paused" ? <Play className="w-4 h-4" />
    : <Volume2 className="w-4 h-4" />;

  const title = st === "playing" ? "Pause" : st === "paused" ? "Resume" : "Listen";

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      /* 28px circle padded out to a 44px hit area: it sits inline beside body
         text, so a bare 28px target sent mistaps into the paragraph. */
      className={`inline-flex box-content items-center justify-center w-7 h-7 p-2 -m-2 rounded-full hover:bg-accent/15 text-muted-foreground hover:text-accent transition-colors ${st === "playing" ? "text-accent animate-pulse" : st === "paused" ? "text-accent" : ""} ${className}`}
    >
      {icon}
    </button>
  );
}
