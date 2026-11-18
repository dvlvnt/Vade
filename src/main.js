import '@fontsource-variable/unbounded';
import '@fontsource-variable/manrope';
import './style.css';
import { animate } from 'motion';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { StatusBar, Style } from '@capacitor/status-bar';
import {
  CATS, catOf, CUR, money, rulesOf, ruleText, MONTHS, DAYS_SHORT, ymd, parse, todayStr, periodKey, keyParts, addMonths, lastDay,
  dueDate, daysBetween, fmtDay, fmtDayShort, isPaid, paymentsFor, nextOpen, statusText, monthMap, plannedNotifications,
} from './logic.js';

const NATIVE = Capacitor.isNativePlatform();
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* yok */ } };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const $ = (id) => document.getElementById(id);

/* ---------- veri ---------- */
const KEY = 'vade.v1';
let state;
try { state = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { state = null; }
if (!state || !Array.isArray(state.bills)) state = { bills: [], payments: [] };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* dolu */ } syncNotifications(); };

const now = new Date();
let view = { y: now.getFullYear(), m: now.getMonth() };
const curKey = () => periodKey(new Date().getFullYear(), new Date().getMonth());

/* ---------- simgeler ---------- */
const SV = (d, s = 22, w = 2.2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  drop: '<path d="M12 3s-6 7-6 11a6 6 0 0012 0c0-4-6-11-6-11z"/>',
  flame: '<path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-6 6-6 9-1-1-2-2-2-4-1 2-1 4-1 6 0 5 3 8 7 8z"/>',
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>',
  wifi: '<path d="M2 9a15 15 0 0120 0M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0"/><circle cx="12" cy="19.5" r="1"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  dots: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3 1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8 1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  bell: '<path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 004 0"/>',
};
const icon = (n, s, w) => SV(ICON[n] || ICON.dots, s, w);

const DROP_PATH = 'M10 1.2C10 1.2 2 11 2 16.6a8 8 0 0016 0C18 11 10 1.2 10 1.2z';
function dropSVG(color, kind, big) {
  // kind: paid | open | late
  const fill = kind === 'paid' ? color : kind === 'late' ? 'rgba(255,77,77,.16)' : `${color}33`;
  const stroke = kind === 'late' ? '#FF4D4D' : color;
  const tick = kind === 'paid' ? '<path class="tick" d="M6.2 16.4l2.6 2.7 5-5.6" fill="none" stroke="#14211C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' : '';
  return `<svg class="drop ${big ? 'big' : ''} ${kind === 'late' ? 'late' : ''}" viewBox="0 0 20 26" aria-hidden="true"><path d="${DROP_PATH}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>${tick}</svg>`;
}

