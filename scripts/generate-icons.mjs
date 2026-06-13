import sharp from 'sharp'
import { writeFileSync } from 'fs'

// InvestIQ icon SVG — dark bg + indigo chart + trend line
const svg512 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <!-- Background -->
  <rect width="512" height="512" rx="96" fill="#0f1117"/>

  <!-- Chart bars -->
  <rect x="58"  y="300" width="56" height="134" rx="10" fill="#4f46e5" opacity="0.7"/>
  <rect x="134" y="250" width="56" height="184" rx="10" fill="#6366f1" opacity="0.8"/>
  <rect x="210" y="190" width="56" height="244" rx="10" fill="#6366f1"/>
  <rect x="286" y="220" width="56" height="214" rx="10" fill="#6366f1" opacity="0.85"/>
  <rect x="362" y="155" width="56" height="279" rx="10" fill="#818cf8"/>

  <!-- Trend line -->
  <polyline
    points="86,282 162,230 238,168 314,198 390,132"
    stroke="#c7d2fe"
    stroke-width="12"
    fill="none"
    stroke-linecap="round"
    stroke-linejoin="round"
  />

  <!-- Trend dot (top) -->
  <circle cx="390" cy="132" r="14" fill="#e0e7ff"/>
</svg>`

async function generate(svgStr, outPath, size) {
  await sharp(Buffer.from(svgStr))
    .resize(size, size)
    .png()
    .toFile(outPath)
  console.log(`✓ ${outPath} (${size}×${size})`)
}

await generate(svg512, 'public/icon-512.png', 512)
await generate(svg512, 'public/icon-192.png', 192)
await generate(svg512, 'public/apple-touch-icon.png', 180)
await generate(svg512, 'public/favicon-32.png', 32)
console.log('Icons generated.')
