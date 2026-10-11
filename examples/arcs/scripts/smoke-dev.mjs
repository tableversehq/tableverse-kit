import assert from "node:assert/strict";

const base = process.argv[2] ?? "http://localhost:5100";
async function request(path, body) {
  const response = await fetch(
    new URL(path, base),
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  assert.equal(
    response.status,
    200,
    `${path}: ${await response.clone().text()}`,
  );
  return response.json();
}
async function snapshot(viewer) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(new URL(`/session?viewer=${viewer}`, base), {
      signal: controller.signal,
    });
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const chunk = await reader.read();
      assert.ok(!chunk.done, "Snapshot stream ended before a snapshot");
      text += decoder.decode(chunk.value, { stream: true });
      const match = text.match(/event: snapshot\ndata: (.+)\n/);
      if (match) return JSON.parse(match[1]);
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

const description = await request("/game");
assert.equal(description.name, "arcs");
assert.deepEqual(description.playerBounds, { min: 2, max: 4 });
const shell = await request("/shell.json");
assert.ok(shell.frontendUrl);
const frontend = await fetch(shell.frontendUrl);
assert.equal(frontend.status, 200);
assert.match(await frontend.text(), /ARCS/);
for (const asset of ["cards/farseers.jpg", "actions/aggression-2.webp"]) {
  assert.equal(
    (await fetch(new URL(`assets/${asset}`, shell.frontendUrl))).status,
    200,
  );
}
await request("/initialize", {
  players: ["p1", "p2", "p3"],
  seed: "arcs-smoke",
});
let state = await snapshot("p1");
const active = state.view.game.active;
state = await snapshot(active);
const own = state.view.game.players.find((p) => p.id === active);
assert.equal(own.hand.length, 6);
for (const p of state.view.game.players.filter((p) => p.id !== active))
  assert.deepEqual(p.hand, { __hidden: true, value: { count: 6 } });
const other = state.view.game.order.find((p) => p !== active);
const rejected = await request("/execute", {
  viewer: other,
  command: { type: "act", input: { op: "pass" } },
});
assert.equal(rejected.accepted, false);
assert.equal((await snapshot(active)).version, state.version);
const card = own.hand[0];
assert.deepEqual(
  await request("/execute", {
    viewer: active,
    command: { type: "act", input: { op: "play", card: card.id } },
  }),
  { accepted: true },
);
const played = await snapshot(active);
assert.equal(played.view.game.phase, "actions");
assert.equal(played.view.game.pips, card.pips);
assert.equal(played.version, state.version + 1);
assert.deepEqual(
  await request("/execute", {
    viewer: active,
    command: { type: "act", input: { op: "end" } },
  }),
  { accepted: true },
);
assert.notEqual((await snapshot(other)).view.game.active, active);
console.log(
  "PASS: shell, frontend, assets, initialization, private snapshots, turn authorization, card play, version updates, and turn handoff.",
);
