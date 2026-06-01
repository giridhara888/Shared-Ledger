import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IHousehold extends Document {
  name: string;
  members: Types.ObjectId[];
  // Who owes whom balances
  // Map key: "userA_id:userB_id" (always sorted alphabetically to avoid duplicates)
  // Map value: Amount userA owes userB (can be negative if userB owes userA)
  balances: Map<string, number>; 
}

const HouseholdSchema = new Schema<IHousehold>({
  name: { type: String, required: true },
  members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  balances: {
    type: Map,
    of: Number,
    default: new Map()
  }
}, { timestamps: true });

export const Household = mongoose.model<IHousehold>('Household', HouseholdSchema);
