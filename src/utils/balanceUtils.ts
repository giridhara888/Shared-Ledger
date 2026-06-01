import { Household } from '../models/Household';

/**
 * Normalizes balance key to ensure consistent representation.
 * Always returns id1_id2 where id1 < id2.
 */
export const getBalanceKey = (userId1: string, userId2: string): string => {
  return userId1 < userId2 ? `${userId1}_${userId2}` : `${userId2}_${userId1}`;
};

/**
 * Calculates current amount user owes to another user.
 * Positive means fromUser owes toUser.
 * Negative means toUser owes fromUser.
 */
export const getAmountOwed = (balances: Map<string, number>, fromUser: string, toUser: string): number => {
  const key = getBalanceKey(fromUser, toUser);
  const val = balances.get(key) || 0;
  return fromUser < toUser ? val : -val;
};

/**
 * Updates amount owed in the balances map.
 */
export const addDebt = (balances: Map<string, number>, debtorUser: string, creditorUser: string, amount: number) => {
  if (debtorUser === creditorUser) return;
  const key = getBalanceKey(debtorUser, creditorUser);
  const currentVal = balances.get(key) || 0;
  
  const impact = debtorUser < creditorUser ? amount : -amount;
  balances.set(key, currentVal + impact);
};
