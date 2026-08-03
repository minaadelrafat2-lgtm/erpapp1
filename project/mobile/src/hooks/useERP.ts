import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchDashboardSummary,
  fetchRecentNotifications,
  fetchProducts,
  fetchProductById,
  fetchCategories,
  type ProductListResult,
} from '@services/erpService';
import { APP_CONFIG } from '@constants';
import type { DashboardSummary, ERPNotification, Category } from '@apptypes/erp';
import type { Product, ProductDetail } from '@apptypes/erp';

// ============================================================
// Query Keys
// ============================================================

export const erpKeys = {
  dashboard: ['erp', 'dashboard'] as const,
  notifications: (limit: number) => ['erp', 'notifications', limit] as const,
  products: ['erp', 'products'] as const,
  productsList: (search: string, categoryId: string | null) => ['erp', 'products', 'list', search, categoryId] as const,
  product: (id: string) => ['erp', 'products', 'detail', id] as const,
  categories: ['erp', 'categories'] as const,
};

// ============================================================
// Dashboard Hooks
// ============================================================

export function useDashboardSummary() {
  return useQuery<DashboardSummary>({
    queryKey: erpKeys.dashboard,
    queryFn: fetchDashboardSummary,
    staleTime: 60_000,
  });
}

export function useRecentNotifications(limit = 5) {
  return useQuery<ERPNotification[]>({
    queryKey: erpKeys.notifications(limit),
    queryFn: () => fetchRecentNotifications(limit),
    staleTime: 30_000,
  });
}

// ============================================================
// Product Hooks
// ============================================================

export function useProducts(search: string, categoryId: string | null) {
  return useInfiniteQuery<ProductListResult>({
    queryKey: erpKeys.productsList(search, categoryId ?? 'all'),
    queryFn: ({ pageParam }) =>
      fetchProducts({
        search: search || undefined,
        categoryId: categoryId ?? undefined,
        cursor: (pageParam as string | null) ?? null,
        limit: APP_CONFIG.itemsPerPage,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 30_000,
  });
}

export function useProduct(id: string | null) {
  return useQuery<ProductDetail>({
    queryKey: erpKeys.product(id ?? ''),
    queryFn: () => fetchProductById(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}

// ============================================================
// Category Hooks
// ============================================================

export function useCategories() {
  return useQuery<Category[]>({
    queryKey: erpKeys.categories,
    queryFn: fetchCategories,
    staleTime: 5 * 60_000,
  });
}

// ============================================================
// Refresh Helper
// ============================================================

export function useRefreshERP() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ['erp'] });
  };
}
