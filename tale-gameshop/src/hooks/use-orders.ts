import { useCallback, useEffect, useState } from 'react';
import { fetchAccountOrders } from '../api/accountApi';
import type { AccountOrderListItem, FetchAccountOrdersParams } from '../types/account-orders';

type UseOrdersOptions = {
  limit?: number | null;
  page?: number;
  pageSize?: number;
  status?: FetchAccountOrdersParams['status'];
  q?: string;
  sort?: FetchAccountOrdersParams['sort'];
};

export const useOrders = (options: UseOrdersOptions = {}) => {
  const {
    limit = null,
    page = 1,
    pageSize = 10,
    status = 'all',
    q = '',
    sort = 'newest',
  } = options;

  const [items, setItems] = useState<AccountOrderListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAccountOrders({
        page,
        pageSize,
        status,
        q,
        sort,
      });

      const nextItems = limit === null ? data.items : data.items.slice(0, limit);
      setItems(nextItems);
      setTotalCount(data.totalItems);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error('Failed to load account orders:', err);
      setError('Unable to load orders.');
      setItems([]);
      setTotalCount(0);
      setTotalPages(0);
    } finally {
      setIsLoading(false);
    }
  }, [limit, page, pageSize, q, sort, status]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    items,
    totalCount,
    totalPages,
    isLoading,
    error,
    reload: load,
  };
};
