import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Transaction } from '../models/Transaction';
import { Household } from '../models/Household';
import { addDebt } from '../utils/balanceUtils';
import { getInrEquivalent } from '../services/cryptoService';

export const addTransaction = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const { householdId, paidBy, splitAmong, splits, amount, currency, description, category, date, receiptImage } = req.body;

      if (!householdId || !paidBy || (!splitAmong && !splits) || amount <= 0) {
        throw new Error('Invalid transaction data');
      }

      // 1. Get INR equivalent if it's Crypto
      const inrEquivalent = await getInrEquivalent(amount, currency);

      // 2. Create Transaction
      const transaction = new Transaction({
        householdId,
        paidBy,
        splitAmong: splitAmong || splits?.map((s: any) => s.user),
        splits,
        amount,
        currency,
        inrEquivalent,
        description,
        category,
        date: date || new Date(),
        receiptImage
      });

      await transaction.save({ session });

      // 3. Update Household balances
      const household = await Household.findById(householdId).session(session);
      if (!household) {
        throw new Error('Household not found');
      }

      if (!household.balances) {
        household.balances = new Map();
      }

      if (splits && splits.length > 0) {
        let totalSplitAmount = 0;
        for (const split of splits) {
          totalSplitAmount += split.amount;
        }
        
        const conversionRate = inrEquivalent / amount;

        for (const split of splits) {
          const debtorId = split.user.toString();
          if (debtorId !== paidBy.toString()) {
            const splitAmountInr = split.amount * conversionRate;
            addDebt(household.balances, debtorId, paidBy.toString(), splitAmountInr);
          }
        }
      } else if (splitAmong && splitAmong.length > 0) {
        const splitAmountInr = inrEquivalent / splitAmong.length;
        for (const debtorId of splitAmong) {
          if (debtorId.toString() !== paidBy.toString()) {
            addDebt(household.balances, debtorId.toString(), paidBy.toString(), splitAmountInr);
          }
        }
      }

      await household.save({ session });
      result = transaction;
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  } finally {
    session.endSession();
  }
};

export const updateTransaction = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const { id } = req.params;
      const { paidBy, splitAmong, splits, amount, currency, description, category, date, receiptImage } = req.body;

      const transaction = await Transaction.findById(id).session(session);
      if (!transaction) throw new Error('Transaction not found');

      const household = await Household.findById(transaction.householdId).session(session);
      if (!household) throw new Error('Household not found');
      if (!household.balances) household.balances = new Map();

      // Reverse old transaction
      if (transaction.splits && transaction.splits.length > 0) {
        const conversionRate = transaction.inrEquivalent / transaction.amount;
        for (const split of transaction.splits) {
          const debtorId = split.user.toString();
          if (debtorId !== transaction.paidBy.toString()) {
            const splitAmountInr = split.amount * conversionRate;
            addDebt(household.balances, debtorId, transaction.paidBy.toString(), -splitAmountInr);
          }
        }
      } else if (transaction.splitAmong && transaction.splitAmong.length > 0) {
        const splitAmountInr = transaction.inrEquivalent / transaction.splitAmong.length;
        for (const debtorId of transaction.splitAmong) {
          if (debtorId.toString() !== transaction.paidBy.toString()) {
            addDebt(household.balances, debtorId.toString(), transaction.paidBy.toString(), -splitAmountInr);
          }
        }
      }

      // Apply new transaction data
      let newInrEquivalent = transaction.inrEquivalent;
      if (amount !== undefined || currency !== undefined) {
        newInrEquivalent = await getInrEquivalent(amount ?? transaction.amount, currency ?? transaction.currency);
      }

      if (paidBy !== undefined) transaction.paidBy = paidBy;
      if (amount !== undefined) transaction.amount = amount;
      if (currency !== undefined) transaction.currency = currency;
      transaction.inrEquivalent = newInrEquivalent;
      if (description !== undefined) transaction.description = description;
      if (category !== undefined) transaction.category = category;
      if (date !== undefined) transaction.date = date;
      if (receiptImage !== undefined) transaction.receiptImage = receiptImage;
      if (splits !== undefined) transaction.splits = splits;
      if (splitAmong !== undefined) transaction.splitAmong = splitAmong;
      
      const activeSplits = transaction.splits && transaction.splits.length > 0 ? transaction.splits : undefined;
      const activeSplitAmong = activeSplits ? activeSplits.map(s => s.user) : transaction.splitAmong;
      transaction.splitAmong = activeSplitAmong as mongoose.Types.ObjectId[];

      await transaction.save({ session });

      // Apply new balances
      if (activeSplits && activeSplits.length > 0) {
        const conversionRate = transaction.inrEquivalent / transaction.amount;
        for (const split of activeSplits) {
          const debtorId = split.user.toString();
          if (debtorId !== transaction.paidBy.toString()) {
            const splitAmountInr = split.amount * conversionRate;
            addDebt(household.balances, debtorId, transaction.paidBy.toString(), splitAmountInr);
          }
        }
      } else if (transaction.splitAmong && transaction.splitAmong.length > 0) {
        const splitAmountInr = transaction.inrEquivalent / transaction.splitAmong.length;
        for (const debtorId of transaction.splitAmong) {
          if (debtorId.toString() !== transaction.paidBy.toString()) {
            addDebt(household.balances, debtorId.toString(), transaction.paidBy.toString(), splitAmountInr);
          }
        }
      }

      await household.save({ session });
      result = transaction;
    });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  } finally {
    session.endSession();
  }
};

export const deleteTransaction = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { id } = req.params;
      console.log('Attempting delete transaction', id);

      const transaction = await Transaction.findById(id).session(session);
      if (!transaction) {
        console.log('Transaction not found', id);
        throw new Error('Transaction not found');
      }

      const household = await Household.findById(transaction.householdId).session(session);
      if (!household) {
        console.log('Household not found', transaction.householdId);
        throw new Error('Household not found');
      }

      if (!household.balances) {
        household.balances = new Map();
      }

      console.log('Reversing balances for tx:', transaction._id);
      
      if (transaction.splits && transaction.splits.length > 0) {
        const conversionRate = transaction.inrEquivalent / transaction.amount;
        for (const split of transaction.splits) {
          const debtorId = split.user.toString();
          if (debtorId !== transaction.paidBy.toString()) {
            const splitAmountInr = split.amount * conversionRate;
            addDebt(household.balances, debtorId, transaction.paidBy.toString(), -splitAmountInr);
          }
        }
      } else if (transaction.splitAmong && transaction.splitAmong.length > 0) {
        const splitAmountInr = transaction.inrEquivalent / transaction.splitAmong.length;
        for (const debtorId of transaction.splitAmong) {
          if (debtorId.toString() !== transaction.paidBy.toString()) {
            addDebt(household.balances, debtorId.toString(), transaction.paidBy.toString(), -splitAmountInr);
          }
        }
      }

      await household.save({ session });
      await Transaction.findByIdAndDelete(id, { session });
    });

    res.status(200).json({ success: true, message: 'Transaction deleted' });
  } catch (error) {
    console.error('Delete transaction error:', error);
    if (error instanceof Error) {
      res.status(400).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  } finally {
    session.endSession();
  }
};
