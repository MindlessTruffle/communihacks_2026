// Copies the Kenney CC0 packs we use from _kenney_raw/ into public/.
// Re-run any time: `pnpm assets:kenney`. Raw zips come from kenney.nl (see HANDOFF.md).
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const raw = path.join(root, "_kenney_raw");
const pub = path.join(root, "public");

function copyDir(src, dst, filter = () => true) {
  if (!fs.existsSync(src)) { console.warn("missing", src); return 0; }
  fs.mkdirSync(dst, { recursive: true });
  let n = 0;
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) n += copyDir(s, d, filter);
    else if (filter(e.name)) { fs.copyFileSync(s, d); n++; }
  }
  return n;
}

const glbKits = {
  "castle-kit": "Models/GLB format",
  "fantasy-town-kit": "Models/GLB format",
  "food-kit": "Models/GLB format",
  "mini-characters": "Models/GLB format",
  "graveyard-kit": "Models/GLB format",
  "survival-kit": "Models/GLB format",
  "nature-kit": "Models/GLTF format",
  "furniture-kit": "Models/GLTF format",
};
for (const [kit, sub] of Object.entries(glbKits)) {
  const n = copyDir(path.join(raw, kit, sub), path.join(pub, "kenney", kit), (f) => /\.(glb|png)$/i.test(f));
  console.log(kit, n);
}

const audio = {
  "rpg-audio": "Audio",
  "interface-sounds": "Audio",
  "ui-audio": "Audio",
  "impact-sounds": "Audio",
  "music-jingles": "Audio",
};
for (const [pack, sub] of Object.entries(audio)) {
  const n = copyDir(path.join(raw, pack, sub), path.join(pub, "audio", "kenney", pack), (f) => /\.ogg$/i.test(f));
  console.log(pack, n);
}
console.log("ui", copyDir(path.join(raw, "ui-pack-rpg-expansion", "PNG"), path.join(pub, "ui", "kenney"), (f) => f.endsWith(".png")));
