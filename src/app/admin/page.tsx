"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import type { CategoryWithItems } from "@/types/menu";

type SortMode = "manual" | "price" | "name";

type VoiceCommand = 
  | { type: "delete"; name: string }
  | { type: "add"; category: string; name: string; price: number; has_ice?: boolean }
  | { type: "addNoPrice"; category: string; name: string }
  | { type: "price"; name: string; price: number }
  | { type: "ice"; name: string; has_ice: boolean }
  | { type: "rename"; from: string; to: string }
  | { type: "bulkPrice"; scope: "all" | "category"; category?: string; price: number }
  | { type: "setSort"; mode: SortMode }
  | { type: "saveSort"; scope: "all" | "category"; category?: string }
  | { type: "sortAndSave"; mode: Exclude<SortMode, "manual">; scope: "all" | "category"; category?: string }
  | { type: "move"; name: string; direction: -1 | 1; steps: number }
  | null;

function normalizeKoreanSpeech(text: string) {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.?!…]/g, "")
    .replace(/원/g, "")
    // "40으로", "4.5로", "사천원으로" 같은 케이스에서 (으)로 제거
    .replace(/(\d)\s*(?:으로|로)\b/g, "$1 ")
    .replace(/([가-힣]+)\s*(?:으로|로)\b/g, "$1 ")
    .replace(/\b(?:으로|로)\b/g, " ")
    .replace(/\b메뉴\b/g, " ")
    .replace(/\b에\b/g, " ")
    // 붙어있는 조사 제거: "라떼를" -> "라떼", "커피는" -> "커피"
    .replace(/([가-힣])(?:를|을|이|가|은|는)\b/g, "$1 ")
    .replace(/\b을\b|\b를\b|\b이\b|\b가\b|\b은\b|\b는\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePriceKrwToThousands(raw: string): number | null {
  const s = raw.trim().replace(/,/g, "");
  if (!s) return null;

  const koreanDigit: Record<string, number> = {
    영: 0,
    공: 0,
    일: 1,
    이: 2,
    삼: 3,
    사: 4,
    오: 5,
    육: 6,
    칠: 7,
    팔: 8,
    구: 9,
  };

  function parseKoreanNumberToInt(text: string): number | null {
    // 지원 범위: 0 ~ 9999 정도 (메뉴 가격에 충분)
    // 예: 사천오백 -> 4500, 천 -> 1000, 오백 -> 500, 십오 -> 15
    const t = text.trim();
    if (!t) return null;
    if (t === "천") return 1000;
    if (t === "백") return 100;
    if (t === "십") return 10;

    let total = 0;
    let current = 0;
    let seen = false;

    const unitValue: Record<string, number> = { 십: 10, 백: 100, 천: 1000 };
    for (const ch of t) {
      if (ch in koreanDigit) {
        current = koreanDigit[ch];
        seen = true;
        continue;
      }
      if (ch in unitValue) {
        const unit = unitValue[ch];
        const n = current === 0 && seen === false ? 1 : current; // "천"처럼 숫자 생략 시 1
        total += n * unit;
        current = 0;
        seen = false;
        continue;
      }
      // 알 수 없는 글자 포함 시 실패
      return null;
    }
    // 끝에 일의 자리
    total += current;
    return total;
  }

  // 4.5 / 5 / 4.0
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = parseFloat(s);
    if (Number.isNaN(n)) return null;
    // 사용자가 4500(원)처럼 말하면 4.5(천원 단위)로 보정
    if (Number.isInteger(n)) {
      // 4500 -> 4.5
      if (n >= 1000) return n / 1000;
      // 450 -> 4.5
      if (n >= 100 && n < 1000) return n / 100;
      // 45 -> 4.5 (음성에서 4.5를 45로 받아쓰는 경우)
      if (n >= 10 && n < 100) return n / 10;
    }
    return n;
  }

  // 4천 / 4 천 / 4.5천
  const m = s.match(/^(\d+(?:\.\d+)?)\s*천$/);
  if (m) {
    const n = parseFloat(m[1]);
    if (Number.isNaN(n)) return null;
    return n;
  }

  // 사천 / 사천오백 / 오천 등 (한글 숫자)
  if (/^[가-힣]+$/.test(s)) {
    const n = parseKoreanNumberToInt(s);
    if (n === null) return null;
    return n >= 1000 ? n / 1000 : n;
  }

  // 4500(원) 처럼 숫자 + 기타가 섞인 경우 마지막 숫자만 추출 시도
  const lastNum = s.match(/(\d+(?:\.\d+)?)(?:\s*천)?$/);
  if (lastNum) {
    const n = parseFloat(lastNum[1]);
    if (!Number.isNaN(n)) return n >= 1000 ? n / 1000 : n;
  }

  return null;
}

function normalizeMenuName(name: string) {
  return name
    .trim()
    .replace(/\s+/g, "")
    // 흔한 오타/표기: 라테/라떼
    .replace(/라테/g, "라떼")
    // 흔한 오타/표기: 마키아또/마끼아또
    .replace(/마키아또/g, "마끼아또");
}

