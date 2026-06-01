/**
 * Simplified Debt Settlement Algorithm.
 * Minimizes the number of transactions needed to clear debts among roommates.
 */
export interface Debt {
  from: string;
  to: string;
  amount: number;
}

export const settleUp = (balances: Map<string, number>): Debt[] => {
  // 1. Calculate net balance for each person
  const netBalances = new Map<string, number>();

  for (const [key, amount] of balances.entries()) {
    const [user1, user2] = key.split('_');
    // amount > 0 means user1 owes user2
    const currentNet1 = netBalances.get(user1) || 0;
    const currentNet2 = netBalances.get(user2) || 0;

    netBalances.set(user1, currentNet1 - amount);
    netBalances.set(user2, currentNet2 + amount);
  }

  // 2. Separate into debtors and creditors
  const debtors: { user: string; amount: number }[] = [];
  const creditors: { user: string; amount: number }[] = [];

  for (const [user, netAmount] of netBalances.entries()) {
    if (netAmount < -0.01) {
      debtors.push({ user, amount: Math.abs(netAmount) });
    } else if (netAmount > 0.01) {
      creditors.push({ user, amount: netAmount });
    }
  }

  // Sort them so larger debts are settled first
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  // 3. Match debtors and creditors
  const settlements: Debt[] = [];
  let i = 0; // debtor index
  let j = 0; // creditor index

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const settledAmount = Math.min(debtor.amount, creditor.amount);

    settlements.push({
      from: debtor.user,
      to: creditor.user,
      amount: parseFloat(settledAmount.toFixed(2)) // keep it clean
    });

    debtor.amount -= settledAmount;
    creditor.amount -= settledAmount;

    if (debtor.amount < 0.01) i++;
    if (creditor.amount < 0.01) j++;
  }

  return settlements;
};
