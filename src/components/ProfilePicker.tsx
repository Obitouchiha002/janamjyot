import { useEffect, useState } from "react";
import { User } from "lucide-react";
import { Pressable } from "@/components/mobile/Pressable";

interface Profile { id: string; name: string; date: string; }

/** Dropdown of saved charts; calls onPick with the chosen chartId (auto-picks the first). */
export default function ProfilePicker({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/profiles").then((r) => r.json()).then((d) => {
      const list: Profile[] = Array.isArray(d) ? d : [];
      setProfiles(list);
      setLoaded(true);
      if (list.length && !value) onPick(list[0].id);
    }).catch(() => setLoaded(true));
  }, []); // eslint-disable-line

  if (loaded && profiles.length === 0) {
    return (
      <div className="m-card p-5 text-center">
        <p className="text-[15px] font-bold">No saved charts yet</p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">Create a chart first to use this tool.</p>
        <Pressable
          to="/create-chart"
          feedback="medium"
          className="mt-4 inline-flex items-center justify-center rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
        >
          Create Chart
        </Pressable>
      </div>
    );
  }

  return (
    <label className="m-card flex items-center gap-3 px-3.5 py-1">
      <User className="h-[18px] w-[18px] shrink-0 text-accent" />
      <select
        value={value}
        onChange={(e) => onPick(e.target.value)}
        className="h-11 w-full min-w-0 bg-transparent text-[14px] font-semibold text-foreground focus:outline-none"
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id} className="bg-card text-foreground">
            {p.name} · {p.date}
          </option>
        ))}
      </select>
    </label>
  );
}
