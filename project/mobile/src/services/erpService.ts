import { supabase } from '@lib/supabase';
import { ApiError, toApiError } from '@lib/errors';
import type {
  Product,
  ProductDetail,
  ProductImage,
  Branch,
  Warehouse,
  ERPNotification,
  Category,
  DashboardSummary,
} from '@apptypes/erp';
import { APP_CONFIG } from '@constants';

// ============================================================
// Dashboard Service — reuses v_dashboard_summary view
// ============================================================

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  // Reuse the existing BI view for low_stock_count (per-product threshold)
  const [summaryRes, productsRes, branchesRes, warehousesRes] = await Promise.all([
    supabase.from('v_dashboard_summary').select('low_stock_count').limit(1).maybeSingle(),
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('branches').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('warehouses').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ]);

  const errors = [summaryRes, productsRes, branchesRes, warehousesRes].filter((r) => r.error);
  if (errors.length > 0) throw toApiError(errors[0]!.error);

  // Out-of-stock: stock <= 0
  const outStockRes = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .lte('stock', 0);
  if (outStockRes.error) throw toApiError(outStockRes.error);

  const summaryRow = summaryRes.data as { low_stock_count: number } | null;

  return {
    total_products: productsRes.count ?? 0,
    low_stock_count: summaryRow?.low_stock_count ?? 0,
    out_of_stock_count: outStockRes.count ?? 0,
    total_branches: branchesRes.count ?? 0,
    total_warehouses: warehousesRes.count ?? 0,
  };
}

export async function fetchRecentNotifications(userId: string, limit = 5): Promise<ERPNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .or(`user_id.eq.${userId},user_id.is.null`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw toApiError(error);
  return (data ?? []) as ERPNotification[];
}

// ============================================================
// Products Service
// ============================================================

const PRODUCT_SELECT = `
  *,
  categories!inner(name, slug),
  brands(name, slug),
  product_images(id, url, alt, sort_order)
`;

export interface ProductListItem extends Product {
  category_name: string | null;
  category_slug: string | null;
  brand_name: string | null;
  brand_slug: string | null;
  image_url: string | null;
}

export interface ProductListResult {
  items: ProductListItem[];
  nextCursor: string | null;
}

export async function fetchProducts(opts: {
  search?: string;
  categoryId?: string;
  cursor?: string | null;
  limit?: number;
}): Promise<ProductListResult> {
  const limit = opts.limit ?? APP_CONFIG.itemsPerPage;
  let query = supabase.from('products').select(PRODUCT_SELECT, { count: 'exact' }).eq('is_active', true);

  if (opts.search) {
    query = query.or(`name.ilike.%${opts.search}%,sku.ilike.%${opts.search}%,barcode.ilike.%${opts.search}%`);
  }
  if (opts.categoryId) {
    query = query.eq('category_id', opts.categoryId);
  }
  if (opts.cursor) {
    query = query.lt('created_at', opts.cursor);
  }

  query = query.order('created_at', { ascending: false }).limit(limit + 1);

  const { data, error } = await query;
  if (error) throw toApiError(error);

  const rows = (data ?? []) as unknown as Array<Product & {
    categories: { name: string; slug: string } | null;
    brands: { name: string; slug: string } | null;
    product_images: ProductImage[];
  }>;

  const items: ProductListItem[] = rows.slice(0, limit).map((row) => {
    const sortedImages = [...(row.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    return {
      ...row,
      category_name: row.categories?.name ?? null,
      category_slug: row.categories?.slug ?? null,
      brand_name: row.brands?.name ?? null,
      brand_slug: row.brands?.slug ?? null,
      image_url: sortedImages[0]?.url ?? null,
    };
  });

  const nextCursor = rows.length > limit ? rows[limit - 1]!.created_at : null;

  return { items, nextCursor };
}

export async function fetchProductById(id: string): Promise<ProductDetail> {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) throw toApiError(error);
  if (!data) throw new ApiError('Product not found.');

  const row = data as unknown as Product & {
    categories: { name: string; slug: string } | null;
    brands: { name: string; slug: string } | null;
    product_images: ProductImage[];
  };

  const images: ProductImage[] = [...(row.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  return {
    ...row,
    category_name: row.categories?.name ?? null,
    category_slug: row.categories?.slug ?? null,
    brand_name: row.brands?.name ?? null,
    brand_slug: row.brands?.slug ?? null,
    images,
  };
}

// ============================================================
// Categories Service
// ============================================================

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw toApiError(error);
  return (data ?? []) as Category[];
}

// ============================================================
// Branches & Warehouses Service
// ============================================================

export async function fetchBranches(): Promise<Branch[]> {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) throw toApiError(error);
  return (data ?? []) as Branch[];
}

export async function fetchWarehouses(): Promise<Warehouse[]> {
  const { data, error } = await supabase
    .from('warehouses')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) throw toApiError(error);
  return (data ?? []) as Warehouse[];
}
