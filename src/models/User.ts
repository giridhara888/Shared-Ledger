import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  householdId?: mongoose.Types.ObjectId;
}

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  householdId: { type: Schema.Types.ObjectId, ref: 'Household', default: null }
}, { timestamps: true });

export const User = mongoose.model<IUser>('User', UserSchema);
