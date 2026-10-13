import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';

export const isMember = (me) => me?.state === 'member' || me?.state === 'owner';
export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: 60_000 });
}
export function usePlans(enabled) {
  return useQuery({ queryKey: ['plans'], queryFn: api.listPlans, enabled });
}
export function useStats(enabled) {
  const tz = browserTimeZone();
  return useQuery({ queryKey: ['stats', tz], queryFn: () => api.stats(tz), enabled });
}
