import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Save, FolderOpen, Store, HardDrive, Building2, MapPin, Phone, Hash, FileText, Palette, Check, RotateCcw, Moon, Sun } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useTheme, THEMES, getCustomPreview } from '../theme/ThemeContext';

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
  const { theme, setTheme, customColors, setCustomColor, resetCustomColors } = useTheme();
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
    <div className="sx-page">
      {toastMessage && <div className="toast-notification">{toastMessage}</div>}

      <div className="sx-head">
        <h1>General Settings</h1>
        <p>Manage your establishment details and system configuration</p>
      </div>

      {/* Appearance */}
      <div className="sx-group">
        <div className="sx-group-head"><Palette size={14} /> Appearance</div>
        <div className="theme-grid">
          {THEMES.map((t) => {
            // The Custom card mirrors the user's live, derived palette.
            const preview = t.id === 'custom' ? getCustomPreview(customColors) : t.preview;
            return (
              <div
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`theme-option ${theme === t.id ? 'active' : ''}`}
              >
                {theme === t.id && (
                  <div className="theme-option-check"><Check size={13} /></div>
                )}
                <div className="theme-option-preview">
                  <div style={{ backgroundColor: preview.bg }} />
                  <div style={{ backgroundColor: preview.panelBg }} />
                  <div style={{ backgroundColor: preview.headerBg }} />
                  <div style={{ backgroundColor: preview.accent }} />
                </div>
                <div className="theme-option-info">
                  <span className="theme-option-name">{t.label}</span>
                  <span className="theme-option-desc">{t.description}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Custom palette editor — visible only when Custom is the active theme */}
        {theme === 'custom' && (
          <div className="custom-palette">
            <div className="custom-palette-head">
              <span>Pick a base tint &amp; accent — everything else is auto-balanced for readability</span>
              <button type="button" className="sx-btn-ghost custom-palette-reset" onClick={resetCustomColors}>
                <RotateCcw size={14} /> Reset
              </button>
            </div>

            <div className="custom-palette-row">
              {/* Mode toggle */}
              <div className="custom-mode">
                <span className="custom-field-label">Mode</span>
                <div className="custom-mode-seg">
                  <button
                    type="button"
                    className={`custom-mode-btn ${customColors.mode === 'dark' ? 'active' : ''}`}
                    onClick={() => setCustomColor('mode', 'dark')}
                  >
                    <Moon size={14} /> Dark
                  </button>
                  <button
                    type="button"
                    className={`custom-mode-btn ${customColors.mode === 'light' ? 'active' : ''}`}
                    onClick={() => setCustomColor('mode', 'light')}
                  >
                    <Sun size={14} /> Light
                  </button>
                </div>
              </div>

              {/* Base tint */}
              <label className="custom-swatch">
                <input
                  type="color"
                  value={customColors.base}
                  onChange={(e) => setCustomColor('base', e.target.value)}
                />
                <div className="custom-swatch-info">
                  <span className="custom-swatch-name">Base Tint</span>
                  <span className="custom-swatch-hint">Backgrounds, panels &amp; borders</span>
                  <span className="custom-swatch-value">{customColors.base.toUpperCase()}</span>
                </div>
              </label>

              {/* Accent */}
              <label className="custom-swatch">
                <input
                  type="color"
                  value={customColors.accent}
                  onChange={(e) => setCustomColor('accent', e.target.value)}
                />
                <div className="custom-swatch-info">
                  <span className="custom-swatch-name">Accent</span>
                  <span className="custom-swatch-hint">Buttons, highlights &amp; active states</span>
                  <span className="custom-swatch-value">{customColors.accent.toUpperCase()}</span>
                </div>
              </label>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {/* Store Information */}
        <div className="sx-group">
          <div className="sx-group-head"><Store size={14} /> Store Information</div>
          <div className="sx-grid">
            <div className="sx-field">
              <label><Building2 size={13} /> Hotel Name</label>
              <input type="text" name="hotel_name" value={settings.hotel_name} onChange={handleChange} placeholder="e.g. Grand Restaurant" className="sx-input" />
            </div>
            <div className="sx-field">
              <label><Phone size={13} /> Phone Number</label>
              <input type="text" name="phone_number" value={settings.phone_number} onChange={handleChange} placeholder="Contact number" className="sx-input" />
            </div>
            <div className="sx-field">
              <label><Hash size={13} /> GST Number</label>
              <input type="text" name="gst_number" value={settings.gst_number} onChange={handleChange} placeholder="GSTIN" className="sx-input" />
            </div>
            <div className="sx-field">
              <label><FileText size={13} /> FSSAI Number</label>
              <input type="text" name="fssai_number" value={settings.fssai_number} onChange={handleChange} placeholder="FSSAI License Number" className="sx-input" />
            </div>
            <div className="sx-field sx-span-full">
              <label><MapPin size={13} /> Address</label>
              <textarea name="address" value={settings.address} onChange={handleChange} placeholder="Complete address" rows={2} className="sx-textarea" />
            </div>
          </div>
        </div>

        {/* UPI Payment */}
        <div className="sx-group">
          <div className="sx-group-head"><Store size={14} /> UPI Payment</div>
          <div className="sx-grid cols-3">
            <div className="sx-field">
              <label>UPI ID</label>
              <input type="text" name="upi_id" value={settings.upi_id || ""} onChange={handleChange} placeholder="e.g. merchant@upi" className="sx-input" />
            </div>
            <div className="sx-field">
              <label>Merchant / Restaurant Name</label>
              <input type="text" name="merchant_name" value={settings.merchant_name || ""} onChange={handleChange} placeholder="Shown to customer" className="sx-input" />
            </div>
            <div className="sx-field">
              <label>Payment Reference (Optional)</label>
              <input type="text" name="payment_reference" value={settings.payment_reference || ""} onChange={handleChange} placeholder="e.g. Bill Payment" className="sx-input" />
            </div>
          </div>
        </div>

        <div className="sx-actions">
          <button type="submit" disabled={saving} className="sx-btn-primary">
            <Save size={16} />
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </form>

      {/* System Configuration */}
      <div className="sx-group">
        <div className="sx-group-head"><HardDrive size={14} /> System Configuration</div>
        <div className="sx-field">
          <label><FolderOpen size={13} /> Database Location</label>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="sx-readonly" style={{ flex: 1, minWidth: '220px' }}>{dbFolderPath || "Not Selected"}</span>
            <button onClick={handleChangeDbFolder} className="sx-btn-ghost" style={{ flexShrink: 0 }}>
              <FolderOpen size={16} /> Change Folder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
