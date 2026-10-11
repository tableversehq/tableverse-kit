import {
  AMBITIONS,
  RAID_COSTS,
  RESOURCES,
  courtCard,
  type ActionCard,
} from "arcs-engine/data";
import {
  key,
  list,
  num,
  ok,
  str,
  type Choice,
  type Ctx,
  type Flow,
  type Target,
} from "./flow.ts";
import {
  AMBITION_INFO,
  RESOURCE_INFO,
  SUIT_INFO,
  courtName,
  playerName,
  systemName,
} from "./text.ts";

const cardLabel = (c: ActionCard) =>
  `${SUIT_INFO[c.suit]?.name ?? c.suit} ${c.rank}`;

export function playFlow(ctx: Ctx): Flow {
  const g = ctx.base,
    me = ctx.me;
  const hand = g.player(me).hand;
  const leading = !g.lead.length;
  const lead = g.lead[0];
  const modesFor = (card: string) =>
    leading
      ? ok(ctx, { op: "play", card })
        ? ["lead"]
        : []
      : ["surpass", "pivot", "copy"].filter((mode) =>
          ok(ctx, { op: "play", card, mode }),
        );
  const describe = (c: ActionCard, mode: string): Choice => {
    const suit = SUIT_INFO[c.suit];
    const leadSuit = SUIT_INFO[lead?.suit ?? ""];
    if (mode === "lead")
      return {
        value: mode,
        label: "Lead",
        detail: `${c.pips} action${c.pips > 1 ? "s" : ""}: ${suit?.verbs}`,
        tone: "primary",
      };
    if (mode === "surpass")
      return {
        value: mode,
        label: "Surpass",
        detail: `${c.pips} action${c.pips > 1 ? "s" : ""}: ${suit?.verbs}`,
        tone: "primary",
      };
    if (mode === "pivot")
      return {
        value: mode,
        label: "Pivot",
        detail: `1 action: ${suit?.verbs}`,
        tone: "primary",
      };
    return {
      value: mode,
      label: "Copy",
      detail: `Face down · 1 action: ${leadSuit?.verbs}`,
      tone: "primary",
    };
  };
  return {
    id: "play",
    label: "Play a card",
    run(a) {
      const card = str(a, "card")?.replace(/^hand:/, "");
      const c = hand.find((h) => h.id === card);
      if (!card || !c) {
        const targets: Target[] = hand
          .filter((h) => modesFor(h.id).length)
          .map((h) => ({
            key: key.hand(h.id),
            value: h.id,
            label: cardLabel(h),
            detail: modesFor(h.id)
              .map((m) => describe(h, m).label)
              .join(" · "),
          }));
        return {
          id: "card",
          prompt: leading
            ? "Lead a card"
            : `Play a card — ${SUIT_INFO[lead?.suit ?? ""]?.name} ${g.leadRank} leads`,
          targets,
        };
      }
      const modes = modesFor(card);
      const leadName = SUIT_INFO[lead?.suit ?? ""]?.name ?? "";
      const extrasFor = (m: string) =>
        leading
          ? []
          : hand.filter(
              (h) =>
                h.id !== card &&
                ok(ctx, { op: "play", card, mode: m, seize: h.id }),
            );
      const blocked: Record<string, string> = {
        surpass: `Surpass needs ${leadName} higher than ${g.leadRank}`,
        pivot: `Pivot needs a suit other than ${leadName}`,
        copy: "Copy is not available",
      };
      const picked = str(a, "mode");
      const mode = picked?.replace(/\+seize$/, "");
      if (!mode || !modes.includes(mode)) {
        const all = leading ? ["lead"] : ["surpass", "pivot", "copy"];
        const choices: Choice[] = [];
        for (const m of all) {
          if (!modes.includes(m)) {
            choices.push({
              ...describe(c, m),
              disabled: blocked[m],
              tone: "quiet",
            });
            continue;
          }
          const plain = describe(c, m);
          const sevenSeizes =
            m === "surpass" && c.rank === 7 && g.initiative !== me && !g.seized;
          choices.push(
            sevenSeizes
              ? { ...plain, detail: `${plain.detail} · seizes initiative` }
              : plain,
          );
          if (extrasFor(m).length && !sevenSeizes)
            choices.push({
              value: `${m}+seize`,
              label: `${plain.label} & seize`,
              detail: "Also discard a card face down to take the initiative",
              tone: "quiet",
            });
        }
        return {
          id: "mode",
          prompt: `${cardLabel(c)} — how will you play it?`,
          choices,
        };
      }
      const base = { op: "play", card, ...(leading ? {} : { mode }) };
      const ambitions = (
        c.ambition === "any" ? AMBITIONS : [c.ambition]
      ).filter((amb) => amb && ok(ctx, { ...base, ambition: amb }));
      const ambition = str(a, "ambition");
      if (ambitions.length && ambition === undefined) {
        const marker = [...g.markers]
          .filter((m) => !m.ambition)
          .sort((x, y) => y.first - x.first)[0];
        return {
          id: "ambition",
          prompt: "Declare an ambition?",
          detail: marker
            ? `Places the ${marker.first}/${marker.second} marker. Your card's number becomes 0${g.has(me, "secret-order") ? " (Secret Order keeps it for Keeper/Empath)" : ""}.`
            : undefined,
          choices: [
            ...ambitions.map((amb) => ({
              value: amb,
              label: `Declare ${AMBITION_INFO[amb]?.name}`,
              detail: AMBITION_INFO[amb]?.counts,
              tone: "primary" as const,
            })),
            { value: "none", label: "Don't declare", tone: "quiet" },
          ],
        };
      }
      const declared = ambition && ambition !== "none" ? { ambition } : {};
      if (picked?.endsWith("+seize")) {
        const extras = extrasFor(mode).filter((h) =>
          ok(ctx, { ...base, ...declared, seize: h.id }),
        );
        const extra = str(a, "extra")?.replace(/^hand:/, "");
        if (!extra)
          return {
            id: "extra",
            prompt: "Seize — choose a card to discard face down",
            targets: extras.map((h) => ({
              key: key.hand(h.id),
              value: h.id,
              label: cardLabel(h),
            })),
          };
        return { input: { ...base, ...declared, seize: extra } };
      }
      return { input: { ...base, ...declared } };
    },
  };
}

