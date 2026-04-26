import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SkillBundle } from "../../types/shared";
import {
  filterSkills,
  groupSkills,
  masterStateOf,
  selectedCount,
  toggleAll,
  type MasterState,
} from "./grouping";

export function SkillPicker({
  skills,
  selected,
  onChange,
}: {
  skills: SkillBundle[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const allGroups = useMemo(() => groupSkills(skills), [skills]);
  const filteredGroups = useMemo(
    () => groupSkills(filterSkills(skills, query)),
    [skills, query],
  );

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const totalSelected = selected.size;
  const summary = useMemo(() => {
    if (totalSelected === 0) return null;
    const names: string[] = [];
    for (const s of allGroups.user) if (selected.has(s.id)) names.push(s.name);
    for (const g of allGroups.plugins) {
      const allSel = g.skills.every((s) => selected.has(s.id));
      if (allSel) names.push(g.pluginName);
      else for (const s of g.skills) if (selected.has(s.id)) names.push(s.name);
    }
    if (names.length <= 3) return names.join(", ");
    return `${names.slice(0, 2).join(", ")}, +${names.length - 2}`;
  }, [allGroups, selected, totalSelected]);

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  return (
    <div className="sp-popover-root" ref={rootRef}>
      <button
        type="button"
        className={`sp-trigger${open ? " sp-trigger-open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="sp-trigger-label">skills</span>
        {totalSelected > 0 ? (
          <span className="sp-trigger-badge">{totalSelected}</span>
        ) : (
          <span className="sp-trigger-placeholder">none selected</span>
        )}
        {summary && <span className="sp-trigger-summary">{summary}</span>}
        <svg
          viewBox="0 0 12 12"
          width="9"
          height="9"
          aria-hidden="true"
          className="sp-trigger-caret"
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="sp-popover" role="dialog" aria-label="Select skills">
          <div className="sp-popover-search">
            <input
              ref={inputRef}
              type="text"
              placeholder="filter skills…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="sp-popover-list">
            {filteredGroups.user.length > 0 && (
              <Section
                tone="user"
                title="user"
                ids={filteredGroups.user.map((s) => s.id)}
                selected={selected}
                onToggleAll={() =>
                  onChange(toggleAll(filteredGroups.user.map((s) => s.id), selected))
                }
              >
                {filteredGroups.user.map((s) => (
                  <SkillRow
                    key={s.id}
                    skill={s}
                    checked={selected.has(s.id)}
                    onToggle={() => toggleOne(s.id)}
                  />
                ))}
              </Section>
            )}
            {filteredGroups.plugins.map((g) => (
              <Section
                key={g.pluginName}
                tone="plugin"
                title={g.pluginName}
                meta={displayVersion(g.pluginVersion)}
                ids={g.skills.map((s) => s.id)}
                selected={selected}
                onToggleAll={() =>
                  onChange(toggleAll(g.skills.map((s) => s.id), selected))
                }
              >
                {g.skills.map((s) => (
                  <SkillRow
                    key={s.id}
                    skill={s}
                    checked={selected.has(s.id)}
                    onToggle={() => toggleOne(s.id)}
                  />
                ))}
              </Section>
            ))}
            {filteredGroups.user.length === 0 &&
              filteredGroups.plugins.length === 0 && (
                <div className="sp-empty">no matches</div>
              )}
          </div>
          <div className="sp-popover-footer">
            <button
              type="button"
              className="sp-clear"
              disabled={totalSelected === 0}
              onClick={() => onChange(new Set())}
            >
              clear all
            </button>
            <span className="sp-footer-count">
              {totalSelected} selected
            </span>
            <button
              type="button"
              className="sp-done"
              onClick={() => setOpen(false)}
            >
              done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function displayVersion(v: string | undefined): string | undefined {
  if (!v || v === "unknown") return undefined;
  return v;
}

function Section({
  tone,
  title,
  meta,
  ids,
  selected,
  onToggleAll,
  children,
}: {
  tone: "user" | "plugin";
  title: string;
  meta?: string;
  ids: string[];
  selected: Set<string>;
  onToggleAll: () => void;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const state = masterStateOf(ids, selected);
  const count = selectedCount(ids, selected);
  return (
    <section className={`sp-section sp-tone-${tone}`} data-expanded={expanded}>
      <header className="sp-header" onClick={() => setExpanded((e) => !e)}>
        <MasterCheckbox
          state={state}
          onToggle={onToggleAll}
          ariaLabel={`Toggle all ${title}`}
        />
        <span className="sp-title">{title}</span>
        {meta && <span className="sp-meta">{meta}</span>}
        <span className="sp-count">
          {count > 0 && state !== "all"
            ? `${count} of ${ids.length}`
            : `${ids.length}`}
        </span>
        <button
          type="button"
          className="sp-caret"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((x) => !x);
          }}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse" : "Expand"}
          tabIndex={-1}
        >
          <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>
      {expanded && <div className="sp-rows">{children}</div>}
    </section>
  );
}

function SkillRow({
  skill,
  checked,
  onToggle,
}: {
  skill: SkillBundle;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`sp-row${checked ? " sp-row-checked" : ""}`}
      onClick={onToggle}
    >
      <MasterCheckbox
        state={checked ? "all" : "none"}
        onToggle={onToggle}
        ariaLabel={`Toggle ${skill.name}`}
      />
      <span className="sp-row-name">{skill.name}</span>
      {skill.description && (
        <span className="sp-row-desc">{skill.description}</span>
      )}
    </button>
  );
}

function MasterCheckbox({
  state,
  onToggle,
  ariaLabel,
}: {
  state: MasterState;
  onToggle: () => void;
  ariaLabel: string;
}) {
  const ariaChecked: "true" | "false" | "mixed" =
    state === "all" ? "true" : state === "none" ? "false" : "mixed";
  return (
    <span
      role="checkbox"
      aria-checked={ariaChecked}
      aria-label={ariaLabel}
      tabIndex={0}
      className={`sp-cb sp-cb-${state}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <svg viewBox="0 0 14 14" width="9" height="9" aria-hidden="true">
        {state === "all" && (
          <path
            d="M2.5 7L5.5 10L11.5 4"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {state === "partial" && (
          <line
            x1="3"
            y1="7"
            x2="11"
            y2="7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}
      </svg>
    </span>
  );
}