/* ---------- iskelet ---------- */
const LOGO = `<svg width="30" height="30" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFC531"/><stop offset=".5" stop-color="#FF5C8A"/><stop offset="1" stop-color="#9B7BFF"/></linearGradient></defs><path d="M24 4S9 21 9 31a15 15 0 0030 0C39 21 24 4 24 4z" fill="url(#lg)"/><path d="M17 31l5 5 9-10" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const app = $('app');
app.innerHTML = `
  <header class="top">
    <div class="brand">${LOGO}Vade</div>
    <button class="round" id="settings" aria-label="Ayarlar">${icon('gear')}</button>
  </header>
  <div class="cal-wrap" id="calWrap"></div>
  <div id="lists"></div>
  <div class="dock"><button class="add" id="addBill">${icon('plus', 20, 2.6)}Fatura ekle</button></div>
  <div class="toast" id="toast" role="status"></div>`;

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  animate(t, { opacity: [0, 1], y: [10, 0] }, { duration: 0.2 });
  clearTimeout(toast.t);
  toast.t = setTimeout(() => animate(t, { opacity: 0 }, { duration: 0.3 }), 1900);
}

/* ---------- takvim ---------- */
function calHTML() {
  const { y, m } = view;
  const k = periodKey(y, m);
  const map = monthMap(state, y, m, todayStr());
  const first = (new Date(y, m, 1).getDay() + 6) % 7;
  const n = lastDay(y, m);
  const today = todayStr();
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<div class="cell out"></div>';
  for (let d = 1; d <= n; d++) {
    const list = map[d] || [];
    const ds = ymd(new Date(y, m, d, 12));
    const drops = list.slice(0, 3).map((x) => dropSVG(catOf(x.bill.cat).color, x.paid ? 'paid' : x.overdue ? 'late' : 'open')).join('');
    cells += `<button class="cell ${list.length ? 'has' : ''} ${ds === today ? 'today' : ''}" data-day="${d}" ${list.length ? '' : 'tabindex="-1"'} aria-label="${d} ${MONTHS[m]}${list.length ? `, ${list.length} fatura` : ''}">
      <span class="num">${d}</span>${list.length ? `<span class="drops">${drops}</span>${list.length > 3 ? `<span class="more">+${list.length - 3}</span>` : ''}` : ''}</button>`;
  }
  const active = state.bills.filter((b) => (b.start || '') <= k);
  const paidN = active.filter((b) => isPaid(state, b.id, k)).length;
  const totals = {};
  state.payments.filter((p) => p.period === k).forEach((p) => { totals[p.currency] = (totals[p.currency] || 0) + p.amount; });
  const totalTxt = Object.entries(totals).map(([c, v]) => `<b>${money(v, c)}</b>`).join(' · ');
  return `
    <div class="hook"></div>
    <div class="cal" id="cal">
      <div class="cal-top"><span class="ring l"></span><span class="ring r"></span></div>
      <div class="cal-head">
        <div class="cal-title">${MONTHS[m]}<small>${y}${active.length ? ` · ${active.length} fatura` : ''}</small></div>
        <div class="nav"><button id="prevM" aria-label="Önceki ay">${icon('left', 20, 2.6)}</button><button id="nextM" aria-label="Sonraki ay">${icon('right', 20, 2.6)}</button></div>
      </div>
      <div class="dow">${DAYS_SHORT.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="grid" id="grid">${cells}</div>
      ${active.length ? `<div class="sum"><span><b>${paidN}/${active.length}</b> ödendi</span>${totalTxt ? `<span>${totalTxt}</span>` : ''}<div class="bar"><i id="barFill" data-w="${(paidN / active.length) * 100}"></i></div></div>` : ''}
    </div>`;
}

function renderCal() {
  $('calWrap').innerHTML = calHTML();
  $('prevM').addEventListener('click', () => turnMonth(-1));
  $('nextM').addEventListener('click', () => turnMonth(1));
  $('grid').addEventListener('click', (e) => {
    const c = e.target.closest('.cell.has');
    if (c) openDaySheet(+c.dataset.day);
  });
  const bar = $('barFill');
  if (bar) {
    if (reduced) bar.style.width = `${bar.dataset.w}%`;
    else animate(bar, { width: ['0%', `${bar.dataset.w}%`] }, { duration: 0.8, delay: 0.2, ease: 'easeOut' });
  }
}

let turning = false;
async function turnMonth(dir) {
  if (turning) return;
  turning = true;
  const old = $('cal');
  const wrap = $('calWrap');
  let ghost = null;
  if (!reduced && old) {
    ghost = old.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
    ghost.style.cssText = 'position:absolute;left:0;right:0;top:0;z-index:4;pointer-events:none;transform-origin:' + (dir > 0 ? '100% 0' : '0 0');
  }
  const d = new Date(view.y, view.m + dir, 1);
  view = { y: d.getFullYear(), m: d.getMonth() };
  renderCal();
  if (ghost) {
    wrap.appendChild(ghost);
    buzz(10);
    animate($('cal'), { scale: [0.97, 1], opacity: [0.6, 1] }, { duration: 0.4 });
    popDrops(0.15);
    await animate(ghost, { rotate: [0, dir * -14], y: [0, 520], x: [0, dir * -40], opacity: [1, 1, 0] }, { duration: 0.55, ease: [0.5, 0, 0.75, 0] });
    ghost.remove();
  }
  turning = false;
}

function popDrops(delay = 0) {
  if (reduced) return;
  const ds = document.querySelectorAll('#grid .drop');
  ds.forEach((el, i) => animate(el, { y: [-14, 0], scale: [0.3, 1], opacity: [0, 1] }, { type: 'spring', stiffness: 420, damping: 15, delay: delay + i * 0.035 }));
}

/* ---------- listeler ---------- */
function upcoming() {
  const today = todayStr();
  const ck = curKey();
  return state.bills.map((b) => {
    const open = nextOpen(state, b, today);
    const paidNow = isPaid(state, b.id, ck);
    const lastPay = state.payments.filter((p) => p.billId === b.id).sort((a, c) => (a.date < c.date ? 1 : -1))[0];
    return { b, open, paidNow: open && open.period > ck && paidNow, lastPay };
  }).sort((a, c) => (a.paidNow - c.paidNow) || ((a.open ? a.open.days : 999) - (c.open ? c.open.days : 999)));
}

function listsHTML() {
  if (!state.bills.length) {
    return `<div class="empty"><h2>İlk faturanı ekle</h2><p>Elektrik, su, kira gibi faturalarını ekle. Son ödeme gününü seç, Vade zamanı gelince hatırlatsın.</p></div>`;
  }
  const up = upcoming();
  const cards = up.map(({ b, open, paidNow, lastPay }) => {
    const c = catOf(b.cat);
    let sub;
    let count = '';
    if (paidNow) {
      sub = `<div class="bill-sub">Bu ay ödendi${lastPay ? `, ${fmtDayShort(lastPay.date)} · ${money(lastPay.amount, lastPay.currency)}` : ''}</div>`;
      count = `<div class="count">${dropSVG(c.color, 'paid', true)}</div>`;
    } else if (open) {
      const cls = open.days < 0 ? 'late' : open.days <= 3 ? 'soon' : '';
      sub = `<div class="bill-sub ${cls}">${open.days < 0 ? statusText(open.days) : `Son ödeme ${fmtDay(open.due)}`}</div>`;
      count = open.days >= 0 ? `<div class="count" data-n="${open.days}">${open.days}<small>${open.days === 0 ? 'bugün' : 'gün'}</small></div>` : `<div class="count late">!</div>`;
    }
    return `<div class="bill ${paidNow ? 'done' : ''}" style="--c:${c.color}" data-bill="${b.id}" role="button" tabindex="0">
      <span class="ic">${icon(c.icon, 24)}</span>
      <div class="bill-main"><div class="bill-name">${esc(b.name)}</div>${sub}</div>
      ${count}
      <button class="paybtn" data-pay="${b.id}">Ödedim</button>
    </div>`;
  }).join('');

  const pays = [...state.payments].sort((a, c) => (a.date < c.date ? 1 : a.date > c.date ? -1 : c.ts - a.ts));
  const groups = [];
  for (const p of pays) {
    const d = parse(p.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, items: [], totals: {} }; groups.push(g); }
    g.items.push(p);
    g.totals[p.currency] = (g.totals[p.currency] || 0) + p.amount;
  }
  const hist = groups.slice(0, histLimit).map((g) => `
    <div class="month-h"><span>${g.label}</span><span>${Object.entries(g.totals).map(([cu, v]) => money(v, cu)).join(' · ')}</span></div>
    ${g.items.map((p) => {
      const b = state.bills.find((x) => x.id === p.billId);
      const c = catOf(b ? b.cat : 'diger');
      const [py, pm] = keyParts(p.period);
      return `<button class="pay-row" style="--c:${c.color}" data-bill="${p.billId}">
        <span class="dot"></span><span class="t"><b>${esc(b ? b.name : 'Silinmiş fatura')}</b><span>${fmtDay(p.date)} ödendi · ${MONTHS[pm]} ${py !== new Date().getFullYear() ? py : ''} faturası${p.note ? ` · ${esc(p.note)}` : ''}</span></span>
        <span class="a">${money(p.amount, p.currency)}</span></button>`;
    }).join('')}`).join('');

  return `
    <div class="sec-h">Faturalar<span>${up.filter((x) => !x.paidNow).length} ödenecek</span></div>
    ${cards}
    ${pays.length ? `<div class="sec-h">Geçmiş<span>${pays.length} ödeme</span></div>${hist}
      ${groups.length > histLimit ? '<button class="add" id="moreHist" style="background:var(--wall-2);color:var(--paper);margin-top:10px;box-shadow:none">Daha eski ödemeler</button>' : ''}` : ''}`;
}
let histLimit = 4;

function renderLists(animateIn) {
  $('lists').innerHTML = listsHTML();
  const more = $('moreHist');
  if (more) more.addEventListener('click', () => { histLimit += 6; renderLists(); });
  if (animateIn && !reduced) {
    animate('#lists .bill, #lists .sec-h, #lists .empty', { opacity: [0, 1], y: [24, 0] }, { delay: (i) => 0.5 + i * 0.06, duration: 0.45, ease: 'easeOut' });
    document.querySelectorAll('#lists .count[data-n]').forEach((el) => {
      const n = +el.dataset.n;
      const small = el.querySelector('small').outerHTML;
      animate(Math.min(n + 12, 40), n, { duration: 0.9, delay: 0.6, ease: 'easeOut', onUpdate: (v) => { el.innerHTML = `${Math.round(v)}${small}`; } });
    });
  }
}

$('lists').addEventListener('click', (e) => {
  const pay = e.target.closest('[data-pay]');
  if (pay) { e.stopPropagation(); openPaySheet(pay.dataset.pay); return; }
  const bill = e.target.closest('[data-bill]');
  if (bill && state.bills.find((b) => b.id === bill.dataset.bill)) openBillSheet(bill.dataset.bill);
});

function renderAll(animateIn) {
  renderCal();
  renderLists(animateIn);
}

/* ---------- alt sayfa ---------- */
let sheetOpen = false;
function openSheet(html, onMount) {
  if (sheetOpen) return;
  sheetOpen = true;
  history.pushState({ sheet: 1 }, '');
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const sh = document.createElement('div');
  sh.className = 'sheet';
  sh.setAttribute('role', 'dialog');
  sh.innerHTML = `<div class="grip"></div>${html}`;
  document.body.append(scrim, sh);
  if (reduced) scrim.style.opacity = 1;
  else {
    animate(scrim, { opacity: 1 }, { duration: 0.25 });
    animate(sh, { y: ['100%', '0%'] }, { type: 'spring', stiffness: 260, damping: 28 });
  }
  let closed = false;
  const ctl = {
    el: sh,
    close(fromPop) {
      if (closed) return Promise.resolve();
      closed = true;
      window.removeEventListener('popstate', onPop);
      if (!fromPop) history.back();
      const done = () => { scrim.remove(); sh.remove(); sheetOpen = false; };
      if (reduced) { done(); return Promise.resolve(); }
      animate(scrim, { opacity: 0 }, { duration: 0.2 });
      return animate(sh, { y: '100%' }, { duration: 0.24, ease: 'easeIn' }).then(done);
    },
  };
  const onPop = () => ctl.close(true);
  window.addEventListener('popstate', onPop);
  scrim.addEventListener('click', () => ctl.close(false));
  onMount(sh, ctl);
}
const swapSheet = (ctl, fn) => ctl.close().then(() => setTimeout(fn, 40));

function wheel(host, values, start, onChange, fmt = (v) => v) {
  host.innerHTML = values.map((v) => `<div>${fmt(v)}</div>`).join('');
  const items = [...host.children];
  let idx = -1;
  const mark = () => {
    const i = Math.max(0, Math.min(values.length - 1, Math.round(host.scrollTop / 44)));
    if (i === idx) return;
    idx = i;
    items.forEach((it, k) => it.classList.toggle('sel', k === i));
    buzz(3);
    onChange(values[i]);
  };
  let raf = 0;
  host.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(mark); });
  const set = (v) => { host.scrollTop = Math.max(0, values.indexOf(v)) * 44; idx = -1; mark(); };
  requestAnimationFrame(() => set(start));
  return { set };
}

/* ---------- fatura ekle / düzenle ---------- */
function openBillSheet(id) {
  const ex = state.bills.find((b) => b.id === id);
  if (ex) return openBillDetail(ex);
  return openBillEditor(null);
}

function openBillEditor(ex) {
  const f = ex ? JSON.parse(JSON.stringify(ex)) : {
    cat: 'elektrik', name: 'Elektrik', currency: 'EUR', dueDay: Math.min(new Date().getDate() + 7, 28),
    remind: { rules: [{ d: -3, t: '09:00' }, { d: 0, t: '09:00' }], daily: false, off: false },
  };
  f.remind = { ...f.remind, rules: rulesOf(f).map((r) => ({ ...r })) };
  let nameTouched = !!ex;
  const html = `
    <h2>${ex ? 'Faturayı düzenle' : 'Fatura ekle'}</h2>
    <span class="lab">Tür</span>
    <div class="chips" id="cats">${CATS.map((c) => `<button class="chip" style="--c:${c.color}" data-cat="${c.id}" aria-pressed="${c.id === f.cat}">${icon(c.icon, 17)}${c.name}</button>`).join('')}</div>
    <label class="lab" for="bName">Ad</label>
    <input class="field" id="bName" value="${esc(f.name)}" maxlength="40" />
    <span class="lab">Para birimi</span>
    <div class="chips" id="curs">${Object.entries(CUR).map(([k, s]) => `<button class="chip" data-cur="${k}" aria-pressed="${k === f.currency}">${s} ${k === 'TRY' ? 'TL' : k}</button>`).join('')}</div>
    <span class="lab">Son ödeme günü</span>
    <div class="wheels"><div class="wheel-box"><div class="wheel-wrap"><div class="band"></div><div class="wheel" id="wDay"></div></div></div>
      <div class="wheel-box" style="flex:1.4;display:grid;place-items:center;text-align:left"><div id="dueTxt" style="font-weight:700;line-height:1.4"></div></div></div>
    <span class="lab"><span class="bell" id="bell">${icon('bell', 16, 2.4)}</span> Hatırlatma</span>
    <button class="toggle" id="tOn" role="switch" aria-checked="${!f.remind.off}">Hatırlat<span class="sw"></span></button>
    <div id="remBox">
      <div class="rules" id="rules"></div>
      <div class="rem-ed">
        <div class="rem-h" id="edTitle">Yeni hatırlatma</div>
        <div class="seg3" id="dir">
          <button data-dir="-1">Önce</button><button data-dir="0">Son gün</button><button data-dir="1">Sonra</button>
        </div>
        <div class="stepper" id="stepper">
          <button id="dMinus" aria-label="Azalt">−</button>
          <div class="step-v"><b id="dVal">3</b><span id="dLbl">gün önce</span></div>
          <button id="dPlus" aria-label="Arttır">+</button>
        </div>
        <div class="wheels">
          <div class="wheel-box"><span>Saat</span><div class="wheel-wrap"><div class="band"></div><div class="wheel" id="wH"></div></div></div>
          <div class="wheel-box"><span>Dakika</span><div class="wheel-wrap"><div class="band"></div><div class="wheel" id="wM"></div></div></div>
        </div>
        <button class="addrule" id="addRule">${icon('plus', 18, 2.6)}<span id="addTxt">Hatırlatmayı ekle</span></button>
        <div class="lab" style="margin-top:14px">Hızlı ekle (seçili saatle)</div>
        <div class="chips">${[[-7, '1 hafta önce'], [-3, '3 gün önce'], [-1, '1 gün önce'], [0, 'Son gün'], [1, '1 gün sonra'], [3, '3 gün sonra']].map(([d, l]) => `<button class="chip" data-quick="${d}">${l}</button>`).join('')}</div>
      </div>
      <button class="toggle" id="tDaily" role="switch" aria-checked="${!!f.remind.daily}"><span>Ödenene kadar her gün hatırlat<small>Son ödeme günü geçerse 10 güne kadar her gün, seçili saatte</small></span><span class="sw"></span></button>
    </div>
    <button class="save" id="bSave">${ex ? 'Kaydet' : 'Faturayı ekle'}</button>
    ${ex ? '<button class="link" id="bDel">Faturayı sil</button>' : ''}`;
  openSheet(html, (sh, ctl) => {
    const q = (s) => sh.querySelector(s);
    const paintDue = () => {
      const t = new Date();
      let k = periodKey(t.getFullYear(), t.getMonth());
      if (dueDate(f, k) < todayStr()) k = addMonths(k, 1);
      q('#dueTxt').innerHTML = `Her ayın <b>${f.dueDay}</b>’${f.dueDay >= 29 ? ' (kısa aylarda son gün)' : 'i'}<br><span style="color:var(--mute);font-weight:600">Sonraki: ${fmtDay(dueDate(f, k))}</span>`;
    };
    wheel(q('#wDay'), Array.from({ length: 31 }, (_, i) => i + 1), f.dueDay, (v) => { f.dueDay = v; paintDue(); });
    let H = 9;
    let M = 0;
    let dir = -1;
    let days = 3;
    let editing = -1;
    const hW = wheel(q('#wH'), Array.from({ length: 24 }, (_, i) => i), H, (v) => { H = v; }, (v) => String(v).padStart(2, '0'));
    const mW = wheel(q('#wM'), Array.from({ length: 12 }, (_, i) => i * 5), M, (v) => { M = v; }, (v) => String(v).padStart(2, '0'));
    const timeStr = () => `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
    const paintEd = () => {
      sh.querySelectorAll('[data-dir]').forEach((x) => x.setAttribute('aria-pressed', +x.dataset.dir === dir));
      q('#stepper').style.display = dir === 0 ? 'none' : '';
      q('#dVal').textContent = days;
      q('#dLbl').textContent = dir < 0 ? 'gün önce' : 'gün sonra';
      q('#edTitle').textContent = editing >= 0 ? 'Hatırlatmayı düzenle' : 'Yeni hatırlatma';
      q('#addTxt').textContent = editing >= 0 ? 'Değişikliği kaydet' : 'Hatırlatmayı ekle';
    };
    const sortRules = () => f.remind.rules.sort((a, b) => a.d - b.d || (a.t < b.t ? -1 : 1));
    const paintRules = (fresh) => {
      sortRules();
      q('#rules').innerHTML = f.remind.rules.length ? f.remind.rules.map((r, i) => `
        <div class="rule ${i === editing ? 'on' : ''} ${r.d > 0 ? 'after' : ''}" data-ri="${i}">
          <span class="rule-ic">${icon('bell', 16, 2.4)}</span><span class="rule-t">${ruleText(r)}</span>
          <button data-rdel="${i}" aria-label="Sil">×</button>
        </div>`).join('') : '<div class="hint">Henüz hatırlatma yok. Aşağıdan ekle.</div>';
      if (fresh != null && !reduced) {
        const row = sh.querySelector(`[data-ri="${fresh}"]`);
        if (row) animate(row, { opacity: [0, 1], x: [-20, 0], scale: [0.96, 1] }, { type: 'spring', stiffness: 380, damping: 24 });
      }
    };
    const pushRule = (rule) => {
      if (f.remind.rules.some((r, i) => i !== editing && r.d === rule.d && r.t === rule.t)) { toast('Bu hatırlatma zaten var'); return; }
      if (editing >= 0) f.remind.rules[editing] = rule; else f.remind.rules.push(rule);
      editing = -1;
      sortRules();
      paintRules(f.remind.rules.findIndex((r) => r.d === rule.d && r.t === rule.t));
      paintEd();
      ring();
    };
    paintEd();
    paintRules();
    const paintRem = () => {
      q('#remBox').style.display = f.remind.off ? 'none' : '';
      q('#tOn').setAttribute('aria-checked', !f.remind.off);
    };
    paintRem();
    const ring = () => { if (!reduced) animate(q('#bell'), { rotate: [0, 18, -14, 9, -5, 0] }, { duration: 0.6 }); };
    sh.addEventListener('click', (e) => {
      const c = e.target.closest('[data-cat]');
      if (c) {
        f.cat = c.dataset.cat;
        if (!nameTouched) { f.name = catOf(f.cat).name; q('#bName').value = f.name; }
        sh.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', x === c));
        if (!reduced) animate(c, { scale: [0.9, 1] }, { type: 'spring', stiffness: 500, damping: 15 });
        return;
      }
      const cu = e.target.closest('[data-cur]');
      if (cu) { f.currency = cu.dataset.cur; sh.querySelectorAll('[data-cur]').forEach((x) => x.setAttribute('aria-pressed', x === cu)); return; }
      const dd = e.target.closest('[data-dir]');
      if (dd) { dir = +dd.dataset.dir; if (dir !== 0 && days < 1) days = 1; paintEd(); return; }
      if (e.target.closest('#dMinus')) { days = Math.max(1, days - 1); paintEd(); if (!reduced) animate(q('#dVal'), { y: [6, 0] }, { duration: 0.15 }); return; }
      if (e.target.closest('#dPlus')) { days = Math.min(60, days + 1); paintEd(); if (!reduced) animate(q('#dVal'), { y: [-6, 0] }, { duration: 0.15 }); return; }
      if (e.target.closest('#addRule')) { pushRule({ d: dir * days, t: timeStr() }); return; }
      const qk = e.target.closest('[data-quick]');
      if (qk) { editing = -1; pushRule({ d: +qk.dataset.quick, t: timeStr() }); return; }
      const del = e.target.closest('[data-rdel]');
      if (del) {
        const i = +del.dataset.rdel;
        const row = del.closest('.rule');
        const done = () => { f.remind.rules.splice(i, 1); if (editing === i) editing = -1; else if (editing > i) editing--; paintRules(); paintEd(); };
        if (reduced) done(); else animate(row, { opacity: 0, x: 40 }, { duration: 0.2 }).then(done);
        return;
      }
      const row = e.target.closest('[data-ri]');
      if (row) {
        editing = +row.dataset.ri;
        const r = f.remind.rules[editing];
        dir = Math.sign(r.d); days = Math.abs(r.d) || 3;
        const [h, m] = r.t.split(':').map(Number);
        hW.set(h); mW.set(m - (m % 5));
        paintEd(); paintRules();
        q('.rem-ed').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }
      if (e.target.closest('#tOn')) { f.remind.off = !f.remind.off; paintRem(); ring(); return; }
      if (e.target.closest('#tDaily')) { f.remind.daily = !f.remind.daily; f.remind.dailyTime = timeStr(); q('#tDaily').setAttribute('aria-checked', f.remind.daily); ring(); return; }
      if (e.target.closest('#bDel')) {
        if (!confirm(`${f.name} faturası ve ödeme geçmişi silinsin mi?`)) return;
        state.bills = state.bills.filter((b) => b.id !== ex.id);
        state.payments = state.payments.filter((p) => p.billId !== ex.id);
        save();
        ctl.close().then(() => { renderAll(); toast('Fatura silindi'); });
        return;
      }
      if (e.target.closest('#bSave')) {
        f.name = q('#bName').value.trim() || catOf(f.cat).name;
        delete f.remind.offsets;
        delete f.remind.time;
        if (!f.remind.rules.length && !f.remind.daily) f.remind.off = true;
        if (ex) {
          Object.assign(ex, f);
        } else {
          const t = new Date();
          let k = periodKey(t.getFullYear(), t.getMonth());
          if (dueDate(f, k) < todayStr()) k = addMonths(k, 1);
          state.bills.push({ ...f, id: uid(), created: Date.now(), start: k });
        }
        save();
        if (!f.remind.off) askPermission();
        ctl.close().then(() => { renderAll(); toast(ex ? 'Kaydedildi' : 'Fatura eklendi'); if (!ex) popDrops(); });
      }
    });
    q('#bName').addEventListener('input', () => { nameTouched = true; });
  });
}

