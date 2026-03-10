import Link from "next/link";
import { createClient } from "@/lib/supabase";
import type { CategoryWithItems } from "@/types/menu";

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
    items: (items || []).filter((i) => i.category_id === cat.id),
  }));
}

export default async function MenuPage() {
  const menu = await getMenu();

  return (
    <main className="container">
      <h1 className="page-title">메뉴판</h1>
      {menu.length === 0 ? (
        <p style={{ textAlign: "center", color: "var(--muted)" }}>
          메뉴가 없습니다. Supabase에서 SQL을 실행했는지 확인해 주세요.
        </p>
      ) : (
        menu.map((category) => (
          <section key={category.id} className="menu-card">
            <h2 className="category-title">{category.name}</h2>
            <ul className="menu-list">
              {category.items.map((item) => (
                <li key={item.id} className="menu-item">
                  <span className="menu-item-name">{item.name}</span>
                  <span className="menu-item-price">{Number(item.price).toFixed(1)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <Link href="/admin" className="admin-link">
        관리자 →
      </Link>
    </main>
  );
}
