// Wraps each .glb of the static demo build as base64 JSON (<name>.glb.json) for hosts
// that only serve web text/image types. See GltfFurniture.tsx → unpackModel.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'dist-demo/models';
for (const f of readdirSync(dir).filter((n) => n.endsWith('.glb'))) {
  writeFileSync(join(dir, `${f}.json`), JSON.stringify({ glb: readFileSync(join(dir, f)).toString('base64') }));
  console.log(`packed ${f}`);
}
