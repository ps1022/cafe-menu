export type Category = {
  id: string;
  name: string;
  sort_order: number;
};

export type MenuItem = {
  id: string;
  category_id: string;
  name: string;
  price: number;
  sort_order: number;
  has_ice: boolean;
  tag?: "베스트" | "시그니처" | null;
  category?: Category;
};

export type CategoryWithItems = Category & {
  items: MenuItem[];
};
