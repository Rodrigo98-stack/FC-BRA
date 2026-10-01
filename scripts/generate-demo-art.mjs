// Gera as ilustrações neutras usadas pelos dados DEMO (public/demo/*.svg).
// São placeholders explícitos ("IMAGEM DEMO"), não fotos de produto.
import fs from "node:fs";
import path from "node:path";

const out = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "public", "demo");
fs.mkdirSync(out, { recursive: true });

const themes = {
  light: { bg1: "#EFE9E5", bg2: "#E3DAD3", ink: "#3A2F29", accent: "#B39256", label: "#8C7E74" },
  dark: { bg1: "#2A2D32", bg2: "#1F2226", ink: "#ECE7E1", accent: "#B8955C", label: "#9C948A" },
};

// Silhuetas em traço (viewBox 200x260).
const art = {
  vestido: `<path d="M82 30 L88 62 Q100 70 112 62 L118 30" /><path d="M88 62 Q84 92 86 108 L64 228 Q100 240 136 228 L114 108 Q116 92 112 62" /><path d="M86 108 Q100 114 114 108" />`,
  camisa: `<path d="M78 44 L100 58 L122 44 L150 58 L166 120 L146 126 L136 90 L136 220 L64 220 L64 90 L54 126 L34 120 L50 58 Z" /><path d="M88 44 L100 70 L112 44" /><path d="M100 70 L100 220" /><circle cx="100" cy="96" r="1.8"/><circle cx="100" cy="126" r="1.8"/><circle cx="100" cy="156" r="1.8"/><circle cx="100" cy="186" r="1.8"/>`,
  blusa: `<path d="M80 46 Q100 62 120 46 L152 60 L170 176 L150 180 L138 96 L136 214 L64 214 L62 96 L50 180 L30 176 L48 60 Z" /><path d="M64 200 L136 200" /><path d="M150 166 L170 162 M30 162 L50 166" />`,
  calca: `<path d="M66 34 L134 34 L140 230 L108 230 L100 96 L92 230 L60 230 Z" /><path d="M66 50 L134 50" /><path d="M100 50 L100 96" />`,
  saia: `<path d="M70 52 L130 52 L138 214 Q100 222 62 214 Z" /><path d="M70 66 L130 66" /><path d="M100 160 L100 218" />`,
  bolsa: `<path d="M48 104 L152 104 L160 214 L40 214 Z" /><path d="M72 104 Q72 52 100 52 Q128 52 128 104" /><path d="M48 132 L152 132" /><rect x="92" y="126" width="16" height="12" rx="2" />`,
  sapato: `<path d="M30 176 Q34 150 60 150 L104 150 Q126 120 150 104 L166 112 Q160 150 172 176 L170 190 L32 190 Z" /><path d="M150 104 L160 190" /><path d="M32 190 L170 190" />`,
  acessorio: `<circle cx="100" cy="70" r="10" /><path d="M100 80 L100 110" /><path d="M100 110 Q70 150 100 196 Q130 150 100 110 Z" /><circle cx="100" cy="158" r="6" />`,
  camiseta: `<path d="M78 42 Q100 58 122 42 L156 58 L168 98 L144 104 L138 84 L138 214 L62 214 L62 84 L56 104 L32 98 L44 58 Z" /><path d="M86 46 Q100 64 114 46" />`,
  bermuda: `<path d="M60 50 L140 50 L150 170 L108 176 L100 104 L92 176 L50 170 Z" /><path d="M60 66 L140 66" /><path d="M100 66 L100 104" />`,
};

function product(name, themeKey, alt) {
  const t = themes[themeKey];
  const scale = alt ? 2.15 : 1.55;
  const ty = alt ? -60 : 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${alt ? t.bg2 : t.bg1}"/><stop offset="1" stop-color="${alt ? t.bg1 : t.bg2}"/></linearGradient></defs>
  <rect width="800" height="1000" fill="url(#g)"/>
  <ellipse cx="400" cy="${alt ? 980 : 860}" rx="${alt ? 320 : 220}" ry="24" fill="${t.ink}" opacity="0.06"/>
  <g transform="translate(${400 - 100 * scale} ${150 + ty}) scale(${scale})" fill="none" stroke="${t.ink}" stroke-width="${(2.4 / scale) * 1.6}" stroke-linecap="round" stroke-linejoin="round">${art[name]}</g>
  <line x1="340" y1="930" x2="460" y2="930" stroke="${t.accent}" stroke-width="1.5"/>
  <text x="400" y="962" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="18" letter-spacing="6" fill="${t.label}">IMAGEM DEMO</text>
</svg>
`;
}

// Capa DEMO na vertical (4:5), o formato das molduras da home.
function hero(themeKey) {
  const t = themes[themeKey];
  const dark = themeKey === "dark";
  const piece = dark ? art.camisa : art.vestido;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1500" width="1200" height="1500">
  <defs>
    <linearGradient id="h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.bg1}"/><stop offset="1" stop-color="${t.bg2}"/></linearGradient>
    <radialGradient id="l" cx="0.5" cy="0.42" r="0.6"><stop offset="0" stop-color="${t.ink}" stop-opacity="${dark ? 0.12 : 0.06}"/><stop offset="1" stop-color="${t.ink}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="1500" fill="url(#h)"/>
  <rect width="1200" height="1500" fill="url(#l)"/>
  <circle cx="600" cy="640" r="${dark ? 420 : 400}" fill="none" stroke="${t.accent}" stroke-width="2" stroke-opacity="0.7"/>
  <g transform="translate(${600 - 100 * 3.4} 210) scale(3.4)" fill="none" stroke="${t.ink}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">${piece}</g>
  <ellipse cx="600" cy="1290" rx="300" ry="26" fill="${t.ink}" opacity="0.07"/>
  <line x1="420" y1="1390" x2="780" y2="1390" stroke="${t.accent}" stroke-width="1.5"/>
  <text x="600" y="1432" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="22" letter-spacing="8" fill="${t.label}">BANNER DEMO · SUBSTITUA EM BANNERS</text>
</svg>
`;
}

let n = 0;
for (const name of Object.keys(art)) {
  for (const theme of Object.keys(themes)) {
    fs.writeFileSync(path.join(out, `${name}-${theme}.svg`), product(name, theme, false));
    fs.writeFileSync(path.join(out, `${name}-${theme}-alt.svg`), product(name, theme, true));
    n += 2;
  }
}
for (const theme of Object.keys(themes)) {
  fs.writeFileSync(path.join(out, `hero-${theme}.svg`), hero(theme));
  n++;
}
console.log(`${n} ilustrações DEMO geradas em public/demo`);
