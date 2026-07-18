import { useState } from "react";
import { getLang } from "@/lib/prefs";
import { useParams } from "react-router-dom";
import {
  ChevronDown, ChevronRight,
  Briefcase, GraduationCap, Heart, HeartHandshake, Activity, Coins, Building2, Compass,
} from "lucide-react";
import AnswerText from "@/components/AnswerText";
import SpeakButton from "@/components/SpeakButton";
import { Pressable } from "@/components/mobile/Pressable";
import { haptic } from "@/lib/native";

// Life sectors with the questions users most commonly ask in each. Tapping a
// question sends it to the same chart-based AI (/api/chat), which replies in the
// 4-phase (Answer → Past → Present → Future) format.
const SECTORS: Array<{
  key: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  questions: string[];
}> = [
  {
    key: "career",
    title: "Career",
    icon: Briefcase,
    questions: [
      "What does my birth chart reveal about my true career direction and calling?",
      "Which profession, industry, or work style best suits my natural strengths?",
      "Am I better suited to service, business, freelancing, or a leadership role?",
      "Is my current career path aligned with my long-term growth and potential?",
      "Which hidden talents or strengths can become my biggest professional advantage?",
      "What is currently blocking my career growth, recognition, or stability?",
      "Which planetary period is shaping my professional direction right now?",
      "Is this a favourable time for a major career move or a bold decision?",
      "How can I build authority, reputation, and lasting success in my field?",
      "What is my next step toward the career I am truly meant for?",
    ],
  },
  {
    key: "wealth",
    title: "Wealth & Money",
    icon: Coins,
    questions: [
      "What does my birth chart reveal about my overall wealth potential?",
      "What are my strongest and most natural sources of income?",
      "Why do I face money stress, financial delays, or unstable cash flow?",
      "How can I strengthen savings, discipline, and long-term financial security?",
      "Is this a favourable period for investment, expansion, or financial risk?",
      "Do I have indications for property, assets, or major financial gains — and when?",
      "Which planetary influences are currently affecting my income and savings?",
      "What financial mistakes or risky decisions should I avoid right now?",
      "How can I convert my income into lasting wealth over time?",
      "What is my next practical step toward financial stability and growth?",
    ],
  },
  {
    key: "job",
    title: "Job",
    icon: Building2,
    questions: [
      "What does my chart say about my current job and work situation?",
      "Is my present job supporting my growth, stability, and peace of mind?",
      "Should I stay in my current job or look for a better opportunity?",
      "What are my chances of a job change, promotion, or salary rise — and when?",
      "Is the current period favourable for interviews, selection, or switching jobs?",
      "Why am I facing pressure, politics, delays, or a lack of recognition at work?",
      "How can I improve my equation with seniors, colleagues, and management?",
      "Which strengths should I rely on to perform better in my current role?",
      "What workplace risks or wrong moves should I avoid in this phase?",
      "What should I do next for better job stability and steady progress?",
    ],
  },
  {
    key: "education",
    title: "Education",
    icon: GraduationCap,
    questions: [
      "What does my chart reveal about my learning style and academic potential?",
      "Which subject, stream, or specialisation is most suited to me?",
      "Is this a favourable period for exams, admissions, or competitive success?",
      "Do I have strong potential for higher education or studying abroad?",
      "Why do I struggle with focus, confidence, or consistency in my studies?",
      "Should I continue my current stream or consider a different direction?",
      "What obstacles may affect my education, and how can I handle them?",
      "Which skills should I build now for stronger future opportunities?",
      "Which planetary period is influencing my studies and focus right now?",
      "What is my best next step for academic or skill-based growth?",
    ],
  },
  {
    key: "love",
    title: "Love",
    icon: Heart,
    questions: [
      "What does my birth chart reveal about my love life and emotional nature?",
      "What kind of romantic connection is truly suited to me?",
      "Why do I face delay, confusion, or repeated patterns in love?",
      "Is the current period favourable for love, attraction, or emotional clarity?",
      "Should I express my feelings now, or wait for a better time?",
      "Does my chart support a stable, committed love relationship?",
      "What emotional mistakes or wrong choices should I avoid in love?",
      "Is there distance, misunderstanding, or a lack of clarity in my current bond?",
      "How can I build trust, communication, and emotional balance in love?",
      "What guidance does my chart give for a mature and meaningful love life?",
    ],
  },
  {
    key: "relationship",
    title: "Relationship & Marriage",
    icon: HeartHandshake,
    questions: [
      "What does my chart reveal about my marriage and long-term partnerships?",
      "When is marriage or a serious commitment indicated in my chart?",
      "What may cause delay, confusion, or obstacles in my marriage?",
      "What is the likely nature, background, and direction of my life partner?",
      "How compatible am I with a specific partner, beyond surface-level matching?",
      "What does my chart indicate about children, and is the timing favourable?",
      "How can I build harmony and understanding with my spouse and in-laws?",
      "Are current planetary influences creating tension in my close relationships?",
      "How can I handle misunderstandings, distance, or trust issues maturely?",
      "What should I do to build a peaceful, stable, and supportive married life?",
    ],
  },
  {
    key: "health",
    title: "Health",
    icon: Activity,
    questions: [
      "What does my birth chart indicate about my overall health and vitality?",
      "Which areas of health or lifestyle need the most attention in my chart?",
      "Are stress, sleep, emotions, or routine imbalance affecting my well-being?",
      "Which planetary influences may be impacting my physical or mental balance?",
      "What health patterns should I be more mindful of in the current period?",
      "How can I improve my energy, sleep, digestion, and daily wellness?",
      "What habits or excesses should I avoid for long-term well-being?",
      "Is this a good period for healing, fitness, or a lifestyle reset?",
      "Do I carry any chronic tendencies I should address early?",
      "What practical steps will best support my long-term well-being?",
    ],
  },
  {
    key: "lifepath",
    title: "Life Path & Remedies",
    icon: Compass,
    questions: [
      "What is the deeper purpose, direction, and core lesson of my birth chart?",
      "Which planetary period am I in now, and what is it trying to teach me?",
      "Why do I feel stuck, delayed, or blocked in certain areas of life?",
      "Is this phase temporary, and when can I expect clarity or forward movement?",
      "Are there any major doshas or difficult planetary influences in my chart?",
      "What do Sade Sati, Kaal Sarp, Pitra Dosh, or similar patterns mean for me personally?",
      "Which remedies genuinely suit my chart — mantra, charity, fasting, or discipline?",
      "Should I wear a gemstone, and is it truly safe and beneficial for my chart?",
      "Does my chart indicate foreign settlement, relocation, legal, or property matters?",
      "What is the single most important focus for my growth in the year ahead?",
    ],
  },
];

