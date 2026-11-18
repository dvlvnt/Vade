// Vade: fatura, dönem ve hatırlatma hesapları (arayüzden bağımsız)

export const CATS = [
  { id: 'elektrik', name: 'Elektrik', color: '#FFC531', icon: 'bolt' },
  { id: 'su', name: 'Su', color: '#3CC4E8', icon: 'drop' },
  { id: 'dogalgaz', name: 'Doğalgaz', color: '#FF7A3D', icon: 'flame' },
  { id: 'kira', name: 'Kira', color: '#9B7BFF', icon: 'home' },
  { id: 'kart', name: 'Kredi kartı', color: '#FF5C8A', icon: 'card' },
  { id: 'kredi', name: 'Kredi', color: '#A5E05A', icon: 'bank' },
  { id: 'telefon', name: 'Telefon', color: '#5C8DFF', icon: 'phone' },
  { id: 'internet', name: 'İnternet', color: '#2FD8B4', icon: 'wifi' },
  { id: 'sigorta', name: 'Sigorta', color: '#E8A0FF', icon: 'shield' },
  { id: 'diger', name: 'Diğer', color: '#C9D3CE', icon: 'dots' },
];
export const catOf = (id) => CATS.find((c) => c.id === id) || CATS[CATS.length - 1];

export const CUR = { EUR: '€', PLN: 'zł', TRY: '₺' };
const nf = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n, cur) => `${nf.format(n)} ${CUR[cur] || cur}`;

export const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const DAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

/* ---- tarih yardımcıları (yerel, saat 12:00 ile) ---- */
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const todayStr = () => ymd(new Date());
export const periodKey = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`; // m: 0-11
export const keyParts = (k) => { const [y, m] = k.split('-').map(Number); return [y, m - 1]; };
export const addMonths = (k, n) => { const [y, m] = keyParts(k); const d = new Date(y, m + n, 1); return periodKey(d.getFullYear(), d.getMonth()); };
export const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();
export const dueDate = (bill, k) => { const [y, m] = keyParts(k); return ymd(new Date(y, m, Math.min(bill.dueDay, lastDay(y, m)), 12)); };
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
export const fmtDay = (s) => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
export const fmtDayShort = (s) => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };

/* ---- durum ---- */
export const paymentsFor = (state, billId, k) => state.payments.filter((p) => p.billId === billId && p.period === k);
export const isPaid = (state, billId, k) => paymentsFor(state, billId, k).length > 0;

// Faturanın takip edildiği ilk dönem (eklendiği ay)
const startKey = (bill) => bill.start || periodKey(new Date(bill.created || Date.now()).getFullYear(), new Date(bill.created || Date.now()).getMonth());

/** Ödenmemiş ilk dönem (gecikmiş olabilir) */
export function nextOpen(state, bill, today = todayStr()) {
  const t = parse(today);
  let k = startKey(bill);
  const cur = periodKey(t.getFullYear(), t.getMonth());
  // en fazla 24 ay geriye bak
  if (k < addMonths(cur, -24)) k = addMonths(cur, -24);
  for (let i = 0; i < 40; i++) {
    if (!isPaid(state, bill.id, k)) {
      const due = dueDate(bill, k);
      return { period: k, due, days: daysBetween(today, due) };
    }
    k = addMonths(k, 1);
  }
  return null;
}

export function statusText(days) {
  if (days === 0) return 'Bugün';
  if (days === 1) return 'Yarın';
  if (days > 1) return `${days} gün kaldı`;
  if (days === -1) return '1 gün gecikti';
  return `${-days} gün gecikti`;
}

/** Takvim: bir aydaki her gün için fatura listesi */
export function monthMap(state, y, m, today = todayStr()) {
  const k = periodKey(y, m);
  const map = {};
  for (const b of state.bills) {
    if (startKey(b) > k) continue;
    const due = dueDate(b, k);
    const paid = isPaid(state, b.id, k);
    const d = parse(due).getDate();
    (map[d] ||= []).push({ bill: b, paid, overdue: !paid && due < today, due });
  }
  return map;
}

/* ---- hatırlatmalar ---- */
const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) % 2000000000; };

/** Eski biçimi (offsets + tek saat) yeni kurallara çevirir.
 * Kural: { d: gün (eksi = önce, 0 = aynı gün, artı = sonra), t: 'SS:DD' } */
export function rulesOf(b) {
  const r = b.remind || {};
  if (Array.isArray(r.rules)) return r.rules;
  const time = r.time || '09:00';
  return (r.offsets && r.offsets.length ? r.offsets : [0]).map((o) => ({ d: -o, t: time }));
}
export function ruleText(rule) {
  const n = Math.abs(rule.d);
  const day = rule.d === 0 ? 'Son ödeme günü' : rule.d < 0 ? `${n} gün önce` : `${n} gün sonra`;
  return `${day} · ${rule.t}`;
}

/** Planlanacak bildirimler: [{id, at: Date, title, body}] */
export function plannedNotifications(state, now = new Date()) {
  const out = [];
  const today = ymd(now);
  for (const b of state.bills) {
    const r = b.remind || {};
    if (r.off) continue;
    const rules = rulesOf(b);
    const dailyTime = r.dailyTime || (rules[0] && rules[0].t) || '09:00';
    const first = nextOpen(state, b, today);
    if (!first) continue;
    // ödenmemiş ilk dönem + sonraki 2 ay
    for (let i = 0; i < 3; i++) {
      const k = addMonths(first.period, i);
      if (isPaid(state, b.id, k)) continue;
      const due = dueDate(b, k);
      const at = (dateStr, shift, time) => {
        const [hh, mm] = time.split(':').map(Number);
        const d = parse(dateStr); d.setDate(d.getDate() + shift); d.setHours(hh, mm, 0, 0); return d;
      };
      const seen = new Set();
      for (const rule of rules) {
        const when = at(due, rule.d, rule.t);
        if (when <= now) continue;
        seen.add(rule.d);
        const n = Math.abs(rule.d);
        out.push({
          id: hash(`${b.id}|${k}|${rule.d}|${rule.t}`),
          at: when,
          title: rule.d === 0 ? `${b.name}: son ödeme günü bugün` : rule.d < 0 ? `${b.name}: ${n} gün sonra son ödeme` : `${b.name} ödenmedi`,
          body: rule.d > 0 ? `Son ödeme ${fmtDay(due)} idi, ${n} gün geçti. Ödediysen Vade’de işaretle.` : `Son ödeme ${fmtDay(due)}. Ödeyince Vade’de işaretle.`,
          billId: b.id,
        });
      }
      if (r.daily) {
        for (let d = 1; d <= 10; d++) {
          if (seen.has(d)) continue;
          const when = at(due, d, dailyTime);
          if (when > now) {
            out.push({
              id: hash(`${b.id}|${k}|late${d}`),
              at: when,
              title: `${b.name} ödenmedi`,
              body: `Son ödeme ${fmtDay(due)} idi, ${d} gün gecikti.`,
              billId: b.id,
            });
          }
        }
      }
    }
  }
  out.sort((a, c) => a.at - c.at);
  return out.slice(0, 60);
}
