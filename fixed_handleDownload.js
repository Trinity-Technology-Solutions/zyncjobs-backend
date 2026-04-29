// Fixed handleDownload function for PrivacySettingsPage.tsx
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