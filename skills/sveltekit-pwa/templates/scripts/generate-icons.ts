// Renders the app icon image into the PNG sizes that browsers need to install
// the app. Run it after a change to the image and commit the output:
//
//   node scripts/generate-icons.ts [Title]
//
// The source is `src/lib/assets/app-icon.png` (square, at least 512 px). If it
// does not exist, the script draws a placeholder with the first letter of the
// title, so a new project installs before the real art exists.
//
// The PNGs are committed (not built), so the Docker build does not run this.
// Each file name carries a hash of its content, for example
// `icon-512.1a2b3c4d.png`. The script writes the new names into the manifest
// and `src/app.html`. A changed icon then changes the manifest, which is what
// makes Chrome on Android update the installed app's icon.
import { createHash } from 'node:crypto';
import { copyFile, readdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import sharp from 'sharp';

const sourceUrl = new URL('../src/lib/assets/app-icon.png', import.meta.url);
const staticDir = new URL('../static/', import.meta.url);
const out = (name: string) => new URL(name, staticDir);

const exists = (url: URL) =>
  access(url).then(
    () => true,
    () => false
  );

if (!(await exists(sourceUrl))) {
  const letter = (process.argv[2] ?? 'A').trim().charAt(0).toUpperCase() || 'A';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
    <rect width="1024" height="1024" fill="#1f2937"/>
    <text x="512" y="512" font-family="sans-serif" font-size="640" font-weight="700"
      fill="#f9fafb" text-anchor="middle" dominant-baseline="central">${letter}</text>
  </svg>`;
  await writeFile(sourceUrl, await sharp(Buffer.from(svg)).png().toBuffer());
  console.log('wrote src/lib/assets/app-icon.png (placeholder)');
}
const source = await readFile(sourceUrl);

// Chrome needs 192 and 512 to install. iOS uses the 180px apple-touch-icon for the Home Screen.
//
// Android crops a maskable icon to a circle and may show only its middle 60%.
// The maskable icon has the art at 70% of its size on a black background, so
// the crop does not cut the art. The other icons use the full art.
const icons: [name: string, size: number, art?: number][] = [
  ['icon-192', 192],
  ['icon-512', 512],
  ['icon-maskable-512', 512, 0.7],
  ['apple-touch-icon', 180]
];

// Matches a base name with or without a hash: `icon-512.png`, `icon-512.1a2b3c4d.png`.
const named = (name: string) => new RegExp(`/${name}(\\.[0-9a-f]{8})?\\.png`, 'g');

const old = (await readdir(staticDir)).filter((file) =>
  icons.some(([name]) => new RegExp(`^${name}(\\.[0-9a-f]{8})?\\.png$`).test(file))
);

const files = new Map<string, string>();
for (const [name, size, art = 1] of icons) {
  const inner = Math.round(size * art);
  const gap = size - inner;
  const png = await sharp(source)
    .resize(inner, inner)
    .flatten({ background: '#000' })
    .extend({
      top: Math.floor(gap / 2),
      bottom: Math.ceil(gap / 2),
      left: Math.floor(gap / 2),
      right: Math.ceil(gap / 2),
      background: '#000'
    })
    .png()
    .toBuffer();
  const hash = createHash('sha256').update(png).digest('hex').slice(0, 8);
  const file = `${name}.${hash}.png`;
  await writeFile(out(file), png);
  files.set(name, file);
  console.log(`wrote static/${file}`);
}

for (const file of old) {
  if (![...files.values()].includes(file)) await rm(out(file));
}

// Rewrite the references in place, so the formatting of both files stays.
for (const path of ['../static/manifest.webmanifest', '../src/app.html']) {
  const url = new URL(path, import.meta.url);
  let text = await readFile(url, 'utf8');
  for (const [name, file] of files) text = text.replace(named(name), `/${file}`);
  await writeFile(url, text);
}

// The favicon is a copy of the 192px icon that Vite imports. Vite hashes the
// file name, so a changed image gets a new URL and browsers drop the old
// cached favicon.
await copyFile(
  out(files.get('icon-192')!),
  new URL('../src/lib/assets/favicon.png', import.meta.url)
);
console.log('wrote src/lib/assets/favicon.png');
