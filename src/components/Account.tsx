import { useState, useEffect } from 'react';
import { firestore } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import Database from "@tauri-apps/plugin-sql";
import {
  ShieldCheck, LogOut, RefreshCw, UserCircle, KeyRound,
  Loader2, Activity, Building2, Phone, Mail, CalendarClock,
  CheckCircle2, AlertTriangle, XCircle, Crown, Zap
} from "lucide-react";

interface AccountProps {
  db: Database | null;
}

export default function Account({ db }: AccountProps) {
  const [licenseKey, setLicenseKey] = useState<string>(() => localStorage.getItem('magicbill_license_key') || '');
  const [previousKey] = useState<string>(() => localStorage.getItem('magicbill_license_key_history') || '');
  const [inputKey, setInputKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [subDetails, setSubDetails] = useState<any>(null);
  const [userDetails, setUserDetails] = useState<any>(null);

  useEffect(() => {
    if (db) {
      loadLocalSubscription();
      if (licenseKey) {
        verifyAndFetchSubscription(licenseKey, true);
      }
    }
  }, [db, licenseKey]);

  const loadLocalSubscription = async () => {
    if (!db) return;
    try {
      const localSub: any[] = await db.select('SELECT * FROM subscription WHERE id = 1');
      if (localSub && localSub.length > 0) setSubDetails(localSub[0]);
      const localUser: any[] = await db.select('SELECT * FROM user_details WHERE id = 1');
      if (localUser && localUser.length > 0) setUserDetails(localUser[0]);
    } catch (e) {
      console.error("Error reading local data:", e);
    }
  };

  const verifyAndFetchSubscription = async (keyToVerify: string, silent = false) => {
    if (!db) return;
    if (!silent) setSyncing(true);
    setLoading(true);
    setError('');
    try {
      const userDocRef = doc(firestore, 'users', keyToVerify);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        const data = userDoc.data();
        const sub = data.subscription || {};
        const userInfo = {
          displayName: data.displayName || '',
          email: data.email || '',
          mobileNumber: data.mobileNumber || '',
          restaurantName: data.restaurantName || ''
        };
        localStorage.setItem('magicbill_license_key', keyToVerify);
        localStorage.setItem('magicbill_license_key_history', keyToVerify);
        setLicenseKey(keyToVerify);
        setSubDetails(sub);
        setUserDetails(userInfo);

        await db.execute(`
          CREATE TABLE IF NOT EXISTS user_details (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            displayName TEXT, email TEXT, mobileNumber TEXT, restaurantName TEXT
          );
        `);
        await db.execute(`INSERT OR IGNORE INTO user_details (id) VALUES (1)`);
        await db.execute(
          `UPDATE user_details SET displayName=$1, email=$2, mobileNumber=$3, restaurantName=$4 WHERE id=1`,
          [userInfo.displayName, userInfo.email, userInfo.mobileNumber, userInfo.restaurantName]
        );
        await db.execute(
          `UPDATE subscription SET status=$1, planId=$2, subscriptionId=$3, nextBillingDate=$4, updatedAt=$5 WHERE id=1`,
          [sub.status || '', sub.planId || '', sub.id || '', sub.nextBillingDate || '', sub.updatedAt || '']
        );
      } else {
        setError('Invalid License Key / User ID. Please check and try again.');
        if (licenseKey === keyToVerify) handleLogout();
      }
    } catch (err: any) {
      console.error("Error fetching data from Firebase:", err);
      setError(err.message || 'Failed to verify. Please check your internet connection.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  const handleActivate = () => {
    if (!inputKey.trim()) { setError("Please enter a valid User ID."); return; }
    verifyAndFetchSubscription(inputKey.trim());
  };

  const handleLogout = async () => {
    localStorage.removeItem('magicbill_license_key');
    setLicenseKey('');
    setInputKey('');
    setSubDetails(null);
    setUserDetails(null);
    if (db) {
      await db.execute('UPDATE subscription SET status="", planId="", subscriptionId="", nextBillingDate="", updatedAt="" WHERE id=1');
      try { await db.execute('UPDATE user_details SET displayName="", email="", mobileNumber="", restaurantName="" WHERE id=1'); } catch (e) {}
    }
  };

  const calculatePlanStatus = () => {
    if (!subDetails || !subDetails.nextBillingDate) return { status: 'expired', remainingDays: 0 };
    const nextBilling = new Date(subDetails.nextBillingDate).getTime();
    const now = new Date().getTime();
    const gracePeriodMs = 10 * 24 * 60 * 60 * 1000;
    const diffDays = Math.ceil((nextBilling - now) / (1000 * 3600 * 24));
    if (now <= nextBilling) return { status: 'active', remainingDays: diffDays };
    if (now <= nextBilling + gracePeriodMs) return { status: 'grace', remainingDays: 10 + diffDays };
    return { status: 'expired', remainingDays: 0 };
  };

  const planInfo = calculatePlanStatus();

  /** Derive initials for avatar */
  const getInitials = () => {
    const name = userDetails?.displayName || userDetails?.restaurantName || '';
    return name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || '??';
  };

  const statusConfig = {
    active: { icon: CheckCircle2, label: 'ACTIVE', color: 'var(--success)', bg: 'var(--success-subtle)', borderColor: 'color-mix(in srgb, var(--success) 30%, transparent)' },
    grace:  { icon: AlertTriangle, label: 'GRACE PERIOD', color: 'var(--warning)', bg: 'var(--warning-subtle)', borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)' },
    expired:{ icon: XCircle, label: 'EXPIRED', color: 'var(--danger)', bg: 'var(--danger-subtle)', borderColor: 'color-mix(in srgb, var(--danger) 30%, transparent)' },
    tampered:{ icon: XCircle, label: 'LOCKED', color: 'var(--danger)', bg: 'var(--danger-subtle)', borderColor: 'color-mix(in srgb, var(--danger) 30%, transparent)' },
  } as const;

  const currentStatus = statusConfig[planInfo.status as keyof typeof statusConfig] ?? statusConfig.expired;
  const StatusIcon = currentStatus.icon;

  /* ── Activation / not-logged-in view ────────────────────────────── */
  if (!licenseKey) {
    return (
      <div className="settings-page-wrapper" style={{ justifyContent: 'center', alignItems: 'center', maxWidth: '520px' }}>
        <div style={{
          textAlign: 'center', padding: 'var(--space-8) 0 var(--space-4)'
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: 'var(--radius-full)',
            background: 'var(--accent-subtle)',
            border: '2px solid color-mix(in srgb, var(--accent) 30%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto var(--space-4)',
            boxShadow: '0 0 0 8px color-mix(in srgb, var(--accent) 8%, transparent)'
          }}>
            <ShieldCheck size={36} color="var(--accent)" strokeWidth={1.5} />
          </div>
          <h2 style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--text-primary)' }}>
            Activate Magic Bill
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--text-base)' }}>
            Enter your User ID to unlock all features
          </p>
        </div>

        <div className="modern-panel" style={{ gap: 'var(--space-5)' }}>
          {error && (
            <div style={{
              color: 'var(--danger)', padding: 'var(--space-3) var(--space-4)',
              background: 'var(--danger-subtle)',
              border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)',
              borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
              display: 'flex', alignItems: 'center', gap: 'var(--space-2)'
            }}>
              <XCircle size={16} />
              {error}
            </div>
          )}

          <div className="modern-form-group">
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              License Key / User ID
            </label>
            <input
              type="text"
              className="modern-input"
              placeholder="Paste your key here…"
              value={inputKey}
              onChange={(e) => { setInputKey(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
              style={{ fontSize: 'var(--text-base)' }}
            />
          </div>

          <button
            className="modern-btn modern-btn-primary"
            onClick={handleActivate}
            disabled={loading}
            style={{ width: '100%', padding: '0.9rem', fontSize: 'var(--text-base)' }}
          >
            {loading ? <Loader2 size={18} className="spin" /> : <KeyRound size={18} />}
            {loading ? 'Activating…' : 'Activate Device'}
          </button>

          {previousKey && (
            <button
              onClick={() => verifyAndFetchSubscription(previousKey)}
              disabled={loading}
              className="modern-btn"
              style={{ width: '100%' }}
            >
              <RefreshCw size={16} />
              Restore Previous Key
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── Logged-in view ─────────────────────────────────────────────── */
  return (
    <div className="settings-page-wrapper" style={{ paddingBottom: 'var(--space-8)' }}>

      {/* ── Hero Banner ─────────────────────────────────────────────── */}
      <div style={{
        borderRadius: 'var(--radius-xl)',
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, var(--bg-secondary)), var(--bg-secondary))',
        border: '1px solid color-mix(in srgb, var(--accent) 20%, var(--border-subtle))',
        padding: 'var(--space-8) var(--space-8)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-6)',
        boxShadow: '0 4px 20px -6px color-mix(in srgb, var(--accent) 25%, transparent)',
        position: 'relative', overflow: 'hidden'
      }}>
        {/* Decorative circle */}
        <div style={{
          position: 'absolute', top: -60, right: -60, width: 220, height: 220,
          borderRadius: '50%',
          background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
          pointerEvents: 'none'
        }} />

        {/* Avatar */}
        <div style={{
          flexShrink: 0, width: 72, height: 72, borderRadius: 'var(--radius-full)',
          background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, var(--info)))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--accent-fg)',
          boxShadow: '0 4px 16px -4px color-mix(in srgb, var(--accent) 50%, transparent)',
          letterSpacing: '0.02em', zIndex: 1
        }}>
          {getInitials()}
        </div>

        <div style={{ flex: 1, zIndex: 1 }}>
          <h2 style={{ margin: '0 0 var(--space-1)', fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--text-primary)' }}>
            {userDetails?.displayName || userDetails?.restaurantName || 'Magic Bill Account'}
          </h2>
          <p style={{ margin: '0 0 var(--space-3)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            {userDetails?.email || 'Account & Licensing Dashboard'}
          </p>
          {/* Status chips */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 12px', borderRadius: 'var(--radius-full)',
              fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.06em',
              background: currentStatus.bg, color: currentStatus.color,
              border: `1px solid ${currentStatus.borderColor}`
            }}>
              <StatusIcon size={12} strokeWidth={2.5} />
              {currentStatus.label}
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 12px', borderRadius: 'var(--radius-full)',
              fontSize: 'var(--text-xs)', fontWeight: 600,
              background: 'var(--bg-inset)', color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)'
            }}>
              <Crown size={12} />
              {subDetails?.planId ? `${subDetails.planId} Plan` : 'Free Plan'}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', zIndex: 1, flexShrink: 0 }}>
          <button
            className="modern-btn"
            onClick={() => verifyAndFetchSubscription(licenseKey)}
            disabled={syncing || loading}
            style={{ minWidth: 160 }}
          >
            <RefreshCw size={16} className={syncing ? 'spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync Data'}
          </button>
          <button
            className="modern-btn modern-btn-danger"
            onClick={handleLogout}
            disabled={loading}
            style={{ minWidth: 160 }}
          >
            <LogOut size={16} />
            Deactivate
          </button>
        </div>
      </div>

      {/* ── Two-column grid ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>

        {/* ── Identity Panel ──────────────────────────────────────── */}
        <div className="modern-panel">
          <div className="modern-panel-header">
            <div style={{
              width: 34, height: 34, borderRadius: 'var(--radius-md)',
              background: 'var(--accent-subtle)', color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <UserCircle size={18} />
            </div>
            Identity
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <InfoRow icon={<UserCircle size={15} color="var(--accent)" />} label="Name" value={userDetails?.displayName} />
            <InfoRow icon={<Building2 size={15} color="var(--accent)" />} label="Business" value={userDetails?.restaurantName} />
            <InfoRow icon={<Phone size={15} color="var(--accent)" />} label="Mobile" value={userDetails?.mobileNumber} />
            <InfoRow icon={<Mail size={15} color="var(--accent)" />} label="Email" value={userDetails?.email} />
          </div>
        </div>

        {/* ── Plan Status Panel ───────────────────────────────────── */}
        <div className="modern-panel">
          <div className="modern-panel-header">
            <div style={{
              width: 34, height: 34, borderRadius: 'var(--radius-md)',
              background: 'var(--accent-subtle)', color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Activity size={18} />
            </div>
            Plan Status
          </div>

          {subDetails ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {/* Plan name + badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Current Plan</div>
                  <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                    {subDetails.planId || 'Free'} Plan
                  </div>
                </div>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 14px', borderRadius: 'var(--radius-full)',
                  fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.07em',
                  background: currentStatus.bg, color: currentStatus.color,
                  border: `1px solid ${currentStatus.borderColor}`
                }}>
                  <StatusIcon size={12} strokeWidth={2.5} /> {currentStatus.label}
                </span>
              </div>

              {/* Stats row */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                gap: 'var(--space-3)'
              }}>
                <div style={{
                  background: 'var(--bg-inset)', borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-subtle)', padding: 'var(--space-4)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <CalendarClock size={14} color="var(--text-tertiary)" />
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Next Billing
                    </span>
                  </div>
                  <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {subDetails.nextBillingDate
                      ? new Date(subDetails.nextBillingDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                      : 'N/A'}
                  </div>
                </div>

                <div style={{
                  background: 'var(--bg-inset)', borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-subtle)', padding: 'var(--space-4)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Zap size={14} color="var(--text-tertiary)" />
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {planInfo.status === 'grace' ? 'Grace Days' : 'Days Left'}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 'var(--text-2xl)', fontWeight: 800,
                    color: currentStatus.color,
                    lineHeight: 1
                  }}>
                    {planInfo.remainingDays}
                  </div>
                </div>
              </div>

              {/* Alerts */}
              {planInfo.status === 'grace' && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--warning-subtle)',
                  border: '1px solid color-mix(in srgb, var(--warning) 25%, transparent)',
                  borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', color: 'var(--warning)'
                }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  Your subscription is in the grace period. Renew soon to avoid interruption.
                </div>
              )}

              {planInfo.status === 'tampered' && (
                <div style={{
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--danger-subtle)',
                  border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)',
                  borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', color: 'var(--danger)'
                }}>
                  System time tampering detected. Please correct your clock and sync again.
                </div>
              )}

              {planInfo.status === 'expired' && (
                <a
                  href="https://magicbill.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="modern-btn modern-btn-primary"
                  style={{ textAlign: 'center', justifyContent: 'center' }}
                >
                  <Zap size={16} /> Renew Plan
                </a>
              )}
            </div>
          ) : (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', padding: 'var(--space-4) 0' }}>
              No subscription data found. Try syncing.
            </div>
          )}
        </div>
      </div>

      {/* ── Device panel ────────────────────────────────────────────── */}
      <div className="modern-panel" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-6)', padding: 'var(--space-5) var(--space-6)' }}>
        <div style={{
          width: 48, height: 48, borderRadius: 'var(--radius-lg)', flexShrink: 0,
          background: 'var(--success-subtle)',
          border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <ShieldCheck size={22} color="var(--success)" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Device Authenticated</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            This Magic Bill instance is securely linked to your account.
          </div>
        </div>
        <div style={{
          fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)', padding: '4px 10px',
          background: 'var(--bg-inset)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)', maxWidth: 220,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }} title={licenseKey}>
          {licenseKey.slice(0, 24)}…
        </div>
      </div>

    </div>
  );
}

/* ── Helper: info row ──────────────────────────────────────────────── */
function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: 'var(--space-3) 0',
      borderBottom: '1px solid var(--border-subtle)',
      gap: 'var(--space-3)'
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 'var(--radius-md)',
        background: 'var(--accent-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0
      }}>
        {icon}
      </div>
      <div style={{ flex: '0 0 80px', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
        {value || <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, fontStyle: 'italic' }}>Not set</span>}
      </div>
    </div>
  );
}
