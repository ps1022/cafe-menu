-- 메뉴 아이템에 태그 컬럼 추가 (베스트 / 시그니처)
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS tag TEXT CHECK (tag IN ('베스트', '시그니처') OR tag IS NULL);
