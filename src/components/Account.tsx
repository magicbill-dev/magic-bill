import { useState, useEffect } from 'react';
import { firestore } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import Database from "@tauri-apps/plugin-sql";
import { ShieldCheck, LogOut, RefreshCw, UserCircle, Store, Phone, Mail, Fingerprint, Activity } from "lucide-react";

interface AccountProps {
  db: Database | null;
}

export default function Account({ db }: AccountProps) {
  const [licenseKey, setLicenseKey] = useState<string>(() => localStorage.getItem('magicbill_license_key') || '');
  const [previousKey, setPreviousKey] = useState<string>(() => localStorage.getItem('magicbill_license_key_history') || '');
  const [inputKey, setInputKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [subDetails, setSubDetails] = useState<any>(null);
  const [userDetails, setUserDetails] = useState<any>(null);

  useEffect(() => {
    if (db) {
      loadLocalSubscription();
      if (licenseKey) {
        verifyAndFetchSubscription(licenseKey);
      }
    }
  }, [db, licenseKey]);

  const loadLocalSubscription = async () => {
    if (!db) return;
    try {
      const localSub: any[] = await db.select('SELECT * FROM subscription WHERE id = 1');
      if (localSub && localSub.length > 0) {
        setSubDetails(localSub[0]);
      }
      const localUser: any[] = await db.select('SELECT * FROM user_details WHERE id = 1');
      if (localUser && localUser.length > 0) {
        setUserDetails(localUser[0]);
      }
    } catch (e) {
      console.error("Error reading local data:", e);
    }
  };

  const verifyAndFetchSubscription = async (keyToVerify: string) => {
    if (!db) return;
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
        
        // Save valid key
        localStorage.setItem('magicbill_license_key', keyToVerify);
        localStorage.setItem('magicbill_license_key_history', keyToVerify);
        setPreviousKey(keyToVerify);
        setLicenseKey(keyToVerify);
        setSubDetails(sub);
        setUserDetails(userInfo);
        
        // Ensure user_details table exists
        await db.execute(`
          CREATE TABLE IF NOT EXISTS user_details (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            displayName TEXT,
            email TEXT,
            mobileNumber TEXT,
            restaurantName TEXT
          );
        `);
        await db.execute(`INSERT OR IGNORE INTO user_details (id) VALUES (1)`);

        // Sync user details to SQLite
        await db.execute(
          `UPDATE user_details SET 
            displayName = $1, 
            email = $2, 
            mobileNumber = $3, 
            restaurantName = $4
          WHERE id = 1`,
          [
            userInfo.displayName,
            userInfo.email,
            userInfo.mobileNumber,
            userInfo.restaurantName
          ]
        );

        // Sync subscription to SQLite
        await db.execute(
          `UPDATE subscription SET 
            status = $1, 
            planId = $2, 
            subscriptionId = $3, 
            nextBillingDate = $4, 
            updatedAt = $5
          WHERE id = 1`,
          [
            sub.status || '', 
            sub.planId || '', 
            sub.id || '', 
            sub.nextBillingDate || '', 
            sub.updatedAt || ''
          ]
        );
      } else {
        setError('Invalid License Key / User ID.');
        if (licenseKey === keyToVerify) {
           handleLogout(); // clear if current key became invalid
        }
      }
    } catch (err: any) {
      console.error("Error fetching data from Firebase:", err);
      setError(err.message || 'Failed to verify license key. Check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = () => {
    if (!inputKey.trim()) {
      setError("Please enter a valid User ID.");
      return;
    }
    verifyAndFetchSubscription(inputKey.trim());
  };

  const handleLogout = async () => {
    localStorage.removeItem('magicbill_license_key');
    setLicenseKey('');
    setInputKey('');
    setSubDetails(null);
    setUserDetails(null);
    if (db) {
      await db.execute('UPDATE subscription SET status = "", planId = "", subscriptionId = "", nextBillingDate = "", updatedAt = "" WHERE id = 1');
      try {
        await db.execute('UPDATE user_details SET displayName = "", email = "", mobileNumber = "", restaurantName = "" WHERE id = 1');
      } catch(e) {}
    }
  };

  const calculatePlanStatus = () => {
     if (!subDetails || !subDetails.nextBillingDate) return { status: 'expired', remainingDays: 0 };
     const nextBilling = new Date(subDetails.nextBillingDate).getTime();
     const now = new Date().getTime();
     const gracePeriodMs = 10 * 24 * 60 * 60 * 1000;
     
     const diffDays = Math.ceil((nextBilling - now) / (1000 * 3600 * 24));
     
     if (now <= nextBilling) {
         return { status: 'active', remainingDays: diffDays };
     } else if (now <= nextBilling + gracePeriodMs) {
         const graceDaysLeft = 10 + diffDays; // diffDays is negative here
         return { status: 'grace', remainingDays: graceDaysLeft };
     } else {
         return { status: 'expired', remainingDays: 0 };
     }
  };

  const planInfo = calculatePlanStatus();

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', 
      backgroundColor: 'var(--bg-dark, #000000)', padding: '2rem', boxSizing: 'border-box', overflowY: 'auto'
    }}>
      <div style={{
         width: '100%', maxWidth: licenseKey ? '900px' : '450px', 
         background: 'linear-gradient(135deg, rgba(15,15,20, 0.95) 0%, rgba(5,5,10, 0.95) 100%)',
         borderRadius: '1.5rem', padding: '0', color: '#ffffff', position: 'relative',
         boxShadow: '0 30px 60px -15px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255,255,255,0.1)',
         fontFamily: 'system-ui, -apple-system, sans-serif',
         overflow: 'hidden',
         border: '1px solid rgba(255,255,255,0.08)',
         animation: 'popIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
         display: 'flex',
         flexDirection: licenseKey ? 'row' : 'column',
         minHeight: '400px'
      }}>
        <style>{`
          @keyframes popIn {
            0% { opacity: 0; transform: scale(0.95) translateY(10px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes spin { 100% { transform: rotate(360deg); } }
          .spin { animation: spin 1s linear infinite; }
          .glass-btn { transition: all 0.2s; }
          .glass-btn:hover { background: rgba(255,255,255,0.1) !important; border-color: rgba(255,255,255,0.2) !important; }
          .glass-btn:active { transform: scale(0.98); }
          .glass-input:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 3px rgba(59,130,246,0.2); }
        `}</style>

        {/* Left Pane (or Top Pane if not logged in) */}
        <div style={{ flex: 1, padding: '3rem 2.5rem', background: 'rgba(0,0,0,0.2)', borderRight: licenseKey ? '1px solid rgba(255,255,255,0.05)' : 'none', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
           <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px', borderRadius: '1.5rem', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.1))', color: '#60a5fa', marginBottom: '1.5rem', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1), 0 10px 20px -5px rgba(0,0,0,0.3)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              <ShieldCheck size={40} strokeWidth={1.5} />
           </div>
           <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.03em', color: '#fff' }}>
              {licenseKey ? 'Active Device' : 'Device Activation'}
           </h2>
           <p style={{ margin: '0.75rem 0 0 0', color: '#94a3b8', fontSize: '1rem', lineHeight: '1.5', maxWidth: '300px' }}>
              {licenseKey ? 'Your Magic Bill instance is authenticated and connected.' : 'Please enter your unique User ID to unlock the dashboard and reporting features.'}
           </p>

           {licenseKey && (
              <div style={{ marginTop: '2.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                 <button 
                    onClick={() => verifyAndFetchSubscription(licenseKey)} 
                    disabled={loading}
                    className="glass-btn"
                    style={{ width: '100%', padding: '0.875rem', backgroundColor: 'rgba(255,255,255,0.05)', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 500 }}
                 >
                    <RefreshCw size={18} className={loading ? "spin" : ""} /> {loading ? 'Syncing...' : 'Sync Latest Data'}
                 </button>
                 <button 
                    onClick={handleLogout}
                    style={{ width: '100%', padding: '0.875rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '0.75rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', transition: 'all 0.2s' }}
                    onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)'; }}
                 >
                    <LogOut size={18} /> Deactivate Device
                 </button>
              </div>
           )}
        </div>
        
        {/* Right Pane (or Bottom Pane if not logged in) */}
        <div style={{ flex: 1.2, padding: '3rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
           {!licenseKey ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {error && <div style={{ color: '#fca5a5', padding: '0.875rem', backgroundColor: 'rgba(239, 68, 68, 0.15)', borderRadius: '0.5rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>{error}</div>}
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                 <label style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    License Key / User ID
                 </label>
                 <input 
                    type="text" 
                    placeholder="Paste your key here..." 
                    value={inputKey}
                    onChange={(e) => setInputKey(e.target.value)}
                    className="glass-input"
                    style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '1rem', outline: 'none', transition: 'all 0.2s', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }}
                 />
              </div>

              <button 
                 onClick={handleActivate} 
                 disabled={loading}
                 style={{ 
                    padding: '1rem', 
                    background: 'linear-gradient(to right, #2563eb, #3b82f6)', 
                    color: '#fff', 
                    border: 'none', 
                    borderRadius: '0.75rem', 
                    cursor: loading ? 'not-allowed' : 'pointer', 
                    fontWeight: 600,
                    fontSize: '1.05rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    marginTop: '0.5rem',
                    boxShadow: '0 10px 20px -10px rgba(37, 99, 235, 0.5), inset 0 1px 1px rgba(255,255,255,0.2)',
                    transition: 'transform 0.1s, box-shadow 0.1s'
                 }}
                 onMouseDown={(e) => !loading && (e.currentTarget.style.transform = 'scale(0.98)')}
                 onMouseUp={(e) => !loading && (e.currentTarget.style.transform = 'scale(1)')}
                 onMouseLeave={(e) => !loading && (e.currentTarget.style.transform = 'scale(1)')}
              >
                 {loading ? <RefreshCw size={20} className="spin" /> : 'Activate Now'}
              </button>

              {previousKey && (
                 <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', textAlign: 'center' }}>Previously used key found:</span>
                    <button 
                       onClick={() => setInputKey(previousKey)}
                       style={{ 
                          background: 'rgba(255,255,255,0.05)', 
                          border: '1px dashed rgba(255,255,255,0.2)', 
                          color: '#94a3b8', 
                          padding: '0.75rem', 
                          borderRadius: '0.5rem', 
                          fontSize: '0.9rem', 
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          wordBreak: 'break-all'
                       }}
                       onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#f8fafc'; }}
                       onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#94a3b8'; }}
                    >
                       {previousKey}
                    </button>
                 </div>
              )}
           </div>
           ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', animation: 'popIn 0.5s ease-out' }}>
                 
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                       <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          <Fingerprint size={18} /> Identity
                       </h3>
                    </div>
                    
                    {userDetails && (
                       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                             <span style={{ fontSize: '0.8rem', color: '#64748b' }}><UserCircle size={14} style={{verticalAlign: 'text-bottom', marginRight: '4px'}}/> Name</span>
                             <span style={{ fontSize: '1rem', fontWeight: 500, color: '#f8fafc' }}>{userDetails.displayName || '-'}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                             <span style={{ fontSize: '0.8rem', color: '#64748b' }}><Store size={14} style={{verticalAlign: 'text-bottom', marginRight: '4px'}}/> Business</span>
                             <span style={{ fontSize: '1rem', fontWeight: 500, color: '#f8fafc' }}>{userDetails.restaurantName || '-'}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                             <span style={{ fontSize: '0.8rem', color: '#64748b' }}><Phone size={14} style={{verticalAlign: 'text-bottom', marginRight: '4px'}}/> Mobile</span>
                             <span style={{ fontSize: '1rem', fontWeight: 500, color: '#f8fafc' }}>{userDetails.mobileNumber || '-'}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                             <span style={{ fontSize: '0.8rem', color: '#64748b' }}><Mail size={14} style={{verticalAlign: 'text-bottom', marginRight: '4px'}}/> Email</span>
                             <span style={{ fontSize: '1rem', fontWeight: 500, color: '#f8fafc' }}>{userDetails.email || '-'}</span>
                          </div>
                       </div>
                    )}
                 </div>

                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                       <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          <Activity size={18} /> Plan Status
                       </h3>
                       {planInfo.status === 'active' && (
                          <span style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', borderRadius: '1rem', fontWeight: 700, letterSpacing: '0.05em', border: '1px solid rgba(16, 185, 129, 0.3)' }}>ACTIVE</span>
                       )}
                       {planInfo.status === 'grace' && (
                          <span style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', borderRadius: '1rem', fontWeight: 700, letterSpacing: '0.05em', border: '1px solid rgba(245, 158, 11, 0.3)' }}>GRACE PERIOD</span>
                       )}
                       {planInfo.status === 'expired' && (
                          <span style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', borderRadius: '1rem', fontWeight: 700, letterSpacing: '0.05em', border: '1px solid rgba(239, 68, 68, 0.3)' }}>EXPIRED</span>
                       )}
                       {planInfo.status === 'tampered' && (
                          <span style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', borderRadius: '1rem', fontWeight: 700, letterSpacing: '0.05em', border: '1px solid rgba(239, 68, 68, 0.3)' }}>LOCKED</span>
                       )}
                    </div>

                    {subDetails && (
                       <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                               <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Current Plan</span>
                               <span style={{ fontSize: '1rem', fontWeight: 500, color: '#f8fafc', textTransform: 'capitalize' }}>{subDetails.planId || 'Free'}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                               <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Next Billing</span>
                               <span style={{ fontSize: '1rem', fontWeight: 500, color: '#f8fafc' }}>{subDetails.nextBillingDate ? new Date(subDetails.nextBillingDate).toLocaleDateString() : 'N/A'}</span>
                            </div>
                         </div>
                         {planInfo.status === 'tampered' ? (
                            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '1rem', padding: '1.25rem', textAlign: 'center' }}>
                               <p style={{ color: '#fca5a5', margin: '0 0 1rem 0', fontWeight: 500 }}>System time tampering detected. Your clock is set before your last active session. Please correct your system time and click Sync Latest Data.</p>
                            </div>
                         ) : planInfo.status === 'expired' ? (
                            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '1rem', padding: '1.25rem', textAlign: 'center' }}>
                               <p style={{ color: '#fca5a5', margin: '0 0 1rem 0', fontWeight: 500 }}>Your plan has expired. Please renew to continue using all features.</p>
                               <a href="https://magicbill.in" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', background: '#ef4444', color: '#fff', textDecoration: 'none', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: 600, transition: 'background 0.2s' }}>
                                  Activate Plan
                               </a>
                            </div>
                         ) : planInfo.status === 'grace' ? (
                            <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '1rem', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'center' }}>
                               <p style={{ color: '#fbbf24', margin: '0', fontWeight: 600 }}>Your plan has reached its billing date. You are currently in the grace period.</p>
                               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                                  <span style={{ color: '#fcd34d', fontWeight: 500 }}>Grace Days Left:</span>
                                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b' }}>{planInfo.remainingDays}</span>
                               </div>
                               <a href="https://magicbill.in" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', background: 'transparent', border: '1px solid #f59e0b', color: '#f59e0b', textDecoration: 'none', padding: '0.5rem 1rem', borderRadius: '0.5rem', fontWeight: 600, marginTop: '0.5rem' }}>
                                  Renew Now
                               </a>
                            </div>
                         ) : (
                            <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '1rem', padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                               <span style={{ color: '#34d399', fontWeight: 500 }}>Remaining Days:</span>
                               <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981' }}>{planInfo.remainingDays}</span>
                            </div>
                         )}
                       </div>
                    )}
                 </div>

              </div>
           )}
        </div>
      </div>
    </div>
  );
}
