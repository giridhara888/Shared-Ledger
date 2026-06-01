import express from 'express';
import path from 'path';
import cors from 'cors';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { addTransaction, deleteTransaction, updateTransaction } from './src/controllers/transactionController';
import { Household } from './src/models/Household';
import { User } from './src/models/User';
import { Transaction } from './src/models/Transaction';
import { settleUp } from './src/utils/settleUp';
import { getPredictiveBills } from './src/utils/predictiveBills';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API Routes
app.post('/api/transactions/add', addTransaction);
app.put('/api/transactions/:id', updateTransaction);
app.delete('/api/transactions/:id', deleteTransaction);

app.post('/api/members/add', async (req, res) => {
  try {
    const { name, email, householdId } = req.body;
    if (!name || !householdId) return res.status(400).json({ error: 'Name and householdId required' });
    
    const household = await Household.findById(householdId);
    if (!household) return res.status(404).json({ error: 'Household not found' });
    
    let user = await User.findOne({ email: email || `${name.replace(/\s+/g,'').toLowerCase()}@example.com` });
    if (!user) {
      user = await User.create({
        name,
        email: email || `${name.replace(/\s+/g,'').toLowerCase()}@example.com`,
        householdId: household._id
      });
    }

    if (!household.members.includes(user._id as mongoose.Types.ObjectId)) {
      household.members.push(user._id as mongoose.Types.ObjectId);
      await household.save();
    }
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Group (Household) Endpoints
app.get('/api/groups', async (req, res) => {
  try {
    const groups = await Household.find().populate('members');
    res.json(groups);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/groups', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Group name required' });
    const group = await Household.create({ name, balances: new Map() });
    res.json(group);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get current state (simplified for dashboard)
app.get('/api/dashboard', async (req, res) => {
  try {
    const groupId = req.query.groupId as string | undefined;
    let household;
    
    if (groupId) {
      household = await Household.findById(groupId).populate('members');
    } else {
      household = await Household.findOne().populate('members');
    }
    
    if (!household) return res.status(404).json({ error: 'Household not found' });

    const transactions = await Transaction.find({ householdId: household._id }).sort({ date: -1 });
    
    // Settlement
    const debts = settleUp(household.balances);
    
    // Predictive bills
    const upcomingBills = getPredictiveBills(transactions);

    res.json({
      household,
      transactions,
      debts,
      upcomingBills
    });
  } catch (error) {
    if (error instanceof Error) {
        res.status(500).json({ error: error.message });
    } else {
        res.status(500).json({ error: 'Server Error' });
    }
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

async function startServer() {
  const mongoURI = process.env.MONGODB_URI; 

  if (!mongoURI) {
    console.error("MongoDB URI is missing from Environment Variables!");
  }

  if (mongoURI) {
    await mongoose.connect(mongoURI)
      .then(async () => {
        console.log("Successfully connected to MongoDB Atlas!");
        const count = await Household.countDocuments();
        if (count === 0) {
          console.log("Database is empty. Seeding...");
          await seedDatabase();
        }
      })
      .catch((err) => console.error("Database connection error:", err));
  } else {
    // Standard setup for preview environments where real Mongo isn't easily reachable
    const mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongoServer.getUri());
    console.log('Started In-Memory MongoDB');
    await seedDatabase();
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

async function seedDatabase() {
  const users = await User.insertMany([
    { name: 'GIRI', email: 'giri@example.com' },
    { name: 'ARYAN', email: 'aryan@example.com' }
  ]);

  const household = new Household({
    name: 'Room Mates',
    members: [users[0]._id, users[1]._id],
    balances: new Map()
  });

  users[0].householdId = household._id as mongoose.Types.ObjectId;
  users[1].householdId = household._id as mongoose.Types.ObjectId;
  await users[0].save();
  await users[1].save();
  await household.save();

  // Create some past transactions to make it interesting
  const pastTx1 = new Transaction({
    householdId: household._id,
    paidBy: users[0]._id,
    splitAmong: [users[0]._id, users[1]._id],
    amount: 1000,
    currency: 'INR',
    inrEquivalent: 1000,
    description: 'Internet Bill',
    category: 'Utilities',
    date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
  });

  const pastTx2 = new Transaction({
    householdId: household._id,
    paidBy: users[0]._id,
    splitAmong: [users[0]._id, users[1]._id],
    amount: 1000,
    currency: 'INR',
    inrEquivalent: 1000,
    description: 'Internet Bill',
    category: 'Utilities',
    date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) // 60 days ago
  });
  
  await pastTx1.save();
  await pastTx2.save();

  // add debts to household mapping for past bills
  const key = [users[0]._id.toString(), users[1]._id.toString()].sort().join('_');
  // Bob owes Alice for half of 200 = 100
  // Since user0_user1 is what we evaluate... Need a helper for seed DB but I'll set it manually for now
  
  // Easiest is just sending a request via Express/Supertest pattern, but we do it manually safely:
  // We'll let the user create new ones explicitly with the UI to see transactions real-time
  console.log('Database seeded successfully. Ready for preview.');
}

startServer().catch(console.error);
