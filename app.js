(() => {
  const UFS = {
    AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
    DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
    MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
    PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
    RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
    SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
  };

  const $ = (id) => document.getElementById(id);
  const screen = $('screen');

  const state = {
    uf: null,
    cargos: [],
    idx: 0,
    digits: '',
    mode: 'digits', // digits | branco | legenda | fim
    votes: [],
    colinha: {},
    brancos: {}, // cargos em que o voto confirmado na urna foi BRANCO
    justFilled: null, // cargo recém-preenchido pela urna, para destacar a linha
    searchCargo: null,
  };

  // ---------- Colinha salva no navegador (por estado) ----------

  const STORE_KEY = 'urna2026';

  function readStore() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveColinha() {
    if (!state.uf) return;
    try {
      const store = readStore();
      store.lastUf = state.uf;
      store.colinhas = store.colinhas || {};
      store.colinhas[state.uf] = { colinha: state.colinha, brancos: state.brancos };
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch {
      // modo privado / armazenamento bloqueado: a colinha só vale nesta visita
    }
  }

  // ---------- Dados ----------

  function loadUf(uf) {
    if (window.URNA_DATA && URNA_DATA[uf]) return Promise.resolve(URNA_DATA[uf]);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `data/${uf}.js`;
      s.onload = () => resolve(URNA_DATA[uf]);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  const byNumber = (list) => new Map(list.map((c) => [c.numero, c]));
  const fromRow = ([numero, nome, partido, g, id]) => ({ numero, nome, partido, g, id });

  // Número do partido = 2 primeiros dígitos; derivado das próprias candidaturas.
  function partiesOf(list) {
    const map = new Map();
    for (const c of list) map.set(c.numero.slice(0, 2), c.partido);
    return map;
  }

  function buildCargos(uf, data) {
    const federal = data.federal.map(fromRow);
    const estadual = data.estadual.map(fromRow);
    const distrital = uf === 'DF';
    const senMap = byNumber(data.senador);
    return [
      {
        id: 'federal', short: 'Deputado Federal', titles: ['Deputado Federal', 'Deputada Federal'],
        digits: 4, prop: true, list: federal, map: byNumber(federal), parties: partiesOf(federal),
      },
      {
        id: 'estadual',
        short: distrital ? 'Deputado Distrital' : 'Deputado Estadual',
        titles: distrital ? ['Deputado Distrital', 'Deputada Distrital'] : ['Deputado Estadual', 'Deputada Estadual'],
        digits: 5, prop: true, list: estadual, map: byNumber(estadual), parties: partiesOf(estadual),
      },
      {
        id: 'sen1', short: 'Senador - 1ª vaga', titles: ['Senador', 'Senadora'], suffix: ' - 1ª vaga',
        digits: 3, list: data.senador, map: senMap, extra: 'suplentes', searchGroup: 'senador',
      },
      {
        id: 'sen2', short: 'Senador - 2ª vaga', titles: ['Senador', 'Senadora'], suffix: ' - 2ª vaga',
        digits: 3, list: data.senador, map: senMap, extra: 'suplentes', searchGroup: 'senador',
      },
      {
        id: 'gov', short: 'Governador', titles: ['Governador', 'Governadora'],
        vice: ['Vice-Governador', 'Vice-Governadora'],
        digits: 2, list: data.governador, map: byNumber(data.governador), extra: 'vice',
      },
      {
        id: 'pres', short: 'Presidente', titles: ['Presidente', 'Presidente'],
        vice: ['Vice-Presidente', 'Vice-Presidente'],
        digits: 2, list: URNA_DATA.BR.presidente, map: byNumber(URNA_DATA.BR.presidente), extra: 'vice',
      },
    ];
  }

  // ---------- Avaliação do voto em andamento ----------

  function evaluate() {
    const cargo = state.cargos[state.idx];
    const n = state.digits;
    if (state.mode === 'branco') return { kind: 'branco' };

    if (cargo.prop) {
      const party = n.length >= 2 ? cargo.parties.get(n.slice(0, 2)) : null;
      if (state.mode === 'legenda') return { kind: 'legenda', party };
      if (n.length === cargo.digits) {
        const cand = cargo.map.get(n);
        if (cand) return { kind: 'nominal', cand };
        // Partido existe mas o candidato não: o voto vai para a legenda.
        if (party) return { kind: 'legenda-errado', party };
        return { kind: 'nulo' };
      }
      if (n.length >= 2 && party) return { kind: 'partido', party, canLegenda: n.length === 2 };
      return { kind: 'parcial' };
    }

    if (n.length < cargo.digits) return { kind: 'parcial' };
    const cand = cargo.map.get(n);
    if (!cand) return { kind: 'nulo' };
    if (cargo.id === 'sen2') {
      const first = state.votes.find((v) => v.cargo === 'sen1');
      if (first && first.numero === n) return { kind: 'nulo', repeated: true };
    }
    return { kind: 'nominal', cand };
  }

  // ---------- Tela ----------

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const initials = (name) => name.split(/\s+/).filter((w) => w.length > 2 || /^[A-ZÁ-Ú]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  // Foto oficial do registro de candidatura (DivulgaCand/TSE); se falhar, a cópia
  // do Nexo; se também falhar, fica a silhueta com as iniciais que está por baixo.
  const TSE_ELEICAO_2026 = '20322002026';
  const photoUrls = (id, uf) => [
    `https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/${TSE_ELEICAO_2026}/${id}/${uf}`,
    `https://candidatos.nexojornal.com.br/fotos/${id}.jpg`,
  ];

  function photo(person, label, small, uf) {
    const [src, fallback] = person.id ? photoUrls(person.id, uf) : [];
    return `<figure class="s-photo${small ? ' small' : ''}">
      <div class="s-photo-img">
        <svg viewBox="0 0 60 70" aria-hidden="true"><circle cx="30" cy="26" r="13"/><path d="M6 70c2-16 12-24 24-24s22 8 24 24z"/></svg>
        <span aria-hidden="true">${esc(initials(person.nome))}</span>
        ${src ? `<img src="${src}" data-fallback="${fallback}" alt="Foto de ${esc(person.nome)}">` : ''}
      </div>
      <figcaption>${esc(label)}</figcaption>
    </figure>`;
  }

  // 'error' não borbulha: escuta na fase de captura.
  screen.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG') return;
    if (img.dataset.fallback) {
      img.src = img.dataset.fallback;
      img.dataset.fallback = '';
    } else {
      img.remove();
    }
  }, true);

  function steps() {
    return `<nav class="s-steps">${state.cargos.map((c, i) => {
      const cls = i < state.idx ? 'done' : i === state.idx ? 'current' : '';
      return `<span class="${cls}">${esc(c.short)}</span>`;
    }).join('')}</nav>`;
  }

  function boxes(cargo, filledGray) {
    let html = '<div class="s-number">';
    for (let i = 0; i < cargo.digits; i++) {
      const d = state.digits[i];
      const current = !filledGray && i === state.digits.length && state.mode === 'digits';
      const cls = d !== undefined ? '' : filledGray ? ' is-gray' : current ? ' is-current' : '';
      html += `<span class="s-digit${cls}">${d ?? ''}</span>`;
    }
    return html + '</div>';
  }

  const footer = (proceed) => `<div class="s-footer">
      Aperte a tecla:<br>
      <span class="s-footer-line">CONFIRMA para ${proceed ? 'PROSSEGUIR' : 'CONFIRMAR este voto'}</span>${proceed ? '<span class="s-footer-note">(voto de legenda)</span>' : ''}<br>
      <span class="s-footer-line s-footer-indent">CORRIGE para REINICIAR este voto</span>
    </div>`;

  function render() {
    if (state.mode === 'fim') {
      screen.innerHTML = `<div class="s-status"><span>SIMULAÇÃO</span></div>
        <div class="s-fim">FIM</div><div class="s-votou">VOTOU</div>`;
      $('sr-status').textContent = 'Fim. Votação concluída.';
      return;
    }

    const cargo = state.cargos[state.idx];
    const r = evaluate();
    const g = r.cand && r.cand.g === 'F' ? 1 : 0;
    const title = cargo.titles[g] + (cargo.suffix || '');

    let left = `<div class="s-cargo">${esc(title)}</div>`;
    let right = '';
    let showFooter = true;
    let proceed = false;

    if (r.kind === 'branco') {
      left += '<div class="s-branco">VOTO EM BRANCO</div>';
    } else {
      left += boxes(cargo, r.kind === 'legenda');
      if (r.kind === 'nominal') {
        const c = r.cand;
        const uf = cargo.id === 'pres' ? 'BR' : state.uf;
        left += `<div class="s-name">${esc(c.nome)}</div><div class="s-party">${esc(c.partido)}</div>`;
        if (cargo.extra === 'vice' && c.vice) {
          const vg = c.vice.g === 'F' ? 1 : 0;
          left += `<div class="s-extra">${cargo.vice[vg]}: ${esc(c.vice.nome)}</div>`;
          right = photo(c, cargo.titles[g], false, uf) + photo(c.vice, cargo.vice[vg], true, uf);
        } else if (cargo.extra === 'suplentes') {
          (c.suplentes || []).forEach((s, i) => {
            left += `<div class="s-extra">${i + 1}º Suplente: ${esc(s.nome)}</div>`;
          });
          right = photo(c, cargo.titles[g], false, uf)
            + `<div class="s-photo-row">${(c.suplentes || []).map((s, i) => photo(s, `${i + 1}º Suplente`, true, uf)).join('')}</div>`;
        } else {
          right = photo(c, cargo.titles[g], false, uf);
        }
      } else if (r.kind === 'partido') {
        left += `<div class="s-party s-party-alone">${esc(r.party)}</div>`;
        // Com 3+ dígitos incompletos o CONFIRMA não faz nada: não mostrar instrução.
        proceed = r.canLegenda;
        showFooter = r.canLegenda;
      } else if (r.kind === 'legenda') {
        left += `<div class="s-party s-party-alone">${esc(r.party)}</div>`;
        left += '<div class="s-big">VOTO DE LEGENDA</div>';
      } else if (r.kind === 'legenda-errado') {
        left += `<div class="s-warning">NÚMERO ERRADO</div><div class="s-party">${esc(r.party)}</div>`;
        left += '<div class="s-big">VOTO DE LEGENDA</div>';
      } else if (r.kind === 'nulo') {
        left += `<div class="s-warning">${r.repeated ? 'CANDIDATURA JÁ VOTADA NA 1ª VAGA' : 'NÚMERO ERRADO'}</div>`;
        left += '<div class="s-big">VOTO NULO</div>';
      } else {
        showFooter = false;
      }
    }

    screen.innerHTML = `${steps()}<div class="s-status"><span>SIMULAÇÃO</span></div>
      <div class="s-body"><div class="s-info">${left}</div><div class="s-photos">${right}</div></div>
      ${showFooter ? footer(proceed) : ''}`;
    announce(title, r);
    renderColinha();
  }

  // Leitor de tela: uma frase curta em vez de reler a tela inteira a cada tecla.
  function announce(title, r) {
    let msg = `${title}. ${state.digits.split('').join(' ')}`;
    if (r.kind === 'nominal') msg += `. ${r.cand.nome}, ${r.cand.partido}`;
    else if (r.kind === 'partido') msg += `. Partido ${r.party}. Confirma para voto de legenda`;
    else if (r.kind === 'legenda' || r.kind === 'legenda-errado') msg += `. Voto de legenda, ${r.party}`;
    else if (r.kind === 'nulo') msg += '. Número errado, voto nulo';
    else if (r.kind === 'branco') msg = `${title}. Voto em branco`;
    $('sr-status').textContent = msg;
  }

  // Número anotado na colinha para o cargo em votação, visível junto do teclado
  // (no celular a colinha fica bem abaixo da urna).
  function renderHint() {
    const el = $('colinha-hint');
    if (!state.cargos.length) return;
    if (state.mode === 'fim') {
      el.innerHTML = '<span class="hint-label">Votação concluída</span><span class="hint-value">Confira o resumo abaixo</span>';
      return;
    }
    const cargo = state.cargos[state.idx];
    const n = state.colinha[cargo.id] || '';
    const m = colinhaMatch(cargo, n);
    let value = '<span class="hint-empty">Nada anotado</span>';
    if (n) value = `<b>${esc(n)}</b> ${esc(m.cand ? m.cand.nome : m.text)}`;
    else if (state.brancos[cargo.id]) value = 'Voto em branco';
    el.innerHTML = `<span class="hint-label">Sua colinha · ${esc(cargo.short)}</span><span class="hint-value">${value}</span>`;
  }

  // A busca acompanha o cargo em votação, a menos que a pessoa esteja buscando.
  function syncSearch() {
    const cargo = state.cargos[state.idx];
    if (!cargo || state.searchCargo === cargo.id || document.activeElement === $('search-input')) return;
    state.searchCargo = cargo.id;
    $('search-input').value = '';
    renderTabs();
    renderResults();
  }

  // ---------- Braile das teclas ----------
  // Como na urna: número em braile nas teclas numéricas (1–9 = a–i, 0 = j) e a
  // palavra soletrada em BRANCO / CORRIGE / CONFIRMA. Pontos 1-2-3 na coluna da
  // esquerda (de cima para baixo), 4-5-6 na da direita.
  const BRAILLE = {
    a: [1], b: [1, 2], c: [1, 4], d: [1, 4, 5], e: [1, 5], f: [1, 2, 4], g: [1, 2, 4, 5],
    h: [1, 2, 5], i: [2, 4], j: [2, 4, 5], m: [1, 3, 4], n: [1, 3, 4, 5], o: [1, 3, 5],
    r: [1, 2, 3, 5],
  };
  const DIGIT_LETTER = { 1: 'a', 2: 'b', 3: 'c', 4: 'd', 5: 'e', 6: 'f', 7: 'g', 8: 'h', 9: 'i', 0: 'j' };

  function brailleSvg(text) {
    const DOT = 5; // distância entre pontos da mesma cela
    const CELL = 12; // distância entre celas (maior que entre pontos, como no braile real)
    const R = 1.7;
    const letters = [...text.toLowerCase()];
    const width = (letters.length - 1) * CELL + DOT + 2 * R + 1;
    const height = 2 * DOT + 2 * R + 1;
    let dots = '';
    letters.forEach((ch, i) => {
      const raised = BRAILLE[ch] || [];
      for (let p = 1; p <= 6; p++) {
        const cx = R + 0.5 + i * CELL + (p > 3 ? DOT : 0);
        const cy = R + 0.5 + ((p - 1) % 3) * DOT;
        dots += `<circle cx="${cx}" cy="${cy}" r="${R}" class="${raised.includes(p) ? 'on' : 'off'}"/>`;
      }
    });
    return `<svg class="braille" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true" focusable="false">${dots}</svg>`;
  }

  document.querySelectorAll('#keypad [data-key]').forEach((btn) => {
    const key = btn.dataset.key;
    const word = /^\d$/.test(key) ? DIGIT_LETTER[key] : key;
    btn.innerHTML = `<span class="key-label">${btn.textContent}</span>${brailleSvg(word)}`;
  });

  // ---------- Teclas ----------

  function flash(key) {
    const btn = document.querySelector(`[data-key="${key}"]`);
    if (!btn) return;
    btn.classList.add('is-pressed');
    setTimeout(() => btn.classList.remove('is-pressed'), 120);
  }

  function press(key) {
    if (state.mode === 'fim' || !state.cargos.length) return;
    UrnaSound.unlock();
    flash(key);
    const cargo = state.cargos[state.idx];

    if (/^\d$/.test(key)) {
      if (state.mode !== 'digits' || state.digits.length >= cargo.digits) return;
      UrnaSound.key();
      state.digits += key;
    } else if (key === 'corrige') {
      UrnaSound.key();
      state.digits = '';
      state.mode = 'digits';
    } else if (key === 'branco') {
      if (state.digits || state.mode !== 'digits') return;
      UrnaSound.key();
      state.mode = 'branco';
    } else if (key === 'confirma') {
      confirm(cargo);
      return;
    }
    render();
  }

  function confirm(cargo) {
    const r = evaluate();
    if (r.kind === 'partido') {
      if (!r.canLegenda) return;
      UrnaSound.key();
      state.mode = 'legenda';
      render();
      return;
    }
    if (r.kind === 'parcial') return;

    const vote = { cargo: cargo.id, label: cargo.short, numero: state.digits, kind: r.kind };
    if (r.cand) Object.assign(vote, { nome: r.cand.nome, partido: r.cand.partido });
    if (r.party) Object.assign(vote, { partido: r.party, numero: state.digits.slice(0, 2) });
    state.votes.push(vote);

    // O voto confirmado vai para a colinha (substitui o que tinha sido anotado).
    state.colinha[cargo.id] = r.kind === 'branco' ? '' : vote.numero;
    state.brancos[cargo.id] = r.kind === 'branco';
    state.justFilled = cargo.id;
    saveColinha();

    const last = state.idx === state.cargos.length - 1;
    if (last) {
      UrnaSound.end();
      state.mode = 'fim';
      render();
      renderColinha();
      showReceipt();
    } else {
      UrnaSound.confirm();
      state.idx++;
      state.digits = '';
      state.mode = 'digits';
      syncSearch();
      render();
    }
  }

  $('keypad').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-key]');
    if (btn) press(btn.dataset.key);
  });

  // Clique de mouse não deixa foco na tecla: senão o Enter do teclado físico
  // "reapertaria" a última tecla clicada em vez de CONFIRMA. Tab continua focando.
  $('keypad').addEventListener('mousedown', (e) => {
    if (e.target.closest('[data-key]')) e.preventDefault();
  });

  // Mesmo motivo para os outros botões (Limpar, Exportar, abas): depois de um
  // clique de mouse (detail > 0) o foco sai do botão; ativação por teclado mantém.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn && e.detail > 0 && !btn.closest('#uf-grid')) btn.blur();
  });

  document.addEventListener('keydown', (e) => {
    if ($('step-vote').hidden || e.target.closest('input, select, textarea')) return;
    // Botão focado pelo teclado (Tab) mantém Enter/espaço para si. Se o foco veio
    // de um clique de mouse, o Enter volta a ser CONFIRMA.
    const control = e.target.closest('button, a');
    if (control && control.matches(':focus-visible') && (e.key === 'Enter' || e.key === ' ')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    let key = null;
    if (/^\d$/.test(e.key)) key = e.key;
    else if (e.key === 'Enter') key = 'confirma';
    else if (e.key === 'Backspace' || e.key === 'Delete') key = 'corrige';
    else if (e.key === 'b' || e.key === 'B') key = 'branco';
    if (!key) return;
    e.preventDefault();
    press(key);
  });

  // ---------- Resumo ----------

  function describe(v) {
    switch (v.kind) {
      case 'nominal': return `<b>${esc(v.numero)}</b> — ${esc(v.nome)} <span>(${esc(v.partido)})</span>`;
      case 'legenda':
      case 'legenda-errado': return `<b>${esc(v.numero)}</b> — Voto de legenda <span>(${esc(v.partido)})</span>`;
      case 'branco': return 'Voto em branco';
      default: return 'Voto nulo';
    }
  }

  function showReceipt() {
    $('receipt-list').innerHTML = state.votes.map((v) => `<li><strong>${esc(v.label)}:</strong> ${describe(v)}</li>`).join('');
    $('receipt').hidden = false;
    $('receipt').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function startVoting() {
    state.idx = 0;
    state.digits = '';
    state.mode = 'digits';
    state.votes = [];
    $('receipt').hidden = true;
    syncSearch();
    render();
  }

  $('restart').addEventListener('click', () => {
    startVoting();
    $('step-vote').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ---------- Colinha / busca ----------

  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // O que o número anotado na colinha vai dar na urna.
  function colinhaMatch(cargo, n) {
    if (!n) return state.brancos[cargo.id] ? { text: 'Voto em branco', cls: 'is-ok' } : { text: '', cls: '' };
    const party = cargo.prop && n.length >= 2 ? cargo.parties.get(n.slice(0, 2)) : null;
    if (n.length < cargo.digits) {
      if (party && n.length === 2) return { text: `Voto de legenda · ${party}`, cls: 'is-ok' };
      if (party) return { text: `${party} · continue digitando`, cls: '' };
      return { text: 'Continue digitando…', cls: '' };
    }
    const cand = cargo.map.get(n);
    if (cand) {
      if (cargo.id === 'sen2' && state.colinha.sen1 === n) {
        return { text: `${cand.nome} já está na 1ª vaga — seria voto nulo`, cls: 'is-warn' };
      }
      return { text: `${cand.nome} · ${cand.partido}`, cls: 'is-ok', cand };
    }
    if (party) return { text: `Número não encontrado — conta como legenda do ${party}`, cls: 'is-warn' };
    return { text: 'Número não encontrado — seria voto nulo', cls: 'is-warn' };
  }

  function matchHtml(cargo, n) {
    const m = colinhaMatch(cargo, n);
    const uf = cargo.id === 'pres' ? 'BR' : state.uf;
    const img = m.cand && m.cand.id
      ? `<img src="${photoUrls(m.cand.id, uf)[0]}" data-fallback="${photoUrls(m.cand.id, uf)[1]}" alt="">`
      : '';
    return { cls: m.cls, html: `${img}<span>${esc(m.text)}</span>` };
  }

  function renderColinha() {
    $('colinha-list').innerHTML = state.cargos.map((c, i) => {
      const n = state.colinha[c.id] || '';
      const m = matchHtml(c, n);
      const cls = [
        state.mode !== 'fim' && i === state.idx ? 'is-current' : '',
        state.searchCargo === c.id ? 'is-open' : '',
        state.justFilled === c.id ? 'is-filled' : '',
      ].join(' ');
      return `<li class="${cls}" data-row="${c.id}">
        <div class="colinha-row">
          <label class="colinha-label" for="col-${c.id}">${esc(c.short)}</label>
          <input class="colinha-input" id="col-${c.id}" data-cargo="${c.id}" value="${n}"
            inputmode="numeric" pattern="[0-9]*" maxlength="${c.digits}" autocomplete="off"
            placeholder="${'0'.repeat(c.digits)}" style="--digits:${c.digits}" aria-describedby="match-${c.id}">
        </div>
        <div class="colinha-match ${m.cls}" id="match-${c.id}" aria-live="polite">${m.html}</div>
      </li>`;
    }).join('');
    state.justFilled = null;
    renderHint();
  }

  // Atualiza só a linha editada, sem recriar o input que está com foco.
  function updateMatch(id) {
    const cargo = state.cargos.find((c) => c.id === id);
    const el = $(`match-${id}`);
    const m = matchHtml(cargo, state.colinha[id] || '');
    el.className = `colinha-match ${m.cls}`;
    el.innerHTML = m.html;
    renderHint();
  }

  function markOpen() {
    document.querySelectorAll('#colinha-list li').forEach((li) => li.classList.toggle('is-open', li.dataset.row === state.searchCargo));
  }

  $('colinha-list').addEventListener('input', (e) => {
    const input = e.target.closest('.colinha-input');
    if (!input) return;
    const clean = input.value.replace(/\D/g, '').slice(0, Number(input.maxLength));
    if (clean !== input.value) input.value = clean;
    const id = input.dataset.cargo;
    state.colinha[id] = clean;
    state.brancos[id] = false;
    saveColinha();
    updateMatch(id);
    if (id === 'sen1' && state.colinha.sen2) updateMatch('sen2');
    renderResults();
  });

  $('colinha-list').addEventListener('focusin', (e) => {
    const input = e.target.closest('.colinha-input');
    if (!input || state.searchCargo === input.dataset.cargo) return;
    state.searchCargo = input.dataset.cargo;
    renderTabs();
    renderResults();
    markOpen();
  });

  // Enter pula para o próximo cargo.
  $('colinha-list').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('.colinha-input')) return;
    e.preventDefault();
    const inputs = [...document.querySelectorAll('.colinha-input')];
    const next = inputs[inputs.indexOf(e.target) + 1];
    if (next) next.focus(); else e.target.blur();
  });

  // Fotos das miniaturas: mesmo esquema de fallback da tela da urna.
  $('colinha-list').addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG') return;
    if (img.dataset.fallback) {
      img.src = img.dataset.fallback;
      img.dataset.fallback = '';
    } else {
      img.remove();
    }
  }, true);

  // ---------- Exportar colinha ----------

  function colinhaRows() {
    return state.cargos.map((c) => {
      const n = state.colinha[c.id] || '';
      const m = colinhaMatch(c, n);
      let detail = m.text;
      if (m.cand) detail = `${m.cand.nome} (${m.cand.partido})`;
      else if (/continue digitando/i.test(m.text)) detail = 'Número incompleto';
      return { label: c.short, digits: c.digits, n, detail, ok: m.cls === 'is-ok' };
    });
  }

  const subtitle = () => `Eleições 2026 · 1º turno · 4 de outubro · ${UFS[state.uf]}`;

  function colinhaText() {
    const lines = colinhaRows().map((r) => `${r.label}: ${r.n || '—'}${r.detail ? ` — ${r.detail}` : ''}`);
    return `Minha colinha\n${subtitle()}\n\n${lines.join('\n')}`;
  }

  async function exportImage() {
    if (document.fonts) await document.fonts.ready;
    const rows = colinhaRows();
    const W = 1080;
    const top = 230;
    const rowH = 150;
    const H = top + rows.length * rowH + 150;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    const font = (w, s) => `${w} ${s}px Arimo, Arial, sans-serif`;

    g.fillStyle = '#fff';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#3cae4f';
    g.fillRect(0, 0, W, 16);

    g.fillStyle = '#111';
    g.font = font(700, 60);
    g.fillText('Minha colinha', 72, 118);
    g.fillStyle = '#5d5b55';
    g.font = font(400, 30);
    g.fillText(subtitle(), 72, 170);

    rows.forEach((r, i) => {
      const y = top + i * rowH;
      g.strokeStyle = '#e1ded5';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(72, y);
      g.lineTo(W - 72, y);
      g.stroke();

      g.fillStyle = '#111';
      g.font = font(700, 32);
      g.fillText(r.label, 72, y + 58);
      g.fillStyle = r.n && !r.ok ? '#b4541a' : '#5d5b55';
      g.font = font(400, 26);
      let detail = r.detail || (r.n ? '' : 'Não anotado');
      while (g.measureText(detail).width > 560 && detail.length > 4) detail = `${detail.slice(0, -2)}…`;
      g.fillText(detail, 72, y + 104);

      const box = 64;
      const gap = 10;
      let x = W - 72 - r.digits * box - (r.digits - 1) * gap;
      for (let k = 0; k < r.digits; k++) {
        g.strokeStyle = '#111';
        g.lineWidth = 3;
        g.strokeRect(x, y + 32, box, 84);
        if (r.n[k]) {
          g.fillStyle = '#111';
          g.font = font(700, 54);
          g.textAlign = 'center';
          g.fillText(r.n[k], x + box / 2, y + 94);
          g.textAlign = 'left';
        }
        x += box + gap;
      }
    });

    g.fillStyle = '#5d5b55';
    g.font = font(400, 24);
    g.fillText('O celular não pode entrar na cabine: imprima ou anote no papel.', 72, H - 84);
    g.fillText('Feito no simulador não oficial de urna · Eleições 2026', 72, H - 48);

    cv.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `colinha-2026-${state.uf}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  }

  function exportPrint() {
    const rows = colinhaRows();
    $('print-sheet').innerHTML = `
      <div class="print-card">
        <h1>Minha colinha</h1>
        <p class="print-sub">${esc(subtitle())}</p>
        <table>${rows.map((r) => `<tr>
          <th>${esc(r.label)}<small>${esc(r.detail || '')}</small></th>
          <td><span class="print-boxes">${Array.from({ length: r.digits }, (_, k) => `<span>${r.n[k] ?? ''}</span>`).join('')}</span></td>
        </tr>`).join('')}</table>
        <p class="print-foot">O celular não pode entrar na cabine: leve esta colinha impressa ou anotada.</p>
      </div>`;
    window.print();
  }

  async function exportText(btn) {
    const text = colinhaText();
    const label = btn.textContent;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Minha colinha · Eleições 2026', text });
        return;
      }
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copiado!';
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      btn.textContent = 'Não foi possível copiar';
    }
    setTimeout(() => { btn.textContent = label; }, 2000);
  }

  // ---------- Limpar colinha (com desfazer, sem diálogo) ----------

  let toastTimer = null;

  function showToast(message, actionLabel, onAction) {
    const toast = $('toast');
    toast.innerHTML = `<span>${esc(message)}</span>${actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : ''}`;
    toast.hidden = false;
    const btn = toast.querySelector('button');
    if (btn) {
      btn.addEventListener('click', () => {
        onAction();
        hideToast();
      }, { once: true });
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 6000);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    $('toast').hidden = true;
  }

  const colinhaIsEmpty = () =>
    !Object.values(state.colinha).some(Boolean) && !Object.values(state.brancos).some(Boolean);

  function clearColinha() {
    if (colinhaIsEmpty()) {
      showToast('A colinha já está vazia.');
      return;
    }
    const backup = { colinha: { ...state.colinha }, brancos: { ...state.brancos } };
    state.colinha = {};
    state.brancos = {};
    saveColinha();
    renderColinha();
    renderResults();
    showToast('Colinha limpa.', 'Desfazer', () => {
      state.colinha = backup.colinha;
      state.brancos = backup.brancos;
      saveColinha();
      renderColinha();
      renderResults();
    });
  }

  $('clear-colinha').addEventListener('click', clearColinha);
  $('export-png').addEventListener('click', exportImage);
  $('export-print').addEventListener('click', exportPrint);
  $('export-text').addEventListener('click', (e) => exportText(e.currentTarget));
  if (navigator.share) $('export-text').textContent = 'Compartilhar';

  function renderTabs() {
    $('search-tabs').innerHTML = state.cargos.map((c) =>
      `<button role="tab" data-tab="${c.id}" aria-selected="${state.searchCargo === c.id}">${esc(c.short.replace('Deputado ', 'Dep. '))}</button>`).join('');
  }

  function renderResults() {
    const cargo = state.cargos.find((c) => c.id === state.searchCargo);
    const q = norm($('search-input').value.trim());
    const big = cargo.list.length > 60;
    if (big && q.length < 2) {
      $('search-results').innerHTML = `<li class="search-empty">Digite ao menos 2 letras para buscar entre ${cargo.list.length.toLocaleString('pt-BR')} candidaturas.</li>`;
      return;
    }
    const hits = cargo.list.filter((c) => !q || norm(c.nome).includes(q) || c.numero.startsWith(q) || norm(c.partido).includes(q));
    const shown = hits.slice(0, 60);
    $('search-results').innerHTML = shown.length
      ? shown.map((c) => `<li><button data-pick="${c.numero}" class="${state.colinha[cargo.id] === c.numero ? 'is-picked' : ''}">
          <b>${esc(c.numero)}</b><span>${esc(c.nome)}</span><small>${esc(c.partido)}</small></button></li>`).join('')
        + (hits.length > shown.length ? `<li class="search-empty">+${hits.length - shown.length} resultados — refine a busca.</li>` : '')
      : '<li class="search-empty">Nenhuma candidatura encontrada.</li>';
  }

  function openSearch(id) {
    state.searchCargo = id;
    renderTabs();
    renderColinha();
    renderResults();
  }

  $('search-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) openSearch(b.dataset.tab);
  });
  $('search-input').addEventListener('input', renderResults);
  $('search-results').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    const id = state.searchCargo;
    state.colinha[id] = state.colinha[id] === b.dataset.pick ? '' : b.dataset.pick;
    state.brancos[id] = false;
    saveColinha();
    renderColinha();
    renderResults();
  });

  // ---------- Estado ----------

  function renderUfGrid() {
    const last = readStore().lastUf;
    $('uf-grid').innerHTML = Object.entries(UFS).map(([uf, name]) =>
    uf === last
      ? `<button class="uf-btn is-last" data-uf="${uf}"><b>${uf}</b><span>${name}<em>Último usado</em></span></button>`
      : `<button class="uf-btn" data-uf="${uf}"><b>${uf}</b><span>${name}</span></button>`).join('');
  }
  renderUfGrid();

  $('uf-grid').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-uf]');
    if (!b) return;
    UrnaSound.unlock();
    const uf = b.dataset.uf;
    b.classList.add('is-loading');
    try {
      const data = await loadUf(uf);
      state.uf = uf;
      state.cargos = buildCargos(uf, data);
      const saved = (readStore().colinhas || {})[uf] || {};
      state.colinha = saved.colinha || {};
      state.brancos = saved.brancos || {};
      saveColinha();
      $('uf-name').textContent = UFS[uf];
      $('step-uf').hidden = true;
      $('step-vote').hidden = false;
      $('search-input').value = '';
      openSearch('federal');
      startVoting();
      $('step-vote').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      b.classList.remove('is-loading');
    }
  });

  $('change-uf').addEventListener('click', () => {
    state.cargos = [];
    renderUfGrid();
    $('step-vote').hidden = true;
    $('step-uf').hidden = false;
  });
})();
