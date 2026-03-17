"use client";

import { useState, useRef } from "react";
import Link from "next/link";

// ── 시뮬레이션용 메뉴 데이터
const INITIAL_ITEMS = [
  { id: 1, name: "아메리카노", price: 4000, soldOut: false, tag: null as null | "BEST" | "NEW" },
  { id: 2, name: "카페라떼", price: 4500, soldOut: false, tag: "BEST" as null | "BEST" | "NEW" },
  { id: 3, name: "바닐라라떼", price: 5000, soldOut: false, tag: null as null | "BEST" | "NEW" },
  { id: 4, name: "카푸치노", price: 4500, soldOut: false, tag: null as null | "BEST" | "NEW" },
  { id: 5, name: "에스프레소", price: 3500, soldOut: false, tag: null as null | "BEST" | "NEW" },
  { id: 6, name: "콜드브루", price: 5000, soldOut: false, tag: "NEW" as null | "BEST" | "NEW" },
];

// ── 명령 파서
function parseCommand(text: string): { type: string; name?: string; delta?: number } | null {
  const t = text.trim();
  const restoreMatch = t.match(/^(.+?)\s*(?:품절\s*(?:해제|취소)|재입고|복구)/i);
  if (restoreMatch) return { type: "restore", name: restoreMatch[1].trim() };
  const soldOutMatch = t.match(/^(.+?)\s*(?:품절|솔드아웃|sold\s*out)/i);
  if (soldOutMatch) return { type: "soldOut", name: soldOutMatch[1].trim() };
  const upMatch = t.match(/^(.+?)\s*(?:가격)?\s*(\d[\d,]*)\s*(?:원)?\s*(?:올려|인상|높여)/i);
  if (upMatch) return { type: "priceUp", name: upMatch[1].trim(), delta: parseInt(upMatch[2].replace(/,/g, "")) };
  const downMatch = t.match(/^(.+?)\s*(?:가격)?\s*(\d[\d,]*)\s*(?:원)?\s*(?:내려|인하|낮춰)/i);
  if (downMatch) return { type: "priceDown", name: downMatch[1].trim(), delta: parseInt(downMatch[2].replace(/,/g, "")) };
  return null;
}

function findItem(items: typeof INITIAL_ITEMS, name: string) {
  return items.find(
    (i) =>
      i.name.includes(name) ||
      name.includes(i.name) ||
      i.name.replace(/\s/g, "").includes(name.replace(/\s/g, "")) ||
      name.replace(/\s/g, "").includes(i.name.replace(/\s/g, ""))
  );
}

