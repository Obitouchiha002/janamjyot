/**
 * Renders the AI's plain-text answer (the 4-phase ANSWER / PAST / PRESENT / FUTURE
 * format) as clean headings and bullet points — without needing markdown. Works in
 * any language because it keys off structure (bullet markers, short heading lines)
 * rather than specific words.
 */

function isBullet(line: string) {
  return /^\s*[•\-]\s+/.test(line);
}

// A heading is a short, non-bullet line — typically the phase label, often ending
// with ":" or "()". We treat short lines (<= 7 words) with no sentence punctuation
// in the middle as headings. Lines containing inline **bold** are content, not headings.
function isHeading(line: string) {
  const t = line.trim();
  if (!t || isBullet(t) || t.includes("**")) return false;
  const words = t.split(/\s+/).length;
  if (t.endsWith(":")) return words <= 9;
  // e.g. "Future (next 1-2 years)" / "Aane wala samay"
  if (words <= 6 && !/[.!?]/.test(t.slice(0, -1))) return true;
  return false;
}

// Render inline emphasis: **bold** → <strong>. Keeps the rest as plain text.
function renderInline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+?\*\*)/g).map((part, i) => {
    const m = /^\*\*([\s\S]+?)\*\*$/.exec(part);
    return m
      ? <strong key={i} className="font-bold text-foreground">{m[1]}</strong>
      : <span key={i}>{part}</span>;
  });
}

export default function AnswerText({ text }: { text: string }) {
  const lines = (text || "").split(/\r?\n/);
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = (key: string) => {
    if (!bullets.length) return;
    out.push(
      <ul key={key} className="list-disc pl-5 space-y-1.5 my-2">
        {bullets.map((b, i) => (
          <li key={i} className="text-sm leading-relaxed text-foreground/90">{renderInline(b)}</li>
        ))}
      </ul>
    );
    bullets = [];
  };

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) {
      flushBullets(`ul-${idx}`);
      return;
    }
    if (isBullet(line)) {
      bullets.push(line.replace(/^\s*[•\-*]\s+/, ""));
      return;
    }
    flushBullets(`ul-${idx}`);
    if (isHeading(line)) {
      out.push(
        <h4 key={`h-${idx}`} className="text-[13px] font-bold uppercase tracking-wide text-accent mt-3 first:mt-0">
          {line.replace(/\*\*/g, "").replace(/:$/, "")}
        </h4>
      );
    } else {
      out.push(
        <p key={`p-${idx}`} className="text-sm leading-relaxed text-foreground/90 my-1">{renderInline(line)}</p>
      );
    }
  });
  flushBullets("ul-end");

  return <div className="space-y-0.5">{out}</div>;
}
