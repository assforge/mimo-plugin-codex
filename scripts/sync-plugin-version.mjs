import { existsSync, readFileSync, writeFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const version = packageJson.version;

const jsonFiles = [
  {
    path: "plugins/mimo/.codex-plugin/plugin.json",
    update(json) {
      json.version = version;
    },
  },
  {
    path: "plugins/mimo/.claude-plugin/plugin.json",
    update(json) {
      json.version = version;
    },
  },
  {
    path: ".claude-plugin/marketplace.json",
    update(json) {
      json.version = version;
      for (const plugin of json.plugins ?? []) {
        if (plugin.name === "mimo") {
          plugin.version = version;
        }
      }
    },
  },
];

for (const entry of jsonFiles) {
  if (!existsSync(entry.path)) {
    continue;
  }

  const json = JSON.parse(readFileSync(entry.path, "utf8"));
  entry.update(json);
  writeFileSync(entry.path, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`synced ${entry.path} to ${version}`);
}
