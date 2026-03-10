import Link from "next/link";
import { createClient } from "@/lib/supabase";
import type { CategoryWithItems } from "@/types/menu";

export const dynamic = "force-dynamic";

async function getMenu(): Promise<CategoryWithItems[]> {
  const supabase = createClient();
  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order");
  if (!categories?.length) return [];

  const { data: items } = await supabase
    .from("menu_items")
    .select("*")
    .order("sort_order");

  return (categories || []).map((cat) => ({
    ...cat,
    items: (items || [])
      .filter((i) => i.category_id === cat.id)
      .sort((a, b) => Number(a.price) - Number(b.price) || a.name.localeCompare(b.name, "ko-KR")),
  }));
}

function formatPrice(price: number) {
  return `${price.toFixed(1)}천`;
}

export default async function MenuPage() {
  const menu = await getMenu();

  return (
    <main className="container">
      <div className="page-header">
        <h1 className="page-title">카페 봄</h1>
        <p className="page-subtitle">Cafe Spring &nbsp;&bull;&nbsp; Menu</p>
      </div>
      {menu.length === 0 ? (
        <p style={{ textAlign: "center", color: "var(--muted)" }}>
          메뉴가 없습니다. Supabase에서 SQL을 실행했는지 확인해 주세요.
        </p>
      ) : (
        <div className="menu-grid">
          {menu.map((category) => (
            <section key={category.id} className="menu-card">
              <h2 className="category-title">{category.name}</h2>
              <ul className="menu-list">
                {category.items.map((item) => (
                  <li key={item.id} className="menu-item">
                    <span className="menu-item-name">
                      {item.tag && (
                        <span className={item.tag === "베스트" ? "item-tag item-tag-best" : "item-tag item-tag-sig"}>
                          {item.tag === "베스트" ? "BEST" : "SIGNATURE"}
                        </span>
                      )}
                      {item.name}
                    </span>
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
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <div className="footer-deco">♥ &nbsp; THANK YOU &nbsp; ♥</div>
      <Link href="/admin" className="admin-link">
        ⚙ 관리자
      </Link>
    </main>
  );
}
