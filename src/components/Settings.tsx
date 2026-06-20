import { useState } from "react";
import Database from "@tauri-apps/plugin-sql";
import MenuManagement from "./MenuManagement";
import GeneralSettings from "./GeneralSettings";
import PrinterSettings from "./PrinterSettings";
import BillSettings from "./BillSettings";
import StaffManagement from "./StaffManagement";

interface SettingsProps {
  db: Database | null;
}

export default function Settings({ db }: SettingsProps) {
  const [activeTab, setActiveTab] = useState("Menu");

  const tabs = ["General", "Menu", "Staff", "Bill", "Printer"];

  return (
    <div className="settings-container" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div 
        className="settings-tabs" 
        style={{ 
          display: 'flex', 
          gap: 'var(--space-4)', 
          borderBottom: 'var(--border-thin) solid var(--border-color)', 
          marginBottom: 'var(--space-4)' 
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.75rem 1rem',
              borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
              transition: 'all 0.2s ease-in-out'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="settings-content" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: activeTab === "General" ? 'block' : 'none' }}>
          <GeneralSettings db={db} activeTab={activeTab} />
        </div>
        
        <div style={{ display: activeTab === "Menu" ? 'block' : 'none' }}>
          <MenuManagement db={db} activeTab={activeTab} />
        </div>

        <div style={{ display: activeTab === "Staff" ? 'block' : 'none' }}>
          <StaffManagement db={db} activeTab={activeTab} />
        </div>
        
        <div style={{ display: activeTab === "Bill" ? 'block' : 'none' }}>
          <BillSettings db={db} activeTab={activeTab} />
        </div>
        
        <div style={{ display: activeTab === "Printer" ? 'block' : 'none' }}>
          <PrinterSettings db={db} activeTab={activeTab} />
        </div>
      </div>
    </div>
  );
}
