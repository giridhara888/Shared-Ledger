import React, { useState, useEffect, useRef } from 'react';
import { PlusCircle, Wallet, Calendar, AlertCircle, Sun, Moon, Download, Scan, ArrowUp, ArrowDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function App() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState<{title: string, type: 'error' | 'success'} | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  // Form State
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [category, setCategory] = useState('General');
  const [paidBy, setPaidBy] = useState('');
  const [splitAmong, setSplitAmong] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<'EQUAL' | 'UNEQUAL'>('EQUAL');
  const [splits, setSplits] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'date', direction: 'desc' });
  const [lang, setLang] = useState<'EN' | 'HI'>('EN');

  const t = {
    EN: {
      currentGroup: 'Current Group',
      totalLedger: 'Total Shared Ledger',
      predictiveAlerts: 'Predictive Alerts',
      members: 'Members',
      netBalance: 'Net Balance',
      recentExpenses: 'Recent Shared Expenses',
      quickLog: 'Quick Log Entry',
      settleUp: 'Optimized Settle Up'
    },
    HI: {
      currentGroup: 'वर्तमान समूह',
      totalLedger: 'कुल साझा खाता',
      predictiveAlerts: 'आगामी बिल अनुमान',
      members: 'सदस्य',
      netBalance: 'शुद्ध शेष',
      recentExpenses: 'हाल के साझा खर्च',
      quickLog: 'त्वरित खर्च दर्ज करें',
      settleUp: 'लेनदेन का निपटारा'
    }
  };

  const [groups, setGroups] = useState<any[]>([]);
  const [currentGroupId, setCurrentGroupId] = useState<string>('');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [displayCurrency, setDisplayCurrency] = useState<'INR' | 'BTC' | 'ETH'>('INR');

  const EXCHANGE_RATES: Record<string, number> = {
    'INR': 1,
    'BTC': 5500000,
    'ETH': 295000,
  };

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const fetchGroups = () => {
    fetch('/api/groups').then(res => res.json()).then(data => {
      setGroups(data);
      if (data.length > 0 && !currentGroupId) {
        setCurrentGroupId(data[0]._id);
      }
    }).catch(console.error);
  }

  const fetchDashboard = (groupId?: string) => {
    const targetGroup = groupId || currentGroupId;
    const url = targetGroup ? `/api/dashboard?groupId=${targetGroup}` : '/api/dashboard';
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to load data');
        }
        return res.json();
      })
      .then(data => {
        setDashboard(data);
        if (data?.household?.members?.length > 0) {
          if (!paidBy) setPaidBy(data.household.members[0]._id);
          if (splitAmong.length === 0) setSplitAmong(data.household.members.map((m: any) => m._id));
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'Failed to load data');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    if (currentGroupId) {
      fetchDashboard(currentGroupId);
    } else {
      fetchDashboard();
    }
  }, [currentGroupId]);

  const handleToggleSplit = (id: string) => {
    setSplitAmong(prev => 
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dashboard?.household?.members?.length) return;
    if (splitMode === 'EQUAL' && splitAmong.length === 0) return setToastMessage({ title: 'Select at least one person to split with', type: 'error' });

    let formattedSplits = undefined;
    if (splitMode === 'UNEQUAL') {
      let sum = 0;
      for (const val of Object.values(splits) as number[]) {
        sum += (val || 0);
      }
      if (Math.abs(sum - parseFloat(amount)) > 0.01) {
         return setToastMessage({ title: `Total splits (${sum}) must equal total amount (${amount})`, type: 'error' });
      }
      formattedSplits = Object.entries(splits).filter(([_, amt]) => (amt as number) > 0).map(([user, amt]) => ({ user, amount: amt }));
    }

    try {
      const url = editingTxId ? `/api/transactions/${editingTxId}` : '/api/transactions/add';
      const method = editingTxId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          householdId: currentGroupId,
          paidBy,
          splitAmong: splitMode === 'EQUAL' ? splitAmong : formattedSplits?.map((s:any) => s.user),
          splits: splitMode === 'UNEQUAL' ? formattedSplits : [],
          amount: parseFloat(amount),
          currency,
          description,
          category,
          date: new Date()
        })
      });

      if (!res.ok) {
        throw new Error('Transaction failed');
      }

      setAmount('');
      setDescription('');
      setEditingTxId(null);
      setSplitMode('EQUAL');
      setSplits({});
      
      // Refresh dashboard
      if (currentGroupId) fetchDashboard(currentGroupId);
      else fetchDashboard();
      setToastMessage({ title: 'Transaction saved successfully', type: 'success' });
    } catch (err) {
      setToastMessage({ title: "Failed to add transaction", type: 'error' });
    }
  };

  const handleDownloadReport = () => {
    if (!dashboard?.transactions) return;
    
    const headers = ['Date', 'Description', 'Amount', 'Currency', 'Category', 'Paid By'];
    const rows = dashboard.transactions.map((tx: any) => {
      const paidByName = dashboard.household?.members?.find((m: any) => m._id === tx.paidBy)?.name || 'Unknown';
      return [
        new Date(tx.date).toLocaleDateString(),
        `"${tx.description}"`,
        tx.amount,
        tx.currency,
        tx.category,
        `"${paidByName}"`
      ].join(',');
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "ledgershare_report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPDF = () => {
    if (!dashboard?.transactions || dashboard.transactions.length === 0) return;
    const doc = new jsPDF();
    doc.text("LedgerShare Expense Report", 14, 15);
    
    const tableColumn = ["Date", "Description", "Amount", "Currency", "Category", "Paid By"];
    const tableRows = dashboard.transactions.map((tx: any) => {
      const paidByName = dashboard.household?.members?.find((m: any) => m._id === tx.paidBy)?.name || 'Unknown';
      return [
        new Date(tx.date).toLocaleDateString(),
        tx.description,
        tx.amount,
        tx.currency,
        tx.category,
        paidByName
      ];
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
    });
    doc.save("ledgershare_report.pdf");
  };

  const handleEditClick = (tx: any) => {
    setEditingTxId(tx._id);
    setDescription(tx.description);
    setAmount(tx.amount.toString());
    setCurrency(tx.currency);
    setCategory(tx.category);
    setPaidBy(tx.paidBy);
    
    if (tx.splits && tx.splits.length > 0) {
      setSplitMode('UNEQUAL');
      const newSplits: Record<string, number> = {};
      tx.splits.forEach((s: any) => { newSplits[s.user] = s.amount; });
      setSplits(newSplits);
      setSplitAmong([]);
    } else {
      setSplitMode('EQUAL');
      setSplitAmong(tx.splitAmong || []);
      setSplits({});
    }
  };

  const handleSettleUp = async (debtorId: string, creditorId: string, settleAmount: number) => {
    try {
      // Create a settlement transaction: debtor pays creditor on their behalf
      const res = await fetch('/api/transactions/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          householdId: dashboard.household._id,
          paidBy: debtorId,
          splitAmong: [creditorId],
          amount: settleAmount,
          currency: 'INR',
          description: 'Debt Settlement',
          category: 'Settlement',
          date: new Date()
        })
      });
      if (!res.ok) throw new Error('Failed to settle');
      fetchDashboard();
      setToastMessage({ title: 'Settlement completed', type: 'success' });
    } catch (err) {
      setToastMessage({ title: "Failed to settle debt", type: 'error' });
    }
  };

  const handleDeleteTransaction = async (txId: string) => {
    try {
      const res = await fetch(`/api/transactions/${txId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to delete transaction');
      }
      if (currentGroupId) fetchDashboard(currentGroupId);
      else fetchDashboard();
      setConfirmDeleteId(null);
      setToastMessage({ title: 'Transaction deleted', type: 'success' });
    } catch (err: any) {
      console.error(err);
      setToastMessage({ title: "Failed to delete: " + err.message, type: 'error' });
    }
  };

  // Extract totals
  let totalInrEquivalent = 0;
  
  // Chart Data Processing
  const categoryTotals: Record<string, number> = {};

  dashboard?.transactions?.forEach((tx: any) => {
    totalInrEquivalent += tx.inrEquivalent;
    const cat = tx.category || 'General';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + tx.inrEquivalent;
  });

  const chartData = Object.keys(categoryTotals)
    .filter(cat => cat !== 'Settlement') // don't chart settlements as expenses
    .map(category => ({
      name: category,
      amount: categoryTotals[category]
    })).sort((a, b) => b.amount - a.amount);

  const filteredTransactions = dashboard?.transactions?.filter((tx: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      tx.description?.toLowerCase().includes(q) ||
      tx.category?.toLowerCase().includes(q)
    );
  }) || [];

  const sortedTransactions = React.useMemo(() => {
    let sortableItems = [...filteredTransactions];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        
        if (sortConfig.key === 'date') {
          aVal = new Date(a[sortConfig.key]).getTime();
          bVal = new Date(b[sortConfig.key]).getTime();
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredTransactions, sortConfig]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-800">Loading Shared Ledger...</div>;
  if (error) return <div className="text-red-500 min-h-screen flex items-center justify-center">{error}</div>;

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800 overflow-hidden dark:bg-slate-900 dark:text-slate-100">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-4 right-4 px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 z-50 animate-in fade-in slide-in-from-top-4 ${toastMessage.type === 'error' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'}`}>
          {toastMessage.type === 'error' ? <AlertCircle size={20} /> : <Scan size={20} />}
          <span className="text-sm font-bold">{toastMessage.title}</span>
          <button onClick={() => setToastMessage(null)} className="ml-4 hover:opacity-75 transition-opacity">&times;</button>
        </div>
      )}

      {/* Left Sidebar: Wealth & Alerts */}
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col shrink-0 dark:bg-slate-800 dark:border-slate-700">
        <div className="p-6 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">L</div>
            <h1 className="font-bold text-xl tracking-tight">LedgerShare</h1>
          </div>

          <div className="flex flex-col gap-2 mb-8">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider dark:text-slate-400">{t[lang].currentGroup}</label>
            <select 
              value={currentGroupId} 
              onChange={(e) => setCurrentGroupId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-500 transition-colors dark:bg-slate-700 dark:border-slate-600 dark:text-white"
            >
              <option value="">-- Select Group --</option>
              {groups.map(g => (
                <option key={g._id} value={g._id}>{g.name}</option>
              ))}
            </select>
            <button 
              onClick={() => {
                const name = prompt('Enter new group name:');
                if (name) {
                  fetch('/api/groups', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                  }).then(() => fetchGroups());
                }
              }}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 text-left mt-1 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              + Create new Group
            </button>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t[lang].totalLedger}</p>
              <select 
                value={displayCurrency} 
                onChange={(e: any) => setDisplayCurrency(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-500 outline-none cursor-pointer hover:text-slate-700 dark:text-slate-400 dark:hover:text-amber-400 transition-colors"
              >
                <option value="INR">INR</option>
                <option value="BTC">BTC</option>
                <option value="ETH">ETH</option>
              </select>
            </div>
            <p className="text-3xl font-light text-slate-900 leading-none dark:text-white">
              {displayCurrency === 'INR' ? '₹' : displayCurrency === 'BTC' ? '₿' : 'Ξ'}
              {(totalInrEquivalent / EXCHANGE_RATES[displayCurrency]).toFixed(displayCurrency === 'INR' ? 2 : 6)}
            </p>
          </div>
        </div>
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          <div>
            <h3 className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-4 flex items-center gap-2">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              {t[lang].predictiveAlerts}
            </h3>
            <div className="space-y-3">
              {dashboard?.upcomingBills?.length === 0 ? (
                <p className="text-slate-500 text-sm dark:text-slate-400">No predictive alerts currently.</p>
              ) : (
                dashboard?.upcomingBills?.map((bill: any, idx: number) => (
                  <div key={idx} className={`p-3 border rounded-xl ${bill.confidence === 'High' ? 'bg-amber-50 border-amber-100 dark:bg-amber-900/20 dark:border-amber-800/50' : 'bg-indigo-50 border-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-800/50'}`}>
                    <p className={`text-xs font-bold ${bill.confidence === 'High' ? 'text-amber-800 dark:text-amber-400' : 'text-indigo-800 dark:text-indigo-400'}`}>{bill.description} Expected</p>
                    <p className={`text-xs mt-1 italic ${bill.confidence === 'High' ? 'text-amber-700 dark:text-amber-500' : 'text-indigo-700 dark:text-indigo-500'}`}>~₹{bill.amountInr?.toFixed(2)} on {new Date(bill.expectedDate).toLocaleDateString()}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="mt-auto p-6 border-t border-slate-100 shrink-0 dark:border-slate-700">
          <div className="flex flex-col gap-3">
             <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex justify-between">
               <span>{t[lang].members}</span>
               <span>{t[lang].netBalance}</span>
             </div>
             {dashboard?.household?.members?.map((member: any) => {
                let netBalance = 0;
                if (dashboard?.debts) {
                  dashboard.debts.forEach((debt: any) => {
                    if (debt.from === member._id) netBalance -= debt.amount;
                    if (debt.to === member._id) netBalance += debt.amount;
                  });
                }
                const balanceString = netBalance === 0 ? 'Settled' : netBalance > 0 ? `+₹${netBalance.toFixed(2)}` : `-₹${Math.abs(netBalance).toFixed(2)}`;
                const balanceColor = netBalance === 0 ? 'text-slate-400' : netBalance > 0 ? 'text-emerald-500' : 'text-rose-500';

                return (
                  <div key={member._id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 font-bold text-slate-500 text-xs dark:bg-slate-700 dark:text-slate-300">
                        {member.name?.charAt(0) || 'U'}
                      </div>
                      <div>
                        <p className="text-sm font-bold truncate">{member.name || 'Unknown User'}</p>
                      </div>
                    </div>
                    <div className={`text-xs font-bold ${balanceColor}`}>
                      {balanceString}
                    </div>
                  </div>
                );
             })}
             
             <button 
                onClick={() => {
                  const name = prompt('Enter new member name:');
                  if (name) {
                    fetch('/api/members/add', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ householdId: dashboard?.household?._id, name })
                    }).then(() => fetchDashboard());
                  }
                }}
                className="mt-2 text-xs font-bold text-indigo-600 border border-dashed border-indigo-200 rounded-lg py-2 hover:bg-indigo-50 transition-colors text-center w-full dark:text-indigo-400 dark:border-slate-700 dark:hover:bg-slate-700"
             >
               + Add Member
             </button>
          </div>
        </div>
      </aside>

      {/* Main Content: Transactions */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0 dark:bg-slate-800 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 truncate">MERN-Stack Backend Active • Node.js v20.x</h2>
          <div className="flex gap-4 shrink-0 items-center">
            <select 
              value={lang} 
              onChange={(e: any) => setLang(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-500 outline-none cursor-pointer hover:text-slate-700 dark:text-slate-400 dark:hover:text-amber-400 transition-colors mr-2"
            >
              <option value="EN">EN</option>
              <option value="HI">HI</option>
            </select>
            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-amber-400 transition-colors"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button onClick={handleDownloadReport} className="px-4 py-2 text-xs font-bold bg-slate-900 text-white rounded-lg dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-500 transition-colors flex items-center gap-2">
              <Download size={14} /> CSV
            </button>
            <button onClick={handleDownloadPDF} className="px-4 py-2 text-xs font-bold bg-indigo-100 text-indigo-700 rounded-lg dark:bg-slate-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-slate-600 transition-colors flex items-center gap-2">
              <Download size={14} /> PDF
            </button>
          </div>
        </header>

        <div className="p-8 flex-1 overflow-hidden flex flex-col gap-6">
          
          {/* Chart Section */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 shrink-0 h-64 dark:bg-slate-800 dark:border-slate-700">
            <h3 className="font-bold mb-4 text-sm dark:text-white">Expenses by Category</h3>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(val) => `₹${val}`} />
                  <Tooltip 
                    cursor={{ fill: '#f1f5f9' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={['#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#3b82f6'][index % 5]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">No expense data available</div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 flex flex-col min-h-0 dark:bg-slate-800 dark:border-slate-700">
            <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center shrink-0 gap-4 dark:border-slate-700">
              <h3 className="font-bold dark:text-white">{t[lang].recentExpenses}</h3>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Search expenses..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                  />
                </div>
                <div className="flex gap-2 text-xs shrink-0">
                  <span className="px-2 py-1 bg-slate-100 rounded font-medium dark:bg-slate-700 dark:text-slate-300">All Transactions</span>
                  <span className="px-2 py-1 text-slate-400 font-medium">{filteredTransactions.length} Total</span>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
               <table className="w-full text-left">
                <thead className="text-[11px] uppercase text-slate-400 font-bold bg-slate-50/50 sticky top-0 border-b border-slate-100 dark:bg-slate-800/50 dark:border-slate-700">
                  <tr>
                    <th className="px-6 py-3 whitespace-nowrap cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('date')}>
                      <div className="flex items-center gap-1">Date {sortConfig?.key === 'date' && (sortConfig.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}</div>
                    </th>
                    <th className="px-6 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('description')}>
                      <div className="flex items-center gap-1">Description {sortConfig?.key === 'description' && (sortConfig.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}</div>
                    </th>
                    <th className="px-6 py-3 text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('amount')}>
                      <div className="flex items-center justify-end gap-1">Amount {sortConfig?.key === 'amount' && (sortConfig.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}</div>
                    </th>
                    <th className="px-6 py-3">Split By</th>
                    <th className="px-6 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => requestSort('category')}>
                      <div className="flex items-center gap-1">Category {sortConfig?.key === 'category' && (sortConfig.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}</div>
                    </th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-slate-100 dark:divide-slate-700">
                  {sortedTransactions.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-4 text-center text-slate-500">No transactions found.</td></tr>
                  ) : (
                    sortedTransactions.map((tx: any) => (
                      <tr key={tx._id} className="hover:bg-slate-50 transition-colors dark:hover:bg-slate-700/50">
                        <td className="px-6 py-4 font-mono text-xs text-slate-500 whitespace-nowrap dark:text-slate-400">
                          {new Date(tx.date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100">
                          {tx.description}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="font-bold text-slate-900 dark:text-slate-100">{tx.amount} {tx.currency}</div>
                          {tx.currency !== 'INR' && <div className="text-xs text-slate-500 dark:text-slate-400">≈ ₹{tx.inrEquivalent?.toFixed(2)}</div>}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex -space-x-2">
                            {(tx.splits?.length > 0 ? tx.splits.map((s: any) => s.user) : tx.splitAmong)?.map((_: any, i: number) => (
                               <div key={i} className={`w-6 h-6 rounded-full border-2 border-white dark:border-slate-800 flex items-center justify-center text-[10px] text-white font-bold ${['bg-blue-400', 'bg-emerald-400', 'bg-rose-400', 'bg-amber-400'][i % 4]}`}></div>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${tx.category === 'Utilities' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>{tx.category}</span>
                        </td>
                        <td className="px-6 py-4 text-right flex gap-3 justify-end items-center h-full">
                          <button onClick={() => handleEditClick(tx)} className="text-indigo-500 hover:text-indigo-700 text-[11px] font-bold transition-colors uppercase">Edit</button>
                          {confirmDeleteId === tx._id ? (
                            <div className="flex gap-2">
                              <button onClick={() => handleDeleteTransaction(tx._id)} className="text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors">Yes</button>
                              <button onClick={() => setConfirmDeleteId(null)} className="text-slate-600 bg-slate-200 hover:bg-slate-300 dark:text-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors">No</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDeleteId(tx._id)} className="text-red-500 hover:text-red-700 text-[11px] font-bold transition-colors uppercase">Delete</button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* Right Sidebar: Quick Log & Settlement */}
      <aside className="w-80 bg-white border-l border-slate-200 flex flex-col shrink-0 dark:bg-slate-800 dark:border-slate-700">
        <div className="p-6 border-b border-slate-100 shrink-0 dark:border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{editingTxId ? 'Edit Transaction' : t[lang].quickLog}</h3>
            {editingTxId && (
              <button 
                onClick={() => {
                  setEditingTxId(null);
                  setDescription('');
                  setAmount('');
                  setSplitMode('EQUAL');
                  setSplits({});
                }} 
                className="text-[10px] uppercase font-bold text-slate-400 hover:text-slate-600 transition-colors">
                Cancel
              </button>
            )}
          </div>
          <form className="space-y-4" onSubmit={handleAddTransaction}>
            <input required value={description} onChange={e => setDescription(e.target.value)} type="text" placeholder="Expense Name" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:placeholder-slate-400" />
            <div className="flex gap-2">
              <input required value={amount} onChange={e => setAmount(e.target.value)} type="number" step="0.01" min="0" placeholder="Amount" className="w-2/3 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:placeholder-slate-400" />
              <select value={currency} onChange={e => setCurrency(e.target.value)} className="w-1/3 px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                <option value="INR">INR</option>
                <option value="BTC">BTC</option>
                <option value="ETH">ETH</option>
              </select>
            </div>
            
            <div className="flex gap-2">
                <select value={category} onChange={e => setCategory(e.target.value)} className="w-1/2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium text-slate-700 dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                  <option value="General">General</option>
                  <option value="Groceries">Groceries</option>
                  <option value="Rent">Rent</option>
                  <option value="Utilities">Utilities</option>
                  <option value="Dining">Dining</option>
                  <option value="Travel">Travel</option>
                </select>
                <select value={paidBy} onChange={e => setPaidBy(e.target.value)} className="w-1/2 px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold outline-none truncate dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                  {dashboard?.household?.members?.map((m: any) => (
                    <option key={m._id} value={m._id}>{m.name} Paid</option>
                  ))}
                </select>
            </div>
            
            <div className="flex flex-col gap-2">
                <div className="flex rounded-lg overflow-hidden border border-slate-200 bg-slate-100 p-1 gap-1 dark:bg-slate-700 dark:border-slate-600">
                  <button type="button" onClick={() => setSplitMode('EQUAL')} className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-colors ${splitMode === 'EQUAL' ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-300'}`}>Equal</button>
                  <button type="button" onClick={() => setSplitMode('UNEQUAL')} className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-colors ${splitMode === 'UNEQUAL' ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-300'}`}>Unequal</button>
                </div>

                {splitMode === 'EQUAL' ? (
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg dark:bg-slate-700 dark:border-slate-600">
                    <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Split Between:</span>
                    <div className="flex -space-x-1">
                      {dashboard?.household?.members?.map((m: any) => (
                        <div key={m._id} title={m.name} onClick={() => handleToggleSplit(m._id)} className={`w-6 h-6 rounded-full border-2 border-white dark:border-slate-800 flex items-center justify-center text-[9px] font-bold cursor-pointer transition-colors ${splitAmong.includes(m._id) ? 'bg-indigo-500 text-white shadow-sm z-10 scale-110' : 'bg-slate-200 text-slate-400 hover:bg-slate-300 dark:bg-slate-600 dark:text-slate-300 dark:hover:bg-slate-500'}`}>
                          {m.name.charAt(0)}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg max-h-32 overflow-y-auto dark:bg-slate-700 dark:border-slate-600">
                    {dashboard?.household?.members?.map((m: any) => (
                      <div key={m._id} className="flex items-center justify-between text-sm">
                        <span className="font-bold text-slate-700 text-xs dark:text-slate-200">{m.name}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400 text-xs dark:text-slate-500">{currency}</span>
                          <input 
                            type="number" 
                            step="0.01" 
                            min="0"
                            placeholder="0.00" 
                            value={splits[m._id] || ''}
                            onChange={(e) => setSplits({...splits, [m._id]: parseFloat(e.target.value) || 0})}
                            className="w-16 px-2 py-1 bg-white border border-slate-200 rounded text-xs outline-none text-right placeholder-slate-300 focus:border-indigo-500 dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder-slate-500" 
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            <button type="submit" className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition">
              {editingTxId ? 'Save Changes' : 'Add Transaction'}
            </button>
          </form>
        </div>
        <div className="p-6 flex-1 overflow-y-auto">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">{t[lang].settleUp}</h3>
          <div className="space-y-4">
            {dashboard?.debts?.length === 0 ? (
               <p className="text-emerald-600 text-[11px] font-bold p-3 bg-emerald-50 rounded-xl border border-emerald-100 text-center dark:bg-emerald-900/20 dark:border-emerald-800/50 dark:text-emerald-400">All completely settled! 🎉</p>
            ) : (
                dashboard?.debts?.map((debt: any, idx: number) => {
                const debtor = dashboard.household.members.find((m:any) => m._id === debt.from)?.name || 'Unknown';
                const creditor = dashboard.household.members.find((m:any) => m._id === debt.to)?.name || 'Unknown';
                return (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 dark:bg-slate-700 dark:border-slate-600">
                    <div className="flex -space-x-2 shrink-0">
                      <div className="w-8 h-8 rounded-full bg-rose-400 border-2 border-white dark:border-slate-800 flex items-center justify-center text-[10px] font-bold text-white uppercase">{debtor.charAt(0)}</div>
                      <div className="w-8 h-8 rounded-full bg-blue-400 border-2 border-white dark:border-slate-800 flex items-center justify-center text-[10px] text-white font-bold">→</div>
                      <div className="w-8 h-8 rounded-full bg-emerald-400 border-2 border-white dark:border-slate-800 flex items-center justify-center text-[10px] font-bold text-white uppercase">{creditor.charAt(0)}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold truncate text-slate-800 dark:text-slate-200">{debtor} owes {creditor}</p>
                      <p className="text-[10px] text-slate-500 font-mono dark:text-slate-400">₹{debt.amount?.toFixed(2)} INR</p>
                    </div>
                    <button onClick={() => handleSettleUp(debt.from, debt.to, debt.amount)} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 shrink-0 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-lg transition-colors dark:bg-indigo-900/30 dark:border-indigo-800/50 dark:text-indigo-400 dark:hover:text-indigo-300">Pay</button>
                  </div>
                )
             })
            )}

            {dashboard?.debts?.length > 0 && <button onClick={() => { if (currentGroupId) fetchDashboard(currentGroupId); else fetchDashboard(); }} className="w-full py-2 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:bg-slate-50 transition-colors dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700">Recalculate Debts</button>}
          </div>
        </div>
      </aside>
    </div>
  );
}
