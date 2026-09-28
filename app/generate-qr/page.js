'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const toInt = (v) => (v === '' ? NaN : Number(v));

export default function GenerateQrPage() {
  const [tableNumber, setTableNumber] = useState('');
  const [adultCount, setAdultCount] = useState('');
  const [childCount, setChildCount] = useState('0');

  // 'form' | 'warning' | 'result'
  const [phase, setPhase] = useState('form');
  const [existing, setExisting] = useState(null); // session เก่าที่ยังเปิดอยู่
  const [showConfirm, setShowConfirm] = useState(false);
  const [minutesOpen, setMinutesOpen] = useState(0);
  const [result, setResult] = useState(null); // { table, adults, children, url }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleOpenTable = async (e) => {
    e.preventDefault();
    setError('');

    const table = toInt(tableNumber);
    const adults = toInt(adultCount);
    const children = childCount === '' ? 0 : toInt(childCount);

    if (!Number.isInteger(table) || table <= 0) {
      return setError('กรุณากรอกเลขโต๊ะเป็นตัวเลขที่มากกว่า 0');
    }
    if (!Number.isInteger(adults) || adults < 0 || !Number.isInteger(children) || children < 0) {
      return setError('จำนวนผู้ใหญ่/เด็กต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
    }
    if (adults + children < 1) {
      return setError('ต้องมีลูกค้าอย่างน้อย 1 คน');
    }

    setLoading(true);
    try {
      // 1) เช็คว่าโต๊ะนี้มี session ที่เปิดค้างอยู่หรือไม่
      const { data: openRows, error: findError } = await supabase
        .from('sessions')
        .select('id, table_number, adult_count, child_count, created_at')
        .eq('table_number', table)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1);

      if (findError) throw findError;

      if (openRows && openRows.length > 0) {
        setExisting(openRows[0]);
        setPhase('warning');
        return;
      }

      // 2) ไม่มี -> สร้าง session ใหม่
      const { error: insertError } = await supabase.from('sessions').insert({
        table_number: table,
        adult_count: adults,
        child_count: children,
        status: 'open',
      });
      if (insertError) throw insertError;

      const url = `${window.location.origin}/order/${table}`;
      setResult({ table, adults, children, url });
      setPhase('result');
    } catch (err) {
      setError('เกิดข้อผิดพลาด: ' + (err?.message || 'ไม่ทราบสาเหตุ') + ' กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  const askCloseOld = () => {
    const created = new Date(existing.created_at).getTime();
    setMinutesOpen(Math.max(0, Math.floor((Date.now() - created) / 60000)));
    setShowConfirm(true);
  };

  const confirmCloseOld = async () => {
    setError('');
    setLoading(true);
    try {
      // เช็คซ้ำว่ายัง open อยู่ตอน update (กันกดซ้ำ)
      const { error: updateError } = await supabase
        .from('sessions')
        .update({ status: 'closed' })
        .eq('id', existing.id)
        .eq('status', 'open')
        .select('id');
      if (updateError) throw updateError;

      // ปิดสำเร็จ (หรือถูกปิดไปแล้ว) -> กลับไปฟอร์มเดิม ค่าที่กรอกยังอยู่
      setShowConfirm(false);
      setExisting(null);
      setPhase('form');
    } catch (err) {
      setShowConfirm(false);
      setError('ปิดโต๊ะเดิมไม่สำเร็จ: ' + (err?.message || 'ไม่ทราบสาเหตุ') + ' กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('คัดลอกไม่สำเร็จ กรุณาคัดลอกลิงก์ด้วยตัวเอง');
    }
  };

  const resetAll = () => {
    setTableNumber('');
    setAdultCount('');
    setChildCount('0');
    setExisting(null);
    setResult(null);
    setError('');
    setPhase('form');
  };

  const qrSrc = result
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(result.url)}`
    : '';

  return (
    <main style={s.page}>
      <h1 style={s.title}>เปิดโต๊ะ</h1>

      {phase === 'result' && result ? (
        <section style={s.card}>
          <div style={{ textAlign: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc} alt={`QR Code โต๊ะ ${result.table}`} width={300} height={300} style={{ maxWidth: '100%', height: 'auto' }} />
            <p style={s.summary}>
              โต๊ะ {result.table} · ผู้ใหญ่ {result.adults} · เด็ก {result.children}
            </p>
            <div style={s.linkRow}>
              <span style={s.linkText}>{result.url}</span>
              <button type="button" onClick={handleCopy} style={s.smallBtn}>
                {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
              </button>
            </div>
            {error && <p style={s.error}>{error}</p>}
            <button type="button" onClick={resetAll} style={{ ...s.bigBtn, marginTop: 24 }}>
              เปิดโต๊ะใหม่
            </button>
          </div>
        </section>
      ) : (
        <>
          {phase === 'warning' && existing && (
            <section style={s.warning} role="alert">
              <p style={s.warningText}>โต๊ะนี้มีลูกค้าอยู่ระหว่างทานอาหาร กรุณาปิดออเดอร์เดิมก่อน</p>
              <button type="button" onClick={askCloseOld} style={s.dangerBtn}>
                ปิดออเดอร์เดิม
              </button>
            </section>
          )}

          <form onSubmit={handleOpenTable} style={s.card}>
            <label style={s.label}>
              เลขโต๊ะ
              <input
                type="number"
                inputMode="numeric"
                min="1"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                style={s.input}
              />
            </label>
            <label style={s.label}>
              จำนวนผู้ใหญ่
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={adultCount}
                onChange={(e) => setAdultCount(e.target.value)}
                style={s.input}
              />
            </label>
            <label style={s.label}>
              จำนวนเด็ก
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={childCount}
                onChange={(e) => setChildCount(e.target.value)}
                style={s.input}
              />
            </label>

            {error && <p style={s.error}>{error}</p>}

            <button type="submit" disabled={loading} style={{ ...s.bigBtn, opacity: loading ? 0.6 : 1 }}>
              {loading ? 'กำลังทำงาน...' : 'เปิดโต๊ะ'}
            </button>
          </form>
        </>
      )}

      {showConfirm && existing && (
        <div style={s.overlay} role="dialog" aria-modal="true">
          <div style={s.dialog}>
            <h2 style={s.dialogTitle}>ยืนยันปิดโต๊ะเดิม?</h2>
            <p style={s.dialogLine}>โต๊ะ {existing.table_number}</p>
            <p style={s.dialogLine}>
              ผู้ใหญ่ {existing.adult_count} · เด็ก {existing.child_count}
            </p>
            <p style={s.dialogLine}>เปิดมาแล้ว {minutesOpen} นาที</p>
            <div style={s.dialogActions}>
              <button type="button" onClick={() => setShowConfirm(false)} disabled={loading} style={s.cancelBtn}>
                ยกเลิก
              </button>
              <button type="button" onClick={confirmCloseOld} disabled={loading} style={{ ...s.dangerBtn, opacity: loading ? 0.6 : 1 }}>
                {loading ? 'กำลังปิด...' : 'ยืนยันปิดโต๊ะเดิม'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const s = {
  page: { maxWidth: 520, margin: '0 auto', padding: '1.5rem 1rem 3rem', fontFamily: 'sans-serif', fontSize: 22 },
  title: { fontSize: 36, margin: '0 0 1rem', textAlign: 'center' },
  card: { display: 'flex', flexDirection: 'column', gap: 16, background: '#fff', border: '2px solid #ddd', borderRadius: 12, padding: '1.25rem' },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontWeight: 600 },
  input: { fontSize: 28, padding: '0.6rem 0.75rem', border: '2px solid #999', borderRadius: 8, width: '100%', boxSizing: 'border-box' },
  bigBtn: { fontSize: 26, fontWeight: 700, padding: '1rem', background: '#c53030', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', width: '100%' },
  smallBtn: { fontSize: 16, padding: '0.4rem 0.8rem', background: '#edf2f7', border: '1px solid #a0aec0', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' },
  error: { color: '#c53030', fontWeight: 600, margin: 0, fontSize: 20 },
  warning: { background: '#fffaf0', border: '4px solid #dd6b20', borderRadius: 12, padding: '1.25rem', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 14 },
  warningText: { margin: 0, fontSize: 24, fontWeight: 700, color: '#9c4221' },
  dangerBtn: { fontSize: 22, fontWeight: 700, padding: '0.9rem 1rem', background: '#e53e3e', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer' },
  cancelBtn: { fontSize: 22, fontWeight: 600, padding: '0.9rem 1rem', background: '#edf2f7', color: '#2d3748', border: '2px solid #a0aec0', borderRadius: 10, cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50 },
  dialog: { background: '#fff', border: '5px solid #e53e3e', borderRadius: 14, padding: '1.5rem', width: '100%', maxWidth: 440 },
  dialogTitle: { margin: '0 0 12px', fontSize: 28, color: '#c53030' },
  dialogLine: { margin: '6px 0', fontSize: 24 },
  dialogActions: { display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 },
  summary: { fontSize: 26, fontWeight: 700, margin: '16px 0 8px' },
  linkRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' },
  linkText: { fontSize: 18, wordBreak: 'break-all' },
};
