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
    <div className="sx-page">
      <div className="sx-head">
        <h1>Staff Management</h1>
        <p>Manage your team members and roles</p>
      </div>

      {/* Add Staff */}
      <div className="sx-group">
        <div className="sx-group-head"><UserPlus size={14} /> Add Staff Member</div>
        <form onSubmit={addStaff} className="inline-add-bar">
          <input
            type="text"
            placeholder="Full Name (e.g. John Doe)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            className="sx-input"
            style={{ flex: 2, minWidth: '200px' }}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={loading}
            className="sx-select"
            style={{ flex: 1, minWidth: '130px' }}
          >
            <option value="Manager">Manager</option>
            <option value="Waiter">Waiter</option>
            <option value="Chef">Chef</option>
            <option value="Cashier">Cashier</option>
          </select>
          <input
            type="text"
            placeholder="Phone (e.g. 9876543210)"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            disabled={loading}
            className="sx-input"
            style={{ flex: 1.5, minWidth: '150px' }}
          />
          <button type="submit" disabled={loading || !name.trim()} className="sx-btn-primary" style={{ flexShrink: 0 }}>
            <UserPlus size={16} /> Add Staff
          </button>
        </form>
      </div>

      {/* Team Members */}
      <div className="sx-group">
        <div className="sx-group-head">
          Team Members
          <span className="sx-spacer" />
          <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text-secondary)' }}>{staff.length} total</span>
        </div>
        {staff.length === 0 ? (
          <div className="empty-block">
            <div className="empty-icon"><UserPlus size={24} /></div>
            <h3>No staff members yet</h3>
            <p>Use the form above to add your first team member.</p>
          </div>
        ) : (
          <div className="data-list">
            <div className="data-list-head" style={{ gridTemplateColumns: '2fr 1fr 1.5fr 70px' }}>
              <div>Name</div>
              <div>Role</div>
              <div>Phone</div>
              <div style={{ textAlign: 'right' }}>Actions</div>
            </div>
            {staff.map((member) => (
              <div key={member.id} className="data-row" style={{ gridTemplateColumns: '2fr 1fr 1.5fr 70px' }}>
                <div style={{ fontWeight: 'var(--font-semibold)', color: 'var(--text-primary)' }}>{member.name}</div>
                <div><span className="role-pill">{member.role}</span></div>
                <div style={{ color: 'var(--text-secondary)' }}>{member.phone || '-'}</div>
                <div className="data-row-actions">
                  <button onClick={() => deleteStaff(member.id)} className="row-action-btn danger" title="Remove staff">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