const LANGS: Array<[string, string]> = [
  ["en", "English"], ["hinglish", "Hinglish"], ["hi", "हिंदी"], ["ta", "தமிழ்"],
  ["te", "తెలుగు"], ["mr", "मराठी"], ["bn", "বাংলা"], ["gu", "ગુજરાતી"],
  ["kn", "ಕನ್ನಡ"], ["ml", "മലയാളം"], ["pa", "ਪੰਜਾਬੀ"], ["ur", "اردو"],
];

export default function SectorsPage() {
  const { chartId } = useParams();
  const [lang, setLang] = useState(getLang());
  const [open, setOpen] = useState<string>("career");
  // question -> { loading, answer }
  const [answers, setAnswers] = useState<Record<string, { loading: boolean; answer?: string }>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const askQuestion = async (q: string) => {
    setExpanded(expanded === q ? null : q);
    if (answers[q]?.answer || answers[q]?.loading) return; // already have / fetching
    setAnswers((prev) => ({ ...prev, [q]: { loading: true } }));
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chartId, question: q, language: lang, context: "sector" }),
      });
      const data = await res.json();
      const answer = res.ok ? data.answer : data.error || "Could not generate an answer.";
      if (res.ok) haptic.success(); else haptic.error();
      setAnswers((prev) => ({ ...prev, [q]: { loading: false, answer } }));
    } catch {
      haptic.error();
      setAnswers((prev) => ({ ...prev, [q]: { loading: false, answer: "Error fetching answer." } }));
    }
  };

  const active = SECTORS.find((s) => s.key === open);

  return (
    <div className="space-y-6 pt-2">
      <div className="m-enter flex items-center justify-between gap-3 px-1">
        <p className="text-[13px] leading-snug text-muted-foreground">
          Pick an area, tap a question — answers come from your kundli.
        </p>
        <select
          value={lang}
          onChange={(e) => { haptic.select(); setLang(e.target.value); }}
          aria-label="Reply language"
          className="h-9 shrink-0 rounded-full border border-border bg-card px-3 text-[12.5px] font-semibold text-muted-foreground outline-none"
        >
          {LANGS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
      </div>

      {/* ── Sector chips ─────────────────────────────────────────────────── */}
      <section className="m-enter" style={{ animationDelay: '0.04s' }}>
        <div className="grid grid-cols-2 gap-2.5">
          {SECTORS.map((s) => {
            const Icon = s.icon;
            const on = open === s.key;
            return (
              <Pressable
                key={s.key}
                feedback="select"
                onClick={() => setOpen(s.key)}
                className={`m-card flex min-h-[52px] items-center gap-2.5 px-3.5 py-3 text-left transition-colors ${
                  on ? "border-accent bg-accent/10" : ""
                }`}
              >
                <Icon className={`h-[19px] w-[19px] shrink-0 ${on ? "text-accent" : "text-muted-foreground"}`} />
                <span className={`text-[13px] font-bold leading-tight ${on ? "text-accent" : ""}`}>{s.title}</span>
              </Pressable>
            );
          })}
        </div>
      </section>

      {/* ── Questions of the selected sector ─────────────────────────────── */}
      {active && (
        <section key={active.key} className="m-enter" style={{ animationDelay: '0.06s' }}>
          <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
            {active.title} — common questions
          </h3>

          <div className="space-y-2.5">
            {active.questions.map((q) => {
              const state = answers[q];
              const isOpen = expanded === q;
              return (
                <div key={q} className="m-card">
                  <Pressable
                    subtle
                    onClick={() => askQuestion(q)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                  >
                    <span className="text-[14px] font-semibold leading-snug">{q}</span>
                    <ChevronDown
                      className={`h-[18px] w-[18px] shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </Pressable>

                  {isOpen && (
                    <div className="border-t border-border bg-muted/40 px-4 py-3.5">
                      {state?.loading && (
                        <div className="space-y-2">
                          <div className="skeleton h-3.5 w-2/3" />
                          <div className="skeleton h-3.5" />
                          <div className="skeleton h-3.5 w-5/6" />
                          <p className="pt-1 text-[12px] text-muted-foreground">Thinking…</p>
                        </div>
                      )}
                      {state?.answer && (
                        <div>
                          <div className="mb-1 flex justify-end">
                            <SpeakButton text={state.answer} lang={lang} />
                          </div>
                          <div className="selectable text-[14.5px] leading-relaxed">
                            <AnswerText text={state.answer} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <Pressable
        to={`/ask/${chartId}`}
        className="m-card m-enter flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-3.5"
        style={{ animationDelay: '0.1s' }}
      >
        <span className="text-[14px] font-bold">Ask your own question</span>
        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-accent" />
      </Pressable>
    </div>
  );
}
