import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ITransaction extends Document {
  householdId: Types.ObjectId;
  paidBy: Types.ObjectId;
  splitAmong: Types.ObjectId[];
  splits?: { user: Types.ObjectId; amount: number }[]; // For unequal splits
  amount: number;
  currency: 'INR' | 'BTC' | 'ETH';
  inrEquivalent: number; // Stored for normalized tracking/dashboard
  description: string;
  category: string;
  date: Date;
  receiptImage?: string; // URL to OCR parsed receipt
}

const TransactionSchema = new Schema<ITransaction>({
  householdId: { type: Schema.Types.ObjectId, ref: 'Household', required: true },
  paidBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  splitAmong: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
  splits: [{ 
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    amount: { type: Number }
  }],
  amount: { type: Number, required: true },
  currency: { type: String, enum: ['INR', 'BTC', 'ETH'], required: true, default: 'INR' },
  inrEquivalent: { type: Number, required: true },
  description: { type: String, required: true },
  category: { type: String, default: 'General' },
  date: { type: Date, default: Date.now },
  receiptImage: { type: String }
}, { timestamps: true });

export const Transaction = mongoose.model<ITransaction>('Transaction', TransactionSchema);
