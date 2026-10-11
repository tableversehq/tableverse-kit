import { DICE, RESOURCES, courtCard } from "arcs-engine/data";
import { paymentActions } from "arcs-engine/rules";
import type { GameState } from "arcs-engine/state";
import { attempt } from "./oracle.ts";
import type { Input } from "../client.ts";
import {
  effects,
  key,
  list,
  num,
  ok,
  str,
  type Answers,
  type Choice,
  type Ctx,
  type Flow,
  type Outcome,
  type Target,
} from "./flow.ts";
import {
  RESOURCE_INFO,
  VERB_INFO,
  courtName,
  playerName,
  systemName,
} from "./text.ts";

export type Pay =
  | { source: "pip" }
  | { source: "resource"; slot: number; resource: string };

const payInput = (pay: Pay) =>
  pay.source === "pip"
    ? { source: "pip" }
    : { source: "resource", slot: pay.slot, resource: pay.resource };

const GUILD_VERBS: Record<string, [string, string]> = {
  manufacture: ["mining-interest", "build"],
  synthesize: ["shipping-interest", "build"],
  pressgang: ["prison-wardens", "build"],
  execute: ["prison-wardens", "influence"],
  abduct: ["court-enforcers", "battle"],
  trade: ["elder-broker", "tax"],
};

const LOYAL: Record<string, string> = {
  material: "loyal-engineers",
  fuel: "loyal-pilots",
  weapon: "loyal-marines",
  relic: "loyal-keepers",
  psionic: "loyal-empaths",
};

export function verbsFor(ctx: Ctx, pay: Pay): string[] {
  const base = paymentActions(ctx.base, ctx.me, { op: "", ...payInput(pay) });
  const guild = Object.entries(GUILD_VERBS)
    .filter(
      ([, [card, action]]) =>
        ctx.base.has(ctx.me, card) && base.includes(action),
    )
    .map(([verb]) => verb);
  return [...new Set(base), ...guild];
}

function single<T extends { value: string }>(
  a: Answers,
  id: string,
  options: T[],
): string | undefined {
  return str(a, id) ?? (options.length === 1 ? options[0]?.value : undefined);
}

