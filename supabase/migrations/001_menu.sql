-- 카테고리 테이블
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0
);

-- 메뉴 항목 테이블 (같은 카테고리 내 동일 이름 방지)
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE(category_id, name)
);

-- RLS 활성화 (선택: 공개 읽기만 허용하려면 아래 정책 사용)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

-- 모든 사용자 읽기 허용
CREATE POLICY "categories read" ON categories FOR SELECT USING (true);
CREATE POLICY "menu_items read" ON menu_items FOR SELECT USING (true);

-- 모든 사용자 쓰기 허용 (관리자 페이지에서 사용). 보안 강화 시 나중에 인증 추가
CREATE POLICY "categories all" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "menu_items all" ON menu_items FOR ALL USING (true) WITH CHECK (true);

-- 샘플 데이터: 카테고리
INSERT INTO categories (name, sort_order) VALUES
  ('커피', 1),
  ('라떼', 2),
  ('프라페', 3)
ON CONFLICT (name) DO NOTHING;

-- 샘플 데이터: 메뉴 (category name으로 id 찾기)
INSERT INTO menu_items (category_id, name, price, sort_order)
SELECT c.id, '에스프레소', 3.5, 1 FROM categories c WHERE c.name = '커피'
UNION ALL SELECT c.id, '아메리카노', 3.5, 2 FROM categories c WHERE c.name = '커피'
UNION ALL SELECT c.id, '헤이즐넛 아메리카노', 3.5, 3 FROM categories c WHERE c.name = '커피'
UNION ALL SELECT c.id, '카페라떼', 4.0, 4 FROM categories c WHERE c.name = '커피'
UNION ALL SELECT c.id, '바닐라라떼', 4.5, 5 FROM categories c WHERE c.name = '커피'
UNION ALL SELECT c.id, '카라멜마끼아또', 4.5, 6 FROM categories c WHERE c.name = '커피'
UNION ALL SELECT c.id, '고구마라떼', 4.5, 1 FROM categories c WHERE c.name = '라떼'
UNION ALL SELECT c.id, '밤 라떼', 4.5, 2 FROM categories c WHERE c.name = '라떼'
UNION ALL SELECT c.id, '녹차 프라페', 5.0, 1 FROM categories c WHERE c.name = '프라페'
UNION ALL SELECT c.id, '쿠키앤크림프라페', 5.0, 2 FROM categories c WHERE c.name = '프라페'
ON CONFLICT (category_id, name) DO NOTHING;
