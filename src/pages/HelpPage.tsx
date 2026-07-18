import React, { useMemo, useState } from "react";
import {
  Mail, Send, ChevronDown, MessageCircleQuestion, Code2,
  MessageCircle, Search, ShieldCheck, Copy, Check,
  HeartHandshake, CalendarDays, Clock4, FileText, ChevronRight,
} from "lucide-react";
import { Pressable } from "@/components/mobile/Pressable";

// ── Developer / support contact ──────────────────────────────────────────
// Change these to the real values any time.
const DEVELOPER_NAME = "Vansh Kashyap";
const SUPPORT_EMAIL = "grivaaseo@gmail.com";
const SUPPORT_WHATSAPP = ""; // e.g. "919876543210" (country code + number, no +). Leave blank to hide.

const TOPICS = ["Bug / Problem", "Feedback", "Feature request", "Question", "Other"];

const FAQ: Array<{ q: string; a: string }> = [
  { q: "My chart looks wrong or the time is off — how do I fix it?", a: "On the Create Chart page, enter the date (YYYY-MM-DD), the time (double-check hour/minute and AM/PM) and pick the correct place from the suggestions. A wrong AM/PM changes the Lagna entirely. Re-create the chart with the correct details." },
  { q: "The AI is not answering, or I get a limit error.", a: "The app uses several AI providers and automatically switches to the next one. Wait a minute and send again. If it keeps failing, report it from the form above." },
  { q: "Voice / mic is not working.", a: "The microphone needs a secure connection. Open the app over HTTPS, and allow microphone permission when the browser or phone asks for it." },
  { q: "How do I match two kundlis?", a: "Open More → Kundli Matching, fill in the name, date, time and place for both people (choose the place from the suggestions), then tap Match Kundli. You get the full 36-point Ashtakoot result." },
  { q: "Where are the Daily Panchang and Muhurat?", a: "Both are in the More menu. Select a date and city to see the tithi, nakshatra, Rahu Kaal, Choghadiya and the auspicious muhurats." },
  { q: "How do I change the language of a report or answer?", a: "Life Report, Ask AI, Sectors, Transit and Matching each have a language selector at the top. 12 languages are supported, including Hindi, Tamil and Telugu." },
  { q: "How do I change the app theme?", a: "Go to Settings → Theme and tap any swatch. The whole app updates instantly, and your choice is remembered." },
  { q: "Why do Live Transit, Sectors and Ask AI have separate chats?", a: "Each one keeps its own conversation so context from one screen never leaks into another. This is intentional." },
  { q: "Where is my chart data stored? Is it private?", a: "Your charts are stored against your own account and are visible only to you. You can view or delete them any time from Profiles." },
  { q: "How do I download a report as PDF?", a: "Open the Life Report and tap the PDF button at the top. The PDF includes the charts, birth details, dasha and the full reading." },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="m-card">
      <Pressable
        subtle
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
      >
        <span className="text-[14px] font-semibold leading-snug">{q}</span>
        <ChevronDown
          className={`h-[18px] w-[18px] shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </Pressable>
      {open && (
        <div className="border-t border-border bg-muted px-4 py-3.5">
          <p className="selectable text-[13.5px] leading-relaxed text-muted-foreground">{a}</p>
        </div>
      )}
    </div>
  );
}

const QUICK = [
  { title: "Create Chart", desc: "Generate a new birth chart", icon: FileText, to: "/create-chart", tint: "#A78BFA" },
  { title: "Kundli Matching", desc: "36-point compatibility", icon: HeartHandshake, to: "/match", tint: "#F26D9B" },
  { title: "Daily Panchang", desc: "Tithi, Rahu Kaal & more", icon: CalendarDays, to: "/panchang", tint: "#E8B44A" },
  { title: "Muhurat Finder", desc: "Auspicious timings", icon: Clock4, to: "/muhurat", tint: "#7DD3C0" },
];

const INPUT_CLS =
  "w-full rounded-2xl border border-input bg-card px-4 py-3.5 text-[15px] outline-none transition-colors focus:border-accent";

export default function HelpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState(TOPICS[0]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState("");

  const filteredFaq = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? FAQ.filter((f) => (f.q + " " + f.a).toLowerCase().includes(q)) : FAQ;
  }, [query]);

  const fullMessage = () => `[${topic}]\n${message}`;
  const openMailApp = () => {
    const subject = encodeURIComponent(`JanamJyot ${topic} — from ${name || "a user"}`);
    const body = encodeURIComponent(`Name: ${name}\nReply email: ${email}\n\n${fullMessage()}\n\n— Sent from JanamJyot Help`);
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || status === "sending") return;
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message: fullMessage() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.sent) { setStatus("sent"); setMessage(""); }
      else if (res.ok && data.configured === false) { openMailApp(); setStatus("idle"); }
      else setStatus("error");
    } catch { setStatus("error"); }
  };

  const copyEmail = () => {
    navigator.clipboard?.writeText(SUPPORT_EMAIL).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };

  const waLink = SUPPORT_WHATSAPP
    ? `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent("Hi, I need help with JanamJyot: ")}`
    : "";

  return (
    <div className="space-y-7 pt-2">
      <p className="m-enter px-1 text-[13.5px] leading-relaxed text-muted-foreground">
        Have a problem? Reach out directly, or find your answer below.
      </p>

      {/* contact channels */}
      <section className="m-enter">
        <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          Contact
        </h3>
        <div className="m-card divide-y divide-border">
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
              style={{ background: "#E8B44A22", color: "#E8B44A" }}
            >
              <Mail className="h-[19px] w-[19px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Email</p>
              <p className="truncate text-[14px] font-bold">{SUPPORT_EMAIL}</p>
            </div>
            <Pressable
              onClick={copyEmail}
              aria-label="Copy email"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground"
            >
              {copied ? <Check className="h-[18px] w-[18px] text-accent" /> : <Copy className="h-[18px] w-[18px]" />}
            </Pressable>
          </div>

          {waLink ? (
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="pressable pressable-sm flex items-center gap-3.5 px-4 py-3.5"
            >
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                style={{ background: "#34D39922", color: "#34D399" }}
              >
                <MessageCircle className="h-[19px] w-[19px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">WhatsApp</p>
                <p className="text-[14px] font-bold">Chat now</p>
              </div>
              <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
            </a>
          ) : (
            <div className="flex items-center gap-3.5 px-4 py-3.5 opacity-60">
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                style={{ background: "#34D39922", color: "#34D399" }}
              >
                <MessageCircle className="h-[19px] w-[19px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">WhatsApp</p>
                <p className="text-[14px] font-bold">Coming soon</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* developer */}
      <section className="m-card m-enter relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/10 blur-2xl" />
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          <Code2 className="h-3.5 w-3.5" /> Developer
        </p>
        <div className="mt-3 flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent text-[16px] font-bold text-accent-foreground">
            {DEVELOPER_NAME.split(" ").map((w) => w[0]).join("")}
          </span>
          <div className="min-w-0">
            <p className="text-[16px] font-bold leading-tight">{DEVELOPER_NAME}</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">Creator &amp; Developer — JanamJyot</p>
          </div>
        </div>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="pressable pressable-sm mt-4 flex items-center gap-3 rounded-2xl bg-muted px-4 py-3"
        >
          <Mail className="h-[18px] w-[18px] shrink-0 text-accent" />
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Email</span>
            <span className="block truncate text-[13.5px] font-medium">{SUPPORT_EMAIL}</span>
          </span>
        </a>
        <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
          Usually replies within 24–48 hours. Include chart details or a screenshot for a faster fix.
        </p>
      </section>

      {/* report form */}
      <section className="m-enter">
        <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          Send a message
        </h3>
        <div className="m-card p-4">
          <p className="mb-3.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <MessageCircleQuestion className="h-4 w-4 text-accent" /> Goes straight to the developer.
          </p>
          <form onSubmit={submit} className="space-y-3">
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className={`${INPUT_CLS} appearance-none`}
            >
              {TOPICS.map((t) => <option key={t}>{t}</option>)}
            </select>
            <input
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT_CLS}
            />
            <input
              type="email"
              placeholder="Your email (for a reply)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLS}
            />
            <textarea
              placeholder="Describe your problem, feedback or feature request…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className={`${INPUT_CLS} resize-none leading-relaxed`}
            />
            <button
              type="submit"
              disabled={!message.trim() || status === "sending"}
              className="pressable flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25 disabled:opacity-50"
            >
              <Send className={`h-[17px] w-[17px] ${status === "sending" ? "animate-pulse" : ""}`} strokeWidth={2.4} />
              {status === "sending" ? "Sending…" : "Send message"}
            </button>

            {status === "sent" && (
              <p className="text-center text-[12.5px] font-semibold text-accent">
                ✓ Message sent — you’ll get a reply soon.
              </p>
            )}
            {status === "error" && (
              <p className="selectable text-center text-[12.5px] text-destructive">
                Could not send. Please try again shortly, or email {SUPPORT_EMAIL} directly.
              </p>
            )}
          </form>
        </div>
      </section>

      {/* quick start */}
      <section className="m-enter">
        <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          Quick start
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {QUICK.map((q) => {
            const Icon = q.icon;
            return (
              <Pressable key={q.title} to={q.to} className="m-card block p-4 text-left">
                <span
                  className="mb-3 grid h-10 w-10 place-items-center rounded-xl"
                  style={{ background: `${q.tint}22`, color: q.tint }}
                >
                  <Icon className="h-[19px] w-[19px]" />
                </span>
                <p className="text-[14px] font-bold leading-tight">{q.title}</p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">{q.desc}</p>
              </Pressable>
            );
          })}
        </div>
      </section>

      {/* FAQ */}
      <section className="m-enter">
        <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          Frequently asked questions
        </h3>
        <div className="relative mb-3">
          <Search className="absolute left-4 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search help…"
            className={`${INPUT_CLS} pl-11`}
          />
        </div>
        <div className="space-y-2.5">
          {filteredFaq.length ? (
            filteredFaq.map((f) => <FaqItem key={f.q} {...f} />)
          ) : (
            <p className="px-1 text-[13.5px] text-muted-foreground">
              No results — try the contact form above.
            </p>
          )}
        </div>
      </section>

      {/* app info */}
      <section className="m-card m-enter flex items-start gap-3.5 p-4">
        <ShieldCheck className="h-7 w-7 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold">JanamJyot · v1.0</p>
          <p className="selectable mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
            Private by design — your charts stay on your account. Powered by our own astrology engine. 12 languages supported.
          </p>
        </div>
      </section>
    </div>
  );
}
