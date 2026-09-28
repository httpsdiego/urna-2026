// Sons da urna sintetizados via Web Audio, com os mesmos parâmetros do
// simulador oficial do TSE (vota_web_wasm): onda quadrada, 2300/2200 Hz,
// 100 ms por bipe, envelope de ~8 ms, fila tocada em sequência.
const UrnaSound = (() => {
  const HIGH = 2300;
  const LOW = 2200;
  const BEEP_MS = 100;
  const VOLUME = 0.2;

  let ctx = null;
  let out = null;
  let cursor = 0; // fim da fila, em segundos do AudioContext

  function audio() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      out = ctx.createGain();
      out.gain.value = VOLUME;
      out.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Enfileira um bipe, como Module.uenuxBeepQueue(frequencia, duracaoMs).
  function queue(freq, ms) {
    const a = audio();
    const dur = ms / 1000;
    const start = Math.max(a.currentTime + 0.002, cursor);
    const end = start + dur;
    cursor = end;
    if (!freq) return; // frequência 0 = pausa
    const env = Math.min(0.008, Math.max(0.001, dur / 4));
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(1, start + env);
    gain.gain.setValueAtTime(1, Math.max(start + env, end - env));
    gain.gain.linearRampToValueAtTime(0, end);
    osc.connect(gain).connect(out);
    osc.start(start);
    osc.stop(end + 0.01);
  }

  return {
    // Tecla: o simulador web do TSE não bipa nas teclas, a urna física sim.
    // Bipe curto na mesma frequência.
    key() {
      queue(HIGH, 60);
    },
    // CONFIRMA entre cargos: 2300 Hz + 2200 Hz.
    confirm() {
      queue(HIGH, BEEP_MS);
      queue(LOW, BEEP_MS);
    },
    // FIM: bipe do confirma, pausa e o "tiririri" de 8 bipes alternados.
    end() {
      queue(HIGH, BEEP_MS);
      queue(LOW, BEEP_MS);
      queue(0, 620);
      for (let i = 0; i < 4; i++) {
        queue(HIGH, BEEP_MS);
        queue(LOW, BEEP_MS);
      }
    },
    unlock() {
      audio();
    },
  };
})();
