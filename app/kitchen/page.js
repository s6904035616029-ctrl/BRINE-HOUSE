'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const ACTIVE = ['received', 'cooking'];
const POLL_MS = 30000; // ดึงข้อมูลซ้ำเป็นตาข่ายนิรภัย เผื่อ Realtime หลุดโดยไม่รู้ตัว

const byCreatedAsc = (a, b) => new Date(a.created_at) - new Date(b.created_at);

function parseItems(raw) {
  let v = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(v) ? v : [];
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState({}); // { [orderId]: true }
  const [now, setNow] = useState(() => Date.now());
  const fetchRef = useRef(null);

  const fetchOrders = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('orders')
      .select('id, session_id, table_number, items, status, created_at')
      .in('status', ACTIVE)
      .order('created_at', { ascending: true });
    if (err) {
      setError('โหลดออเดอร์ไม่สำเร็จ: ' + err.message);
      return;
    }
    setError('');
    setOrders(data || []);
    setLoaded(true);
  }, []);
  fetchRef.current = fetchOrders;

  // เพิ่ม/อัปเดตการ์ด ถ้า status ไม่ใช่ received/cooking ให้เอาออก
  const applyRow = useCallback((row) => {
    if (!row || row.id == null) return;
    if (ACTIVE.includes(row.status)) {
      setOrders((prev) => [...prev.filter((o) => o.id !== row.id), row].sort(byCreatedAsc));
    } else {
      setOrders((prev) => prev.filter((o) => o.id !== row.id));
    }
  }, []);

  // โหลดครั้งแรก + Realtime + poll สำรอง
  useEffect(() => {
    fetchRef.current();

    const channel = supabase
      .channel('kitchen-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => applyRow(payload.new))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => applyRow(payload.new))
      .subscribe((s) => {
        setConnected(s === 'SUBSCRIBED');
        // ต่อกลับมาได้เมื่อไร ให้ดึงข้อมูลล่าสุดใหม่ กันพลาดออเดอร์ช่วงที่หลุด
        if (s === 'SUBSCRIBED') fetchRef.current();
      });

    const poll = setInterval(() => fetchRef.current(), POLL_MS);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [applyRow]);

  // อัปเดตเวลา "รอมา N นาที" ทุก 20 วินาที
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);

  const changeStatus = async (order, next) => {
    if (busy[order.id]) return;
    setBusy((b) => ({ ...b, [order.id]: true }));
    setError('');

    const { error: err } = await supabase
      .from('orders')
      .update({ status: next })
      .eq('id', order.id)
      .in('status', ACTIVE);

    if (err) {
      setError('อัปเดตออเดอร์ไม่สำเร็จ: ' + err.message);
      await fetchOrders();
    } else {
      applyRow({ ...order, status: next }); // อัปเดตหน้าจอทันที (Realtime จะส่งซ้ำมาก็ไม่เป็นไร)
    }
    setBusy((b) => {
      const { [order.id]: _omit, ...rest } = b;
      return rest;
    });
  };

  const waiting = orders.filter((o) => o.status === 'received').length;
  const cooking = orders.filter((o) => o.status === 'cooking').length;

  return (
    <div style={k.page}>
      <header style={k.header}>
        <h1 style={k.title}>ครัว BRINE-HOUSE</h1>
        <div style={k.stats}>
          <span style={k.statWait}>รอทำ {waiting}</span>
          <span style={k.statCook}>กำลังทำ {cooking}</span>
          <span style={{ ...k.conn, color: connected ? '#6ee7a0' : '#ff8a8a' }}>
            ● {connected ? 'เชื่อมต่อแล้ว' : 'ขาดการเชื่อมต่อ'}
          </span>
        </div>
      </header>

      {!connected && loaded && (
        <div style={k.banner}>สัญญาณ Realtime หลุด กำลังต่อใหม่ ระบบยังดึงออเดอร์ซ้ำทุก 30 วินาที</div>
      )}
      {error && <div style={k.banner}>{error}</div>}

      {!loaded && !error && <p style={k.empty}>กำลังโหลดออเดอร์...</p>}
      {loaded && orders.length === 0 && <p style={k.empty}>ยังไม่มีออเดอร์ค้างอยู่</p>}

      <main style={k.grid}>
        {orders.map((order) => {
          const isCooking = order.status === 'cooking';
          const mins = Math.max(0, Math.floor((now - new Date(order.created_at).getTime()) / 60000));
          const items = parseItems(order.items);
          return (
            <article key={order.id} style={{ ...k.card, ...(isCooking ? k.cardCooking : k.cardNew) }}>
              <div style={k.cardTop}>
                <div>
                  <div style={k.tableLabel}>โต๊ะ</div>
                  <div style={k.tableNo}>{order.table_number}</div>
                </div>
                <div style={k.meta}>
                  <div style={k.time}>{fmtTime(order.created_at)}</div>
                  <div style={{ ...k.wait, color: mins >= 15 ? '#b42318' : 'inherit' }}>รอมา {mins} นาที</div>
                  <div style={k.badge}>{isCooking ? 'กำลังทำ' : 'ออเดอร์ใหม่'}</div>
                </div>
              </div>

              <ul style={k.items}>
                {items.map((it, i) => (
                  <li key={i} style={k.item}>
                    <span style={k.itemName}>{it.name}</span>
                    <span style={k.itemQty}>× {it.quantity}</span>
                  </li>
                ))}
              </ul>

              <div style={k.actions}>
                {!isCooking && (
                  <button type="button" disabled={!!busy[order.id]} onClick={() => changeStatus(order, 'cooking')} style={{ ...k.btn, ...k.btnStart }}>
                    เริ่มทำ
                  </button>
                )}
                <button type="button" disabled={!!busy[order.id]} onClick={() => changeStatus(order, 'served')} style={{ ...k.btn, ...k.btnServe }}>
                  จัดเสิร์ฟแล้ว
                </button>
              </div>
            </article>
          );
        })}
      </main>
    </div>
  );
}

