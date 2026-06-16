import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Save, FolderOpen, Store, HardDrive, Building2, MapPin, Phone, Hash, FileText } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";

interface StoreSettings {
  hotel_name: string;
  address: string;
  phone_number: string;
  gst_number: string;
  fssai_number: string;
  upi_id?: string;
  merchant_name?: string;
  payment_reference?: string;
}

interface GeneralSettingsProps {
  db: Database | null;
  activeTab: string;
  setUnsavedChanges?: (unsaved: boolean) => void;
  setTriggerSave?: (saveFn: () => Promise<boolean>) => void;
}

export default function GeneralSettings({ db, activeTab, setUnsavedChanges, setTriggerSave }: GeneralSettingsProps) {
  const [settings, setSettings] = useState<StoreSettings>({
    hotel_name: "",
    address: "",
    phone_number: "",
    gst_number: "",
    fssai_number: ""
  });
  const [initialSettings, setInitialSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [dbFolderPath, setDbFolderPath] = useState<string | null>(() => localStorage.getItem("dbFolderPath"));

  useEffect(() => {
    if (setUnsavedChanges && initialSettings) {
      setUnsavedChanges(JSON.stringify(settings) !== JSON.stringify(initialSettings));
    }
  }, [settings, initialSettings, setUnsavedChanges]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  useEffect(() => {
    if (db && activeTab === "General") {
      fetchSettings();
    }
  }, [db, activeTab]);

  const fetchSettings = async () => {
    if (!db) return;
    try {
      setLoading(true);
      const result = await db.select<StoreSettings[]>("SELECT * FROM store_settings WHERE id = 1");
      if (result.length > 0) {
        const fetched = {
          hotel_name: result[0].hotel_name || "",
          address: result[0].address || "",
          phone_number: result[0].phone_number || "",
          gst_number: result[0].gst_number || "",
          fssai_number: result[0].fssai_number || "",
          upi_id: result[0].upi_id || "",
          merchant_name: result[0].merchant_name || "",
          payment_reference: result[0].payment_reference || ""
        };
        setSettings(fetched);
        setInitialSettings(fetched);
      } else {
        setInitialSettings(settings);
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const doSave = async () => {
    if (!db) return false;
    
    try {
      setSaving(true);
      
      const existing = await db.select<StoreSettings[]>("SELECT id FROM store_settings WHERE id = 1");
      
      if (existing.length > 0) {
        await db.execute(
          "UPDATE store_settings SET hotel_name = $1, address = $2, phone_number = $3, gst_number = $4, fssai_number = $5, upi_id = $6, merchant_name = $7, payment_reference = $8 WHERE id = 1",
          [settings.hotel_name, settings.address, settings.phone_number, settings.gst_number, settings.fssai_number, settings.upi_id, settings.merchant_name, settings.payment_reference]
        );
      } else {
        await db.execute(
          "INSERT INTO store_settings (id, hotel_name, address, phone_number, gst_number, fssai_number, upi_id, merchant_name, payment_reference) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)",
          [settings.hotel_name, settings.address, settings.phone_number, settings.gst_number, settings.fssai_number, settings.upi_id, settings.merchant_name, settings.payment_reference]
        );
      }
      
      setInitialSettings(settings);
      setToastMessage("Settings saved successfully!");
      return true;
    } catch (error) {
      console.error("Failed to save settings:", error);
      setToastMessage(`Error saving settings: ${error}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (setTriggerSave) {
      setTriggerSave(doSave);
    }
  }, [settings, db, setTriggerSave]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await doSave();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    let { name, value } = e.target;
    if (name === "phone_number") {
      value = value.replace(/\D/g, '').slice(0, 10);
    }
    setSettings(prev => ({ ...prev, [name]: value }));
  };

  const handleChangeDbFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select New Database Folder"
      });
      if (selected && typeof selected === "string") {
        localStorage.setItem("dbFolderPath", selected);
        setDbFolderPath(selected);
        setToastMessage("Database folder updated. Please restart the app to apply changes.");
      }
    } catch (error) {
      console.error("Failed to open dialog:", error);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading settings...</div>;
  }

  return (
    <div className="settings-page-wrapper">
      {toastMessage && (
        <div style={{
          position: 'fixed', bottom: '2rem', right: '2rem', backgroundColor: 'var(--primary)', color: 'var(--primary-fg)',
          padding: '1rem 1.5rem', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', zIndex: 1000, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: '0.5rem'
        }}>
          {toastMessage}
        </div>
      )}
      
      {/* Header */}
      <div className="settings-page-header">
        <h2 className="settings-page-title">General Settings</h2>
        <p className="settings-page-subtitle">Manage your establishment details and system configuration</p>
      </div>

      <div className="modern-grid-2">
        {/* Store Information Card */}
        <div className="modern-panel">
          <div className="modern-panel-header">
            <Store size={22} style={{ color: 'var(--primary)' }} />
            Store Information
          </div>
          
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1 }}>
            <div className="modern-form-group">
              <label className="modern-label">
                <Building2 size={16} /> Hotel Name
              </label>
              <input
                type="text"
                name="hotel_name"
                value={settings.hotel_name}
                onChange={handleChange}
                placeholder="e.g. Grand Restaurant"
                className="modern-input"
              />
            </div>

            <div className="modern-form-group">
              <label className="modern-label">
                <MapPin size={16} /> Address
              </label>
              <textarea
                name="address"
                value={settings.address}
                onChange={handleChange}
                placeholder="Complete address"
                rows={3}
                className="modern-input"
                style={{ resize: 'vertical' }}
              />
            </div>

            <div className="modern-grid-2">
              <div className="modern-form-group">
                <label className="modern-label">
                  <Phone size={16} /> Phone Number
                </label>
                <input
                  type="text"
                  name="phone_number"
                  value={settings.phone_number}
                  onChange={handleChange}
                  placeholder="Contact number"
                  className="modern-input"
                />
              </div>
              
              <div className="modern-form-group">
                <label className="modern-label">
                  <Hash size={16} /> GST Number
                </label>
                <input
                  type="text"
                  name="gst_number"
                  value={settings.gst_number}
                  onChange={handleChange}
                  placeholder="GSTIN"
                  className="modern-input"
                />
              </div>
            </div>

            <div className="modern-form-group">
              <label className="modern-label">
                <FileText size={16} /> FSSAI Number
              </label>
              <input
                type="text"
                name="fssai_number"
                value={settings.fssai_number}
                onChange={handleChange}
                placeholder="FSSAI License Number"
                className="modern-input"
              />
            </div>

            <div style={{ marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="modern-panel-header" style={{ marginBottom: '1rem', paddingBottom: '0', borderBottom: 'none' }}>
                <Store size={18} style={{ color: 'var(--primary)' }} />
                UPI Payment Settings
              </div>
              <div className="modern-form-group" style={{ marginBottom: '1rem' }}>
                <label className="modern-label">UPI ID</label>
                <input
                  type="text"
                  name="upi_id"
                  value={settings.upi_id || ""}
                  onChange={handleChange}
                  placeholder="e.g. merchant@upi"
                  className="modern-input"
                />
              </div>
              <div className="modern-form-group" style={{ marginBottom: '1rem' }}>
                <label className="modern-label">Merchant / Restaurant Name</label>
                <input
                  type="text"
                  name="merchant_name"
                  value={settings.merchant_name || ""}
                  onChange={handleChange}
                  placeholder="Name displayed to customer during payment"
                  className="modern-input"
                />
              </div>
              <div className="modern-form-group">
                <label className="modern-label">Default Payment Reference (Optional)</label>
                <input
                  type="text"
                  name="payment_reference"
                  value={settings.payment_reference || ""}
                  onChange={handleChange}
                  placeholder="e.g. Bill Payment"
                  className="modern-input"
                />
              </div>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '1.5rem' }}>
              <button 
                type="submit" 
                disabled={saving}
                className="modern-btn-primary"
                style={{ width: '100%' }}
              >
                <Save size={18} />
                {saving ? "Saving Changes..." : "Save Settings"}
              </button>
            </div>
          </form>
        </div>

        {/* System Settings Card */}
        <div className="modern-panel" style={{ height: 'fit-content' }}>
          <div className="modern-panel-header">
            <HardDrive size={22} style={{ color: 'var(--primary)' }} />
            System Configuration
          </div>
          
          <div className="modern-form-group">
            <label className="modern-label">
              <FolderOpen size={16} /> Database Location
            </label>
            <div style={{ padding: '1.25rem', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: '1.5' }}>
                Current Database Folder: <br />
                <strong style={{ color: 'var(--text-primary)', wordBreak: 'break-all', fontSize: '0.95rem', display: 'block', marginTop: '0.5rem', fontFamily: 'monospace' }}>
                  {dbFolderPath || "Not Selected"}
                </strong>
              </p>
              <button 
                onClick={handleChangeDbFolder}
                className="modern-btn-primary"
                style={{ width: '100%', backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', boxShadow: 'none' }}
                onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'var(--text-secondary)' }}
                onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'var(--border-color)' }}
              >
                <FolderOpen size={18} /> Change Folder
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
