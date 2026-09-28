'use client';

import { use, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

const ADULT_PRICE = 289;
const CHILD_PRICE = 145;
const MAX_QTY_PER_ITEM = 5;
const MAX_ITEMS_PER_ORDER = 10;

export default function OrderPage({ params }) {
  // Next.js เวอร์ชันล่าสุด: params เป็น Promise ต้อง unwrap ด้วย use()
  const { tableNumber } = use(params);
  const tableNo = Number(tableNumber);

  // 'loading' | 'error' | 'notfound' | 'ready' | 'closed'
  const [status, setStatus] = useState('loading');
  const [session, setSession] = useState(null);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [activeCat, setActiveCat] = useState(null);

  const [cart, setCart] = useState([]); // [{ id, name, quantity }]
  const [cartOpen, setCartOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState(null); // { text, kind }

  const [showBill, setShowBill] = useState(false);
  const [closing, setClosing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const showToast = (text, kind = 'info') => {
    setToast({ text, kind });
    setTimeout(() => setToast((t) => (t && t.text === text ? null : t)), 2800);
  };

  const load = async () => {
    setStatus('loading');
    setLoadError('');

    if (!Number.isInteger(tableNo) || tableNo <= 0) {
      setStatus('notfound');
      return;
    }

    try {
      const { data: rows, error: sErr } = await supabase
        .from('sessions')
        .select('id, table_number, adult_count, child_count, status, created_at')
        .eq('table_number', tableNo)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1);
      if (sErr) throw sErr;

      if (!rows || rows.length === 0) {
        setStatus('notfound');
        return;
      }
      setSession(rows[0]);

      const [catRes, itemRes] = await Promise.all([
        supabase.from('menu_categories').select('id, name, sort_order').order('sort_order', { ascending: true }),
        supabase.from('menu_items').select('id, category_id, name').order('id', { ascending: true }),
      ]);
      if (catRes.error) throw catRes.error;
      if (itemRes.error) throw itemRes.error;

      setCategories(catRes.data || []);
      setItems(itemRes.data || []);
      setActiveCat(catRes.data && catRes.data.length > 0 ? catRes.data[0].id : null);
      setStatus('ready');
    } catch (err) {
      setLoadError(err?.message || 'ไม่ทราบสาเหตุ');
      setStatus('error');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableNumber]);

  // ---------- ตะกร้า ----------
  const qtyOf = (id) => cart.find((l) => l.id === id)?.quantity || 0;

  const addOne = (item) => {
    const line = cart.find((l) => l.id === item.id);
    if (line) {
      if (line.quantity >= MAX_QTY_PER_ITEM) {
        return showToast(`สั่งได้สูงสุด ${MAX_QTY_PER_ITEM} ชิ้นต่อรายการ`, 'warn');
      }
      setCart(cart.map((l) => (l.id === item.id ? { ...l, quantity: l.quantity + 1 } : l)));
    } else {
      if (cart.length >= MAX_ITEMS_PER_ORDER) {
        return showToast(`ส่งได้สูงสุด ${MAX_ITEMS_PER_ORDER} รายการต่อครั้ง กรุณาส่งออเดอร์ก่อน`, 'warn');
      }
      setCart([...cart, { id: item.id, name: item.name, quantity: 1 }]);
    }
  };

  const removeOne = (id) => {
    setCart(
      cart
        .map((l) => (l.id === id ? { ...l, quantity: l.quantity - 1 } : l))
        .filter((l) => l.quantity > 0)
    );
  };

  const sendOrder = async () => {
    if (cart.length === 0 || sending) return;
    setSending(true);
    try {
      // เช็คว่าโต๊ะยังเปิดอยู่ก่อนส่ง
      const { data: current, error: cErr } = await supabase
        .from('sessions')
        .select('status')
        .eq('id', session.id)
        .limit(1);
      if (cErr) throw cErr;
      if (!current || current.length === 0 || current[0].status !== 'open') {
        setStatus('notfound');
        return;
      }

      const { error } = await supabase.from('orders').insert({
        session_id: session.id,
        table_number: tableNo,
        items: cart.map((l) => ({ name: l.name, quantity: l.quantity })),
        status: 'received',
      });
      if (error) throw error;

      setCart([]);
      setCartOpen(false);
      showToast('ส่งออเดอร์แล้ว ✓', 'ok');
    } catch (err) {
      showToast('ส่งออเดอร์ไม่สำเร็จ กรุณาลองอีกครั้ง', 'error');
    } finally {
      setSending(false);
    }
  };

  // ---------- เรียกเก็บเงิน ----------
  const total = session ? session.adult_count * ADULT_PRICE + session.child_count * CHILD_PRICE : 0;

  const confirmBill = async () => {
    setClosing(true);
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ status: 'closed' })
        .eq('id', session.id)
        .eq('status', 'open');
      if (error) throw error;
      setShowBill(false);
      setCart([]);
      setStatus('closed');
    } catch (err) {
      setShowBill(false);
      showToast('เรียกเก็บเงินไม่สำเร็จ กรุณาลองอีกครั้ง', 'error');
    } finally {
      setClosing(false);
    }
  };

  // ---------- หน้าเต็มจอตามสถานะ ----------
  if (status === 'loading') {
    return <FullScreen tone="plain" text="กำลังโหลดเมนู..." />;
  }
  if (status === 'error') {
    return (
      <FullScreen tone="warn" text="โหลดข้อมูลไม่สำเร็จ" sub={loadError}>
        <button type="button" onClick={load} style={{ ...c.primaryBtn, marginTop: 24, maxWidth: 260 }}>
          ลองใหม่
        </button>
      </FullScreen>
    );
  }
  if (status === 'notfound') {
    return <FullScreen tone="warn" text="โต๊ะนี้ยังไม่เปิดใช้งาน กรุณาแจ้งพนักงาน" />;
  }
  if (status === 'closed') {
    return <FullScreen tone="done" text="ขอบคุณที่ใช้บริการ" sub={`BRINE-HOUSE · โต๊ะ ${tableNo}`} />;
  }

  // ---------- หน้าสั่งอาหาร ----------
  const visibleItems = items.filter((i) => i.category_id === activeCat);
  const cartCount = cart.length;

  return (
    <div style={c.page}>
      <header style={c.header}>
        <div>
          <div style={c.brand}>BRINE-HOUSE</div>
          <div style={c.tableLabel}>โต๊ะ {tableNo}</div>
        </div>
        <button type="button" onClick={() => setShowBill(true)} style={c.billBtn}>
          เรียกเก็บเงิน
        </button>
      </header>

      <nav style={c.tabs} aria-label="หมวดหมู่เมนู">
        {categories.map((cat) => {
          const on = cat.id === activeCat;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCat(cat.id)}
              aria-pressed={on}
              style={{ ...c.tab, ...(on ? c.tabOn : null) }}
            >
              {cat.name}
            </button>
          );
        })}
      </nav>

      <main style={c.list}>
        {visibleItems.length === 0 && <p style={c.empty}>ยังไม่มีเมนูในหมวดนี้</p>}
        {visibleItems.map((item) => {
          const q = qtyOf(item.id);
          return (
            <div key={item.id} style={c.row}>
              <span style={c.itemName}>{item.name}</span>
              {q > 0 ? (
                <div style={c.stepper}>
                  <button type="button" aria-label={`ลด ${item.name}`} onClick={() => removeOne(item.id)} style={c.stepBtn}>
                    −
                  </button>
                  <span style={c.qty}>{q}</span>
                  <button type="button" aria-label={`เพิ่ม ${item.name}`} onClick={() => addOne(item)} style={c.stepBtnOn}>
                    +
                  </button>
                </div>
              ) : (
                <button type="button" aria-label={`เพิ่ม ${item.name}`} onClick={() => addOne(item)} style={c.addBtn}>
                  +
                </button>
              )}
            </div>
          );
        })}
      </main>

      {toast && (
        <div
          role="status"
          style={{
            ...c.toast,
            bottom: cartCount > 0 ? 96 : 24,
            background: toast.kind === 'ok' ? '#1f6b45' : toast.kind === 'error' ? '#b42318' : toast.kind === 'warn' ? '#b45309' : '#333',
          }}
        >
          {toast.text}
        </div>
      )}

      {cartCount > 0 && (
        <div style={c.cartWrap}>
          {cartOpen && (
            <div style={c.cartPanel}>
              {cart.map((l) => (
                <div key={l.id} style={c.cartRow}>
                  <span style={c.cartName}>{l.name}</span>
                  <div style={c.stepper}>
                    <button type="button" aria-label={`ลด ${l.name}`} onClick={() => removeOne(l.id)} style={c.stepBtn}>
                      −
                    </button>
                    <span style={c.qty}>{l.quantity}</span>
                    <button type="button" aria-label={`เพิ่ม ${l.name}`} onClick={() => addOne({ id: l.id, name: l.name })} style={c.stepBtnOn}>
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={c.cartBar}>
            <button type="button" onClick={() => setCartOpen(!cartOpen)} style={c.cartToggle} aria-expanded={cartOpen}>
              <span style={c.cartBadge}>{cartCount}</span>
              <span>
                ตะกร้า {cartCount}/{MAX_ITEMS_PER_ORDER} รายการ {cartOpen ? '▾' : '▴'}
              </span>
            </button>
            <button type="button" onClick={sendOrder} disabled={sending} style={{ ...c.sendBtn, opacity: sending ? 0.6 : 1 }}>
              {sending ? 'กำลังส่ง...' : 'ส่งออเดอร์'}
            </button>
          </div>
        </div>
      )}

      {showBill && (
        <div style={c.overlay} role="dialog" aria-modal="true">
          <div style={c.dialog}>
            <h2 style={c.dialogTitle}>เรียกเก็บเงิน</h2>
            <div style={c.billLine}>
              <span>
                ผู้ใหญ่ {session.adult_count} × {ADULT_PRICE}
              </span>
              <span>{(session.adult_count * ADULT_PRICE).toLocaleString('th-TH')}</span>
            </div>
            <div style={c.billLine}>
              <span>
                เด็ก {session.child_count} × {CHILD_PRICE}
              </span>
              <span>{(session.child_count * CHILD_PRICE).toLocaleString('th-TH')}</span>
            </div>
            <div style={c.billTotal}>
              <span>ยอดที่ต้องจ่าย</span>
              <span>{total.toLocaleString('th-TH')} บาท</span>
            </div>
            {cartCount > 0 && <p style={c.billWarn}>ตะกร้ายังมี {cartCount} รายการที่ยังไม่ได้ส่ง</p>}
            <p style={c.billNote}>เมื่อยืนยันแล้ว จะสั่งอาหารเพิ่มไม่ได้</p>
            <div style={c.dialogActions}>
              <button type="button" onClick={() => setShowBill(false)} disabled={closing} style={c.cancelBtn}>
                ยกเลิก
              </button>
              <button type="button" onClick={confirmBill} disabled={closing} style={{ ...c.primaryBtn, opacity: closing ? 0.6 : 1 }}>
                {closing ? 'กำลังดำเนินการ...' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FullScreen({ text, sub, tone, children }) {
  const bg = tone === 'warn' ? '#fff4e5' : tone === 'done' ? '#1f4d3a' : '#f3f7f1';
  const fg = tone === 'warn' ? '#8a4b08' : tone === 'done' ? '#ffffff' : '#1f4d3a';
  return (
    <div
      style={{
        minHeight: '100vh',
        background: bg,
        color: fg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '2rem',
        fontFamily: c.fontFamily,
      }}
    >
      <p style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.4, margin: 0 }}>{text}</p>
      {sub && <p style={{ fontSize: 20, margin: '12px 0 0', opacity: 0.85 }}>{sub}</p>}
      {children}
    </div>
  );
}

const GREEN = '#1f4d3a';
const AMBER = '#d9822b';

const c = {
  fontFamily: "'Noto Sans Thai', 'Sarabun', system-ui, -apple-system, sans-serif",
  page: { minHeight: '100vh', background: '#f3f7f1', color: '#1c2a22', fontFamily: "'Noto Sans Thai', 'Sarabun', system-ui, -apple-system, sans-serif", paddingBottom: 130 },
  header: { position: 'sticky', top: 0, zIndex: 20, background: GREEN, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem' },
  brand: { fontSize: 20, fontWeight: 800, letterSpacing: 1 },
  tableLabel: { fontSize: 16, opacity: 0.85 },
  billBtn: { minHeight: 48, padding: '0 1rem', fontSize: 17, fontWeight: 700, background: 'transparent', color: '#fff', border: '2px solid #fff', borderRadius: 10, cursor: 'pointer' },
  tabs: { position: 'sticky', top: 66, zIndex: 15, display: 'flex', gap: 8, overflowX: 'auto', padding: '0.6rem 1rem', background: '#f3f7f1', borderBottom: '1px solid #cfdccf' },
  tab: { flex: '0 0 auto', minHeight: 48, padding: '0 1.1rem', fontSize: 18, fontWeight: 600, background: '#fff', color: GREEN, border: '2px solid #b7cdb9', borderRadius: 24, cursor: 'pointer', whiteSpace: 'nowrap' },
  tabOn: { background: GREEN, color: '#fff', borderColor: GREEN },
  list: { padding: '0.5rem 1rem' },
  empty: { textAlign: 'center', fontSize: 18, padding: '2rem 0', color: '#5b6b60' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 68, padding: '0.5rem 0', borderBottom: '1px dashed #b7cdb9' },
  itemName: { fontSize: 20, fontWeight: 600, flex: 1 },
  addBtn: { width: 52, height: 52, fontSize: 30, lineHeight: 1, fontWeight: 700, background: '#fff', color: GREEN, border: `2px solid ${GREEN}`, borderRadius: 26, cursor: 'pointer' },
  stepper: { display: 'flex', alignItems: 'center', gap: 6 },
  stepBtn: { width: 48, height: 48, fontSize: 26, lineHeight: 1, fontWeight: 700, background: '#fff', color: GREEN, border: `2px solid ${GREEN}`, borderRadius: 24, cursor: 'pointer' },
  stepBtnOn: { width: 48, height: 48, fontSize: 26, lineHeight: 1, fontWeight: 700, background: GREEN, color: '#fff', border: `2px solid ${GREEN}`, borderRadius: 24, cursor: 'pointer' },
  qty: { minWidth: 28, textAlign: 'center', fontSize: 22, fontWeight: 700 },
  toast: { position: 'fixed', left: 16, right: 16, zIndex: 40, maxWidth: 480, margin: '0 auto', padding: '0.85rem 1rem', color: '#fff', fontSize: 18, fontWeight: 600, textAlign: 'center', borderRadius: 12, boxShadow: '0 4px 14px rgba(0,0,0,0.25)' },
  cartWrap: { position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30, maxWidth: 560, margin: '0 auto' },
  cartPanel: { background: '#fff', borderTop: `3px solid ${GREEN}`, maxHeight: '45vh', overflowY: 'auto', padding: '0.25rem 1rem' },
  cartRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 60, borderBottom: '1px dashed #cfdccf' },
  cartName: { fontSize: 18, fontWeight: 600, flex: 1 },
  cartBar: { display: 'flex', alignItems: 'center', gap: 10, padding: '0.7rem 1rem calc(0.7rem + env(safe-area-inset-bottom, 0px))', background: GREEN, color: '#fff' },
  cartToggle: { flex: 1, minHeight: 52, display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', color: '#fff', border: 'none', fontSize: 17, fontWeight: 600, cursor: 'pointer', textAlign: 'left', padding: 0 },
  cartBadge: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 32, height: 32, borderRadius: 16, background: AMBER, color: '#fff', fontWeight: 800, fontSize: 17 },
  sendBtn: { minHeight: 52, padding: '0 1.4rem', fontSize: 19, fontWeight: 800, background: AMBER, color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
  dialog: { width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, padding: '1.5rem' },
  dialogTitle: { margin: '0 0 14px', fontSize: 26, color: GREEN },
  billLine: { display: 'flex', justifyContent: 'space-between', fontSize: 20, padding: '6px 0' },
  billTotal: { display: 'flex', justifyContent: 'space-between', fontSize: 26, fontWeight: 800, color: GREEN, padding: '12px 0', margin: '8px 0', borderTop: '2px solid #cfdccf', borderBottom: '2px solid #cfdccf' },
  billWarn: { margin: '6px 0', fontSize: 17, fontWeight: 600, color: '#b45309' },
  billNote: { margin: '6px 0 0', fontSize: 16, color: '#5b6b60' },
  dialogActions: { display: 'flex', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, minHeight: 56, fontSize: 20, fontWeight: 600, background: '#eef2ee', color: '#2d3a32', border: '2px solid #b7cdb9', borderRadius: 12, cursor: 'pointer' },
  primaryBtn: { flex: 1, minHeight: 56, fontSize: 20, fontWeight: 700, background: GREEN, color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer' },
};