function formatPrice(price: number) {
  return `${price.toFixed(1)}천`;
}

function parseVoiceText(text: string): VoiceCommand {
  const raw = text.trim().replace(/\s+/g, " ");
  const t = normalizeKoreanSpeech(text);
  if (!t) return null;

  const categories = ["커피", "라떼", "프라페"];

  // 정렬 모드 변경 (보기만): "정렬 모드 가격", "가격순", "가나다순", "수동 정렬"
  if (t.match(/^(?:정렬\s*모드\s*)?(?:수동|기본)\s*(?:정렬)?$/)) return { type: "setSort", mode: "manual" };
  if (t.match(/^(?:정렬\s*모드\s*)?(?:가격|가격순)\s*(?:정렬)?$/)) return { type: "setSort", mode: "price" };
  if (t.match(/^(?:정렬\s*모드\s*)?(?:가나다|이름|이름순|가나다순)\s*(?:정렬)?$/)) return { type: "setSort", mode: "name" };

  // 정렬 저장: "정렬 저장", "전체 정렬 저장", "커피 정렬 저장"
  const saveSortMatch =
    t.match(/^(?:(커피|라떼|프라페)\s+)?(?:메뉴\s+)?정렬\s+저장$/) ||
    t.match(/^(?:전체|전부|모두)\s+(?:메뉴\s+)?정렬\s+저장$/);
  if (saveSortMatch) {
    const cat = (saveSortMatch[1] || "").trim();
    if (cat) return { type: "saveSort", scope: "category", category: cat };
    return { type: "saveSort", scope: "all" };
  }

  // 정렬 + 저장 한 번에: "커피 가격순으로 정렬 저장", "전체 가나다순 정렬 저장"
  const sortAndSaveMatch =
    t.match(/^(?:(커피|라떼|프라페)\s+)?(?:메뉴\s+)?(가격순|가격|가나다순|가나다|이름순|이름)\s*(?:으로)?\s*정렬\s+저장$/) ||
    t.match(/^(?:전체|전부|모두)\s+(?:메뉴\s+)?(가격순|가격|가나다순|가나다|이름순|이름)\s*(?:으로)?\s*정렬\s+저장$/);
  if (sortAndSaveMatch) {
    const maybeCat = (sortAndSaveMatch[1] || "").trim();
    const modeRaw = (sortAndSaveMatch[2] || sortAndSaveMatch[1] || "").trim();
    const mode: Exclude<SortMode, "manual"> = modeRaw.includes("가격") ? "price" : "name";
    if (categories.includes(maybeCat)) return { type: "sortAndSave", mode, scope: "category", category: maybeCat };
    return { type: "sortAndSave", mode, scope: "all" };
  }

  // 수동 순서 이동: "아메리카노 위로", "밤라떼 두칸 아래로"
  const moveMatch = raw.match(/^(.+?)\s*(?:을|를)?\s*(한\s*칸|두\s*칸|세\s*칸|\d+\s*칸)?\s*(위로|아래로)\s*(?:옮겨|이동|올려|내려)?(?:줘|주세요|해줘|해)?$/);
  if (moveMatch) {
    const name = moveMatch[1].trim();
    const stepsRaw = (moveMatch[2] || "").replace(/\s+/g, "");
    const dirRaw = moveMatch[3].trim();
    const direction: -1 | 1 = dirRaw === "위로" ? -1 : 1;
    let steps = 1;
    if (stepsRaw) {
      if (stepsRaw.startsWith("두")) steps = 2;
      else if (stepsRaw.startsWith("세")) steps = 3;
      else if (stepsRaw.startsWith("한")) steps = 1;
      else {
        const n = parseInt(stepsRaw.replace(/칸/g, ""), 10);
        if (!Number.isNaN(n) && n > 0) steps = Math.min(10, n);
      }
    }
    if (name) return { type: "move", name, direction, steps };
  }

  // 이름 변경(원문 기반): "...밤라떼를 포도 라떼로 바꿔줘"
  // 문장 앞에 다른 말이 붙어도, runCommand에서 실제 메뉴명을 다시 매칭해서 안전하게 처리함
  const renameRaw = raw.match(
    /^(.+?)(?:를|을)\s*(.+?)(?:으로|로)\s*(?:변경|바꿔|바꾸|수정)(?:줘|주세요|해줘|해)?$/
  );
  if (renameRaw) {
    const from = renameRaw[1].trim();
    const to = renameRaw[2].trim();
    const maybePrice = parsePriceKrwToThousands(to);
    if (maybePrice === null && from && to) {
      return { type: "rename", from, to };
    }
  }

  // 일괄 가격 변경:
  // - "커피 메뉴 전부 5로 변경"
  // - "커피 전부 5로 변경"
  // - "전체 메뉴 4.5로 변경" / "메뉴 전부 4500원으로 변경"
  const bulkMatch =
    t.match(/^(?:(커피|라떼|프라페)\s+)?(?:메뉴\s+)?(?:전부|모두|전체)\s+(\S+)\s*(?:변경|바꿔|바꾸|수정)$/) ||
    t.match(/^(?:(커피|라떼|프라페)\s+)?(?:메뉴\s+)?(?:전부|모두|전체)\s+(\S+)\s*(?:으로|로)\s*(?:변경|바꿔|바꾸|수정)$/) ||
    t.match(/^(?:(커피|라떼|프라페)\s+)?(?:메뉴\s+)?(?:전부|모두|전체)\s+가격\s+(\S+)\s*(?:변경|바꿔|바꾸|수정)$/);
  if (bulkMatch) {
    const category = (bulkMatch[1] || "").trim();
    const priceRaw = (bulkMatch[2] || bulkMatch[4] || "").trim();
    const price = parsePriceKrwToThousands(priceRaw);
    if (price !== null) {
      if (category) return { type: "bulkPrice", scope: "category", category, price };
      return { type: "bulkPrice", scope: "all", price };
    }
  }

  // (백업) 조사/구분이 잘려서 들어오는 케이스용 이름 변경
  const renameMatch = t.match(
    /^(.+?)\s+(.+?)\s*(?:으로|로)\s*(?:변경|바꿔|바꾸|수정)(?:줘|주세요|해줘|해)?$/
  );
  if (renameMatch) {
    const from = renameMatch[1].trim();
    const to = renameMatch[2].trim();
    const maybePrice = parsePriceKrwToThousands(to);
    if (maybePrice === null && from && to) return { type: "rename", from, to };
  }

  // 삭제: "에스프레소 삭제", "삭제 에스프레소", "에스프레소 지워줘"
  const deleteKeywords = ["삭제", "지워", "지우", "제거", "빼", "없애"];
  for (const kw of deleteKeywords) {
    const m1 = t.match(new RegExp(`(?:${kw})\\s+(.+)$`));
    const m2 = t.match(new RegExp(`^(.+?)\\s+(?:${kw})$`));
    const m3 = t.match(new RegExp(`^(.+?)\\s+(?:${kw})(?:줘|주세요|해줘|해)$`));
    const hit = m1 || m2 || m3;
    if (hit) return { type: "delete", name: hit[1].trim() };
  }

  // 가격 변경: "카페라떼 가격 4.5", "가격 카페라떼 4.5", "카페라떼 4.5로 변경"
  const priceMatch =
    t.match(/(?:가격\s+)(.+?)\s+([\d.]+)$/) ||
    t.match(/^(.+?)\s+가격\s+([\d.]+)$/) ||
    t.match(/^(.+?)\s+([\d.]+)\s*(?:변경|바꿔|바꾸|수정)$/) ||
    t.match(/^(.+?)\s+([\d.]+)\s*(?:으로|로)\s*(?:변경|바꿔|바꾸|수정)$/) ||
    t.match(/^(.+?)\s+(\d+(?:\.\d+)?\s*천)\s*(?:변경|바꿔|바꾸|수정)$/) ||
    t.match(/^(.+?)\s+(\d+(?:\.\d+)?\s*천)\s*(?:으로|로)\s*(?:변경|바꿔|바꾸|수정)$/);
  if (priceMatch) {
    const price = parsePriceKrwToThousands(priceMatch[2]);
    if (price !== null) return { type: "price", name: priceMatch[1].trim(), price };
  }

  // "추가 커피 디카페인 4.0" or "커피 디카페인 4.0 추가"
  const addMatch =
    t.match(/(?:추가|등록|넣어)\s+(.+)$/) ||
    (t.includes(" 추가") ? t.replace(/\s+추가$/, "") : null);
  if (addMatch) {
    const rest = (typeof addMatch === "string" ? addMatch : addMatch[1]).trim();
    const numMatch = rest.match(/\s+(\d+(?:\.\d+)?(?:\s*천)?|[가-힣]+)\s*$/);
    const price = numMatch ? parsePriceKrwToThousands(numMatch[1]) : null;
    const withoutPrice = numMatch ? rest.slice(0, rest.length - numMatch[0].length).trim() : rest;
    for (const cat of categories) {
      if (withoutPrice.startsWith(cat + " ") || withoutPrice === cat) {
        const name = withoutPrice.slice(cat.length).trim() || "";
        if (name && price !== null) return { type: "add", category: cat, name, price };
        if (name && price === null) return { type: "addNoPrice", category: cat, name };
      }
    }
    if (withoutPrice && price !== null) {
      const firstWord = withoutPrice.split(" ")[0];
      if (categories.includes(firstWord)) {
        const name = withoutPrice.slice(firstWord.length).trim();
        if (name && price !== null) return { type: "add", category: firstWord, name, price };
      }
    }
    if (withoutPrice && price === null) {
      const firstWord = withoutPrice.split(" ")[0];
      if (categories.includes(firstWord)) {
        const name = withoutPrice.slice(firstWord.length).trim();
        if (name) return { type: "addNoPrice", category: firstWord, name };
      }
    }
  }

  return null;
}

