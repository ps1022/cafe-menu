-- menu_items에 has_ice 컬럼 추가 (true면 아이스 옵션 있음 → +0.5 천원)
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS has_ice BOOLEAN NOT NULL DEFAULT false;