const k = {
  page: { minHeight: '100vh', background: '#14201a', color: '#fff', fontFamily: "'Noto Sans Thai', 'Sarabun', system-ui, sans-serif", padding: '1rem 1.25rem 2rem' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  title: { margin: 0, fontSize: 36 },
  stats: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 24, fontWeight: 700 },
  statWait: { background: '#e2e8f0', color: '#14201a', padding: '4px 14px', borderRadius: 10 },
  statCook: { background: '#f5a524', color: '#3b2300', padding: '4px 14px', borderRadius: 10 },
  conn: { fontSize: 20, fontWeight: 600 },
  banner: { background: '#b42318', color: '#fff', fontSize: 22, fontWeight: 600, padding: '0.7rem 1rem', borderRadius: 10, marginBottom: 14 },
  empty: { fontSize: 32, textAlign: 'center', opacity: 0.7, marginTop: '20vh' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, alignItems: 'start' },
  card: { borderRadius: 16, padding: '1rem 1.1rem 1.1rem', color: '#14201a', border: '6px solid', display: 'flex', flexDirection: 'column', gap: 12 },
  cardNew: { background: '#f1f5f9', borderColor: '#94a3b8' },
  cardCooking: { background: '#ffe9b8', borderColor: '#f59e0b' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  tableLabel: { fontSize: 22, fontWeight: 600 },
  tableNo: { fontSize: 84, fontWeight: 800, lineHeight: 1 },
  meta: { textAlign: 'right' },
  time: { fontSize: 34, fontWeight: 800 },
  wait: { fontSize: 22, fontWeight: 600 },
  badge: { display: 'inline-block', marginTop: 6, fontSize: 20, fontWeight: 700, background: '#14201a', color: '#fff', padding: '2px 12px', borderRadius: 8 },
  items: { listStyle: 'none', margin: 0, padding: 0, borderTop: '2px dashed rgba(0,0,0,0.3)' },
  item: { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 30, fontWeight: 700, padding: '8px 0', borderBottom: '1px dashed rgba(0,0,0,0.25)' },
  itemName: { flex: 1 },
  itemQty: { whiteSpace: 'nowrap' },
  actions: { display: 'flex', gap: 10, marginTop: 4 },
  btn: { flex: 1, minHeight: 64, fontSize: 24, fontWeight: 800, border: 'none', borderRadius: 12, cursor: 'pointer' },
  btnStart: { background: '#d9822b', color: '#fff' },
  btnServe: { background: '#1f6b45', color: '#fff' },
};