/* ---------- fatura ayrıntısı ---------- */
function openBillDetail(b) {
  const c = catOf(b.cat);
  const open = nextOpen(state, b, todayStr());
  const pays = state.payments.filter((p) => p.billId === b.id).sort((x, y) => (x.date < y.date ? 1 : -1));
  const total = pays.reduce((s, p) => s + p.amount, 0);
  const r = b.remind || {};
  const remTxt = r.off ? 'Hatırlatma kapalı' : [...rulesOf(b).map(ruleText), r.daily ? 'ödenene kadar her gün' : ''].filter(Boolean).join(', ');
  const html = `
    <div style="display:flex;align-items:center;gap:14px">
      <span class="ic" style="--c:${c.color};background:${c.color}33;color:${c.color === '#C9D3CE' ? '#6C7C75' : c.color}">${icon(c.icon, 26)}</span>
      <div><h2>${esc(b.name)}</h2><div class="hint">Her ayın ${b.dueDay}’${b.dueDay >= 29 ? '' : 'i'} · ${CUR[b.currency]}</div></div>
    </div>
    <div class="toggle" style="margin-top:18px;cursor:default"><span>${open ? (open.days < 0 ? `<b style="color:#C62828">${statusText(open.days)}</b>` : `Sonraki son ödeme: <b>${fmtDay(open.due)}</b>`) : ''}<small>${icon('bell', 13, 2.4)} ${remTxt}</small></span></div>
    <div class="row" style="margin-top:14px"><button class="save" id="dPay" style="margin-top:0">Ödedim</button><button class="save" id="dEdit" style="margin-top:0;background:var(--paper-2);color:var(--ink)">Düzenle</button></div>
    <span class="lab">Ödeme geçmişi${pays.length ? ` · toplam ${money(total, b.currency)}` : ''}</span>
    <div class="hist-list">${pays.length ? pays.map((p) => {
      const [py, pm] = keyParts(p.period);
      return `<div><span>${fmtDay(p.date)} ${parse(p.date).getFullYear()}<small>${MONTHS[pm]} ${py} faturası${p.note ? ` · ${esc(p.note)}` : ''}</small></span><span style="display:flex;align-items:center;gap:6px"><b>${money(p.amount, p.currency)}</b><button data-delp="${p.id}" aria-label="Ödemeyi sil">Sil</button></span></div>`;
    }).join('') : '<div style="color:var(--mute)">Henüz ödeme yok</div>'}</div>`;
  openSheet(html, (sh, ctl) => {
    sh.querySelector('#dPay').addEventListener('click', () => swapSheet(ctl, () => openPaySheet(b.id)));
    sh.querySelector('#dEdit').addEventListener('click', () => swapSheet(ctl, () => openBillEditor(b)));
    sh.addEventListener('click', (e) => {
      const d = e.target.closest('[data-delp]');
      if (!d || !confirm('Bu ödeme silinsin mi?')) return;
      state.payments = state.payments.filter((p) => p.id !== d.dataset.delp);
      save();
      ctl.close().then(() => { renderAll(); toast('Ödeme silindi'); });
    });
  });
}

