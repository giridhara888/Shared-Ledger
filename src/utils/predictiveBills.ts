import { ITransaction } from '../models/Transaction';
import { Types } from 'mongoose';

/**
 * Predictive Recurring Bill Alerts 
 * Identifies monthly patterns in the transaction history 
 * and returns a list of "Upcoming Estimated Bills".
 */

export interface EstimatedBill {
  category: string;
  description: string;
  amountInr: number;
  expectedDate: Date;
  confidence: 'High' | 'Medium' | 'Low';
}

export const getPredictiveBills = (transactions: ITransaction[]): EstimatedBill[] => {
  // Simple algorithm: Group by description/category, look for transactions
  // that happen roughly ~30 days apart.
  
  const grouped = new Map<string, ITransaction[]>();
  
  transactions.forEach(t => {
    // Basic grouping key
    const key = `${t.category}_${t.description.toLowerCase()}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(t);
  });

  const upcomingBills: EstimatedBill[] = [];
  const today = new Date();

  grouped.forEach((txs, key) => {
    if (txs.length >= 2) {
      // Sort chronologically
      txs.sort((a, b) => a.date.getTime() - b.date.getTime());
      
      const latestTxs = txs.slice(-3); // look at last 3 to find pattern
      const diffs: number[] = [];
      
      for (let i = 1; i < latestTxs.length; i++) {
        const diffDays = Math.round((latestTxs[i].date.getTime() - latestTxs[i - 1].date.getTime()) / (1000 * 60 * 60 * 24));
        diffs.push(diffDays);
      }

      // If average diff is around 28-31 days, it's a monthly bill
      const avgDiff = diffs.reduce((sum, d) => sum + d, 0) / diffs.length;
      
      if (avgDiff >= 25 && avgDiff <= 35) {
        const lastTx = latestTxs[latestTxs.length - 1];
        const nextExpectedDate = new Date(lastTx.date);
        nextExpectedDate.setDate(nextExpectedDate.getDate() + Math.round(avgDiff));
        
        // Only if it's coming up in the future (or very recently overdue)
        if (nextExpectedDate >= new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000)) {
           upcomingBills.push({
             category: lastTx.category,
             description: lastTx.description,
             amountInr: lastTx.inrEquivalent,
             expectedDate: nextExpectedDate,
             confidence: txs.length >= 3 ? 'High' : 'Medium'
           });
        }
      }
    }
  });

  return upcomingBills.sort((a, b) => a.expectedDate.getTime() - b.expectedDate.getTime());
};
