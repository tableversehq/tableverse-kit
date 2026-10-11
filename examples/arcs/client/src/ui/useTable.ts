import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { GameState } from "arcs-engine/state";
import { client, type Game, type Input } from "../client.ts";
import { diffMap, type MapEffect } from "../map/effects.ts";
import {
  isStep,
  list,
  type Answers,
  type Ctx,
  type Flow,
  type Step,
  type Target,
} from "../model/flow.ts";
import { hydrate } from "../model/hydrate.ts";
import { attempt } from "../model/oracle.ts";
import { situation, type Global, type Situation } from "../model/situation.ts";
import { explain } from "../model/text.ts";

const subscribe = (fn: () => void) => client.subscribe(fn);

export interface RootEntry {
  flow: Flow;
  stepId: string;
  target: Target;
}

export interface Table {
  status: string;
  view: Game | null;
  me: string | null;
  version: number | null;
  sit: Situation | null;
  base: GameState | null;
  flow: Flow | undefined;
  step: Step | undefined;
  answers: Answers;
  targets: Map<string, Target>;
  picked: Set<string>;
  menu: { key: string; entries: RootEntry[] } | null;
  error: string;
  busy: boolean;
  effects: MapEffect[];
  pick(key: string): void;
  choose(value: string): void;
  setParam(id: string, value: number): void;
  confirm(): void;
  cancel(): void;
  start(flow: Flow, answers?: Answers): void;
  runGlobal(g: Global): void;
  send(input: Input): void;
  clearError(): void;
}

