import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Plus, Trash2, Wallet } from "lucide-react";

interface Expense {
  id: number;
  description: string;
  amount: number;
  category: string;
  date: string;
}

interface ExpenseTrackerProps {
  db: Database | null;
}

export default function ExpenseTracker({ db }: ExpenseTrackerProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Daily Needs");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (db) {
      fetchExpenses();
    }
  }, [db]);

  const fetchExpenses = async () => {
    if (!db) return;
    try {
      const result = await db.select<Expense[]>("SELECT * FROM expenses ORDER BY date DESC");
      setExpenses(result);
    } catch (error) {
      console.error("Failed to fetch expenses:", error);
    }
  };

  const addExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !description.trim() || !amount) return;

    try {
      setLoading(true);
      const dateStr = new Date().toISOString();
      await db.execute(
        "INSERT INTO expenses (description, amount, category, date) VALUES (?, ?, ?, ?)",
        [description, parseFloat(amount), category, dateStr]
      );
      setDescription("");
      setAmount("");
      await fetchExpenses();
    } catch (error) {
      console.error("Failed to add expense:", error);
    } finally {
      setLoading(false);
    }
  };

  const deleteExpense = async (id: number) => {
    if (!db || !window.confirm("Delete this expense record?")) return;
    try {
      await db.execute("DELETE FROM expenses WHERE id = ?", [id]);
      await fetchExpenses();
    } catch (error) {
      console.error("Failed to delete expense:", error);
    }
  };

  return (
    <div className="expense-tracker" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header className="header">
        <div>
          <h2>Expense Tracker</h2>
          <p>Manage and track your daily business expenses</p>
        </div>
      </header>

      <div className="panel" style={{ padding: '1.5rem' }}>
        <h3 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={20} /> Add New Expense
        </h3>
        <form onSubmit={addExpense} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Description (e.g. Milk, Electricity)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ flex: 2, padding: '0.6rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
            required
          />
          <input
            type="number"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ flex: 1, padding: '0.6rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
            step="0.01"
            min="0"
            required
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ flex: 1, padding: '0.6rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
          >
            <option value="Daily Needs">Daily Needs</option>
            <option value="Salary">Salary</option>
            <option value="Rent">Rent</option>
            <option value="Utilities">Utilities</option>
            <option value="Maintenance">Maintenance</option>
            <option value="Other">Other</option>
          </select>
          <button 
            type="submit" 
            disabled={loading}
            style={{ 
              padding: '0.6rem 1.5rem', 
              backgroundColor: 'var(--primary)', 
              color: 'var(--primary-fg)', 
              border: 'none', 
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            {loading ? "Adding..." : "Add Expense"}
          </button>
        </form>
      </div>

      <div className="panel" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <h3 className="panel-title" style={{ padding: '1.5rem 1.5rem 0 1.5rem' }}>Recent Expenses</h3>
        <div className="table-container" style={{ padding: '1rem 1.5rem', overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ width: '50px' }}></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td>{new Date(expense.date).toLocaleDateString()}</td>
                  <td>{expense.description}</td>
                  <td>
                    <span style={{ 
                      padding: '0.25rem 0.5rem', 
                      borderRadius: '9999px', 
                      fontSize: '0.75rem', 
                      backgroundColor: 'var(--bg-light)',
                      color: 'var(--text-secondary)'
                    }}>
                      {expense.category}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{expense.amount.toFixed(2)}</td>
                  <td>
                    <button className="icon-btn delete" onClick={() => deleteExpense(expense.id)}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                    <Wallet size={48} style={{ marginBottom: '1rem', opacity: 0.2 }} />
                    <p>No expenses recorded yet.</p>
                  </td>
                </tr>
              )}
            </tbody>
            {expenses.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 'bold', padding: '1rem' }}>Total:</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', padding: '1rem', color: 'var(--danger)' }}>
                    ₹{expenses.reduce((sum, exp) => sum + exp.amount, 0).toFixed(2)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
