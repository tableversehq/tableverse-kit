import { mkdir, writeFile, readFile } from "node:fs/promises";
const base = "https://cmckenz87.github.io/ArcsFates/Base/";
await mkdir("client/public/assets/cards", { recursive: true });
await mkdir("client/public/assets/setup", { recursive: true });
for (const [source, folder] of [
  ["/tmp/arcs-court.html", "cards"],
  ["/tmp/arcs-setup.html", "setup"],
]) {
  const html = await readFile(source, "utf8");
  const images = [...html.matchAll(/<img alt="([^"]+)" src="([^"]+)"/g)];
  await Promise.all(
    images.map(async ([, name, path]) => {
      const response = await fetch(base + path);
      if (!response.ok) throw new Error(`${response.status}: ${path}`);
      const filename = name
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-")
        .replace(/-$/, "");
      await writeFile(
        `client/public/assets/${folder}/${filename}.jpg`,
        Buffer.from(await response.arrayBuffer()),
      );
      console.log(name);
    }),
  );
}
await mkdir("client/public/assets/actions", { recursive: true });
for (const suit of [
  "administration",
  "aggression",
  "construction",
  "mobilization",
]) {
  await Promise.all(
    Array.from({ length: 7 }, async (_, i) => {
      const name = `${suit}-${i + 1}`;
      const response = await fetch(
        `https://hrf.im/hrf/webp2/arcs/images/action/${name}.webp`,
      );
      if (!response.ok) throw new Error(`${response.status}: ${name}`);
      await writeFile(
        `client/public/assets/actions/${name}.webp`,
        Buffer.from(await response.arrayBuffer()),
      );
      console.log(name);
    }),
  );
}