export function useTable(): Table {
  const view = useSyncExternalStore(subscribe, () => client.getView());
  const status = useSyncExternalStore(subscribe, () => client.getStatus());
  const version = useSyncExternalStore(subscribe, () =>
    client.getStateVersion(),
  );
  const me = client.getViewerId();
  const g = view?.game ?? null;

  const base = useMemo(() => (g ? hydrate(g) : null), [g]);
  const ctx: Ctx | undefined = useMemo(
    () =>
      g && base && me && g.order.includes(me)
        ? { view: g, base, me }
        : undefined,
    [g, base, me],
  );
  const sit = useMemo(() => (g ? situation(g, ctx, me) : null), [g, ctx, me]);

  const [chosen, setChosen] = useState<{ flow?: Flow; answers: Answers }>({
    answers: {},
  });
  const [menu, setMenu] = useState<Table["menu"]>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [effects, setEffects] = useState<MapEffect[]>([]);
  const prev = useRef<Game | null>(null);

  useEffect(() => {
    setChosen({ answers: {} });
    setMenu(null);
    setBusy(false);
    if (g) {
      const fx = diffMap(prev.current, g);
      prev.current = g;
      if (fx.length) {
        setEffects((e) => [...e, ...fx]);
        const ids = new Set(fx.map((f) => f.id));
        setTimeout(
          () => setEffects((e) => e.filter((f) => !ids.has(f.id))),
          1300,
        );
      }
    }
  }, [version, g]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    document.title = sit?.mine ? "● Your turn · ARCS" : "ARCS · The Reach";
  }, [sit?.mine]);

  const flow = sit?.focus ?? chosen.flow;
  const answers = chosen.answers;
  const outcome = flow ? flow.run(answers) : undefined;
  const step = outcome && isStep(outcome) ? outcome : undefined;
  const ready = outcome && !isStep(outcome) ? outcome.input : undefined;

  const execute = useCallback(
    async (input: Input) => {
      if (!ctx) return;
      const trial = attempt(ctx.base, ctx.me, input);
      if (!trial.ok) {
        setError(explain(trial.reason));
        setChosen({ answers: {} });
        return;
      }
      setBusy(true);
      try {
        const result = await client.execute({ type: "act", input });
        if (!result.accepted) {
          setError(explain(result.reason ?? "rejected"));
          setBusy(false);
          setChosen({ answers: {} });
        }
      } catch {
        setError("Connection problem — try again.");
        setBusy(false);
      }
    },
    [ctx],
  );

  const followUps = useRef<Input[]>([]);
  const readyKey = ready ? JSON.stringify(ready) : "";
  useEffect(() => {
    if (!ready || busy || !outcome || isStep(outcome)) return;
    followUps.current = outcome.then ?? [];
    void execute(ready);
  }, [readyKey]);

  useEffect(() => {
    const next = followUps.current[0];
    if (!next || !ctx) return;
    followUps.current = followUps.current.slice(1);
    if (attempt(ctx.base, ctx.me, next).ok) void execute(next);
    else followUps.current = [];
  }, [version, ctx, execute]);

  const root = useMemo(() => {
    const entries = new Map<string, RootEntry[]>();
    if (!sit?.mine || sit.phase !== "actions" || chosen.flow) return entries;
    const flows: Flow[] = [
      ...sit.verbs.filter((v) => v.available).map((v) => v.flow),
      ...(sit.spend ? [sit.spend] : []),
      ...sit.preludes,
    ];
    for (const f of flows) {
      const first = f.run({});
      if (!isStep(first)) continue;
      for (const t of first.targets ?? []) {
        const list = entries.get(t.key) ?? [];
        list.push({ flow: f, stepId: first.id, target: t });
        entries.set(t.key, list);
      }
    }
    return entries;
  }, [sit, chosen.flow]);

  const targets = useMemo(() => {
    const m = new Map<string, Target>();
    if (step?.targets) for (const t of step.targets) m.set(t.key, t);
    else if (!flow)
      for (const [k, entries] of root) {
        const first = entries[0];
        if (!first) continue;
        m.set(k, {
          ...first.target,
          label:
            entries.length > 1
              ? entries.map((e) => e.flow.label).join(" / ")
              : first.target.label,
          detail: entries.length > 1 ? "Click to choose" : first.target.detail,
        });
      }
    return m;
  }, [step, flow, root]);

  const picked = useMemo(() => {
    const s = new Set<string>();
    if (step?.multi) for (const v of list(answers, step.id)) s.add(v);
    for (const h of step?.highlight ?? []) s.add(h);
    return s;
  }, [step, answers]);

  const set = (id: string, value: Answers[string]) =>
    setChosen((c) => ({
      flow: c.flow,
      answers: { ...c.answers, [id]: value },
    }));

  const toggle = (id: string, value: string, max: number) =>
    setChosen((c) => {
      const cur = list(c.answers, id);
      const next = cur.includes(value)
        ? cur.filter((v) => v !== value)
        : max === 1
          ? [value]
          : cur.length >= max
            ? cur
            : [...cur, value];
      return { flow: c.flow, answers: { ...c.answers, [id]: next } };
    });

  const start = (f: Flow, a: Answers = {}) => {
    setMenu(null);
    setChosen({ flow: f, answers: a });
  };

  const pick = (k: string) => {
    if (busy) return;
    if (step) {
      const t = step.targets?.find((x) => x.key === k);
      if (!t) {
        const first = flow?.run({});
        const restart =
          first && isStep(first)
            ? first.targets?.find((x) => x.key === k)
            : undefined;
        if (first && isStep(first) && restart)
          setChosen((c) =>
            c.answers[first.id] === restart.value
              ? { answers: {} }
              : { flow: c.flow, answers: { [first.id]: restart.value } },
          );
        return;
      }
      if (step.multi) toggle(step.id, t.value, step.multi.max);
      else set(step.id, t.value);
      return;
    }
    const entries = root.get(k);
    if (!entries?.length) return;
    if (entries.length === 1 && entries[0])
      start(entries[0].flow, { [entries[0].stepId]: entries[0].target.value });
    else setMenu({ key: k, entries });
  };

  const cancel = () => {
    setMenu(null);
    setChosen({ answers: {} });
  };

  const choose = (value: string) => {
    if (busy || !step) return;
    if (value === "cancel") return cancel();
    if (step.multi) toggle(step.id, value, step.multi.max);
    else set(step.id, value);
  };

  const confirm = () => {
    if (busy || !step) return;
    if (step.multi) set("go", "yes");
    else set(step.id, "yes");
  };

  const setParam = (id: string, value: number) => set(id, value);

  const runGlobal = (gl: Global) => {
    if (!busy) void execute(gl.input);
  };

  return {
    status,
    view: g,
    me,
    version,
    sit,
    base,
    flow,
    step,
    answers,
    targets,
    picked,
    menu,
    error,
    busy,
    effects,
    pick,
    choose,
    setParam,
    confirm,
    cancel,
    start,
    runGlobal,
    send: (input: Input) => {
      if (!busy) void execute(input);
    },
    clearError: () => setError(""),
  };
}