export default function AdminPage() {
  const [menu, setMenu] = useState<CategoryWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [listening, setListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [lastParsed, setLastParsed] = useState<string>("");
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const [addForm, setAddForm] = useState({ categoryId: "", name: "", price: "", hasIce: false });
  const listeningRef = useRef(false);
  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognitionAPI = (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition; SpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setMessage({ type: "error", text: "이 브라우저는 음성 인식을 지원하지 않습니다." });
      return;
    }
    const rec = new SpeechRecognitionAPI() as SpeechRecognition;
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "ko-KR";
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(" ")
        .trim();
      if (transcript) setLastTranscript(transcript);
    };
    rec.onend = () => {
      // 일부 브라우저는 결과 후 자동 종료됨 → 켜져 있으면 자동 재시작
      if (listeningRef.current) {
        try {
          rec.start();
        } catch {
          // start가 연속 호출로 실패할 수 있어 무시 (사용자가 다시 눌러도 됨)
        }
      }
    };
    setRecognition(rec);
    return () => rec.abort();
  }, []);

  const showMsg = useCallback((type: "ok" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }, []);

  const fetchMenu = useCallback(async () => {
    const supabase = createClient();
    const { data: categories, error: catErr } = await supabase.from("categories").select("*").order("sort_order");
    if (catErr) {
      showMsg("error", `카테고리 조회 실패: ${catErr.message}`);
      setMenu([]);
      return;
    }
    if (!categories?.length) {
      setMenu([]);
      return;
    }
    const { data: items, error: itemErr } = await supabase.from("menu_items").select("*").order("sort_order");
    if (itemErr) {
      showMsg("error", `메뉴 조회 실패: ${itemErr.message}`);
      setMenu(categories.map((c) => ({ ...c, items: [] })));
      return;
    }
    setMenu(
      categories.map((cat) => ({
        ...cat,
        items: (items || []).filter((i: { category_id: string }) => i.category_id === cat.id),
      }))
    );
  }, [showMsg]);

  const sortItems = useCallback((mode: SortMode, category: CategoryWithItems) => {
    const items = [...category.items];
    if (mode === "manual") return items.sort((a, b) => a.sort_order - b.sort_order);
    if (mode === "price") return items.sort((a, b) => Number(a.price) - Number(b.price) || a.sort_order - b.sort_order);
    return items.sort((a, b) => a.name.localeCompare(b.name, "ko-KR") || a.sort_order - b.sort_order);
  }, []);

  const getSortedItems = useCallback((category: CategoryWithItems) => sortItems(sortMode, category), [sortItems, sortMode]);

  const applyAutoSortToCategory = useCallback(
    async (categoryId: string) => {
      if (sortMode === "manual") {
        showMsg("error", "현재 정렬 모드가 '수동'입니다. '가격' 또는 '가나다'를 선택한 뒤 적용하세요.");
        return;
      }
      const category = menu.find((c) => c.id === categoryId);
      if (!category) return;
      const sorted = sortItems(sortMode, category);
      const updates = sorted.map((item, idx) => ({ id: item.id, sort_order: idx + 1 }));
      const supabase = createClient();
      const { error } = await supabase.from("menu_items").upsert(updates, { onConflict: "id" });
      if (error) {
        showMsg("error", `정렬 저장 실패: ${error.message}`);
        return;
      }
      showMsg("ok", `'${category.name}' 정렬이 저장되었습니다.`);
      await fetchMenu();
    },
    [sortMode, menu, getSortedItems, fetchMenu, showMsg]
  );

  const applyAutoSortToAll = useCallback(async () => {
    if (sortMode === "manual") {
      showMsg("error", "현재 정렬 모드가 '수동'입니다. '가격' 또는 '가나다'를 선택한 뒤 적용하세요.");
      return;
    }
    const updates = menu.flatMap((category) => {
      const sorted = sortItems(sortMode, category);
      return sorted.map((item, idx) => ({ id: item.id, sort_order: idx + 1 }));
    });
    if (updates.length === 0) {
      showMsg("error", "정렬할 메뉴가 없습니다.");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("menu_items").upsert(updates, { onConflict: "id" });
    if (error) {
      showMsg("error", `정렬 저장 실패: ${error.message}`);
      return;
    }
    showMsg("ok", "전체 카테고리 정렬이 저장되었습니다.");
    await fetchMenu();
  }, [sortMode, menu, getSortedItems, fetchMenu, showMsg]);

  const moveItem = useCallback(
    async (categoryId: string, itemId: string, direction: -1 | 1) => {
      const category = menu.find((c) => c.id === categoryId);
      if (!category) return;
      const items = [...category.items].sort((a, b) => a.sort_order - b.sort_order);
      const idx = items.findIndex((i) => i.id === itemId);
      const swapIdx = idx + direction;
      if (idx === -1 || swapIdx < 0 || swapIdx >= items.length) return;
      const a = items[idx];
      const b = items[swapIdx];
      const supabase = createClient();
      const { error } = await supabase.from("menu_items").upsert(
        [
          { id: a.id, sort_order: b.sort_order },
          { id: b.id, sort_order: a.sort_order },
        ],
        { onConflict: "id" }
      );
      if (error) {
        showMsg("error", `순서 변경 실패: ${error.message}`);
        return;
      }
      await fetchMenu();
    },
    [menu, fetchMenu, showMsg]
  );

  useEffect(() => {
    fetchMenu().finally(() => setLoading(false));
  }, [fetchMenu]);

  const runCommand = useCallback(
    async (cmd: VoiceCommand) => {
      if (!cmd) return;
      const supabase = createClient();

      const findBestItem = (query: string) => {
        const q = normalizeMenuName(query);
        const allItems = menu.flatMap((c) => c.items);
        // 1순위: 정확히 일치
        const exact = allItems.find((item) => normalizeMenuName(item.name) === q);
        if (exact) return exact;
        // 2순위: 부분 일치 (가장 길게 겹치는 것, 단 query가 item에 포함되는 것보다 item이 query에 포함되는 것 우선)
        let best: { id: string; score: number } | null = null;
        for (const item of allItems) {
          const n = normalizeMenuName(item.name);
          if (n === q) continue; // 이미 위에서 처리
          // query가 item 이름을 포함 (ex: "헤이즐넛아메리카노".includes("아메리카노"))
          if (n.includes(q)) {
            const score = q.length * 10; // 낮은 우선순위
            if (!best || score > best.score) best = { id: item.id, score };
          }
          // item 이름이 query를 포함 (ex: "아메리카노".includes("아메리카"))
          if (q.includes(n) && n.length > 1) {
            const score = n.length * 20; // 높은 우선순위
            if (!best || score > best.score) best = { id: item.id, score };
          }
        }
        if (!best) return null;
        return allItems.find((i) => i.id === best!.id) ?? null;
      };

      try {
        if (cmd.type === "setSort") {
          setSortMode(cmd.mode);
          showMsg("ok", `정렬 모드: ${cmd.mode === "manual" ? "수동" : cmd.mode === "price" ? "가격순" : "가나다순"}`);
          return;
        }
        if (cmd.type === "delete") {
          const item = findBestItem(cmd.name);
          if (!item) {
            showMsg("error", `'${cmd.name}' 메뉴를 찾을 수 없습니다.`);
            return;
          }
          const { error } = await supabase.from("menu_items").delete().eq("id", item.id);
          if (error) throw error;
          showMsg("ok", `'${item.name}' 삭제됨`);
          await fetchMenu();
        } else if (cmd.type === "price") {
          const item = findBestItem(cmd.name);
          if (!item) {
            showMsg("error", `'${cmd.name}' 메뉴를 찾을 수 없습니다.`);
            return;
          }
          const { error } = await supabase.from("menu_items").update({ price: cmd.price }).eq("id", item.id);
          if (error) throw error;
          showMsg("ok", `'${item.name}' 가격 ${cmd.price}천원으로 변경`);
          await fetchMenu();
        } else if (cmd.type === "ice") {
          const item = findBestItem(cmd.name);
          if (!item) {
            showMsg("error", `'${cmd.name}' 메뉴를 찾을 수 없습니다.`);
            return;
          }
          const { error } = await supabase.from("menu_items").update({ has_ice: cmd.has_ice }).eq("id", item.id);
          if (error) throw error;
          showMsg("ok", `'${item.name}' 아이스 옵션 ${cmd.has_ice ? "추가" : "제거"}됨`);
          await fetchMenu();
        } else if (cmd.type === "saveSort") {
          if (cmd.scope === "all") {
            await applyAutoSortToAll();
          } else {
            const cat = menu.find((c) => c.name === cmd.category);
            if (!cat) {
              showMsg("error", `'${cmd.category}' 카테고리를 찾을 수 없습니다.`);
              return;
            }
            await applyAutoSortToCategory(cat.id);
          }
        } else if (cmd.type === "sortAndSave") {
          const mode = cmd.mode;
          if (cmd.scope === "all") {
            const updates = menu.flatMap((category) => {
              const sorted = sortItems(mode, category);
              return sorted.map((item, idx) => ({ id: item.id, sort_order: idx + 1 }));
            });
            if (updates.length === 0) {
              showMsg("error", "정렬할 메뉴가 없습니다.");
              return;
            }
            const { error } = await supabase.from("menu_items").upsert(updates, { onConflict: "id" });
            if (error) throw error;
            setSortMode(mode);
            showMsg("ok", `전체 메뉴를 ${mode === "price" ? "가격순" : "가나다순"}으로 정렬 저장`);
            await fetchMenu();
          } else {
            const cat = menu.find((c) => c.name === cmd.category);
            if (!cat) {
              showMsg("error", `'${cmd.category}' 카테고리를 찾을 수 없습니다.`);
              return;
            }
            const sorted = sortItems(mode, cat);
            const updates = sorted.map((item, idx) => ({ id: item.id, sort_order: idx + 1 }));
            const { error } = await supabase.from("menu_items").upsert(updates, { onConflict: "id" });
            if (error) throw error;
            setSortMode(mode);
            showMsg("ok", `'${cat.name}'를 ${mode === "price" ? "가격순" : "가나다순"}으로 정렬 저장`);
            await fetchMenu();
          }
        } else if (cmd.type === "bulkPrice") {
          if (cmd.scope === "all") {
            const allIds = menu.flatMap((c) => c.items).map((i) => i.id);
            if (allIds.length === 0) {
              showMsg("error", "변경할 메뉴가 없습니다.");
              return;
            }
            const { error } = await supabase.from("menu_items").update({ price: cmd.price }).in("id", allIds);
            if (error) throw error;
            showMsg("ok", `전체 메뉴 가격을 ${cmd.price}로 변경`);
            await fetchMenu();
          } else {
            const cat = menu.find((c) => c.name === cmd.category);
            if (!cat) {
              showMsg("error", `'${cmd.category}' 카테고리를 찾을 수 없습니다.`);
              return;
            }
            const { error } = await supabase.from("menu_items").update({ price: cmd.price }).eq("category_id", cat.id);
            if (error) throw error;
            showMsg("ok", `'${cmd.category}' 메뉴 가격을 ${cmd.price}로 변경`);
            await fetchMenu();
          }
        } else if (cmd.type === "rename") {
          const item = findBestItem(cmd.from);
          if (!item) {
            showMsg("error", `'${cmd.from}' 메뉴를 찾을 수 없습니다.`);
            return;
          }
          const newName = cmd.to.replace(/\s+/g, " ").trim();
          if (!newName) {
            showMsg("error", "변경할 새 이름이 비어있습니다.");
            return;
          }
          const { error } = await supabase.from("menu_items").update({ name: newName }).eq("id", item.id);
          if (error) throw error;
          showMsg("ok", `'${item.name}' → '${newName}'로 변경`);
          await fetchMenu();
        } else if (cmd.type === "move") {
          // 수동 정렬 기준으로 위/아래 이동 (해당 아이템의 카테고리를 찾아 그 안에서 swap)
          const item = findBestItem(cmd.name);
          if (!item) {
            showMsg("error", `'${cmd.name}' 메뉴를 찾을 수 없습니다.`);
            return;
          }
          const category = menu.find((c) => c.items.some((i) => i.id === item.id));
          if (!category) return;
          for (let k = 0; k < cmd.steps; k++) {
            await moveItem(category.id, item.id, cmd.direction);
          }
          showMsg("ok", `'${item.name}' ${cmd.direction === -1 ? "위로" : "아래로"} 이동`);
        } else if (cmd.type === "add") {
          const cat = menu.find((c) => c.name === cmd.category);
          if (!cat) {
            showMsg("error", `'${cmd.category}' 카테고리를 찾을 수 없습니다.`);
            return;
          }
          const existing = cat.items.find((i) => normalizeMenuName(i.name) === normalizeMenuName(cmd.name));
          if (existing) {
            const { error } = await supabase.from("menu_items").update({ price: cmd.price, ...(cmd.has_ice !== undefined ? { has_ice: cmd.has_ice } : {}) }).eq("id", existing.id);
            if (error) throw error;
            showMsg("ok", `'${cmd.name}' 가격 업데이트됨 (${cmd.category})`);
          } else {
            const maxOrder = Math.max(0, ...cat.items.map((i) => i.sort_order));
            const { error } = await supabase.from("menu_items").insert({
              category_id: cat.id,
              name: cmd.name,
              price: cmd.price,
              has_ice: cmd.has_ice ?? false,
              sort_order: maxOrder + 1,
            });
            if (error) throw error;
            showMsg("ok", `'${cmd.name}' 추가됨 (${cmd.category})${cmd.has_ice ? " [아이스 가능]" : ""}`);
          }
          await fetchMenu();
        } else if (cmd.type === "addNoPrice") {
          showMsg("error", `가격이 빠졌어요. 예: '추가 ${cmd.category} ${cmd.name} 4.0' 또는 '${cmd.category} ${cmd.name} 4천원 추가'`);
        }
      } catch (e) {
        showMsg("error", e instanceof Error ? e.message : "오류 발생");
      }
    },
    [menu, fetchMenu, applyAutoSortToAll, applyAutoSortToCategory, moveItem, showMsg, sortItems]
  );

  useEffect(() => {
    if (!lastTranscript) return;
    const transcript = lastTranscript;
    setLastTranscript("");
    setLastParsed("AI 해석 중...");

    fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: transcript,
        menuContext: menu.map((c) => ({ name: c.name, items: c.items.map((i) => i.name) })),
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        const cmd: VoiceCommand = data.cmd ?? null;
        if (cmd) {
          if (cmd.type === "delete") setLastParsed(`삭제: ${cmd.name}`);
          if (cmd.type === "price") setLastParsed(`가격변경: ${cmd.name} → ${cmd.price}`);
          if (cmd.type === "add") setLastParsed(`추가: [${cmd.category}] ${cmd.name} ${cmd.price}`);
          if (cmd.type === "addNoPrice") setLastParsed(`추가(가격 필요): [${cmd.category}] ${cmd.name}`);
          if (cmd.type === "rename") setLastParsed(`이름변경: ${cmd.from} → ${cmd.to}`);
          if (cmd.type === "bulkPrice") {
            if (cmd.scope === "all") setLastParsed(`일괄 가격변경: 전체 → ${cmd.price}`);
            else setLastParsed(`일괄 가격변경: ${cmd.category} → ${cmd.price}`);
          }
          if (cmd.type === "setSort") setLastParsed(`정렬 모드: ${cmd.mode}`);
          if (cmd.type === "saveSort") setLastParsed(`정렬 저장: ${cmd.scope === "all" ? "전체" : cmd.category}`);
          if (cmd.type === "sortAndSave") setLastParsed(`정렬+저장: ${cmd.scope === "all" ? "전체" : cmd.category} (${cmd.mode})`);
          if (cmd.type === "move") setLastParsed(`이동: ${cmd.name} ${cmd.direction === -1 ? "위로" : "아래로"} ${cmd.steps}칸`);
          runCommand(cmd);
        } else {
          setLastParsed(`해석 실패: "${transcript}"`);
          showMsg("error", data.message || "명령을 이해하지 못했어요.");
        }
      })
      .catch(() => {
        setLastParsed("AI 연결 오류");
        showMsg("error", "AI 서버에 연결할 수 없어요.");
      });
  }, [lastTranscript, runCommand, menu, showMsg]);

  const handleManualAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const { categoryId, name, price, hasIce } = addForm;
      if (!categoryId || !name.trim() || !price) return;
      const parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice)) return;
      const cat = menu.find((c) => c.id === categoryId);
      if (!cat) return;
      const maxOrder = Math.max(0, ...cat.items.map((i) => i.sort_order));
      const supabase = createClient();
      const { error } = await supabase.from("menu_items").insert({
        category_id: categoryId,
        name: name.trim(),
        price: parsedPrice,
        has_ice: hasIce,
        sort_order: maxOrder + 1,
      });
      if (error) { showMsg("error", `추가 실패: ${error.message}`); return; }
      showMsg("ok", `'${name.trim()}' 추가됨`);
      setAddForm((f) => ({ ...f, name: "", price: "", hasIce: false }));
      await fetchMenu();
    },
    [addForm, menu, fetchMenu, showMsg]
  );

  const handleManualDelete = useCallback(
    async (itemId: string, itemName: string) => {
      if (!confirm(`'${itemName}'을(를) 삭제할까요?`)) return;
      const supabase = createClient();
      const { error } = await supabase.from("menu_items").delete().eq("id", itemId);
      if (error) { showMsg("error", `삭제 실패: ${error.message}`); return; }
      showMsg("ok", `'${itemName}' 삭제됨`);
      await fetchMenu();
    },
    [fetchMenu, showMsg]
  );

  const toggleListening = () => {
    if (!recognition) return;
    if (listening) {
      recognition.stop();
      setListening(false);
    } else {
      setLastTranscript("");
      recognition.start();
      setListening(true);
    }
  };

  if (loading) {
    return (
      <main className="container">
        <p style={{ textAlign: "center" }}>로딩 중...</p>
      </main>
    );
  }

  return (
    <main className="container">
      <h1 className="page-title">관리자</h1>

      {/* ── 음성 제어 ── */}
      <p style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.9rem", marginBottom: "0.75rem" }}>
        자연스럽게 말씀해 주세요.&nbsp; 예: &quot;아메리카노 지워줘&quot;, &quot;바닐라라떼 4500원으로 바꿔줘&quot;
      </p>
      <div style={{ textAlign: "center", marginBottom: "0.75rem" }}>
        <button
          type="button"
          onClick={toggleListening}
          style={{
            padding: "0.65rem 1.4rem",
            fontSize: "1rem",
            borderRadius: "8px",
            border: "none",
            background: listening ? "#c44" : "var(--accent)",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {listening ? "🎤 음성 끄기" : "🎤 음성 켜기"}
        </button>
      </div>
      {message && (
        <p
          style={{
            textAlign: "center",
            padding: "0.5rem",
            background: message.type === "ok" ? "#e8f5e9" : "#ffebee",
            color: message.type === "ok" ? "#2e7d32" : "#c62828",
            borderRadius: "8px",
            marginBottom: "0.75rem",
          }}
        >
          {message.text}
        </p>
      )}
      {lastTranscript && (
        <p style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 0.25rem" }}>
          들린 말: {lastTranscript}
        </p>
      )}
      {lastParsed && (
        <p style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 1rem" }}>
          해석: {lastParsed}
        </p>
      )}

      {/* ── 메뉴 직접 추가 ── */}
      <form
        onSubmit={handleManualAdd}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          alignItems: "center",
          background: "var(--card-bg, #fff)",
          border: "1px solid var(--border, #e0d8d0)",
          borderRadius: "8px",
          padding: "0.85rem 1rem",
          marginBottom: "1.5rem",
        }}
      >
        <strong style={{ fontSize: "0.9rem", marginRight: "0.25rem" }}>＋ 메뉴 추가</strong>
        <select
          value={addForm.categoryId}
          onChange={(e) => setAddForm((f) => ({ ...f, categoryId: e.target.value }))}
          required
          style={{ padding: "0.35rem 0.5rem", borderRadius: "4px", border: "1px solid var(--border, #e0d8d0)", fontSize: "0.9rem" }}
        >
          <option value="">카테고리</option>
          {menu.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="메뉴 이름"
          value={addForm.name}
          onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
          required
          style={{ padding: "0.35rem 0.5rem", borderRadius: "4px", border: "1px solid var(--border, #e0d8d0)", fontSize: "0.9rem", minWidth: "110px" }}
        />
        <input
          type="number"
          placeholder="가격 (천원)"
          value={addForm.price}
          onChange={(e) => setAddForm((f) => ({ ...f, price: e.target.value }))}
          required
          step="0.1"
          min="0"
          style={{ padding: "0.35rem 0.5rem", borderRadius: "4px", border: "1px solid var(--border, #e0d8d0)", fontSize: "0.9rem", width: "110px" }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.9rem", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={addForm.hasIce}
            onChange={(e) => setAddForm((f) => ({ ...f, hasIce: e.target.checked }))}
          />
          아이스
        </label>
        <button
          type="submit"
          style={{ padding: "0.35rem 0.9rem", borderRadius: "4px", border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }}
        >
          추가
        </button>
      </form>

      {/* ── 메뉴 목록 (2열, 가격순) ── */}
      <div className="menu-grid">
        {menu.map((category) => {
          const sortedByOrder = [...category.items].sort((a, b) => a.sort_order - b.sort_order);
          const displayItems = [...category.items].sort(
            (a, b) => Number(a.price) - Number(b.price) || a.name.localeCompare(b.name, "ko-KR")
          );
          return (
            <section key={category.id} className="menu-card">
              <h2 className="category-title">{category.name}</h2>
              <ul className="menu-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {displayItems.map((item) => {
                  const orderIdx = sortedByOrder.findIndex((i) => i.id === item.id);
                  return (
                    <li key={item.id} className="menu-item" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.25rem" }}>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <span className="menu-item-name" style={{ flex: 1 }}>{item.name}</span>
                        <span className="menu-item-dots" />
                        <span className="menu-item-price">
                          {item.has_ice ? (
                            <>
                              <span className="price-hot">H {formatPrice(Number(item.price))}</span>
                              <span className="price-sep"> / </span>
                              <span className="price-ice">I {formatPrice(Number(item.price) + 0.5)}</span>
                            </>
                          ) : (
                            formatPrice(Number(item.price))
                          )}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "0.25rem", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={() => moveItem(category.id, item.id, -1)}
                          disabled={orderIdx === 0}
                          style={{ padding: "0.1rem 0.45rem", fontSize: "0.75rem", borderRadius: "3px", border: "1px solid var(--border, #e0d8d0)", background: "transparent", cursor: orderIdx === 0 ? "default" : "pointer", opacity: orderIdx === 0 ? 0.3 : 1 }}
                          title="위로"
                        >↑</button>
                        <button
                          type="button"
                          onClick={() => moveItem(category.id, item.id, 1)}
                          disabled={orderIdx === sortedByOrder.length - 1}
                          style={{ padding: "0.1rem 0.45rem", fontSize: "0.75rem", borderRadius: "3px", border: "1px solid var(--border, #e0d8d0)", background: "transparent", cursor: orderIdx === sortedByOrder.length - 1 ? "default" : "pointer", opacity: orderIdx === sortedByOrder.length - 1 ? 0.3 : 1 }}
                          title="아래로"
                        >↓</button>
                        <button
                          type="button"
                          onClick={() => handleManualDelete(item.id, item.name)}
                          style={{ padding: "0.1rem 0.45rem", fontSize: "0.75rem", borderRadius: "3px", border: "1px solid #fca5a5", background: "transparent", color: "#c62828", cursor: "pointer" }}
                          title="삭제"
                        >✕</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <Link href="/" className="admin-link">
        ← 메뉴판 보기
      </Link>
    </main>
  );
}
