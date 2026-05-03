import React, { useState, useEffect } from 'react';
import {
  Shield, Download, Trash2, ToggleLeft, ToggleRight,
  Loader, History, ChevronRight, AlertTriangle,
} from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import BackButton from '../components/BackButton';
import { accountAPI } from '../api/account';

interface Props {
  onNavigate: (page: string) => void;
  user?: any;
  onLogout?: () => void;
}

interface PrivacySettings {
  storeResume: boolean;
  allowEmployerView: boolean;
  receiveJobAlerts: boolean;
  allowAIRecommendations: boolean;
}

const CANDIDATE_TOGGLES: { key: keyof PrivacySettings; label: string; desc: string }[] = [
  { key: 'storeResume',            label: 'Store my resume',                 desc: 'Allow ZyncJobs to securely store your resume for job matching.' },
  { key: 'allowEmployerView',      label: 'Allow employers to view profile',  desc: 'Employers can discover and view your profile in search results.' },
  { key: 'receiveJobAlerts',       label: 'Receive job alerts',              desc: 'Get email notifications about new matching job opportunities.' },
  { key: 'allowAIRecommendations', label: 'Allow AI-based recommendations',  desc: 'Your resume data may be processed by AI to improve job recommendations.' },
];

const EMPLOYER_TOGGLES: { key: keyof PrivacySettings; label: string; desc: string }[] = [
  { key: 'storeResume',            label: 'Store company profile',              desc: 'Allow ZyncJobs to securely store your company profile for candidate discovery.' },
  { key: 'allowEmployerView',      label: 'Allow candidates to view company',   desc: 'Candidates can discover and view your company profile in search results.' },
  { key: 'receiveJobAlerts',       label: 'Receive application alerts',         desc: 'Get email notifications about new candidate applications to your job postings.' },
  { key: 'allowAIRecommendations', label: 'Allow AI-based candidate matching',  desc: 'Your job data may be processed by AI to improve candidate recommendations.' },
];

const CANDIDATE_STORAGE_KEY = 'zync_privacy_settings';
const EMPLOYER_STORAGE_KEY = 'zync_employer_privacy_settings';

const DEFAULT_SETTINGS: PrivacySettings = {
  storeResume: true,
  allowEmployerView: true,
  receiveJobAlerts: true,
  allowAIRecommendations: true,
};

type Tab = 'settings' | 'history';

const loadLocalSettings = (storageKey: string): PrivacySettings => {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
};

const saveLocalSettings = (s: PrivacySettings, storageKey: string) => {
  try { localStorage.setItem(storageKey, JSON.stringify(s)); } catch { /* ignore */ }
};