/* ---------- ödeme ---------- */
function openPaySheet(billId) {
  const b = state.bills.find((x) => x.id === billId);
  if (!b) return;
  const c = catOf(b.cat);
  const open = nextOpen(state, b, todayStr());
  const base = open ? open.period : curKey();
  const options = [addMonths(base, -1), base, addMonths(base, 1)].filter((k) => k >= (b.start || '') || k === base);
  let period = base;
  const html = `
    <div style="display:flex;align-items:center;gap:14px">
      <span class="ic" style="background:${c.color}33;color:${c.color === '#C9D3CE' ? '#6C7C75' : c.color}">${icon(c.icon, 26)}</span>
      <div><h2>${esc(b.name)}</h2><div class="hint">${open ? `Son ödeme ${fmtDay(open.due)}` : ''}</div></div>
    </div>
    <label class="lab" for="amt">Ödenen tutar (${CUR[b.currency]})</label>
    <input class="field big" id="amt" inputmode="decimal" placeholder="0,00" autocomplete="off" />
    <span class="lab">Hangi ayın faturası</span>
    <div class="chips" id="pers">${options.map((k) => { const [y, m] = keyParts(k); return `<button class="chip" data-per="${k}" aria-pressed="${k === period}">${MONTHS[m]} ${y}${isPaid(state, b.id, k) ? ' ✓' : ''}</button>`; }).join('')}</div>
    <div class="row">
      <div><label class="lab" for="pdate">Ödeme tarihi</label><input class="field" id="pdate" type="date" value="${todayStr()}" max="${todayStr()}" /></div>
    </div>
    <label class="lab" for="pnote">Not (isteğe bağlı)</label>
    <input class="field" id="pnote" maxlength="60" placeholder="Örneğin banka havalesi" />
    <button class="save" id="pSave" disabled>Ödendi olarak kaydet</button>`;
  openSheet(html, (sh, ctl) => {
    const q = (s) => sh.querySelector(s);
    const amt = q('#amt');
    const val = () => parseFloat(amt.value.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    amt.addEventListener('input', () => { q('#pSave').disabled = !(val() > 0); });
    setTimeout(() => amt.focus(), 300);
    sh.addEventListener('click', (e) => {
      const p = e.target.closest('[data-per]');
      if (p) { period = p.dataset.per; sh.querySelectorAll('[data-per]').forEach((x) => x.setAttribute('aria-pressed', x === p)); return; }
      if (!e.target.closest('#pSave')) return;
      const amount = Math.round(val() * 100) / 100;
      if (!(amount > 0)) return;
      state.payments.push({ id: uid(), billId: b.id, period, date: q('#pdate').value || todayStr(), amount, currency: b.currency, note: q('#pnote').value.trim(), ts: Date.now() });
      save();
      ctl.close().then(() => celebrate(b, period));
    });
  });
}

function celebrate(b, period) {
  const [y, m] = keyParts(period);
  const needTurn = view.y !== y || view.m !== m;
  view = { y, m };
  renderAll();
  toast('Ödeme kaydedildi');
  buzz([15, 40, 25]);
  if (reduced) return;
  if (needTurn) popDrops();
  const day = parse(dueDate(b, period)).getDate();
  const cell = document.querySelector(`#grid .cell[data-day="${day}"]`);
  if (!cell) return;
  const c = catOf(b.cat).color;
  cell.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  const drop = cell.querySelector('.drop');
  if (drop) {
    animate(drop, { scale: [0.2, 1.5, 1], rotate: [0, -10, 0] }, { duration: 0.6, ease: 'easeOut' });
    const tick = drop.querySelector('.tick');
    if (tick) {
      const len = tick.getTotalLength();
      tick.style.strokeDasharray = len;
      animate(len, 0, { duration: 0.35, delay: 0.35, onUpdate: (v) => { tick.style.strokeDashoffset = v; } });
    }
  }
  const r = cell.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  for (let i = 0; i < 12; i++) {
    const s = document.createElement('div');
    s.className = 'splash';
    const size = 5 + Math.random() * 7;
    s.style.cssText += `left:${cx - size / 2}px;top:${cy - size / 2}px;width:${size}px;height:${size * 1.3}px;border-radius:50% 50% 50% 50% / 60% 60% 40% 40%;background:${i % 3 ? c : '#fff'}`;
    document.body.appendChild(s);
    const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 34 + Math.random() * 40;
    animate(s, { x: [0, Math.cos(a) * dist], y: [0, Math.sin(a) * dist - 10, Math.sin(a) * dist + 30], opacity: [1, 1, 0], scale: [0.5, 1, 0.6] }, { duration: 0.8, ease: 'easeOut' }).then(() => s.remove());
  }
}

/* ---------- gün sayfası ---------- */
function openDaySheet(d) {
  const map = monthMap(state, view.y, view.m, todayStr());
  const list = map[d] || [];
  const html = `<h2>${d} ${MONTHS[view.m]}</h2><div class="hint">${list.length} fatura</div>
    <div style="margin-top:14px">${list.map(({ bill, paid, overdue }) => {
      const c = catOf(bill.cat);
      const ps = paymentsFor(state, bill.id, periodKey(view.y, view.m));
      return `<div class="toggle" style="cursor:default"><span style="display:flex;gap:12px;align-items:center">${dropSVG(c.color, paid ? 'paid' : overdue ? 'late' : 'open', true)}<span>${esc(bill.name)}<small>${paid ? `Ödendi ${fmtDay(ps[0].date)} · ${money(ps.reduce((s, p) => s + p.amount, 0), bill.currency)}` : overdue ? 'Gecikti' : 'Ödenmedi'}</small></span></span>
        ${paid ? '' : `<button class="chip" data-pay="${bill.id}" style="background:${c.color};color:#14211C">Ödedim</button>`}</div>`;
    }).join('')}</div>`;
  openSheet(html, (sh, ctl) => {
    sh.addEventListener('click', (e) => {
      const p = e.target.closest('[data-pay]');
      if (p) swapSheet(ctl, () => openPaySheet(p.dataset.pay));
    });
  });
}

/* ---------- ayarlar ve yedek ---------- */
function openSettings() {
  const html = `<h2>Ayarlar</h2>
    <span class="lab">Bildirimler</span>
    <button class="toggle" id="sPerm"><span>Bildirim izni<small id="permTxt">Kontrol ediliyor…</small></span>${icon('bell', 20)}</button>
    <button class="toggle" id="sTest"><span>Deneme bildirimi<small>10 saniye sonra bir bildirim gelir</small></span>${icon('right', 20)}</button>
    <span class="lab">Yedek</span>
    <button class="toggle" id="sExport"><span>Yedeği paylaş<small>Faturalar ve ödemeler tek dosyada. Drive’a ya da kendine gönder.</small></span>${icon('right', 20)}</button>
    <button class="toggle" id="sImport"><span>Yedekten geri yükle<small>Mevcut verilerin yerine yedekteki gelir</small></span>${icon('right', 20)}</button>
    <input type="file" id="sFile" accept="application/json,.json" hidden />
    <div class="hint" style="margin-top:16px">Veriler sadece bu telefonda durur. Uygulamayı silmeden önce yedek al.</div>`;
  openSheet(html, (sh, ctl) => {
    const q = (s) => sh.querySelector(s);
    const paintPerm = async () => {
      if (!NATIVE) { q('#permTxt').textContent = 'Bu cihazda bildirim yok'; return; }
      try {
        const p = await LocalNotifications.checkPermissions();
        q('#permTxt').textContent = p.display === 'granted' ? 'Açık' : 'Kapalı, açmak için dokun';
      } catch { q('#permTxt').textContent = 'Bilinmiyor'; }
    };
    paintPerm();
    q('#sPerm').addEventListener('click', async () => { await askPermission(); paintPerm(); });
    q('#sTest').addEventListener('click', async () => {
      if (!NATIVE) { toast('Bildirim sadece telefonda çalışır'); return; }
      const ok = await askPermission();
      if (!ok) return;
      await LocalNotifications.schedule({ notifications: [{ id: 1, title: 'Vade deneme bildirimi', body: 'Hatırlatmalar böyle görünecek.', schedule: { at: new Date(Date.now() + 10000), allowWhileIdle: true }, channelId: 'vade', smallIcon: 'ic_stat_vade', iconColor: '#1E9E6E' }] });
      toast('10 saniye içinde gelecek');
    });
    q('#sExport').addEventListener('click', async () => {
      const data = JSON.stringify({ app: 'vade', v: 1, at: new Date().toISOString(), ...state }, null, 1);
      const name = `vade-yedek-${todayStr()}.json`;
      try {
        if (NATIVE) {
          const w = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache, encoding: Encoding.UTF8 });
          await Share.share({ title: 'Vade yedeği', files: [w.uri] });
        } else {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
          a.download = name; a.click();
        }
      } catch { /* iptal */ }
    });
    q('#sImport').addEventListener('click', () => q('#sFile').click());
    q('#sFile').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const d = JSON.parse(await file.text());
        if (!Array.isArray(d.bills) || !Array.isArray(d.payments)) throw new Error('bad');
        if (!confirm(`${d.bills.length} fatura ve ${d.payments.length} ödeme yüklensin mi? Şu anki veriler silinir.`)) return;
        state = { bills: d.bills, payments: d.payments };
        save();
        ctl.close().then(() => { renderAll(true); toast('Yedek yüklendi'); });
      } catch { toast('Bu dosya bir Vade yedeği değil'); }
    });
  });
}

