import {
  isStep,
  type Answers,
  type Ctx,
  type Flow,
} from "../src/model/flow.ts";
import { hydrate } from "../src/model/hydrate.ts";
import { attempt } from "../src/model/oracle.ts";
import { situation } from "../src/model/situation.ts";
import type { Game, Input } from "../src/client.ts";

const [base = "http://localhost:5200", countText = "60", seedText = "1"] =
  process.argv.slice(2);
let s = Number(seedText) * 7919;
const random = () => (s = (s * 16807) % 2147483647) / 2147483647;

async function snapshot(viewer: string): Promise<Game> {
  const res = await fetch(`${base}/session?viewer=${viewer}`);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let text = "";
  for (;;) {
    const { value } = await reader.read();
    text += dec.decode(value, { stream: true });
    const m = text.match(/event: snapshot\ndata: (.+)\n/);
    if (m) {
      await reader.cancel();
      return JSON.parse(m[1]!).view.game;
    }
  }
}

function drive(flow: Flow): Input | undefined {
  const a: Answers = {};
  for (let i = 0; i < 12; i++) {
    const out = flow.run(a);
    if (!isStep(out)) return out.input;
    for (const p of out.params ?? [])
      a[p.id] = p.min + Math.floor(random() * (p.max - p.min + 1));
    if (out.multi) {
      a[out.id] = [
        ...(out.targets ?? []).map((t) => t.value),
        ...(out.choices ?? []).map((c) => c.value),
      ].slice(0, out.multi.min);
      a.go = "yes";
      continue;
    }
    const options = [
      ...(out.targets ?? []).map((t) => t.value),
      ...(out.choices ?? [])
        .filter((c) => c.value !== "cancel")
        .map((c) => c.value),
    ];
    if (options.length)
      a[out.id] = options[Math.floor(random() * options.length)]!;
    else if (out.confirm) a[out.id] = "yes";
    else return undefined;
  }
  return undefined;
}

for (let n = 0; n < Number(countText); n++) {
  const any = await snapshot("p1");
  const me =
    any.pending[0]?.actor ??
    (any.battle[0] ? any.battle[0].attacker : any.active);
  if (any.winner) break;
  const g = await snapshot(me);
  const ctx: Ctx = { view: g, base: hydrate(g), me };
  const sit = situation(g, ctx, me);
  const flows = sit.focus
    ? [sit.focus]
    : [
        ...sit.verbs.filter((v) => v.available).map((v) => v.flow),
        ...(sit.spend ? [sit.spend] : []),
        ...sit.preludes,
      ];
  let input: Input | undefined;
  for (let t = 0; t < 8 && !input; t++) {
    const end = sit.globals.find((x) => x.id === "end");
    if (end && (random() < 0.12 || !flows.length)) input = end.input;
    else if (flows.length) {
      const c = drive(flows[Math.floor(random() * flows.length)]!);
      if (c && attempt(ctx.base, me, c).ok) input = c;
    }
  }
  input ??= sit.globals[0]?.input;
  if (!input) break;
  const r = await fetch(`${base}/execute`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ viewer: me, command: { type: "act", input } }),
  });
  const body = await r.json();
  if (!body.accepted)
    console.log("rejected", me, JSON.stringify(input), JSON.stringify(body));
}
const end = await snapshot("p1");
console.log(
  `chapter ${end.chapter} round ${end.round} active ${end.active} phase ${end.phase} pending ${end.pending[0]?.kind ?? "-"} battle ${end.battle[0]?.step ?? "-"}`,
);
