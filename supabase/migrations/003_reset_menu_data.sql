-- Reset all menu data to base configuration
-- Categories: 커피, 주스, 티 / All items: 5,000원 (5.0 in thousands)

TRUNCATE TABLE menu_items RESTART IDENTITY CASCADE;
TRUNCATE TABLE categories RESTART IDENTITY CASCADE;

INSERT INTO categories (name, sort_order) VALUES
  ('커피', 1),
  ('주스', 2),
  ('티',   3);

INSERT INTO menu_items (category_id, name, price, has_ice, sort_order)
SELECT id, '에스프레소', 5.0, false, 1 FROM categories WHERE name = '커피'
UNION ALL
SELECT id, '아메리카노', 5.0, false, 2 FROM categories WHERE name = '커피'
UNION ALL
SELECT id, '카페라떼',   5.0, false, 3 FROM categories WHERE name = '커피'
UNION ALL
SELECT id, '카푸치노',   5.0, false, 4 FROM categories WHERE name = '커피'
UNION ALL
SELECT id, '수박',  5.0, false, 1 FROM categories WHERE name = '주스'
UNION ALL
SELECT id, '자몽',  5.0, false, 2 FROM categories WHERE name = '주스'
UNION ALL
SELECT id, '오렌지', 5.0, false, 3 FROM categories WHERE name = '주스'
UNION ALL
SELECT id, '얼그레이',  5.0, false, 1 FROM categories WHERE name = '티'
UNION ALL
SELECT id, '자스민',    5.0, false, 2 FROM categories WHERE name = '티'
UNION ALL
SELECT id, '페퍼민트',  5.0, false, 3 FROM categories WHERE name = '티';