const PrivacySettingsPage: React.FC<Props> = ({ onNavigate, user: propUser, onLogout }) => {
  const storedUser = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const isEmployer = (propUser?.type || propUser?.userType || propUser?.role || storedUser?.userType || storedUser?.role || storedUser?.type) === 'employer';
  const TOGGLES = isEmployer ? EMPLOYER_TOGGLES : CANDIDATE_TOGGLES;
  const STORAGE_KEY = isEmployer ? EMPLOYER_STORAGE_KEY : CANDIDATE_STORAGE_KEY;
  const [tab, setTab]               = useState<Tab>('settings');
  const [settings, setSettings]     = useState<PrivacySettings>(() => loadLocalSettings(STORAGE_KEY));
  const [loading, setLoading]       = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [msg, setMsg]               = useState<{ text: string; ok: boolean } | null>(null);

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  };

  // Try to sync with backend on mount — only apply if local storage has no saved settings yet
  useEffect(() => {
    const hasLocalSettings = !!localStorage.getItem(STORAGE_KEY);
    if (hasLocalSettings) { setLoading(false); return; }
    const API = import.meta.env.VITE_API_URL || '/api';
    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken') || '';
    fetch(`${API}/gdpr/privacy-settings`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          const merged = { ...DEFAULT_SETTINGS, ...data };
          setSettings(merged);
          saveLocalSettings(merged, STORAGE_KEY);
        }
      })
      .catch(() => { /* use localStorage */ })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (key: keyof PrivacySettings) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    saveLocalSettings(updated, STORAGE_KEY);
    flash('Settings saved.', true);

    // Best-effort backend sync — no error shown if it fails
    const API = import.meta.env.VITE_API_URL || '/api';
    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken') || '';
    fetch(`${API}/gdpr/privacy-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(updated),
    }).catch(() => { /* silent — already saved locally */ });
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const storedProfile = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
      const baseProfile = propUser || storedProfile;
      const API = import.meta.env.VITE_API_URL || '/api';
      const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken') || '';
      const userId = baseProfile.id || baseProfile._id;

      if (!userId) {
        flash('User ID not found. Please log in again.', false);
        return;
      }

      // Use the backend PDF generation instead of frontend
      const response = await fetch(`${API}/gdpr/export-pdf/${userId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      // Download the PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const safeName = (baseProfile.name || 'User').replace(/[^a-zA-Z0-9]/g, '_');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `ZyncJobs_DataExport_${safeName}_${dateStr}.pdf`;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      flash('PDF report downloaded successfully.', true);
    } catch (err) {
      console.error('PDF download error:', err);
      flash('Failed to download PDF. Please try again.', false);
    } finally {
      setDownloading(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      isEmployer
        ? 'This will permanently delete your employer account, all job postings, applications, and data. This cannot be undone. Continue?'
        : 'This will permanently delete your account, resume, and all data. This cannot be undone. Continue?'
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      const storedUser2 = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
      const userId = propUser?.id || propUser?._id || storedUser2?.id || storedUser2?._id || '';
      const result = await accountAPI.deleteAccount(userId);
      if (result.success) {
        accountAPI.clearUserData();
        localStorage.removeItem(CANDIDATE_STORAGE_KEY);
        localStorage.removeItem(EMPLOYER_STORAGE_KEY);
        if (onLogout) onLogout();
        setTimeout(() => onNavigate('home'), 1500);
      } else {
        flash(result.message, false);
      }
    } finally {
      setDeleting(false);
    }
  };

  // Consent history from backend
  const [consentHistory, setConsentHistory] = useState<any[]>([]);

  useEffect(() => {
    if (tab !== 'history') return;
    const API = import.meta.env.VITE_API_URL || '/api';
    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken') || '';
    const storedUser2 = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
    const userId = (propUser?.id || propUser?._id || storedUser2?.id || storedUser2?._id || '');
    if (!userId || !token) return;
    fetch(`${API}/gdpr/consent-history/${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : [])
      .then(data => setConsentHistory(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [tab]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header onNavigate={onNavigate} user={propUser} onLogout={onLogout} />

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-10">
        <BackButton
          onClick={() => onNavigate('settings')}
          text="Back to Settings"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-800 mb-6 transition-colors"
        />

        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Privacy & Data</h1>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          {(['settings', 'history'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${
                tab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'history' ? 'Consent History' : 'Privacy Settings'}
            </button>
          ))}
        </div>

        {/* Flash message */}
        {msg && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${
            msg.ok
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {!msg.ok && <AlertTriangle className="w-4 h-4 shrink-0" />}
            {msg.text}
          </div>
        )}

        {/* ── Settings Tab ── */}
        {tab === 'settings' && (
          <>
            {/* Privacy toggles */}
            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 mb-6">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <Loader className="w-5 h-5 animate-spin mr-2" /> Loading settings…
                </div>
              ) : (
                TOGGLES.map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between px-5 py-4 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                    </div>
                    <button
                      onClick={() => toggle(key)}
                      className="flex-shrink-0 text-blue-600 hover:text-blue-700 transition-colors"
                      aria-label={`Toggle ${label}`}
                    >
                      {settings[key] ? (
                        <ToggleRight className="w-8 h-8" />
                      ) : (
                        <ToggleLeft className="w-8 h-8 text-gray-400" />
                      )}
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Data actions */}
            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 mb-6">
              {/* Download */}
              <div className="flex items-center justify-between px-5 py-4 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">Download My Data</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {isEmployer
                      ? 'Get a copy of your company profile, job postings, and hiring data (GDPR Art. 20 — portability).'
                      : 'Get a copy of your profile, resume, and applications (GDPR Art. 20 — portability).'}
                  </p>
                </div>
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  {downloading ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {downloading ? 'Preparing…' : 'Download'}
                </button>
              </div>

              {/* Consent history shortcut */}
              <button
                onClick={() => setTab('history')}
                className="w-full flex items-center justify-between px-5 py-4 gap-4 hover:bg-gray-50 transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">Consent History</p>
                  <p className="text-xs text-gray-500 mt-0.5">View a full audit log of your consent records.</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </button>

              {/* Delete account */}
              <div className="flex items-center justify-between px-5 py-4 gap-4">
                <div>
                  <p className="text-sm font-medium text-red-700">Delete My Account</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Permanently removes your account, resume, and all associated data (GDPR Art. 17 — erasure).
                  </p>
                </div>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  {deleting ? <Loader className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Consent History Tab ── */}
        {tab === 'history' && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {consentHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                <History className="w-8 h-8" />
                <p className="text-sm">No consent records found.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Consent Types</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Privacy Settings</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {consentHistory.map((record: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(record.consentTypes || []).map((t: string) => (
                            <span key={t} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-100">
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1 text-xs text-gray-600">
                          {[
                            ['Resume', record.storeResume],
                            ['Employer View', record.allowEmployerView],
                            ['Job Alerts', record.receiveJobAlerts],
                            ['AI', record.allowAIRecommendations],
                          ].map(([label, val]) => (
                            <span key={String(label)} className={`px-2 py-0.5 rounded-full border text-xs ${
                              val ? 'bg-green-50 text-green-700 border-green-100' : 'bg-gray-100 text-gray-400 border-gray-200'
                            }`}>
                              {String(label)}: {val ? 'On' : 'Off'}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                        {new Date(record.consentDate).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <p className="text-xs text-gray-400 mt-6 text-center">
          For data requests or questions, contact{' '}
          <a href="mailto:privacy@zyncjobs.com" className="text-blue-500 hover:underline">
            privacy@zyncjobs.com
          </a>
        </p>
        {isEmployer && (
          <p className="text-xs text-gray-400 mt-2 text-center">
            Employer data is handled in accordance with our{' '}
            <a href="/privacy" className="text-blue-500 hover:underline">Privacy Policy</a>.
          </p>
        )}
      </div>

      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default PrivacySettingsPage;