export function expectedDice(assault: number, skirmish: number, raid: number) {
  const avg = (type: string, field: "self" | "ship" | "building" | "keys") =>
    (DICE[type] ?? []).reduce((n, f) => n + f[field], 0) / 6;
  const interceptChance = (type: string) =>
    (DICE[type] ?? []).filter((f) => f.intercept).length / 6;
  const total = (field: "self" | "ship" | "building" | "keys") =>
    assault * avg("assault", field) +
    skirmish * avg("skirmish", field) +
    raid * avg("raid", field);
  const noIntercept =
    (1 - interceptChance("assault")) ** assault *
    (1 - interceptChance("raid")) ** raid;
  return {
    toThem: total("ship"),
    buildings: total("building"),
    toYou: total("self"),
    keys: total("keys"),
    intercept: 1 - noIntercept,
  };
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

export function verbFlow(ctx: Ctx, verb: string, pay: Pay): Flow {
  const g = ctx.base,
    me = ctx.me,
    p = payInput(pay);
  const info = VERB_INFO[verb];
  const flow = (run: (a: Answers) => Outcome): Flow => ({
    id: `verb:${verb}:${pay.source === "pip" ? "pip" : pay.slot}`,
    label: info?.name ?? verb,
    hint: info?.hint,
    run,
  });
  const done = (input: Input): Outcome => ({ input });

  if (verb === "tax")
    return flow((a) => {
      const targets: Target[] = g.pieces
        .filter((c) => c.kind === "city")
        .map((c) => ({ c, input: { op: "tax", target: c.id, ...p } }))
        .filter(({ input }) => ok(ctx, input))
        .map(({ c, input }) => ({
          key: key.piece(c.id),
          value: c.id,
          label: `Tax ${systemName(ctx.view, c.system)}${c.owner === me ? "" : ` (${playerName(ctx.view, c.owner)})`}`,
          detail: effects(ctx, input),
        }));
      const target = str(a, "target");
      if (target) return done({ op: "tax", target, ...p });
      return { id: "target", prompt: "Tax — choose a city", targets };
    });

  if (verb === "build")
    return flow((a) => {
      const kindsAt = (system: string) => {
        const choices: Choice[] = [];
        for (const kind of ["city", "starport"])
          if (ok(ctx, { op: "build", kind, system, ...p }))
            choices.push({
              value: kind,
              label: kind === "city" ? "City" : "Starport",
              detail: effects(ctx, { op: "build", kind, system, ...p }),
            });
        const port = g.pieces.find(
          (x) =>
            x.kind === "starport" &&
            x.owner === me &&
            x.system === system &&
            !g.built.includes(x.id),
        );
        if (
          port &&
          ok(ctx, { op: "build", kind: "ship", system, target: port.id, ...p })
        )
          choices.push({
            value: "ship",
            label: "Ship at your starport",
            detail: effects(ctx, {
              op: "build",
              kind: "ship",
              system,
              target: port.id,
              ...p,
            }),
          });
        return { choices, port };
      };
      const system = str(a, "system");
      if (!system) {
        const targets: Target[] = g.systems
          .map((s) => ({ s, kinds: kindsAt(s.id).choices }))
          .filter(({ kinds }) => kinds.length)
          .map(({ s, kinds }) => ({
            key: key.system(s.id),
            value: s.id,
            label:
              kinds.length === 1 && kinds[0]?.value === "ship"
                ? `Build a ship at your starport in ${systemName(ctx.view, s.id)}`
                : `Build in ${systemName(ctx.view, s.id)}`,
            detail:
              kinds.length === 1 && kinds[0]?.value === "ship"
                ? "Building slots are full; your starport can still build a ship"
                : kinds.map((k) => k.label).join(" / "),
          }));
        return { id: "system", prompt: "Build — choose where", targets };
      }
      const { choices, port } = kindsAt(system);
      const kind = str(a, "kind");
      if (!kind || !choices.some((c) => c.value === kind))
        return {
          id: "kind",
          prompt: `Build in ${systemName(ctx.view, system)} — what?`,
          highlight: [key.system(system)],
          choices: choices.map((c) => ({ ...c, tone: "primary" as const })),
        };
      return done({
        op: "build",
        kind,
        system,
        ...(kind === "ship" ? { target: port?.id } : {}),
        ...p,
      });
    });

  if (verb === "repair")
    return flow((a) => {
      const target = str(a, "target");
      if (target) return done({ op: "repair", target, ...p });
      const targets: Target[] = g.pieces
        .filter((x) => x.owner === me && x.damaged)
        .filter((x) => ok(ctx, { op: "repair", target: x.id, ...p }))
        .map((x) => ({
          key: key.piece(x.id),
          value: x.id,
          label: `Repair ${x.kind} in ${systemName(ctx.view, x.system)}`,
        }));
      return {
        id: "target",
        prompt: "Repair — choose a damaged piece",
        targets,
      };
    });

  if (verb === "influence" || verb === "secure" || verb === "abduct")
    return flow((a) => {
      const card = str(a, "card");
      if (card) return done({ op: verb, card, ...p });
      const targets: Target[] = g.court
        .filter((c) => ok(ctx, { op: verb, card: c.id, ...p }))
        .map((c) => ({
          key: key.court(c.id),
          value: c.id,
          label: `${info?.name ?? verb} ${courtName(c.id)}`,
          detail:
            verb === "influence"
              ? "Place 1 agent"
              : effects(ctx, { op: verb, card: c.id, ...p }),
        }));
      return {
        id: "card",
        prompt: `${info?.name} — choose a Court card`,
        targets,
      };
    });

  if (verb === "move")
    return flow((a) => {
      const origin = str(a, "origin");
      const shipsAt = (system: string) =>
        g.pieces.filter(
          (x) => x.owner === me && x.kind === "ship" && x.system === system,
        );
      if (!origin) {
        const targets: Target[] = [
          ...new Set(
            g.pieces
              .filter((x) => x.owner === me && x.kind === "ship")
              .map((x) => x.system),
          ),
        ]
          .filter((s) =>
            g.system(s).neighbors.some((n) =>
              ok(ctx, {
                op: "move",
                ids: shipsAt(s).map((x) => x.id),
                system: n,
                ...p,
              }),
            ),
          )
          .map((s) => ({
            key: key.system(s),
            value: s,
            label: `Move from ${systemName(ctx.view, s)}`,
            detail: `${shipsAt(s).length} ship${shipsAt(s).length > 1 ? "s" : ""}`,
          }));
        return { id: "origin", prompt: "Move — choose ships to move", targets };
      }
      const fresh = shipsAt(origin).filter((x) => !x.damaged),
        damaged = shipsAt(origin).filter((x) => x.damaged);
      const nf = Math.min(num(a, "fresh", fresh.length), fresh.length),
        nd = Math.min(num(a, "damaged", damaged.length), damaged.length);
      const ids = [...fresh.slice(0, nf), ...damaged.slice(0, nd)].map(
        (x) => x.id,
      );
      const routes = ids.length
        ? moveRoutes(ctx, origin, ids, p)
        : new Map<string, Input[]>();
      const dest = str(a, "dest");
      const route = dest ? routes.get(dest) : undefined;
      if (route?.[0]) return { input: route[0], then: route.slice(1) };
      const via = (seq: Input[]) =>
        seq
          .slice(0, -1)
          .map((step) => step.system)
          .filter((s): s is string => !!s);
      const targets: Target[] = [...routes].map(([n, seq]) => {
        const hops = via(seq);
        return {
          key: key.system(n),
          value: n,
          label: `${hops.length ? "Catapult" : "Move"} ${ids.length} → ${systemName(ctx.view, n)}`,
          detail: hops.length
            ? `via ${hops.map((s) => systemName(ctx.view, s)).join(", ")}`
            : undefined,
        };
      });
      return {
        id: "dest",
        prompt: ids.length
          ? `Move ${ids.length} ship${ids.length > 1 ? "s" : ""} from ${systemName(ctx.view, origin)} — choose a destination`
          : "Choose at least one ship",
        highlight: [key.system(origin)],
        targets,
        params: [
          ...(fresh.length
            ? [
                {
                  id: "fresh",
                  label: "Fresh",
                  min: 0,
                  max: fresh.length,
                  value: nf,
                },
              ]
            : []),
          ...(damaged.length
            ? [
                {
                  id: "damaged",
                  label: "Damaged",
                  min: 0,
                  max: damaged.length,
                  value: nd,
                },
              ]
            : []),
        ],
      };
    });

  if (verb === "battle")
    return flow((a) => {
      const rivalsAt = (system: string) =>
        [
          ...new Set(
            g
              .at(system)
              .filter((x) => x.owner !== me)
              .map((x) => x.owner),
          ),
        ].filter((d) =>
          ok(ctx, {
            op: "battle",
            system,
            target: d,
            assault: 0,
            skirmish: 0,
            raid: 0,
            ...p,
          }),
        );
      const system = str(a, "system");
      if (!system) {
        const targets: Target[] = g.systems
          .filter((s) => g.at(s.id, me, "ship").length && rivalsAt(s.id).length)
          .map((s) => ({
            key: key.system(s.id),
            value: s.id,
            label: `Battle in ${systemName(ctx.view, s.id)}`,
            detail: rivalsAt(s.id)
              .map((d) => playerName(ctx.view, d))
              .join(" / "),
          }));
        return {
          id: "system",
          prompt: "Battle — choose a system with your ships",
          targets,
        };
      }
      const rivals = rivalsAt(system);
      const defender = single(
        a,
        "defender",
        rivals.map((d) => ({ value: d })),
      );
      if (!defender)
        return {
          id: "defender",
          prompt: `Battle in ${systemName(ctx.view, system)} — choose the defender`,
          highlight: [key.system(system)],
          choices: rivals.map((d) => ({
            value: d,
            label: playerName(ctx.view, d),
            tone: "primary",
          })),
        };
      const ships = g.at(system, me, "ship").length;
      const maxDice = Math.min(
        18,
        ships + (g.has(me, "gatekeepers") && !g.system(system).planet ? 2 : 0),
      );
      const raidOk = ok(ctx, {
        op: "battle",
        system,
        target: defender,
        assault: 0,
        skirmish: 0,
        raid: 1,
        ...p,
      });
      const assault = Math.min(6, num(a, "assault", Math.min(6, maxDice))),
        skirmish = Math.min(6, num(a, "skirmish", 0)),
        raid = raidOk ? Math.min(6, num(a, "raid", 0)) : 0;
      const input: Input = {
        op: "battle",
        system,
        target: defender,
        assault,
        skirmish,
        raid,
        ...p,
      };
      if (str(a, "roll")) return done(input);
      const e = expectedDice(assault, skirmish, raid);
      const total = assault + skirmish + raid;
      return {
        id: "roll",
        prompt: `Battle ${playerName(ctx.view, defender)} in ${systemName(ctx.view, system)} — collect up to ${maxDice} dice`,
        highlight: [key.system(system)],
        detail:
          total > maxDice
            ? `Too many dice: you have ${maxDice}.`
            : `Expected: ${fmt(e.toThem)} hits to them · ${fmt(e.buildings)} to buildings · ${fmt(e.toYou)} to you · ${fmt(e.keys)} keys · intercept ${Math.round(e.intercept * 100)}%${raidOk ? "" : " · no Raid dice: needs defending buildings here, or none anywhere"}`,
        params: [
          {
            id: "assault",
            label: "Assault",
            min: 0,
            max: Math.min(6, maxDice - skirmish - raid),
            value: assault,
            color: "#e2483d",
          },
          {
            id: "skirmish",
            label: "Skirmish",
            min: 0,
            max: Math.min(6, maxDice - assault - raid),
            value: skirmish,
            color: "#3d8fe2",
          },
          ...(raidOk
            ? [
                {
                  id: "raid",
                  label: "Raid",
                  min: 0,
                  max: Math.min(6, maxDice - assault - skirmish),
                  value: raid,
                  color: "#e2a23d",
                },
              ]
            : []),
        ],
        confirm:
          total > maxDice
            ? undefined
            : `Roll ${total} ${total === 1 ? "die" : "dice"}`,
      };
    });

  if (verb === "manufacture" || verb === "synthesize")
    return flow(() => done({ op: verb, ...p }));

  if (verb === "pressgang" || verb === "execute")
    return flow((a) => {
      const captives = g.player(me).captives;
      const chosen = list(a, "captives");
      if (str(a, "go"))
        return done({
          op: verb,
          values: chosen.map((c) => c.split("#")[0] ?? ""),
          ...p,
        });
      return {
        id: "captives",
        prompt:
          verb === "pressgang"
            ? "Pressgang — return captives for resources"
            : "Execute — turn captives into trophies",
        choices: captives.map((c, i) => ({
          value: `${c}#${i}`,
          label: `${playerName(ctx.view, c)} agent`,
        })),
        multi: { min: 1, max: captives.length, confirm: info?.name ?? verb },
      };
    });

  if (verb === "trade")
    return flow((a) => {
      const target = str(a, "target");
      if (!target) {
        const targets: Target[] = g.pieces
          .filter(
            (c) =>
              c.kind === "city" && c.owner !== me && g.control(c.system) === me,
          )
          .filter((c) =>
            g
              .player(me)
              .resources.some(
                (r, slot) =>
                  r &&
                  ok(ctx, { op: "trade", target: c.id, giveSlot: slot, ...p }),
              ),
          )
          .map((c) => ({
            key: key.piece(c.id),
            value: c.id,
            label: `Trade with ${playerName(ctx.view, c.owner)}`,
          }));
        return {
          id: "target",
          prompt: "Trade — choose a rival city you control",
          targets,
        };
      }
      const give = str(a, "give");
      if (give)
        return done({ op: "trade", target, giveSlot: Number(give), ...p });
      return {
        id: "give",
        prompt: "Trade — choose a resource to give",
        choices: g
          .player(me)
          .resources.map((r, slot) => ({ r, slot }))
          .filter(
            ({ r, slot }) =>
              r && ok(ctx, { op: "trade", target, giveSlot: slot, ...p }),
          )
          .map(({ r, slot }) => ({
            value: String(slot),
            label: RESOURCE_INFO[r]?.name ?? r,
            tone: "primary",
          })),
      };
    });

  return flow(() => ({ id: "none", prompt: "Unavailable", targets: [] }));
}

function moveRoutes(
  ctx: Ctx,
  origin: string,
  ids: string[],
  pay: Record<string, unknown>,
): Map<string, Input[]> {
  const me = ctx.me;
  const routes = new Map<string, Input[]>();
  const catapulting = (state: GameState) =>
    state.pending[0]?.kind === "catapult" && state.pending[0].actor === me;
  const finish = (state: GameState, seq: Input[]): Input[] =>
    catapulting(state) ? [...seq, { op: "choose", target: "done" }] : seq;
  const queue: { state: GameState; at: string; seq: Input[] }[] = [];
  for (const n of ctx.base.system(origin).neighbors) {
    const input: Input = { op: "move", ids, system: n, ...pay };
    const trial = attempt(ctx.base, me, input);
    if (!trial.ok) continue;
    routes.set(n, finish(trial.after, [input]));
    if (catapulting(trial.after))
      queue.push({ state: trial.after, at: n, seq: [input] });
  }
  while (queue.length) {
    const next = queue.shift();
    if (!next) break;
    for (const n of next.state.system(next.at).neighbors) {
      if (n === origin || routes.has(n)) continue;
      const input: Input = { op: "choose", ids, system: n };
      const trial = attempt(next.state, me, input);
      if (!trial.ok) continue;
      const seq = [...next.seq, input];
      routes.set(n, finish(trial.after, seq));
      if (catapulting(trial.after))
        queue.push({ state: trial.after, at: n, seq });
    }
  }
  return routes;
}

export function spendFlow(ctx: Ctx): Flow {
  const g = ctx.base,
    me = ctx.me,
    player = g.player(me);
  const usesOf = (slot: number) => {
    const r = player.resources[slot] ?? "";
    const as = RESOURCES.filter((e) => e === r || g.has(me, LOYAL[e] ?? ""));
    return as
      .map((e) => {
        const pay: Pay = { source: "resource", slot, resource: e };
        const verbs =
          e === "weapon"
            ? ok(ctx, { op: "weapons", slot })
              ? ["arm"]
              : []
            : verbsFor(ctx, pay).filter((v) => {
                const first = verbFlow(ctx, v, pay).run({});
                return (
                  "input" in first ||
                  (first.targets?.length ?? 0) > 0 ||
                  (first.choices?.length ?? 0) > 0
                );
              });
        return { e, verbs };
      })
      .filter((u) => u.verbs.length);
  };
  return {
    id: "spend",
    label: "Spend resource",
    run(a) {
      const slotText = str(a, "slot");
      if (slotText === undefined) {
        const targets: Target[] = player.resources
          .map((r, slot) => ({ r, slot }))
          .filter(({ r, slot }) => r && usesOf(slot).length)
          .map(({ r, slot }) => ({
            key: key.resource(me, slot),
            value: String(slot),
            label: `Spend ${RESOURCE_INFO[r]?.name}`,
            detail: usesOf(slot)
              .map((u) =>
                u.e === "weapon"
                  ? "Battle with pips"
                  : u.verbs.map((v) => VERB_INFO[v]?.name ?? v).join(" / "),
              )
              .join(" · "),
          }));
        return { id: "slot", prompt: "Prelude — spend a resource", targets };
      }
      const slot = Number(slotText);
      const uses = usesOf(slot);
      const as = single(
        a,
        "as",
        uses.map((u) => ({ value: u.e })),
      );
      if (!as)
        return {
          id: "as",
          prompt: "Spend it as…",
          choices: uses.map((u) => ({
            value: u.e,
            label: RESOURCE_INFO[u.e]?.name ?? u.e,
            tone: "primary",
          })),
        };
      const use = uses.find((u) => u.e === as);
      if (as === "weapon") {
        if (str(a, "arm")) return { input: { op: "weapons", slot } };
        return {
          id: "arm",
          prompt: "Spend Weapon — your card's pips may Battle this turn",
          choices: [{ value: "yes", label: "Spend Weapon", tone: "primary" }],
        };
      }
      const verb = single(
        a,
        "verb",
        (use?.verbs ?? []).map((v) => ({ value: v })),
      );
      if (!verb)
        return {
          id: "verb",
          prompt: `Spend ${RESOURCE_INFO[as]?.name} to…`,
          choices: (use?.verbs ?? []).map((v) => ({
            value: v,
            label: VERB_INFO[v]?.name ?? v,
            tone: "primary",
          })),
        };
      return verbFlow(ctx, verb, {
        source: "resource",
        slot,
        resource: as,
      }).run(a);
    },
  };
}

export function guildPreludeFlow(ctx: Ctx, card: string): Flow | undefined {
  const g = ctx.base,
    me = ctx.me;
  const name = courtCard(card).name;
  const base = { op: "guild", card };
  const flow = (run: (a: Answers) => Outcome): Flow => ({
    id: `guild:${card}`,
    label: name,
    run,
  });
  const confirm = (input: Input, label: string): Flow | undefined =>
    ok(ctx, input)
      ? flow((a) =>
          str(a, "go")
            ? { input }
            : {
                id: "go",
                prompt: `${name} — ${label}`,
                choices: [{ value: "yes", label, tone: "primary" }],
              },
        )
      : undefined;
  const rivals = g.order.filter((id) => id !== me);

  if (
    [
      "admin-union",
      "construction-union",
      "spacing-union",
      "arms-union",
    ].includes(card)
  ) {
    const targets: Target[] = g.played
      .filter((x) => ok(ctx, { ...base, target: x.card.id }))
      .map((x) => ({
        key: key.played(x.card.id),
        value: x.card.id,
        label: `Claim ${x.card.suit} ${x.card.rank}`,
      }));
    if (!targets.length) return undefined;
    return flow((a) => {
      const target = str(a, "target");
      return target
        ? { input: { ...base, target } }
        : { id: "target", prompt: `${name} — claim a played card`, targets };
    });
  }
  if (card === "lattice-spies")
    return confirm(base, "Discard to seize the initiative");
  if (card === "elder-broker")
    return confirm(base, "Discard to gain Material, Fuel and Weapon");
  if (card === "relic-fence") {
    const targets: Target[] = g
      .player(me)
      .resources.map((r, slot) => ({ r, slot }))
      .filter(({ r, slot }) => r && ok(ctx, { ...base, slot }))
      .map(({ r, slot }) => ({
        key: key.resource(me, slot),
        value: String(slot),
        label: `Trade ${RESOURCE_INFO[r]?.name} for a Relic`,
      }));
    if (!targets.length) return undefined;
    return flow((a) => {
      const slot = str(a, "slot");
      return slot
        ? { input: { ...base, slot: Number(slot) } }
        : {
            id: "slot",
            prompt: "Relic Fence — discard a resource to gain a Relic",
            targets,
          };
    });
  }
  if (card === "farseers") {
    if (!ok(ctx, { ...base, ids: [] })) return undefined;
    return flow((a) => {
      const ids = list(a, "cards");
      if (str(a, "go"))
        return {
          input: { ...base, ids: ids.map((k) => k.replace(/^hand:/, "")) },
        };
      return {
        id: "cards",
        prompt: `Farseers — discard any hand cards, then draw that many plus one`,
        targets: g.player(me).hand.map((c) => ({
          key: key.hand(c.id),
          value: key.hand(c.id),
          label: `${c.suit} ${c.rank}`,
        })),
        multi: {
          min: 0,
          max: g.player(me).hand.length,
          confirm: `Draw ${ids.length + 1}`,
        },
      };
    });
  }
  if (
    card === "material-cartel" ||
    card === "fuel-cartel" ||
    card === "silver-tongues"
  ) {
    const targets: Target[] = [];
    for (const r of rivals) {
      g.player(r).resources.forEach((res, slot) => {
        if (res && ok(ctx, { ...base, target: r, slot }))
          targets.push({
            key: key.resource(r, slot),
            value: `${r}|${slot}`,
            label: `Steal ${RESOURCE_INFO[res]?.name} from ${playerName(ctx.view, r)}`,
          });
      });
      if (card === "silver-tongues")
        for (const c of g.player(r).guilds)
          if (ok(ctx, { ...base, target: r, kind: c }))
            targets.push({
              key: key.guild(r, c),
              value: `${r}|card|${c}`,
              label: `Steal ${courtName(c)}`,
            });
    }
    if (!targets.length) return undefined;
    return flow((a) => {
      const t = str(a, "target");
      if (!t)
        return {
          id: "target",
          prompt: `${name} — choose what to steal`,
          targets,
        };
      const [target, second, third] = t.split("|");
      return second === "card"
        ? { input: { ...base, target, kind: third } }
        : { input: { ...base, target, slot: Number(second) } };
    });
  }
  if (card === "mining-interest" || card === "shipping-interest") {
    const empty =
      g.capacity(me) - g.player(me).resources.filter(Boolean).length;
    if (!ok(ctx, { ...base, amount: 0 })) return undefined;
    const r = card === "mining-interest" ? "Material" : "Fuel";
    return flow((a) => {
      const amount = Math.min(empty, num(a, "amount", empty));
      if (str(a, "go")) return { input: { ...base, amount } };
      return {
        id: "go",
        prompt: `${name} — discard to gain ${r} for empty slots`,
        params: [{ id: "amount", label: r, min: 0, max: empty, value: amount }],
        confirm: `Gain ${amount} ${r}`,
      };
    });
  }
  if (card === "gatekeepers") {
    const gates = g.systems.filter((s) => !s.planet);
    const ships = g.available(me, "ship");
    if (ships >= gates.length)
      return confirm(base, `Discard to place a ship in each gate`);
    return flow((a) => {
      const chosen = list(a, "gates").map((k) => k.replace(/^system:/, ""));
      if (str(a, "go")) return { input: { ...base, ids: chosen } };
      return {
        id: "gates",
        prompt: `Gatekeepers — choose ${ships} gates`,
        targets: gates.map((s) => ({
          key: key.system(s.id),
          value: key.system(s.id),
          label: systemName(ctx.view, s.id),
        })),
        multi: { min: ships, max: ships, confirm: "Place ships" },
      };
    });
  }
  if (
    [
      "prison-wardens",
      "skirmishers",
      "court-enforcers",
      "loyal-marines",
    ].includes(card)
  ) {
    const targets: Target[] = g.systems
      .filter((s) => ok(ctx, { ...base, system: s.id }))
      .map((s) => ({
        key: key.system(s.id),
        value: s.id,
        label: `Place 3 ships in ${systemName(ctx.view, s.id)}`,
      }));
    if (!targets.length) return undefined;
    return flow((a) => {
      const system = str(a, "system");
      return system
        ? { input: { ...base, system } }
        : {
            id: "system",
            prompt: `${name} — discard to place 3 ships in a system you control`,
            targets,
          };
    });
  }
  return undefined;
}

export function preludeFlows(ctx: Ctx): Flow[] {
  const g = ctx.base;
  if (g.phase !== "actions" || !g.prelude) return [];
  return g
    .player(ctx.me)
    .guilds.filter((c) => !g.acquired.includes(c))
    .map((c) => guildPreludeFlow(ctx, c))
    .filter((f): f is Flow => !!f);
}

export function pipVerbs(
  ctx: Ctx,
): { verb: string; flow: Flow; available: boolean }[] {
  const g = ctx.base;
  if (g.phase !== "actions" || g.pips <= 0) return [];
  return verbsFor(ctx, { source: "pip" }).map((verb) => {
    const flow = verbFlow(ctx, verb, { source: "pip" });
    const first = flow.run({});
    const available =
      "input" in first
        ? ok(ctx, first.input)
        : (first.targets?.length ?? 0) + (first.choices?.length ?? 0) > 0;
    return { verb, flow, available };
  });
}
