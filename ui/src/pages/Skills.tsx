import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { SkillBundle } from "../types/shared";
import { SkillBundleList } from "../components/SkillBundleList";
import "../styles/skills.css";

export function Skills() {
  const [skills, setSkills] = useState<SkillBundle[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setSkills(await api.getSkills());
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  if (error) {
    return (
      <div className="placeholder" style={{ padding: 24 }}>
        {error}
      </div>
    );
  }
  return <SkillBundleList skills={skills} />;
}
