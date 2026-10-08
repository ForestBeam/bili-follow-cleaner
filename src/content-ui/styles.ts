export const PANEL_CSS = `
:host { all: initial; }

.panel {
  /* ---------- tokens ---------- */
  --font-sans: "HarmonyOS Sans SC", "MiSans", "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif;
  --font-num: ui-monospace, "Cascadia Mono", "SF Mono", Consolas, "Liberation Mono", monospace;

  --paper: #faf7f6;
  --card: #ffffff;
  --card-2: #f2ecec;
  --ink: #241f26;
  --ink-2: #6b6472;
  --ink-3: #a49ca8;
  --line: #eae3e4;
  --line-strong: #d9d0d3;

  --brand: #d0285f;
  --brand-hi: #e8407d;
  --brand-soft: #ffe9f0;
  --brand-ink: #a81549;
  --mint: #1f9c7f;
  --mint-soft: #e2f6f0;
  --amber: #a86a12;
  --amber-soft: #fcf1de;
  --danger: #c13046;
  --danger-soft: #fdebee;

  --hd-bg: rgba(255, 255, 255, 0.74);
  --foot-bg: rgba(250, 247, 246, 0.88);
  --shadow-lg: 0 30px 64px -28px rgba(32, 22, 30, 0.5), 0 2px 6px rgba(32, 22, 30, 0.05);
  --shadow-sm: 0 1px 2px rgba(32, 22, 30, 0.05), 0 10px 22px -16px rgba(32, 22, 30, 0.45);

  position: fixed; top: 76px; right: 18px; bottom: 18px; width: 372px;
  display: flex; flex-direction: column; overflow: hidden;
  border: 1px solid var(--line-strong); border-radius: 18px;
  background:
    radial-gradient(120% 68% at 100% 0%, var(--brand-soft) 0%, transparent 62%),
    radial-gradient(88% 58% at 0% 100%, var(--mint-soft) 0%, transparent 58%),
    var(--paper);
  color: var(--ink);
  font: 13px/1.6 var(--font-sans);
  -webkit-font-smoothing: antialiased;
  box-shadow: var(--shadow-lg);
  z-index: 2147483000;
  animation: bfc-rise 0.32s cubic-bezier(0.22, 0.9, 0.28, 1) both;
}
.panel *, .panel *::before, .panel *::after { box-sizing: border-box; }

@media (prefers-color-scheme: dark) {
  .panel {
    --paper: #171419;
    --card: #211c23;
    --card-2: #2b242d;
    --ink: #f2edf1;
    --ink-2: #a69eac;
    --ink-3: #7d7583;
    --line: #322b35;
    --line-strong: #453c48;
    --brand: #e9508a;
    --brand-hi: #ff6fa3;
    --brand-soft: #3a1f2c;
    --brand-ink: #ffa8c6;
    --mint: #4fcbaa;
    --mint-soft: #16322c;
    --amber: #e0a450;
    --amber-soft: #332614;
    --danger: #f07387;
    --danger-soft: #3a1d22;
    --hd-bg: rgba(33, 28, 35, 0.76);
    --foot-bg: rgba(23, 20, 25, 0.86);
    --shadow-lg: 0 30px 64px -30px rgba(0, 0, 0, 0.8), 0 2px 6px rgba(0, 0, 0, 0.35);
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3), 0 10px 22px -16px rgba(0, 0, 0, 0.7);
  }
}

/* ---------- header ---------- */
.hd { display: flex; align-items: center; gap: 10px; padding: 13px 14px 12px;
  border-bottom: 1px solid var(--line); background: var(--hd-bg);
  backdrop-filter: blur(10px); }
.mark { flex: none; width: 32px; height: 32px; border-radius: 11px; display: grid; place-items: center;
  color: #fff; background: linear-gradient(160deg, var(--brand-hi), var(--brand));
  box-shadow: 0 10px 18px -12px var(--brand), inset 0 1px 0 rgba(255, 255, 255, 0.25); }
.mark svg { width: 17px; height: 17px; }
.titles { flex: 1; min-width: 0; }
.kicker { font-size: 9.5px; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--ink-3); line-height: 1.3; }
.title { font-size: 14.5px; font-weight: 700; letter-spacing: 0.01em; line-height: 1.35;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hd-actions { display: flex; gap: 4px; }
.icon-btn { width: 30px; height: 30px; border-radius: 9px; border: 1px solid transparent;
  background: transparent; color: var(--ink-2); display: grid; place-items: center;
  cursor: pointer; transition: background 0.15s, color 0.15s, border-color 0.15s; }
.icon-btn:hover { background: var(--card); border-color: var(--line); color: var(--ink); }
.icon-btn[aria-pressed="true"] { background: var(--brand-soft); color: var(--brand-ink); }
.icon-btn.armed { background: var(--danger-soft); color: var(--danger); }
.acct { font-size: 10.5px; line-height: 1.4; color: var(--ink-3); }

/* ---------- scroll area ---------- */
main { flex: 1; overflow: auto; display: flex; flex-direction: column;
  padding: 14px 16px 0; scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
main::-webkit-scrollbar { width: 8px; }
main::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: 99px;
  border: 2px solid transparent; background-clip: content-box; }
.view { flex: 1 0 auto; display: flex; flex-direction: column;
  animation: bfc-fade 0.24s ease both; }

/* ---------- chrome: chips / notes / rows ---------- */
.chips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
.chips::-webkit-scrollbar { display: none; }
.chip { flex: none; display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px;
  border-radius: 999px; border: 1px solid var(--line); background: var(--card); color: var(--ink-2);
  font: 600 12px/1.35 var(--font-sans); cursor: pointer;
  transition: transform 0.15s, border-color 0.15s, color 0.15s, background 0.15s; }
.chip:hover:not(:disabled) { border-color: var(--line-strong); color: var(--ink); transform: translateY(-1px); }
.chip[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: var(--paper); }
.chip:disabled { opacity: 0.42; cursor: default; }
.chip b { font: 600 11px/1 var(--font-num); opacity: 0.7; }

.note { display: flex; gap: 8px; align-items: flex-start; margin: 0 0 10px; padding: 9px 11px;
  border-radius: 12px; background: var(--brand-soft); color: var(--brand-ink); font-size: 12px;
  line-height: 1.55; }
.note.warn { background: var(--amber-soft); color: var(--amber); }
.note.ok { background: var(--mint-soft); color: var(--mint); }
.note svg { flex: none; margin-top: 1px; }
.hint { display: flex; align-items: center; gap: 6px; margin: 9px 0 0;
  font-size: 11.5px; color: var(--ink-3); }
.hint svg { flex: none; }

/* ---------- grid & cards ---------- */
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 11px 5px 9px; border: 1px solid var(--line); border-radius: 14px; background: var(--card);
  cursor: pointer; transition: transform 0.16s cubic-bezier(0.2, 0.8, 0.3, 1),
    box-shadow 0.16s, border-color 0.16s, background 0.16s; }
.card:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
@media (hover: hover) {
  .card:hover { transform: translateY(-2px); box-shadow: var(--shadow-sm); border-color: var(--line-strong); }
}
.card[aria-pressed="true"] { border-color: var(--brand); background: var(--brand-soft);
  box-shadow: inset 0 0 0 1px var(--brand); }
.card.is-blocked { cursor: default; border-style: dashed; background: var(--card-2); }
.card.is-blocked:hover { transform: none; box-shadow: none; }
.card.is-blocked .face, .card.is-blocked .face-txt { filter: grayscale(0.85); opacity: 0.7; }
.face-wrap { position: relative; }
.face { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; display: grid;
  place-items: center; background: var(--card-2); }
.face-txt { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center;
  background: var(--card-2); color: var(--ink-2); font-weight: 700; font-size: 15px; }
.tick { position: absolute; right: -3px; bottom: -3px; width: 18px; height: 18px; border-radius: 50%;
  display: grid; place-items: center; background: var(--brand); color: #fff;
  border: 2px solid var(--card); animation: bfc-pop 0.18s ease both; }
.name { width: 100%; text-align: center; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; font-size: 11.5px; color: var(--ink-2); }
.card[aria-pressed="true"] .name { color: var(--brand-ink); font-weight: 600; }
.badge { position: absolute; top: 5px; left: 5px; display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 5px; border-radius: 6px; font-size: 9.5px; font-weight: 700; letter-spacing: 0.02em; }
.badge svg { width: 9px; height: 9px; }
.badge.lock { background: var(--mint-soft); color: var(--mint); }
.badge.fresh { background: var(--amber-soft); color: var(--amber); }
.lock-btn { position: absolute; top: 4px; right: 4px; width: 23px; height: 23px; border-radius: 7px;
  border: 1px solid transparent; background: transparent; color: var(--ink-3); display: grid;
  place-items: center; cursor: pointer; opacity: 0.72;
  transition: opacity 0.15s, background 0.15s, color 0.15s; }
.lock-btn:hover:not(:disabled) { opacity: 1; background: var(--mint-soft); color: var(--mint); }
.lock-btn:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; opacity: 1; }
.lock-btn:disabled { opacity: 1; color: var(--mint); cursor: default; }
.card:hover .lock-btn { opacity: 1; }
.card-actions { position: absolute; top: 4px; right: 4px; display: flex; gap: 1px; }
.card-actions .lock-btn { position: static; }
.card-actions .lock-btn:first-child:hover:not(:disabled) { background: var(--brand-soft); color: var(--brand-ink); }
.lock-btn.on { opacity: 1; color: var(--mint); }
.search-row { margin-top: 10px; }
.search { width: 100%; padding: 8px 11px; border-radius: 11px; border: 1px solid var(--line-strong);
  background: var(--card); color: var(--ink); font: 500 12.5px/1.4 var(--font-sans); }
.search::placeholder { color: var(--ink-3); }
.search:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
.search::-webkit-search-cancel-button { cursor: pointer; opacity: 0.55; }

/* ---------- buttons ---------- */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px 14px; border-radius: 11px; border: 1px solid var(--line-strong); background: var(--card);
  color: var(--ink); font: 600 13px/1.2 var(--font-sans); cursor: pointer;
  transition: transform 0.14s, box-shadow 0.14s, background 0.14s, border-color 0.14s, color 0.14s; }
.btn:hover:not(:disabled) { transform: translateY(-1px); border-color: var(--ink-3); }
.btn:disabled { opacity: 0.48; cursor: not-allowed; box-shadow: none; }
.btn:active:not(:disabled) { transform: translateY(0); }
.btn:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.btn:disabled { opacity: 0.45; cursor: default; }
.btn.primary { background: var(--brand); border-color: var(--brand); color: #fff;
  box-shadow: 0 12px 22px -14px var(--brand), inset 0 1px 0 rgba(255, 255, 255, 0.18); }
.btn.primary:hover:not(:disabled) { background: var(--brand-hi); border-color: var(--brand-hi); }
.btn.ghost { border-color: transparent; background: transparent; color: var(--ink-2); }
.btn.ghost:hover:not(:disabled) { background: var(--card); border-color: var(--line); color: var(--ink); }
.btn.danger { border-color: transparent; background: var(--danger-soft); color: var(--danger); }
.btn.sm { padding: 5px 9px; border-radius: 9px; font-size: 12px; gap: 4px; }
.btn.block { width: 100%; }

/* ---------- sticky footer ---------- */
.foot { position: sticky; bottom: 0; z-index: 2; display: flex; align-items: center; gap: 9px;
  margin: auto -16px 0; padding: 12px 16px 14px;
  background: var(--foot-bg); backdrop-filter: blur(10px); }
.foot::before { content: ""; position: absolute; left: 0; right: 0; top: -15px; height: 15px;
  border-top: 1px solid var(--line); background: var(--foot-bg); backdrop-filter: blur(10px); }
.foot .grow { flex: 1; min-width: 0; }
.foot .summary { font-size: 12px; color: var(--ink-2); }
.foot .summary b { font: 700 14px/1 var(--font-num); color: var(--ink); }

/* ---------- progress ---------- */
.bar { height: 10px; border-radius: 999px; background: var(--card-2); overflow: hidden; }
.bar > i { position: relative; display: block; height: 100%; border-radius: 999px; overflow: hidden;
  background: linear-gradient(90deg, var(--brand-hi), var(--brand));
  transition: width 0.5s cubic-bezier(0.22, 0.9, 0.28, 1); }
.bar.busy > i::after { content: ""; position: absolute; inset: 0;
  background-image: repeating-linear-gradient(115deg,
    rgba(255, 255, 255, 0.34) 0 6px, transparent 6px 14px); animation: bfc-drift 0.9s linear infinite; }
.tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
.tile { padding: 9px 10px; border-radius: 12px; border: 1px solid var(--line); background: var(--card); }
.tile b { display: block; font: 700 19px/1.25 var(--font-num); letter-spacing: -0.01em; }
.tile span { font-size: 10.5px; color: var(--ink-3); }
.tile.warn b { color: var(--danger); }
.current { display: flex; align-items: center; gap: 9px; margin-top: 12px; padding: 8px 10px;
  border-radius: 12px; background: var(--card); border: 1px solid var(--line); }
.current .face, .current .face-txt { width: 30px; height: 30px; font-size: 12px; }
.current .label { flex: 1; min-width: 0; font-size: 12.5px; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; }
.spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--line-strong);
  border-top-color: var(--brand); animation: bfc-spin 0.7s linear infinite; flex: none; }
.eta { margin-top: 10px; display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--ink-3); }
.chip-tag { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 999px;
  background: var(--amber-soft); color: var(--amber); font-size: 11px; font-weight: 600; }

/* ---------- preview strip (confirm view) ---------- */
.strip { display: flex; flex-wrap: wrap; gap: 5px; margin: 12px 0 4px; }
.strip .face, .strip .face-txt { width: 26px; height: 26px; font-size: 11px; }
.strip .more { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
  background: var(--card-2); color: var(--ink-2); font: 600 10px/1 var(--font-num); }

/* ---------- list rows (failed / backups / protection) ---------- */
.rows { margin-top: 8px; max-height: 168px; overflow: auto; border-radius: 12px;
  border: 1px solid var(--line); background: var(--card); }
.row { display: flex; align-items: center; gap: 8px; padding: 7px 10px; font-size: 12px;
  border-top: 1px solid var(--line); }
.row:first-child { border-top: none; }
.row .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .err { color: var(--ink-3); font: 400 11px/1.5 var(--font-num); }
.row .date { color: var(--ink-3); font: 400 11px/1.5 var(--font-num); }
.ok-mark { flex: none; display: grid; place-items: center; color: var(--mint); }
.empty { padding: 12px; text-align: center; color: var(--ink-3); font-size: 12px; }

/* ---------- settings ---------- */
.sec { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); }
.sec > h4 { display: flex; align-items: center; gap: 7px; margin: 0 0 11px;
  font-size: 11.5px; font-weight: 700; letter-spacing: 0.1em; color: var(--ink-2); }
.sec > h4::before { content: ""; width: 5px; height: 5px; border-radius: 2px; background: var(--brand); }
.field { margin-bottom: 15px; }
.field > .label { display: block; margin-bottom: 7px; font-size: 12.5px; font-weight: 600; }
.seg { display: flex; gap: 4px; padding: 3px; border-radius: 12px; background: var(--card-2);
  border: 1px solid var(--line); }
.seg button { flex: 1; padding: 7px 8px; border: none; border-radius: 9px; background: transparent;
  color: var(--ink-2); font: 600 12px/1.4 var(--font-sans); cursor: pointer; transition: 0.15s; }
.seg button[aria-pressed="true"] { background: var(--card); color: var(--ink);
  box-shadow: var(--shadow-sm); }
.sw { display: flex; align-items: center; gap: 10px; padding: 7px 0; cursor: pointer; }
.sw input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.sw .txt { flex: 1; font-size: 12.5px; }
.track { flex: none; position: relative; width: 38px; height: 22px; border-radius: 999px;
  background: var(--card-2); border: 1px solid var(--line-strong); transition: 0.18s; }
.track::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
  border-radius: 50%; background: var(--card); box-shadow: 0 1px 3px rgba(32, 22, 30, 0.3);
  transition: transform 0.18s, background 0.18s; }
.sw input:checked + .track { background: var(--mint); border-color: var(--mint); }
.sw input:checked + .track::after { transform: translateX(16px); background: #fff; }
.sw input:focus-visible + .track { outline: 2px solid var(--brand); outline-offset: 2px; }
.num-row { display: flex; align-items: center; gap: 8px; }
.num-row input { width: 86px; padding: 7px 9px; border-radius: 10px; border: 1px solid var(--line-strong);
  background: var(--card); color: var(--ink); font: 600 13px/1.3 var(--font-num); }
.num-row input:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
.num-row .unit { font-size: 12px; color: var(--ink-2); }

/* ---------- skeleton ---------- */
.sk { border-radius: 14px; background: linear-gradient(90deg,
  var(--card-2) 25%, var(--line) 37%, var(--card-2) 63%); background-size: 400% 100%;
  animation: bfc-shimmer 1.3s ease-in-out infinite; }
.sk.card-sk { height: 82px; }

/* ---------- byline / report card / about ---------- */
.byline { flex: none; display: flex; align-items: center; gap: 8px; padding: 8px 14px 9px;
  border-top: 1px solid var(--line); background: var(--foot-bg); backdrop-filter: blur(10px);
  font-size: 11px; color: var(--ink-3); }
.byline .grow { flex: 1; min-width: 0; }
.byline-txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mini { flex: none; border: none; border-radius: 8px; padding: 3px 8px; background: transparent;
  color: var(--ink-2); font: 600 11px/1.5 var(--font-sans); cursor: pointer; white-space: nowrap;
  transition: background 0.15s, color 0.15s; }
.mini:hover:not(:disabled) { background: var(--card-2); color: var(--brand-ink); }
.mini:disabled { color: var(--mint); cursor: default; opacity: 1; }
.mini:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }
.report { margin-top: 12px; padding: 11px 12px 9px; border-radius: 14px;
  border: 1px solid var(--line-strong); background: var(--card); box-shadow: var(--shadow-sm); }
.report-top { display: flex; align-items: center; gap: 10px; }
.report-head { flex: 1; min-width: 0; font-size: 15px; font-weight: 700; letter-spacing: 0.01em; }
.report-sub { margin-top: 4px; font-size: 11.5px; color: var(--ink-2); }
.report-mark { margin-top: 8px; padding-top: 7px; border-top: 1px dashed var(--line);
  font-size: 10px; color: var(--ink-3); }
.report-mark-line { display: block; }
.report-mark-url { display: block; font-family: var(--font-num); }
.link-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }

/* ---------- motion ---------- */
@keyframes bfc-rise { from { opacity: 0; transform: translateY(10px) scale(0.99); } }
@keyframes bfc-fade { from { opacity: 0; transform: translateY(4px); } }
@keyframes bfc-pop { from { transform: scale(0.5); opacity: 0; } }
@keyframes bfc-spin { to { transform: rotate(360deg); } }
@keyframes bfc-drift { to { transform: translateX(-14px); } }
@keyframes bfc-shimmer { to { background-position: -135% 0; } }
@keyframes bfc-pulse { 50% { opacity: 0.55; } }
.pulse { animation: bfc-pulse 1.6s ease-in-out infinite; }

@media (prefers-reduced-motion: reduce) {
  .panel, .panel * { animation: none !important; transition: none !important; }
}
`;
