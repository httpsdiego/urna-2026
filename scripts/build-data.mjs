// Gera data/<UF>.js e data/BR.js a partir das fichas do Nexo Jornal
// (dados de registro de candidatura do TSE). Rodar: node scripts/build-data.mjs
import { writeFile, mkdir } from 'node:fs/promises';

const BASE = 'https://candidatos.nexojornal.com.br/2026';
const UFS = ['ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms', 'mg', 'pa',
  'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc', 'sp', 'se', 'to'];

const decode = (s) => s
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'");

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? decode(m[1]) : '';
};
const text = (html, cls) => {
  const m = html.match(new RegExp(`class="${cls}">([^<]*)<`));
  return m ? decode(m[1]).trim() : '';
};
const gender = (tag) => (attr(tag, 'data-g') === 'feminino' ? 'F' : 'M');
// Sequencial da candidatura no TSE (vem no nome da foto: /fotos/<id>.jpg).
const photoId = (html) => (html.match(/\/fotos\/(\d+)\.jpg/) || [])[1] || '';

// Divide o HTML de uma seção em blocos que começam com a tag de abertura dada.
function blocks(html, openRe) {
  const idx = [];
  let m;
  const re = new RegExp(openRe, 'g');
  while ((m = re.exec(html))) idx.push(m.index);
  return idx.map((start, i) => html.slice(start, idx[i + 1] ?? html.length));
}

function parseMembers(chapaHtml) {
  return blocks(chapaHtml, '<a class="membro"').map((b) => {
    const tag = b.slice(0, b.indexOf('>') + 1);
    // nome do membro: primeiro texto com class de nome
    const name = text(b, 'mnm') || text(b, 'cnm') || (b.match(/<(?:div|span)[^>]*>([^<]{2,})<\/(?:div|span)>/) || [])[1] || '';
    return { nome: decode(name).trim(), partido: attr(tag, 'data-p'), g: gender(tag), id: photoId(b) };
  });
}

function parseSection(sec) {
  const title = decode((sec.match(/<h2[^>]*>([\s\S]*?)<\/h2>/) || [])[1] || '').replace(/<[^>]+>/g, '').trim();
  const isChapa = sec.includes('class="chapa');
  const list = [];
  if (isChapa) {
    for (const b of blocks(sec, '<div class="chapa[" ]')) {
      const tag = b.slice(0, b.indexOf('>') + 1);
      if (/class="chapa[^"]*\boc\b/.test(tag)) continue; // saiu da disputa
      list.push({
        numero: attr(tag, 'data-nu'),
        nome: text(b, 'cnm'),
        partido: attr(tag, 'data-p'),
        g: gender(tag),
        id: photoId(b.slice(0, b.indexOf('class="membros"'))),
        membros: parseMembers(b.slice(b.indexOf('class="membros"'))),
      });
    }
  } else {
    for (const b of blocks(sec, '<a class="card[" ]')) {
      const tag = b.slice(0, b.indexOf('>') + 1);
      if (/class="card[^"]*\boc\b/.test(tag)) continue;
      list.push([attr(tag, 'data-nu'), text(b, 'cnm'), attr(tag, 'data-p'), gender(tag), photoId(b)]);
    }
  }
  return { title, list };
}

// Script (não JSON) para funcionar abrindo o index.html direto, via file://.
const wrap = (key, data) => `window.URNA_DATA = window.URNA_DATA || {};
URNA_DATA.${key} = ${JSON.stringify(data)};
`;

async function fetchPage(slug) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${BASE}/${slug}/`);
    if (res.ok) return res.text();
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  throw new Error(`falha ao baixar ${slug}`);
}

function sections(html) {
  return blocks(html, '<section class="cargo-sec"').map((s) => s.slice(0, s.indexOf('</section>') + 10)).map(parseSection);
}

await mkdir(new URL('../data/', import.meta.url), { recursive: true });

// Presidente
{
  const secs = sections(await fetchPage('brasil'));
  const pres = secs.find((s) => /Presidente/i.test(s.title));
  const out = pres.list.map((c) => ({ numero: c.numero, nome: c.nome, partido: c.partido, g: c.g, id: c.id, vice: c.membros[0] }));
  await writeFile(new URL('../data/BR.js', import.meta.url), wrap('BR', { presidente: out }));
  console.log('BR presidente', out.length, out.map((c) => `${c.numero} ${c.nome}`).join(', '));
}

for (const uf of UFS) {
  const secs = sections(await fetchPage(uf));
  const find = (re) => secs.find((s) => re.test(s.title));
  const gov = find(/^Governador/i);
  const sen = find(/^Senador/i);
  const fed = find(/^Deputado Federal/i);
  const est = find(/^Deputado (Estadual|Distrital)/i);
  const data = {
    governador: gov.list.map((c) => ({ numero: c.numero, nome: c.nome, partido: c.partido, g: c.g, id: c.id, vice: c.membros[0] })),
    senador: sen.list.map((c) => ({ numero: c.numero, nome: c.nome, partido: c.partido, g: c.g, id: c.id, suplentes: c.membros })),
    federal: fed.list,
    estadual: est.list,
  };
  await writeFile(new URL(`../data/${uf.toUpperCase()}.js`, import.meta.url), wrap(uf.toUpperCase(), data));
  console.log(uf.toUpperCase(), 'gov', data.governador.length, 'sen', data.senador.length, 'fed', data.federal.length, 'est', data.estadual.length);
}
