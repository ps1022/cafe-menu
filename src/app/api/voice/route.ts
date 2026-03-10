import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `당신은 카페 메뉴 관리 앱의 음성 명령을 분석하는 도우미입니다.

현재 카테고리: {categories}
현재 메뉴 (카테고리/메뉴명): {menuItems}

사용자의 음성 명령을 분석해서 아래 JSON 형식 중 하나로만 반환하세요.
- 가격은 반드시 천원 단위 소수점 숫자로 반환하세요. (4500원 → 4.5, 5000원 → 5, 3000원 → 3)
- 메뉴 이름은 현재 메뉴 목록에 있는 것과 최대한 가깝게 매칭하세요.
- 카테고리명은 현재 카테고리 목록에서 가장 유사한 것을 사용하세요.
- 명령을 이해할 수 없으면 null을 반환하세요.
- JSON만 반환하고 다른 텍스트는 절대 포함하지 마세요.

지원 명령 형식:
{"type":"delete","name":"메뉴이름"}
{"type":"add","category":"카테고리명","name":"메뉴이름","price":숫자}
{"type":"price","name":"메뉴이름","price":숫자}
{"type":"rename","from":"기존이름","to":"새이름"}
{"type":"bulkPrice","scope":"all","price":숫자}
{"type":"bulkPrice","scope":"category","category":"카테고리명","price":숫자}
{"type":"setSort","mode":"manual"}
{"type":"setSort","mode":"price"}
{"type":"setSort","mode":"name"}
{"type":"saveSort","scope":"all"}
{"type":"saveSort","scope":"category","category":"카테고리명"}
{"type":"move","name":"메뉴이름","direction":-1,"steps":칸수}
{"type":"move","name":"메뉴이름","direction":1,"steps":칸수}

음성 명령:`;

export async function POST(req: NextRequest) {
  try {
    const { text, menuContext } = await req.json();

    if (!text?.trim()) {
      return NextResponse.json({ cmd: null, message: "빈 텍스트" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ cmd: null, message: "API 키가 설정되지 않았습니다." }, { status: 500 });
    }

    const categories = (menuContext as { name: string; items: string[] }[])
      ?.map((c) => c.name).join(", ") ?? "";
    const menuItems = (menuContext as { name: string; items: string[] }[])
      ?.flatMap((c) => c.items.map((item) => `${c.name}/${item}`)).join(", ") ?? "";

    const prompt =
      SYSTEM_PROMPT
        .replace("{categories}", categories || "없음")
        .replace("{menuItems}", menuItems || "없음") +
      ` "${text}"`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
      }
    );

    if (!res.ok) {
      console.error("Gemini error:", await res.text());
      return NextResponse.json({ cmd: null, message: "AI 서버 오류" }, { status: 500 });
    }

    const data = await res.json();
    const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "null";
    const cmd = JSON.parse(rawText);

    return NextResponse.json({ cmd: cmd ?? null });
  } catch (e) {
    console.error("Voice route error:", e);
    return NextResponse.json({ cmd: null, message: "처리 중 오류 발생" }, { status: 500 });
  }
}
