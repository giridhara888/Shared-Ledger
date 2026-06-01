import fetch from 'node-fetch';

async function test() {
  const dashRes = await fetch('http://localhost:3000/api/dashboard');
  const dash = await dashRes.json();
  const txs = dash.transactions;
  if (!txs || txs.length === 0) {
    console.log('No transactions found.');
  } else {
    for (const tx of txs) {
      console.log('Deleting', tx._id);
      const res = await fetch(`http://localhost:3000/api/transactions/${tx._id}`, {
        method: 'DELETE'
      });
      console.log('Delete res status:', res.status);
    }
  }
}

test().catch(console.error);