export default function LandingPage() {
  const [items, setItems] = useState(INITIAL_ITEMS);
  const [log, setLog] = useState<{ msg: string; ok: boolean }[]>([]);
  const [listening, setListening] = useState(false);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [flashType, setFlashType] = useState<string>("");
  const recogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playgroundRef = useRef<HTMLDivElement>(null);

  function addLog(msg: string, ok: boolean) {
    setLog((prev) => [{ msg, ok }, ...prev].slice(0, 5));
  }

  const FLASH_COLORS: Record<string, string> = {
    soldOut: "rgba(255,80,80,0.22)",
    restore: "rgba(110,231,183,0.28)",
    priceUp: "rgba(255,209,102,0.3)",
    priceDown: "rgba(130,196,255,0.28)",
  };

  function handleCommand(text: string) {
    const cmd = parseCommand(text);
    if (!cmd) { addLog(`"${text}" — 인식하지 못했어요.`, false); return; }
    const targetItem = cmd.name ? findItem(items, cmd.name) : null;
    if (!targetItem) { addLog(`"${cmd.name}" 항목을 찾을 수 없어요.`, false); return; }
    setItems((prev) => {
      const next = prev.map((item) => ({ ...item }));
      const target = next.find(i => i.id === targetItem.id)!;
      if (cmd.type === "soldOut") { target.soldOut = true; addLog(`✓ ${target.name} 품절 처리됐어요.`, true); }
      else if (cmd.type === "restore") { target.soldOut = false; addLog(`✓ ${target.name} 품절 해제됐어요.`, true); }
      else if (cmd.type === "priceUp" && cmd.delta) { target.price += cmd.delta; addLog(`✓ ${target.name} ${cmd.delta.toLocaleString()}원 인상됐어요.`, true); }
      else if (cmd.type === "priceDown" && cmd.delta) { target.price = Math.max(0, target.price - cmd.delta); addLog(`✓ ${target.name} ${cmd.delta.toLocaleString()}원 인하됐어요.`, true); }
      return next;
    });
    setFlashId(targetItem.id);
    setFlashType(cmd.type);
    setTimeout(() => setFlashId(null), 700);
  }

  function handleMic() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { addLog("이 브라우저는 음성인식을 지원하지 않아요. (Chrome 권장)", false); return; }
    if (listening) { (recogRef.current as any)?.stop(); setListening(false); return; }
    const recog = new SpeechRecognition();
    recog.lang = "ko-KR";
    recog.interimResults = false;
    recog.onresult = (e: any) => { const text = e.results[0][0].transcript; handleCommand(text); setListening(false); };
    recog.onerror = () => setListening(false);
    recog.onend = () => setListening(false);
    recogRef.current = recog;
    recog.start();
    setListening(true);
  }

  function scrollToPlayground() {
    playgroundRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F9F8F6", fontFamily: "'Pretendard', sans-serif" }}>

      {/* Hero */}
      <section style={{ position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 80% 60% at 70% 40%, rgba(27,60,53,0.06) 0%, transparent 70%), radial-gradient(ellipse 50% 50% at 30% 60%, rgba(255,140,66,0.07) 0%, transparent 60%)" }} />
        <div style={{ position: "relative", maxWidth: "1100px", margin: "0 auto", padding: "80px 24px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "60px" }}>
          <div style={{ flex: "1 1 340px" }}>
            <div style={{ display: "inline-block", fontSize: "11px", fontWeight: 600, letterSpacing: "0.15em", marginBottom: "24px", padding: "8px 18px", borderRadius: "24px", background: "rgba(27,60,53,0.08)", color: "#1B3C35" }}>
              🎙 LAZY MENU — 게으른 메뉴판
            </div>
            <h1 style={{ fontSize: "clamp(2rem,4vw,3.4rem)", fontWeight: 700, lineHeight: 1.25, marginBottom: "20px", color: "#1B3C35", wordBreak: "keep-all" }}>
              사장님은 주문만 받으세요.<br />
              <span style={{ color: "#FF8C42" }}>메뉴판</span>은 저희가 바꿀게요.
            </h1>
            <p style={{ fontSize: "1.05rem", lineHeight: 1.75, marginBottom: "36px", color: "#4a4a4a", wordBreak: "keep-all" }}>
              바쁜 피크타임, 포스트잇 대신 말 한마디로<br />
              품절부터 가격 수정까지 바로 해결하세요.
            </p>
            <button onClick={scrollToPlayground} style={{ fontSize: "1rem", fontWeight: 600, padding: "16px 32px", background: "#1B3C35", color: "#F9F8F6", border: "none", borderRadius: "24px", cursor: "pointer", boxShadow: "0 4px 20px rgba(27,60,53,0.25)", transition: "opacity .2s" }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
              30초 체험해보기 →
            </button>
          </div>
          {/* 폰 목업 */}
          <div style={{ flex: "0 0 auto", display: "flex", justifyContent: "center" }}>
            <div style={{ width: "220px", background: "#1B3C35", borderRadius: "2rem", padding: "10px", boxShadow: "0 32px 64px rgba(27,60,53,0.3)", position: "relative" }}>
              <div style={{ borderRadius: "1.5rem", overflow: "hidden", background: "#F9F8F6" }}>
                <div style={{ textAlign: "center", padding: "14px 12px 10px", borderBottom: "1px solid #e8e4de" }}>
                  <p style={{ fontWeight: 700, fontSize: "13px", color: "#1B3C35" }}>☕ 카페 봄</p>
                  <p style={{ fontSize: "9px", letterSpacing: "0.3em", marginTop: "3px", color: "#888" }}>MENU</p>
                </div>
                <div style={{ padding: "12px" }}>
                  {INITIAL_ITEMS.map((item) => (
                    <div key={item.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "7px 0", borderBottom: "1px dotted #ddd" }}>
                      <span style={{ color: "#333" }}>{item.name}</span>
                      <span style={{ color: "#888" }}>{(item.price / 1000).toFixed(1)}천</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ position: "absolute", top: "10px", left: "50%", transform: "translateX(-50%)", width: "50px", height: "5px", background: "#0f2820", borderRadius: "9999px" }} />
            </div>
          </div>
        </div>
      </section>

      {/* Problem & Solution */}
      <section style={{ padding: "100px 24px", position: "relative", overflow: "hidden", background: "linear-gradient(160deg, #0f1f1c 0%, #1B3C35 50%, #0f2820 100%)" }}>
        {/* 배경 장식 */}
        <div style={{ position: "absolute", top: "-120px", right: "-120px", width: "500px", height: "500px", borderRadius: "9999px", background: "radial-gradient(circle, rgba(255,140,66,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "-80px", left: "-80px", width: "400px", height: "400px", borderRadius: "9999px", background: "radial-gradient(circle, rgba(122,171,158,0.1) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ maxWidth: "1000px", margin: "0 auto", position: "relative" }}>
          {/* 헤더 */}
          <div style={{ textAlign: "center", marginBottom: "72px" }}>
            <div style={{ display: "inline-block", fontSize: "11px", fontWeight: 700, letterSpacing: "0.25em", padding: "8px 20px", borderRadius: "24px", background: "rgba(255,140,66,0.15)", color: "#FF8C42", marginBottom: "20px", border: "1px solid rgba(255,140,66,0.25)" }}>
              PAIN POINT
            </div>
            <h2 style={{ fontSize: "clamp(1.8rem,4vw,2.6rem)", fontWeight: 800, color: "#F9F8F6", marginBottom: "14px", lineHeight: 1.25 }}>
              혹시 이런 경험 있으세요?
            </h2>
            <p style={{ color: "rgba(249,248,246,0.5)", fontSize: "0.95rem" }}>카페 사장님들이 매일 겪는 불편함</p>
          </div>

          {/* BEFORE 카드들 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "16px", marginBottom: "56px" }}>
            {[
              { icon: "🏃", title: "사무실까지 왕복", desc: "장사 중에 메뉴판 뽑으러 인쇄소까지 다녀와야 하는 상황" },
              { icon: "😤", title: "포스기와 씨름", desc: "포스기 메뉴 등록하다 주문이 밀리고 손님이 기다리고" },
              { icon: "📝", title: "포스트잇 품절 표시", desc: "손 글씨 포스트잇이 붙은 메뉴판, 보기에도 민망함" },
              { icon: "💸", title: "인쇄소 비용 반복", desc: "가격 바뀔 때마다 메뉴판 재인쇄, 버려지는 돈과 시간" },
            ].map((item) => (
              <div key={item.title} style={{ borderRadius: "20px", padding: "28px 24px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(8px)", transition: "transform 0.2s" }}
                onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-4px)")}
                onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}>
                <div style={{ fontSize: "2rem", marginBottom: "14px" }}>{item.icon}</div>
                <h3 style={{ fontWeight: 700, fontSize: "0.9rem", color: "#ffffff", marginBottom: "8px" }}>{item.title}</h3>
                <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.75)", lineHeight: 1.6, wordBreak: "keep-all" }}>{item.desc}</p>
              </div>
            ))}
          </div>

          {/* 전환 화살표 */}
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "1px", height: "32px", background: "linear-gradient(to bottom, rgba(255,140,66,0), rgba(255,140,66,0.6))" }} />
              <div style={{ width: "44px", height: "44px", borderRadius: "9999px", background: "linear-gradient(135deg, #FF8C42, #ff6b1a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", boxShadow: "0 0 32px rgba(255,140,66,0.5)" }}>▼</div>
              <p style={{ fontSize: "1.35rem", fontWeight: 900, letterSpacing: "0.05em", color: "#FF8C42", marginTop: "10px", textShadow: "0 0 24px rgba(255,140,66,0.5)" }}>LAZY MENU로 바뀌면</p>
            </div>
          </div>

          {/* AFTER — 가로형 큰 카드 */}
          <div style={{ borderRadius: "28px", padding: "48px", background: "linear-gradient(135deg, rgba(27,60,53,0.8) 0%, rgba(15,40,32,0.9) 100%)", border: "1.5px solid rgba(122,171,158,0.3)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)", backdropFilter: "blur(12px)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "28px" }}>
              {[
                { icon: "🎙", label: "말 한마디", value: '"아메리카노 품절"', sub: "즉시 메뉴판 반영" },
                { icon: "💰", label: "가격 수정", value: '"500원 올려줘"', sub: "실시간 업데이트" },
                { icon: "🔗", label: "POS 자동 연동", value: "재등록 불필요", sub: "포스기와 자동 동기화" },
                { icon: "📱", label: "어디서든 제어", value: "스마트폰으로", sub: "매장 밖에서도 가능" },
              ].map((item) => (
                <div key={item.label} style={{ display: "flex", gap: "18px", alignItems: "flex-start" }}>
                  <div style={{ width: "52px", height: "52px", borderRadius: "16px", background: "rgba(255,140,66,0.15)", border: "1px solid rgba(255,140,66,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", flexShrink: 0 }}>
                    {item.icon}
                  </div>
                  <div>
                    <p style={{ fontSize: "0.95rem", fontWeight: 800, letterSpacing: "0.1em", color: "#FFD166", marginBottom: "6px" }}>{item.label}</p>
                    <p style={{ fontSize: "0.8rem", fontWeight: 500, color: "#ffffff", marginBottom: "6px", wordBreak: "keep-all" }}>{item.value}</p>
                    <p style={{ fontSize: "1rem", fontWeight: 700, color: "#6ee7b7" }}>{item.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Playground */}
      <section ref={playgroundRef} style={{ padding: "80px 24px", background: "#F9F8F6" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(1.5rem,3vw,2rem)", fontWeight: 700, textAlign: "center", marginBottom: "10px", color: "#1B3C35" }}>지금 바로 체험해보세요</h2>
          <p style={{ textAlign: "center", marginBottom: "48px", color: "#888", fontSize: "0.9rem" }}>오른쪽 어드민에서 마이크를 누르고 말해보세요! 왼쪽 메뉴판이 실시간으로 바뀝니다</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px", alignItems: "start" }}>
            {/* 고객 메뉴판 */}
            <div style={{ borderRadius: "24px", overflow: "hidden", border: "1px solid #e8e4de", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
              <div style={{ padding: "18px 24px", textAlign: "center", background: "#1B3C35" }}>
                <p style={{ fontWeight: 700, fontSize: "12px", letterSpacing: "0.15em", color: "#F9F8F6" }}>☕ 매장 메뉴판</p>
                <p style={{ fontSize: "9px", letterSpacing: "0.3em", marginTop: "4px", color: "rgba(249,248,246,0.5)" }}>CUSTOMER VIEW</p>
              </div>
              <div style={{ padding: "16px", background: "#fff" }}>
                {items.map((item) => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderRadius: "12px", marginBottom: "6px", background: flashId === item.id ? FLASH_COLORS[flashType] ?? "#F9F8F6" : item.soldOut ? "#f5f5f5" : "#F9F8F6", opacity: item.soldOut ? 0.55 : 1, transition: "all 0.4s ease", boxShadow: flashId === item.id ? `0 0 0 2px ${FLASH_COLORS[flashType]?.replace("0.2", "0.6") ?? "transparent"}` : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: 500, fontSize: "13px", color: item.soldOut ? "#aaa" : "#1B3C35", textDecoration: item.soldOut ? "line-through" : "none" }}>{item.name}</span>
                      {item.tag && !item.soldOut && (
                        <span style={{ fontSize: "9px", fontWeight: 700, padding: "2px 7px", borderRadius: "9999px", background: item.tag === "BEST" ? "#1B3C35" : "#FF8C42", color: "#fff" }}>{item.tag}</span>
                      )}
                      {item.soldOut && (
                        <span style={{ fontSize: "9px", fontWeight: 700, padding: "2px 7px", borderRadius: "9999px", background: "#e0e0e0", color: "#999" }}>SOLD OUT</span>
                      )}
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: item.soldOut ? "#bbb" : "#FF8C42", transition: "all 0.4s ease", fontVariantNumeric: "tabular-nums" }}>{item.price.toLocaleString()}원</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 어드민 콘솔 */}
            <div style={{ borderRadius: "24px", padding: "28px", background: "#1a2420", border: "1px solid #2a3d38", display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* 헤더 */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "9999px", background: listening ? "#FF8C42" : "#3d5a54", display: "inline-block", transition: "background 0.2s" }} />
                  <p style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.2em", color: "#7aab9e" }}>ADMIN CONSOLE</p>
                </div>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "#e8f5f0", marginTop: "6px", lineHeight: 1.6, wordBreak: "keep-all" }}>아래와 같이 말로 편하게 메뉴판과 포스 등록 내용을 바꿔요!<br /><span style={{ fontSize: "11px", fontWeight: 400, color: "#7aab9e" }}>메뉴판에 있는 모든 메뉴 이름으로 명령하실 수 있습니다.</span></p>
              </div>

              {/* 예시 명령 카드들 */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <p style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.15em", color: "rgba(122,171,158,0.6)", marginBottom: "4px" }}>💬 이렇게 말해보세요</p>
                {[
                  { text: "\"아메리카노 품절\"", sub: "메뉴를 즉시 품절 처리", color: "#ff8080" },
                  { text: "\"아메리카노 품절 해제\"", sub: "품절 메뉴를 다시 판매", color: "#7aab9e" },
                  { text: "\"카페라떼 500원 올려줘\"", sub: "가격을 바로 인상", color: "#FFD166" },
                  { text: "\"콜드브루 1000원 내려줘\"", sub: "가격을 바로 인하", color: "#82c4ff" },
                ].map(({ text, sub, color }) => (
                  <div key={text} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", borderRadius: "12px", background: "rgba(255,255,255,0.04)", border: `1px solid ${color}33` }}>
                    <span style={{ fontSize: "13px", fontWeight: 700, color, fontFamily: "monospace", flex: 1 }}>{text}</span>
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap" }}>{sub}</span>
                  </div>
                ))}
              </div>

              {/* 마이크 버튼 */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", padding: "8px 0" }}>
                <button
                  type="button"
                  onClick={handleMic}
                  title="음성 입력"
                  style={{
                    width: "80px", height: "80px", borderRadius: "9999px", border: "none", cursor: "pointer",
                    background: listening ? "#FF8C42" : "#2a4a42",
                    fontSize: "32px", flexShrink: 0,
                    boxShadow: listening ? "0 0 0 8px rgba(255,140,66,0.2), 0 0 32px rgba(255,140,66,0.4)" : "0 4px 20px rgba(0,0,0,0.3)",
                    transition: "all 0.2s",
                    transform: listening ? "scale(1.05)" : "scale(1)",
                  }}
                >🎙</button>
                <p style={{ fontSize: "12px", fontWeight: 600, color: listening ? "#FF8C42" : "#5a8a7e", transition: "color 0.2s", textAlign: "center" }}>
                  {listening ? "듣고 있어요... 말씀해주세요" : "탭해서 음성 명령 시작"}
                </p>
              </div>

              {/* 실행 내역 */}
              <div style={{ borderTop: "1px solid #2a3d38", paddingTop: "16px" }}>
                <p style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.15em", color: "rgba(122,171,158,0.5)", marginBottom: "10px" }}>실행 내역</p>
                <div style={{ minHeight: "60px" }}>
                  {log.length === 0 ? (
                    <p style={{ fontSize: "11px", fontStyle: "italic", color: "#3a5a54" }}>아직 실행된 명령이 없어요.</p>
                  ) : (
                    log.map((l, i) => (
                      <div key={i} style={{ fontSize: "11px", padding: "8px 12px", borderRadius: "10px", marginBottom: "6px", background: l.ok ? "rgba(122,171,158,0.15)" : "rgba(255,100,100,0.1)", color: l.ok ? "#7aab9e" : "#ff8080" }}>{l.msg}</div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 안내 배너 */}
          <div style={{ marginTop: "36px", borderRadius: "20px", overflow: "hidden", border: "1px solid rgba(255,140,66,0.25)" }}>
            {/* 상단: 체험 제한 안내 */}
            <div style={{ padding: "20px 28px", background: "rgba(255,140,66,0.08)", display: "flex", alignItems: "flex-start", gap: "14px" }}>
              <span style={{ fontSize: "22px", flexShrink: 0, marginTop: "2px" }}>⚠️</span>
              <div>
                <p style={{ fontWeight: 700, fontSize: "0.88rem", color: "#FFB347", marginBottom: "5px" }}>현재 체험 데모 버전입니다</p>
                <p style={{ fontSize: "0.8rem", color: "#1a1a1a", lineHeight: 1.65, wordBreak: "keep-all" }}>
                  체험판에서는 <strong style={{ color: "rgba(249,248,246,0.8)" }}>품절 처리 / 품절 해제 / 가격 인상·인하</strong> 4가지 명령만 지원합니다.
                  정식 출시 시 훨씬 더 자연스러운 대화형 명령을 지원할 예정이니 양해 부탁드립니다 🙏
                </p>
              </div>
            </div>
            {/* 하단: 출시 예정 기능 */}
            <div style={{ padding: "24px 28px", background: "#0f1f1c", display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "20px" }}>🚀</span>
                <p style={{ fontWeight: 800, fontSize: "0.9rem", color: "#ffffff" }}>출시 예정 기능</p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                {[
                  { icon: "🤖", label: "전용 AI 엔진", desc: "자연어 명령 완벽 인식", color: "#82c4ff" },
                  { icon: "🖥", label: "POS 실시간 연동", desc: "포스기 자동 동기화", color: "#7aab9e" },
                  { icon: "📊", label: "매출 분석 대시보드", desc: "메뉴별 판매 통계", color: "#FFD166" },
                ].map((f) => (
                  <div key={f.label} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 18px", borderRadius: "12px", background: "rgba(255,255,255,0.08)", border: `1px solid ${f.color}55` }}>
                    <span style={{ fontSize: "18px" }}>{f.icon}</span>
                    <div>
                      <p style={{ fontSize: "12px", fontWeight: 700, color: f.color }}>{f.label}</p>
                      <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", marginTop: "2px" }}>{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: "80px 24px", background: "#fff" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(1.5rem,3vw,2rem)", fontWeight: 700, textAlign: "center", marginBottom: "52px", color: "#1B3C35" }}>Lazy Menu가 특별한 이유</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "24px" }}>
            {[
              { icon: "🎙", title: "초저지연 음성 인식", desc: "주변 소음이 심한 카페 환경에서도 정확하게. 말한 순간 메뉴판이 바뀝니다." },
              { icon: "🖥", title: "원클릭 POS 연동", desc: "별도의 재등록 없이 포스기 메뉴 정보를 자동 동기화합니다." },
              { icon: "🎨", title: "감성 디자인 템플릿", desc: "우리 카페 인테리어에 딱 맞는 디지털 메뉴판 디자인을 자동 생성합니다." },
            ].map((f) => (
              <div key={f.title} style={{ borderRadius: "24px", padding: "36px", textAlign: "center", background: "#F9F8F6", boxShadow: "0 2px 16px rgba(0,0,0,0.04)" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: "20px" }}>{f.icon}</div>
                <h3 style={{ fontWeight: 700, marginBottom: "12px", fontSize: "0.95rem", color: "#1B3C35" }}>{f.title}</h3>
                <p style={{ fontSize: "0.85rem", lineHeight: 1.65, color: "#666", wordBreak: "keep-all" }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "80px 24px", background: "#1B3C35" }}>
        <div style={{ maxWidth: "600px", margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(1.5rem,3vw,2rem)", fontWeight: 700, marginBottom: "16px", color: "#F9F8F6" }}>출시 알림 받기</h2>
          <p style={{ marginBottom: "36px", fontSize: "0.9rem", lineHeight: 1.7, color: "rgba(249,248,246,0.6)", wordBreak: "keep-all" }}>AI 엔진 연결 및 POS 솔루션 정식 출시 시 가장 먼저 안내드립니다.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "center", maxWidth: "440px", margin: "0 auto" }}>
            <input type="email" placeholder="이메일 주소 입력" style={{ flex: "1 1 220px", padding: "14px 20px", fontSize: "13px", outline: "none", background: "rgba(249,248,246,0.1)", border: "1px solid rgba(249,248,246,0.2)", borderRadius: "24px", color: "#F9F8F6", fontFamily: "inherit" }} />
            <button style={{ padding: "14px 28px", fontSize: "13px", fontWeight: 600, background: "#FF8C42", color: "#fff", border: "none", borderRadius: "24px", cursor: "pointer", fontFamily: "inherit" }}>알림 신청</button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: "28px 24px", background: "#f4f3f1" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: "13px", color: "#1B3C35" }}>Lazy Menu</span>
            <span style={{ fontSize: "11px", marginLeft: "10px", color: "#aaa" }}>게으른 메뉴판</span>
          </div>
          <p style={{ fontSize: "11px", color: "#bbb", textAlign: "center" }}>
            AI 연결 및 POS 솔루션 출시 예정 &nbsp;·&nbsp; Copyright © 2026 Lazy Menu Labs. All rights reserved.
          </p>
          <Link href="/menu" style={{ fontSize: "11px", color: "#999", textDecoration: "none" }}>메뉴판 보기 →</Link>
        </div>
      </footer>

    </main>
  );
}