export function pendingFlow(ctx: Ctx): Flow | undefined {
  const g = ctx.base,
    me = ctx.me,
    p = g.pending[0];
  if (!p || p.actor !== me) return undefined;
  const choose = { op: "choose" };
  const flow = (label: string, run: Flow["run"]): Flow => ({
    id: `pending:${p.kind}`,
    label,
    run,
  });
  const rivals = g.order.filter((id) => id !== me);

  if (p.kind === "mulligan")
    return flow("Mulligan", (a) => {
      const target = str(a, "target");
      if (target) return { input: { ...choose, target } };
      return {
        id: "target",
        prompt: "Keep this hand, or discard all 6 and draw 6 new cards?",
        choices: [
          { value: "keep", label: "Keep hand", tone: "primary" },
          { value: "redraw", label: "Redraw", tone: "danger" },
        ],
      };
    });

  if (p.kind === "resources")
    return flow("Resources", (a) => {
      const player = g.player(me);
      const all = [...player.resources.filter(Boolean), ...p.data];
      const cap = g.capacity(me);
      const keep = Math.min(all.length, cap);
      const chosen = list(a, "keep");
      if (str(a, "go")) {
        const values = chosen.map((v) => all[Number(v)] ?? "");
        return {
          input: {
            ...choose,
            values: [...values, ...Array(6 - values.length).fill("")],
          },
        };
      }
      return {
        id: "keep",
        prompt: `Too many resources — keep ${keep} of ${all.length}`,
        detail: `You have ${cap} open slot${cap === 1 ? "" : "s"}. The rest return to the supply.`,
        tokens: all.map((r, i) => ({ value: String(i), resource: r })),
        choices: all.map((r, i) => ({
          value: String(i),
          label: RESOURCE_INFO[r]?.name ?? r,
        })),
        multi: { min: keep, max: keep, confirm: "Keep these" },
      };
    });

  if (p.kind === "catapult")
    return flow("Catapult", (a) => {
      if (str(a, "dest") === "done")
        return { input: { ...choose, target: "done" } };
      const moving = g.pieces.filter(
        (x) => p.data.includes(x.id) && x.system === p.target,
      );
      const n = Math.min(num(a, "ships", moving.length), moving.length);
      const ids = moving.slice(0, n).map((x) => x.id);
      const dest = str(a, "dest");
      if (dest) return { input: { ...choose, ids, system: dest } };
      return {
        id: "dest",
        prompt: `Catapult — keep moving from ${systemName(ctx.view, p.target)}?`,
        highlight: [key.system(p.target)],
        targets: ids.length
          ? g
              .system(p.target)
              .neighbors.filter((s) => ok(ctx, { ...choose, ids, system: s }))
              .map((s) => ({
                key: key.system(s),
                value: s,
                label: `Continue to ${systemName(ctx.view, s)}`,
              }))
          : [],
        params:
          moving.length > 1
            ? [
                {
                  id: "ships",
                  label: "Ships",
                  min: 1,
                  max: moving.length,
                  value: n,
                },
              ]
            : undefined,
        choices: [{ value: "done", label: "Stop here", tone: "quiet" }],
      };
    });

  if (p.kind === "regroup")
    return flow("Regroup", (a) => {
      const system = str(a, "system");
      if (system) return { input: { ...choose, system } };
      return {
        id: "system",
        prompt: "You have no ships or starports — place 3 ships at any gate",
        targets: g.systems
          .filter((s) => !s.planet)
          .map((s) => ({
            key: key.system(s.id),
            value: s.id,
            label: systemName(ctx.view, s.id),
          })),
      };
    });

  if (p.kind === "ransack")
    return flow("Ransack", (a) => {
      const card = str(a, "card");
      if (card) return { input: { ...choose, card } };
      return {
        id: "card",
        prompt: `Ransack the Court — take a card with ${playerName(ctx.view, p.target)}'s agents`,
        detail: "Rival agents on it become your trophies.",
        targets: g.court
          .filter((c) => ok(ctx, { ...choose, card: c.id }))
          .map((c) => ({
            key: key.court(c.id),
            value: c.id,
            label: `Ransack ${courtName(c.id)}`,
          })),
      };
    });

  if (p.kind === "farseers-rival")
    return flow("Farseers", (a) => {
      const target = str(a, "target");
      if (target) return { input: { ...choose, target } };
      return {
        id: "target",
        prompt: "Farseers — look at a rival's hand",
        choices: rivals.map((r) => ({
          value: r,
          label: playerName(ctx.view, r),
          tone: "primary",
        })),
        targets: rivals.map((r) => ({
          key: key.player(r),
          value: r,
          label: playerName(ctx.view, r),
        })),
      };
    });

  if (p.kind === "farseers-swap")
    return flow("Farseers", (a) => {
      const theirs = str(a, "theirs");
      if (theirs === "skip") return { input: { ...choose, target: "skip" } };
      if (!theirs)
        return {
          id: "theirs",
          prompt: `Farseers — ${playerName(ctx.view, p.target)}'s hand. Take one card?`,
          choices: [
            ...g.player(me).peek.map((c) => ({
              value: c.id,
              label: cardLabel(c),
              tone: "primary" as const,
            })),
            { value: "skip", label: "Don't swap", tone: "quiet" },
          ],
        };
      const mine = str(a, "mine")?.replace(/^hand:/, "");
      if (mine) return { input: { ...choose, card: mine, target: theirs } };
      return {
        id: "mine",
        prompt: "Choose one of your cards to give",
        targets: g.player(me).hand.map((c) => ({
          key: key.hand(c.id),
          value: c.id,
          label: cardLabel(c),
        })),
      };
    });

  if (p.kind === "interest")
    return flow("Interest", (a) => {
      if ((g.supply[p.target] ?? 0) > 0) return { input: choose };
      const t = str(a, "target");
      if (t) {
        const [target, slot] = t.split("|");
        return { input: { ...choose, target, slot: Number(slot) } };
      }
      const targets: Target[] = [];
      for (const r of rivals)
        g.player(r).resources.forEach((res, slot) => {
          if (res === p.target && ok(ctx, { ...choose, target: r, slot }))
            targets.push({
              key: key.resource(r, slot),
              value: `${r}|${slot}`,
              label: `Steal from ${playerName(ctx.view, r)}`,
            });
        });
      if (!targets.length) return { input: choose };
      return {
        id: "target",
        prompt: `The ${RESOURCE_INFO[p.target]?.name} supply is empty — steal one`,
        targets,
      };
    });

  if (p.kind === "pressgang-resources")
    return flow("Pressgang", (a) => {
      const counts = RESOURCES.map((r) => num(a, r, 0));
      const total = counts.reduce((x, y) => x + y, 0);
      if (str(a, "go"))
        return {
          input: {
            ...choose,
            values: RESOURCES.flatMap((r, i) => Array(counts[i] ?? 0).fill(r)),
          },
        };
      return {
        id: "go",
        prompt: `Pressgang — choose ${p.count} resource${p.count > 1 ? "s" : ""}`,
        params: RESOURCES.map((r, i) => ({
          id: r,
          label: RESOURCE_INFO[r]?.name ?? r,
          min: 0,
          max: p.count,
          value: counts[i] ?? 0,
          color: RESOURCE_INFO[r]?.color,
        })),
        confirm: total === p.count ? "Gain" : undefined,
      };
    });

  if (p.kind === "mass-uprising")
    return flow("Mass Uprising", (a) => {
      const clusters = [...new Set(g.systems.map((s) => s.cluster))];
      const cluster = str(a, "cluster");
      if (!cluster)
        return {
          id: "cluster",
          prompt: "Mass Uprising — choose a cluster to fill with your ships",
          choices: clusters.map((c) => ({
            value: String(c),
            label: `Cluster ${c}`,
            tone: "primary",
          })),
          targets: g.systems.map((s) => ({
            key: key.system(s.id),
            value: String(s.cluster),
            label: `Cluster ${s.cluster}`,
          })),
        };
      const systems = g.systems.filter((s) => s.cluster === Number(cluster));
      const ships = g.available(me, "ship");
      if (ships >= systems.length)
        return {
          input: { ...choose, target: cluster, ids: systems.map((s) => s.id) },
        };
      const chosen = list(a, "systems").map((k) => k.replace(/^system:/, ""));
      if (str(a, "go"))
        return { input: { ...choose, target: cluster, ids: chosen } };
      return {
        id: "systems",
        prompt: `Choose ${ships} systems`,
        targets: systems.map((s) => ({
          key: key.system(s.id),
          value: key.system(s.id),
          label: systemName(ctx.view, s.id),
        })),
        multi: { min: ships, max: ships, confirm: "Place ships" },
      };
    });

  if (p.kind === "populist-demands")
    return flow("Populist Demands", (a) => {
      const ambition = str(a, "ambition");
      if (ambition === "skip") return { input: { ...choose, target: "skip" } };
      if (ambition) return { input: { ...choose, ambition } };
      return {
        id: "ambition",
        prompt: "Populist Demands — declare an ambition?",
        choices: [
          ...AMBITIONS.filter((amb) =>
            ok(ctx, { ...choose, ambition: amb }),
          ).map((amb) => ({
            value: amb,
            label: AMBITION_INFO[amb]?.name ?? amb,
            tone: "primary" as const,
          })),
          { value: "skip", label: "Don't declare", tone: "quiet" },
        ],
      };
    });

  if (p.kind === "outrage-spreads")
    return flow("Outrage Spreads", (a) => {
      const resource = str(a, "resource");
      if (resource === "skip") return { input: { ...choose, target: "skip" } };
      if (resource) return { input: { ...choose, resource } };
      return {
        id: "resource",
        prompt: "Outrage Spreads — every player provokes Outrage of one type",
        choices: [
          ...RESOURCES.map((r) => ({
            value: r,
            label: RESOURCE_INFO[r]?.name ?? r,
            tone: "danger" as const,
          })),
          { value: "skip", label: "Don't", tone: "quiet" },
        ],
      };
    });

  if (p.kind === "song-of-freedom")
    return flow("Song of Freedom", (a) => {
      const target = str(a, "target");
      if (target === "skip") return { input: { ...choose, target: "skip" } };
      if (!target)
        return {
          id: "target",
          prompt: "Song of Freedom — return a city you control?",
          targets: g.pieces
            .filter(
              (x) => x.kind === "city" && ok(ctx, { ...choose, target: x.id }),
            )
            .map((x) => ({
              key: key.piece(x.id),
              value: x.id,
              label: `Free ${systemName(ctx.view, x.system)}`,
            })),
          choices: [{ value: "skip", label: "Don't", tone: "quiet" }],
        };
      const seizeOk = ok(ctx, { ...choose, target, seize: "yes" });
      const seize = str(a, "seize");
      if (seizeOk && !seize)
        return {
          id: "seize",
          prompt: "Also seize the initiative?",
          choices: [
            { value: "yes", label: "Seize", tone: "primary" },
            { value: "no", label: "No", tone: "quiet" },
          ],
        };
      return {
        input: {
          ...choose,
          target,
          ...(seize === "yes" ? { seize: "yes" } : {}),
        },
      };
    });

  if (p.kind === "guild-struggle")
    return flow("Guild Struggle", (a) => {
      const t = str(a, "target");
      if (t === "skip") return { input: { ...choose, target: "skip" } };
      if (t) {
        const [target, card] = t.split("|");
        return { input: { ...choose, target, card } };
      }
      const targets: Target[] = [];
      for (const r of rivals)
        for (const c of g.player(r).guilds)
          if (ok(ctx, { ...choose, target: r, card: c }))
            targets.push({
              key: key.guild(r, c),
              value: `${r}|${c}`,
              label: `Steal ${courtName(c)}`,
            });
      return {
        id: "target",
        prompt: "Guild Struggle — steal a Guild card?",
        targets,
        choices: [{ value: "skip", label: "Don't", tone: "quiet" }],
      };
    });

  return undefined;
}

