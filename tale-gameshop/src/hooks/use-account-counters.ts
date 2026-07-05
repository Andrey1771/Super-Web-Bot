import { useEffect, useState } from 'react';
import container from '../inversify.config';
import IDENTIFIERS from '../constants/identifiers';
import type { IGameKeysService } from '../iterfaces/i-game-keys-service';
import { fetchAccountOrders } from '../api/accountApi';
import { listSupportTickets } from '../features/account/support/supportApi';

// Живые счётчики для сайдбара кабинета (заказы/ключи/«поддержка ответила»).
// Кеш на минуту: навигация по разделам не должна дёргать три API на каждый переход.

export type AccountCounters = {
    orders: number;
    keys: number;
    ticketsAwaitingReply: number;
};

const TTL_MS = 60_000;
let cache: { value: AccountCounters; at: number } | null = null;
let inflight: Promise<AccountCounters> | null = null;

const isWaitingForUser = (status: string | number) => status === 'WaitingForUser' || status === 1;

const loadCounters = (): Promise<AccountCounters> => {
    if (cache && Date.now() - cache.at < TTL_MS) {
        return Promise.resolve(cache.value);
    }
    if (!inflight) {
        inflight = (async () => {
            const [orders, keys, tickets] = await Promise.allSettled([
                fetchAccountOrders({ page: 1, pageSize: 1, status: 'all', sort: 'newest' }),
                container.get<IGameKeysService>(IDENTIFIERS.IGameKeysService).getKeys(50),
                listSupportTickets()
            ]);
            const value: AccountCounters = {
                orders:
                    orders.status === 'fulfilled'
                        ? ((orders.value as any).totalItems ?? (orders.value as any).totalCount ?? 0)
                        : 0,
                keys: keys.status === 'fulfilled' ? keys.value.length : 0,
                ticketsAwaitingReply:
                    tickets.status === 'fulfilled'
                        ? tickets.value.filter((ticket) => isWaitingForUser(ticket.status)).length
                        : 0
            };
            cache = { value, at: Date.now() };
            inflight = null;
            return value;
        })();
    }
    return inflight;
};

export const invalidateAccountCounters = () => {
    cache = null;
};

export const useAccountCounters = () => {
    const [counters, setCounters] = useState<AccountCounters | null>(cache?.value ?? null);

    useEffect(() => {
        let active = true;
        loadCounters()
            .then((value) => {
                if (active) {
                    setCounters(value);
                }
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, []);

    return counters;
};
