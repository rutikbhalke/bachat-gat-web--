import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePopup } from '../context/PopupContext';
import { groupService } from '../services/dashboardService';
import { authService } from '../services/authService';
import Loader from '../components/common/Loader';
import {
  Settings as SettingsIcon,
  Building2,
  User,
  ShieldCheck,
  Save,
  CheckCircle2,
  AlertCircle,
  Lock,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import AdminResetModal from '../components/forms/AdminResetModal';

const Settings = () => {
  const { user, refreshUser, updateGroupName, isAdmin } = useAuth();
  const { showError, askConfirm, showSuccess } = usePopup();
  const outletContext = useOutletContext();
  const triggerRefresh = outletContext?.triggerRefresh;
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('group'); // 'group' | 'profile' | 'danger'
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  // Group settings state
  const [groupData, setGroupData] = useState({
    group_name: '',
    group_code: '',
    monthly_contribution_per_share: '1000',
    monthly_target: '363000',
    description: '',
  });

  // Profile settings state
  const [profileData, setProfileData] = useState({
    name: user?.fullName || user?.name || '',
    phone: user?.phone || '',
    currentPassword: '',
    newPassword: '',
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (user) {
      setProfileData((prev) => ({
        ...prev,
        name: user.fullName || user.name || '',
        phone: user.phone || '',
      }));
    }
  }, [user]);

  useEffect(() => {
    const fetchGroup = async () => {
      try {
        setLoading(true);
        const res = await groupService.getGroupDetails();
        if (res.success) {
          setGroupData({
            group_name: res.group.group_name || '',
            group_code: res.group.group_code || '',
            monthly_contribution_per_share: res.group.monthly_contribution_per_share?.toString() || '1000',
            monthly_target: res.group.monthly_target?.toString() || '0',
            description: res.group.description || '',
          });
        }
      } catch (err) {
        console.error('Failed to load group details:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchGroup();
  }, []);

  const handleGroupSubmit = async (e) => {
    e.preventDefault();
    if (!groupData.group_name.trim()) {
      showError({
        title: 'Validation Error',
        message: 'Group name cannot be empty.',
      });
      return;
    }

    const confirmed = await askConfirm({
      title: 'Confirm Group Settings Update',
      message: 'Are you sure you want to update group settings?',
      details: [
        { label: 'Group Name', value: groupData.group_name },
        { label: 'Monthly Share', value: `₹${groupData.monthly_contribution_per_share}` },
      ],
      confirmText: 'Save Settings',
      confirmVariant: 'primary',
    });
    if (!confirmed) return;

    try {
      setSaving(true);
      setMessage({ type: '', text: '' });
      const res = await groupService.updateGroupDetails({
        group_name: groupData.group_name,
        monthly_contribution_per_share: parseFloat(groupData.monthly_contribution_per_share),
        monthly_target: parseFloat(groupData.monthly_target),
        description: groupData.description,
      });

      if (res.success) {
        if (res.group && res.group.group_name) {
          updateGroupName(res.group.group_name);
        }
        await refreshUser();
        if (triggerRefresh) triggerRefresh();
        showSuccess({
          title: 'Settings Saved',
          message: 'Group settings updated successfully!',
        });
        setMessage({ type: 'success', text: 'Group settings updated successfully!' });
      }
    } catch (err) {
      showError({
        title: 'Update Failed',
        error: err,
      });
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to update group settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (!profileData.name.trim()) {
      showError({
        title: 'Validation Error',
        message: 'Name cannot be empty.',
      });
      return;
    }

    const confirmed = await askConfirm({
      title: 'Confirm Profile Update',
      message: 'Are you sure you want to save your profile changes?',
      details: [
        { label: 'Name', value: profileData.name },
        { label: 'Phone', value: profileData.phone || 'None' },
      ],
      confirmText: 'Update Profile',
      confirmVariant: 'primary',
    });
    if (!confirmed) return;

    try {
      setSaving(true);
      setMessage({ type: '', text: '' });
      const payload = {
        name: profileData.name,
        phone: profileData.phone,
      };
      if (profileData.newPassword) {
        payload.currentPassword = profileData.currentPassword;
        payload.newPassword = profileData.newPassword;
      }

      const res = await authService.updateProfile(payload);
      if (res.success) {
        showSuccess({
          title: 'Profile Updated',
          message: res.message || 'Profile updated successfully!',
        });
        setMessage({ type: 'success', text: res.message || 'Profile updated successfully!' });
        setProfileData((prev) => ({ ...prev, currentPassword: '', newPassword: '' }));
        await refreshUser();
      }
    } catch (err) {
      showError({
        title: 'Profile Update Failed',
        error: err,
      });
      setMessage({ type: 'error', text: err.response?.data?.message || err.message || 'Failed to update profile.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !groupData.group_name && !profileData.name) return <Loader text="Loading system settings..." />;

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '800px', opacity: loading ? 0.75 : 1, transition: 'opacity 0.15s ease' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Settings & Configurations</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          Configure Bachat Gat parameters, monthly contribution rules, and admin profile
        </p>
      </div>

      {message.text && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            background: message.type === 'success' ? 'var(--success-light)' : 'var(--danger-light)',
            color: message.type === 'success' ? 'var(--success-text)' : 'var(--danger-text)',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs-container">
        {isAdmin && (
          <button
            onClick={() => {
              setActiveTab('group');
              setMessage({ type: '', text: '' });
            }}
            className={`tab-btn ${activeTab === 'group' ? 'active' : ''}`}
          >
            <Building2 size={18} /> Group Configuration
          </button>
        )}

        <button
          onClick={() => {
            setActiveTab('profile');
            setMessage({ type: '', text: '' });
          }}
          className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
        >
          <User size={18} /> Account Profile
        </button>

        {isAdmin && (
          <button
            onClick={() => {
              setActiveTab('danger');
              setMessage({ type: '', text: '' });
            }}
            className={`tab-btn ${activeTab === 'danger' ? 'active' : ''}`}
            style={{ color: activeTab === 'danger' ? 'var(--danger)' : undefined }}
          >
            <AlertTriangle size={18} color="var(--danger)" /> Reset & Clean Data
          </button>
        )}
      </div>

      {/* TAB 1: GROUP CONFIGURATION */}
      {activeTab === 'group' && isAdmin && (
        <div className="card">
          <h2 style={{ fontSize: '1.2rem', marginBottom: '18px' }}>Bachat Gat Parameters</h2>
          <form onSubmit={handleGroupSubmit}>
            <div className="form-group">
              <label className="form-label">Group Name *</label>
              <input
                type="text"
                className="form-input"
                value={groupData.group_name}
                onChange={(e) => setGroupData({ ...groupData, group_name: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Group Code (Unique Identifier)</label>
              <input
                type="text"
                className="form-input"
                value={groupData.group_code}
                disabled
                style={{ background: '#F1F5F9', color: 'var(--text-muted)' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Group code cannot be altered.</span>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Monthly Share Contribution (₹) *</label>
                <input
                  type="number"
                  className="form-input"
                  value={groupData.monthly_contribution_per_share}
                  onChange={(e) => setGroupData({ ...groupData, monthly_contribution_per_share: e.target.value })}
                  min="1"
                  step="1"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Monthly Group Target (₹)</label>
                <input
                  type="number"
                  className="form-input"
                  value={groupData.monthly_target}
                  onChange={(e) => setGroupData({ ...groupData, monthly_target: e.target.value })}
                  min="0"
                  step="1"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Group Description</label>
              <textarea
                className="form-textarea"
                rows={3}
                value={groupData.description}
                onChange={(e) => setGroupData({ ...groupData, description: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button type="submit" className="btn-primary" disabled={saving}>
                <Save size={16} />
                {saving ? 'Saving Changes...' : 'Save Group Settings'}
              </button>
            </div>
          </form>

          {/* DANGER ZONE SECTION IN GROUP CONFIGURATION */}
          <div className="danger-card" style={{ marginTop: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#B91C1C', marginBottom: '8px' }}>
              <AlertTriangle size={22} color="var(--danger)" />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#B91C1C' }}>
                Danger Zone: Reset & Clean Data
              </h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '18px', lineHeight: 1.5 }}>
              Permanently delete all existing financial demo records (contributions, loans, repayments, transactions) and allocate fresh opening capital for all approved members. Member accounts, Admin login and Group settings are 100% preserved.
            </p>
            <div>
              <button
                type="button"
                className="btn-danger"
                onClick={() => setIsResetModalOpen(true)}
              >
                <Trash2 size={16} /> Reset / Clean Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PROFILE SETTINGS */}
      {activeTab === 'profile' && (
        <div className="card">
          <h2 style={{ fontSize: '1.2rem', marginBottom: '18px' }}>Admin Profile & Security</h2>
          <form onSubmit={handleProfileSubmit}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                type="text"
                className="form-input"
                value={profileData.name}
                onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                value={user?.email || ''}
                disabled
                style={{ background: '#F1F5F9', color: 'var(--text-muted)' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                type="tel"
                className="form-input"
                value={profileData.phone}
                onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">System Role</label>
              <input
                type="text"
                className="form-input"
                value={user?.role_name || user?.role || 'MEMBER'}
                disabled
                style={{ background: '#F1F5F9', fontWeight: 700, color: 'var(--primary)' }}
              />
            </div>

            <div style={{ margin: '20px 0 14px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={16} /> Change Password (Optional)
              </h3>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Current Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Enter current password"
                    value={profileData.currentPassword}
                    onChange={(e) => setProfileData({ ...profileData, currentPassword: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">New Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Enter new password"
                    value={profileData.newPassword}
                    onChange={(e) => setProfileData({ ...profileData, newPassword: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button type="submit" className="btn-primary" disabled={saving}>
                <Save size={16} />
                {saving ? 'Updating...' : 'Update Profile'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: DANGER ZONE (ADMIN ONLY) */}
      {activeTab === 'danger' && isAdmin && (
        <div className="card" style={{ border: '1.5px solid #FCA5A5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#B91C1C', marginBottom: '12px' }}>
            <AlertTriangle size={24} color="var(--danger)" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#B91C1C' }}>
              System Reset & Clean Data Center
            </h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px', lineHeight: 1.6 }}>
            This feature allows the Bachat Gat administrator to reset the demo environment to a pristine state.
            It performs a verified double-confirmation process, automatically backs up all collections, deletes old financial activity, and assigns fresh opening base savings to each registered approved member.
          </p>

          <div
            style={{
              background: '#FFF5F5',
              border: '1px solid #FECACA',
              borderRadius: 'var(--radius-md)',
              padding: '16px 20px',
              marginBottom: '24px',
            }}
          >
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#991B1B', marginBottom: '8px' }}>
              Safety & Integrity Guarantees:
            </h4>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: '#7F1D1D', lineHeight: 1.6 }}>
              <li>Full safety backup created and verified before any data deletion</li>
              <li>Member accounts and names are 100% preserved (0 deletions)</li>
              <li>Admin user account is completely untouched</li>
              <li>Group configuration and monthly contribution rules remain intact</li>
              <li>Double confirmation with case-sensitive "RESET DATA" text verification</li>
              <li>Direct Firestore post-reset verification after execution</li>
            </ul>
          </div>

          <div>
            <button
              type="button"
              className="btn-danger"
              style={{ fontSize: '1rem', padding: '12px 24px' }}
              onClick={() => setIsResetModalOpen(true)}
            >
              <Trash2 size={18} /> Reset / Clean Data
            </button>
          </div>
        </div>
      )}

      {/* Admin Reset Modal */}
      {isAdmin && (
        <AdminResetModal
          isOpen={isResetModalOpen}
          onClose={() => setIsResetModalOpen(false)}
          onSuccess={() => {
            if (triggerRefresh) triggerRefresh();
            refreshUser();
          }}
        />
      )}
    </div>
  );
};

export default Settings;