export function battleFlow(ctx: Ctx): Flow | undefined {
  const g = ctx.base,
    me = ctx.me,
    b = g.battle[0];
  if (!b || b.attacker !== me || g.pending.length) return undefined;
  const where = systemName(ctx.view, b.system);
  const flow = (label: string, run: Flow["run"]): Flow => ({
    id: `battle:${b.step}`,
    label,
    run,
  });

  if (b.step === "roll")
    return flow("Skirmishers", (a) => {
      const chosen = list(a, "dice");
      if (str(a, "go"))
        return {
          input: {
            op: "reroll",
            ids: chosen.map((k) => k.replace(/^die:/, "")),
          },
        };
      const max = g.icons(me, "weapon");
      return {
        id: "dice",
        prompt: `Skirmishers — reroll up to ${max} skirmish ${max === 1 ? "die" : "dice"}`,
        targets: b.dice
          .map((d, i) => ({ d, i }))
          .filter(({ d }) => d.type === "skirmish")
          .map(({ i }) => ({
            key: key.die(i),
            value: key.die(i),
            label: `Reroll die ${i + 1}`,
          })),
        multi: {
          min: 0,
          max,
          confirm: chosen.length ? `Reroll ${chosen.length}` : "Keep dice",
        },
      };
    });

  if (
    b.step === "self" ||
    b.step === "intercept" ||
    b.step === "ship" ||
    b.step === "building"
  ) {
    const n =
      b.step === "self"
        ? b.self
        : b.step === "intercept"
          ? b.intercept
          : b.step === "ship"
            ? b.ship
            : b.building;
    const targets: Target[] = g
      .at(b.system)
      .filter((x) => ok(ctx, { op: "hit", target: x.id }))
      .map((x) => ({
        key: key.piece(x.id),
        value: x.id,
        label: `${x.damaged ? "Destroy" : "Damage"} ${x.owner === me ? "your" : `${playerName(ctx.view, x.owner)}'s`} ${x.kind}`,
      }));
    const prompts: Record<string, string> = {
      self: `Your dice hit you — assign ${n} hit${n > 1 ? "s" : ""} to your ships in ${where}`,
      intercept: `Intercepted! Assign ${n} hit${n > 1 ? "s" : ""} to your ships in ${where}`,
      ship: `Assign ${n} hit${n > 1 ? "s" : ""} to ${playerName(ctx.view, b.defender)}'s pieces (ships first)`,
      building: `Assign ${n} building hit${n > 1 ? "s" : ""} to ${playerName(ctx.view, b.defender)}'s buildings`,
    };
    return flow("Assign hits", (a) => {
      const target = str(a, "target");
      if (target) return { input: { op: "hit", target } };
      return {
        id: "target",
        prompt: prompts[b.step] ?? "Assign hits",
        highlight: [key.system(b.system)],
        targets,
      };
    });
  }

  if (b.step === "raid")
    return flow("Raid", (a) => {
      const t = str(a, "target");
      if (t === "done") return { input: { op: "done" } };
      if (t) {
        const [kind, value] = t.split("|");
        return {
          input:
            kind === "card"
              ? { op: "raid", card: value }
              : { op: "raid", slot: Number(value) },
        };
      }
      const def = g.player(b.defender);
      const targets: Target[] = [];
      def.resources.forEach((r, slot) => {
        if (r && ok(ctx, { op: "raid", slot }))
          targets.push({
            key: key.resource(b.defender, slot),
            value: `slot|${slot}`,
            label: `Steal ${RESOURCE_INFO[r]?.name} (${RAID_COSTS[slot]} keys)`,
          });
      });
      for (const c of def.guilds)
        if (ok(ctx, { op: "raid", card: c }))
          targets.push({
            key: key.guild(b.defender, c),
            value: `card|${c}`,
            label: `Steal ${courtName(c)} (${courtCard(c).cost} keys)`,
          });
      return {
        id: "target",
        prompt: `Raid — ${b.keys} key${b.keys === 1 ? "" : "s"} to spend on ${playerName(ctx.view, b.defender)}'s resources and guilds`,
        targets,
        choices: [{ value: "done", label: "Finish battle", tone: "primary" }],
      };
    });

  return undefined;
}