/* ---------- bildirimler ---------- */
async function askPermission() {
  if (!NATIVE) return false;
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted') p = await LocalNotifications.requestPermissions();
    if (p.display !== 'granted') { toast('Bildirim izni kapalı, Ayarlar’dan açabilirsin'); return false; }
    syncNotifications();
    return true;
  } catch { return false; }
}

let syncing = Promise.resolve();
function syncNotifications() {
  if (!NATIVE) return;
  syncing = syncing.then(async () => {
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') return;
      await LocalNotifications.createChannel({ id: 'vade', name: 'Fatura hatırlatmaları', importance: 5, visibility: 1, vibration: true }).catch(() => {});
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
      const plan = plannedNotifications(state, new Date());
      if (!plan.length) return;
      await LocalNotifications.schedule({
        notifications: plan.map((n) => ({
          id: n.id, title: n.title, body: n.body, schedule: { at: n.at, allowWhileIdle: true },
          channelId: 'vade', smallIcon: 'ic_stat_vade', iconColor: '#1E9E6E', extra: { billId: n.billId },
        })),
      });
    } catch (e) { console.error(e); }
  });
}

if (NATIVE) {
  LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    const id = a.notification && a.notification.extra && a.notification.extra.billId;
    if (id) setTimeout(() => openPaySheet(id), 400);
  }).catch(() => {});
  StatusBar.setBackgroundColor({ color: '#12352C' }).catch(() => {});
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
}

/* ---------- olaylar ---------- */
$('addBill').addEventListener('click', () => openBillEditor(null));
$('settings').addEventListener('click', openSettings);
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAll(); });

/* ---------- açılış ---------- */
function intro() {
  renderAll(true);
  if (reduced) return;
  const cal = $('cal');
  animate('.brand, #settings', { opacity: [0, 1], y: [-10, 0] }, { duration: 0.4 });
  animate('.hook', { scale: [0, 1] }, { type: 'spring', stiffness: 500, damping: 18, delay: 0.1 });
  animate(cal, { rotateX: [-75, 12, -5, 2, 0], y: [-60, 0], opacity: [0, 1, 1, 1, 1] }, { duration: 1.1, delay: 0.15, ease: 'easeOut' });
  animate(cal.querySelectorAll('.ring'), { scaleY: [0, 1] }, { delay: 0.2, duration: 0.3 });
  popDrops(0.75);
  animate('.add', { y: [80, 0] }, { type: 'spring', stiffness: 220, damping: 22, delay: 0.6 });
}
intro();
syncNotifications();
