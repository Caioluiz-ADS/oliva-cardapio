/*
 * build-menu.js — transforms the raw ovcmenu API payload (data/source.json)
 * into a clean, structured menu module (js/menu-data.js) used by the site.
 *
 * Run:  node tools/build-menu.js   (from the oliva/ folder)
 *
 * Why this exists: the source data has messy fields — pizza prices are buried
 * in the description text (with typos like "R$ 67,90,90"), grammage is glued to
 * names, some names SHOUT in caps, and grelhados carry two prices. We normalise
 * all of that here so the front-end can stay dumb and pretty.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const raw = fs.readFileSync(path.join(ROOT, 'data', 'source.json'), 'utf8').replace(/^﻿/, '');
const src = JSON.parse(raw);

const SMALL = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'ao', 'a', 'o', 'em', 'no', 'na']);

function titleCase(str) {
  return str.toLowerCase().split(/\s+/).map((w, i) => {
    if (i > 0 && SMALL.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

function cleanName(name) {
  let n = name.replace(/\s+/g, ' ').trim();
  const letters = n.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const isShout = letters.length > 3 && n === n.toUpperCase();
  if (isShout) n = titleCase(n);
  else n = n.charAt(0).toUpperCase() + n.slice(1);
  return n;
}

// Pull a trailing grammage ("250 g", "300 gr", "180 gramas", "(200g)") into its own chip.
function splitWeight(name) {
  const m = name.match(/\s*\(?(\d{2,4})\s?(g|gr|grs|gramas?|ml|kg)\)?\.?$/i);
  if (!m) return { name: name.trim(), weight: '' };
  const unit = /gram/i.test(m[2]) ? 'g' : m[2].toLowerCase().replace('grs', 'g').replace('gr', 'g');
  return { name: name.slice(0, m.index).trim(), weight: `${m[1]} ${unit}` };
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) || n <= 0 ? null : n;
}

function firstPrice(text) {
  const m = String(text).match(/R\$\s?(\d{1,3},\d{2})/);
  return m ? toNumber(m[1]) : null;
}

function cleanDesc(d) {
  if (!d) return '';
  const t = String(d).replace(/\s+/g, ' ').trim();
  if (!t || t.toLowerCase() === 'null') return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function parsePizza(desc) {
  const out = { ingredients: '', priceM: null, priceG: null };
  if (!desc) return out;
  const paren = desc.match(/\(([^)]*)\)/);
  if (paren) out.ingredients = cleanDesc(paren[1]);
  const gMatch = desc.search(/G\s*\d*\s*fatias?/i);
  if (gMatch >= 0) {
    out.priceM = firstPrice(desc.slice(0, gMatch));
    out.priceG = firstPrice(desc.slice(gMatch));
  } else {
    out.priceM = firstPrice(desc);
  }
  return out;
}

function parseGrelhado(desc) {
  const out = { priceLunch: null, priceDinner: null };
  if (!desc) return out;
  const jIdx = desc.search(/Jantar/i);
  if (jIdx >= 0) {
    out.priceLunch = firstPrice(desc.slice(0, jIdx));
    out.priceDinner = firstPrice(desc.slice(jIdx));
  } else {
    out.priceLunch = firstPrice(desc);
  }
  return out;
}

const HIGHLIGHT_KEYS = ['talharim', 'risoto de camar', 'ravioli', 'parmegiana', 'carpaccio', 'tortelli'];

const categories = src.categories.map((c) => {
  const items = src.products
    .filter((p) => p.category_id === c.id)
    .sort((a, b) => (parseInt(a.position) || 0) - (parseInt(b.position) || 0))
    .map((p) => {
      const sw = splitWeight(cleanName(p.name));
      const item = {
        name: sw.name,
        weight: sw.weight,
        image: p.image_url || null,
        price: toNumber(p.price),
        desc: cleanDesc(p.description),
      };
      const cat = c.name.toLowerCase();
      if (cat.includes('pizza')) {
        const pz = parsePizza(p.description);
        item.desc = pz.ingredients;
        item.priceM = pz.priceM;
        item.priceG = pz.priceG;
        item.price = null;
      } else if (cat.includes('grelhad')) {
        const gr = parseGrelhado(p.description);
        item.priceLunch = gr.priceLunch;
        item.priceDinner = gr.priceDinner;
        item.desc = '';
        item.price = null;
      }
      return item;
    });

  const withImg = items.filter((i) => i.image).length;
  const coverage = items.length ? withImg / items.length : 0;
  return {
    name: cleanName(c.name).replace(/\bSh\b/, 'Shopping'),
    slug: c.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    layout: coverage >= 0.4 ? 'gallery' : 'list',
    items,
  };
});

// Curate a few signature dishes (must have a photo) for the highlights strip.
const highlights = [];
for (const cat of categories) {
  for (const it of cat.items) {
    if (highlights.length >= 4) break;
    const nm = it.name.toLowerCase();
    if (it.image && HIGHLIGHT_KEYS.some((k) => nm.includes(k))) {
      highlights.push({ ...it, category: cat.name });
    }
  }
}

// --- localização de imagens: baixa para assets/dishes e referencia local ---
function localPathFor(url) {
  const fname = url.split('/').pop().split('?')[0];
  return { rel: 'assets/dishes/' + fname, dest: path.join(ROOT, 'assets', 'dishes', fname) };
}
async function localizeImage(url) {
  const { rel, dest } = localPathFor(url);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return rel;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    return rel;
  } catch (e) {
    console.warn('  ! falha ao baixar', rel, '-', e.message);
    return url; // mantém remoto como fallback
  }
}

const store = {
  brand: 'Oliva',
  sub: 'Gourmet',
  full: 'Oliva Gourmet',
  cuisine: 'Cozinha italiana contemporânea',
  location: 'Shopping da Bahia · Salvador — BA',
  phoneRaw: String(src.store.telephone || '').replace(/\D/g, ''),
  phone: String(src.store.telephone || '').replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3'),
  payments: (src.payment_methods || []).map((p) => p.name),
};

(async () => {
  fs.mkdirSync(path.join(ROOT, 'assets', 'dishes'), { recursive: true });

  // baixa imagens únicas (com concorrência limitada)
  const urls = [...new Set(
    categories.flatMap((c) => c.items.map((i) => i.image)).concat(highlights.map((h) => h.image)).filter(Boolean)
  )];
  const map = {};
  const CONC = 6;
  console.log(`Baixando ${urls.length} imagens para assets/dishes ...`);
  for (let i = 0; i < urls.length; i += CONC) {
    const batch = urls.slice(i, i + CONC);
    const done = await Promise.all(batch.map(localizeImage));
    batch.forEach((u, k) => (map[u] = done[k]));
  }
  categories.forEach((c) => c.items.forEach((it) => { if (it.image) it.image = map[it.image] || it.image; }));
  highlights.forEach((h) => { if (h.image) h.image = map[h.image] || h.image; });

  const data = { store, highlights, categories };
  const banner = '/* AUTO-GERADO por tools/build-menu.js a partir de data/source.json. Não edite à mão. */\n';
  fs.writeFileSync(path.join(ROOT, 'js', 'menu-data.js'), banner + 'window.MENU = ' + JSON.stringify(data, null, 2) + ';\n', 'utf8');

  const total = categories.reduce((n, c) => n + c.items.length, 0);
  const localized = Object.values(map).filter((v) => v.startsWith('assets/')).length;
  console.log(`OK -> js/menu-data.js | ${categories.length} categorias, ${total} itens, ${highlights.length} destaques`);
  console.log(`Imagens locais: ${localized}/${urls.length}`);
  console.log('Layouts:', categories.map((c) => `${c.name}:${c.layout}`).join('  '));
})();
