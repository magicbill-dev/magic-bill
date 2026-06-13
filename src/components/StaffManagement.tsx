import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { UserPlus, Trash2 } from "lucide-react";

interface StaffMember {
  id: number;
  name: string;
  role: string;
  phone: string;
}

interface StaffManagementProps {
  db: Database | null;
  activeTab: string;
}

export default function StaffManagement({ db, activeTab }: StaffManagementProps) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState("Waiter");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (db && activeTab === "Staff") {
      fetchStaff();
    }
  }, [db, activeTab]);

  const fetchStaff = async () => {
    if (!db) return;
    try {
      const result = await db.select<StaffMember[]>("SELECT * FROM staff ORDER BY name");
      setStaff(result);
    } catch (error) {
      console.error("Failed to fetch staff:", error);
    }
  };

  const addStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !name.trim()) return;

    try {
      setLoading(true);
      await db.execute("INSERT INTO staff (name, role, phone) VALUES (?, ?, ?)", [
        name,
        role,
        phone
      ]);
      setName("");
      setPhone("");
      await fetchStaff();
    } catch (error) {
      console.error("Failed to add staff:", error);
    } finally {
      setLoading(false);
    }
  };

  const deleteStaff = async (id: number) => {
    if (!db || !window.confirm("Remove this staff member?")) return;
    try {
      await db.execute("DELETE FROM staff WHERE id = ?", [id]);
      await fetchStaff();
    } catch (error) {
      console.error("Failed to delete staff:", error);
    }
  };

  return (
    <div className="settings-page-wrapper">
      
      {/* Header */}
      <div className="settings-page-header">
        <h2 className="settings-page-title">Staff Management</h2>
        <p className="settings-page-subtitle">Manage your team members and roles</p>
      </div>
      
      {/* Add Staff Row */}
      <div className="modern-panel">
        <form onSubmit={addStaff} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 2, minWidth: '200px' }}>
            <input
              type="text"
              placeholder="Full Name (e.g. John Doe)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              className="modern-input"
            />
          </div>
          <div style={{ flex: 1, minWidth: '120px' }}>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={loading}
              className="modern-select"
            >
              <option value="Manager">Manager</option>
              <option value="Waiter">Waiter</option>
              <option value="Chef">Chef</option>
              <option value="Cashier">Cashier</option>
            </select>
          </div>
          <div style={{ flex: 1.5, minWidth: '150px' }}>
            <input
              type="text"
              placeholder="Phone (e.g. 9876543210)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={loading}
              className="modern-input"
            />
          </div>
          <button 
            type="submit" 
            disabled={loading || !name.trim()}
            className="modern-btn-primary"
            style={{ padding: '0 2rem' }}
          >
            <UserPlus size={18} /> Add Staff
          </button>
        </form>

        {/* Staff List Header */}
        {staff.length > 0 && (
          <div style={{ display: 'flex', padding: '1rem 0.5rem 0.5rem 0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ flex: 2 }}>Name</div>
            <div style={{ flex: 1 }}>Role</div>
            <div style={{ flex: 1.5 }}>Phone</div>
            <div style={{ width: '80px', textAlign: 'right' }}>Actions</div>
          </div>
        )}

        {/* Staff List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {staff.length === 0 ? (
            <div style={{ padding: '3rem 0', color: 'var(--text-secondary)', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '1.1rem' }}>No staff members added yet.</p>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>Use the form above to add your first staff member.</p>
            </div>
          ) : (
            staff.map((member) => (
              <div key={member.id} style={{ display: 'flex', alignItems: 'center', padding: '1rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                <div style={{ flex: 2, fontSize: '1.05rem', fontWeight: 500, color: 'var(--text-primary)' }}>{member.name}</div>
                <div style={{ flex: 1 }}>
                  <span style={{ padding: '0.25rem 0.75rem', borderRadius: '1rem', fontSize: '0.8rem', fontWeight: 600, background: 'rgba(16, 185, 129, 0.1)', color: 'var(--primary)' }}>
                    {member.role}
                  </span>
                </div>
                <div style={{ flex: 1.5, color: 'var(--text-primary)', fontSize: '1rem' }}>{member.phone || '-'}</div>
                <div style={{ width: '80px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button 
                    onClick={() => deleteStaff(member.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '0.4rem', transition: 'opacity 0.2s', display: 'flex', alignItems: 'center', opacity: 0.8 }}
                    onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseOut={(e) => e.currentTarget.style.opacity = '0.8'}
                    title="Remove staff"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
