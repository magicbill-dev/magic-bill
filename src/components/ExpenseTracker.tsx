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
    <div className="settings-page-wrapper">
      <div className="settings-page-header">
        <h2 className="settings-page-title">Expense Tracker</h2>
        <p className="settings-page-subtitle">Manage and track your daily business expenses</p>
      </div>

      <div className="modern-panel">
        <div className="modern-panel-header">
          <Plus size={22} style={{ color: 'var(--primary)' }} /> Add New Expense
        </div>
        <div className="modern-panel-body">
          <form onSubmit={addExpense} style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Description (e.g. Milk, Electricity)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="modern-input"
              style={{ flex: 2 }}
              required
            />
            <input
              type="number"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="modern-input"
              style={{ flex: 1 }}
              step="0.01"
              min="0"
              required
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="modern-select"
              style={{ flex: 1 }}
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
              className="modern-btn modern-btn-primary"
            >
              {loading ? "Adding..." : "Add Expense"}
            </button>
          </form>
        </div>
      </div>

      <div className="modern-panel" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="modern-panel-header">Recent Expenses</div>
        <div className="table-container" style={{ padding: '1rem 1.5rem', overflowY: 'auto', flex: 1 }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--text-primary)' }}>
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
                      borderRadius: 'var(--radius-full)', 
                      fontSize: 'var(--text-xs)', 
                      backgroundColor: 'var(--bg-light)',
                      color: 'var(--text-secondary)'
                    }}>
                      {expense.category}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>₹{expense.amount.toFixed(2)}</td>
                  <td>
                    <button className="icon-btn delete" style={{ color: 'var(--danger)' }} onClick={() => deleteExpense(expense.id)}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                    <Wallet size={48} style={{ marginBottom: 'var(--space-4)', opacity: 0.2 }} />
                    <p>No expenses recorded yet.</p>
                  </td>
                </tr>
              )}
            </tbody>
            {expenses.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 'bold', padding: 'var(--space-4)' }}>Total:</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', padding: 'var(--space-4)', color: 'var(--danger)' }}>
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
