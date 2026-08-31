import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Paperclip, Save, UploadCloud, Trash2, Download, 
  BarChart2, FileText, Presentation, Image, Code2, FileSpreadsheet, Folder,
  Loader2, Check, AlertCircle
} from 'lucide-react';
import { api } from '../api/client';
import { useLanguage } from '../hooks/useLanguage';
import { toast } from 'react-toastify';

const CATEGORIES = [
  { value: 'spss', icon: BarChart2, labelKey: 'category_spss' },
  { value: 'word', icon: FileText, labelKey: 'category_word' },
  { value: 'ppt', icon: Presentation, labelKey: 'category_ppt' },
  { value: 'infographic', icon: Image, labelKey: 'category_infographic' },
  { value: 'coding_file', icon: Code2, labelKey: 'category_coding_file' },
  { value: 'report', icon: FileSpreadsheet, labelKey: 'category_report' },
  { value: 'other', icon: Folder, labelKey: 'category_other' },
];

const CATEGORY_ICONS = {
  spss: BarChart2,
  word: FileText,
  ppt: Presentation,
  infographic: Image,
  coding_file: Code2,
  report: FileSpreadsheet,
  other: Folder,
};

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function CampaignAssetsModal({ isOpen, onClose, campaign, onAssetsUpdated }) {
  const { t, language } = useLanguage();
  const isRtl = language === 'ar';
  const fileInputRef = useRef(null);

  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [savingNotes, setSavingNotes] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('report');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (campaign) {
      setNotes(campaign.assets?.notes || '');
      setAttachments(campaign.assets?.attachments || []);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [campaign, isOpen]);

  if (!campaign) return null;

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      const res = await api.put(`/admin/campaigns/${campaign._id}/notes`, { notes });
      toast.success(t('notesSaved'));
      if (onAssetsUpdated) {
        onAssetsUpdated(campaign._id, res.data.assets);
      }
    } catch (err) {
      console.error('Error saving notes:', err);
      toast.error(err.response?.data?.error || 'Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error(t('fileTooLarge'));
      e.target.value = '';
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.warning(t('chooseFile'));
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('category', selectedCategory);
      formData.append('file', selectedFile);

      const res = await api.post(`/admin/campaigns/${campaign._id}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success(t('attachmentUploaded'));
      setAttachments(res.data.assets?.attachments || []);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      if (onAssetsUpdated) {
        onAssetsUpdated(campaign._id, res.data.assets);
      }
    } catch (err) {
      console.error('Upload error:', err);
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    if (!window.confirm(t('confirmDeleteAttachment'))) return;

    setDeletingId(attachmentId);
    try {
      const res = await api.delete(`/admin/campaigns/${campaign._id}/attachments/${attachmentId}`);
      toast.success(t('attachmentDeleted'));
      setAttachments(res.data.assets?.attachments || []);

      if (onAssetsUpdated) {
        onAssetsUpdated(campaign._id, res.data.assets);
      }
    } catch (err) {
      console.error('Delete error:', err);
      toast.error(err.response?.data?.error || 'Failed to delete attachment');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="drawer-overlay"
            style={{ zIndex: 4000 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ scale: 0.92, opacity: 0, x: '-50%', y: '-50%' }}
            animate={{ scale: 1, opacity: 1, x: '-50%', y: '-50%' }}
            exit={{ scale: 0.92, opacity: 0, x: '-50%', y: '-50%' }}
            className="campaign-assets-modal-container"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              width: '680px',
              maxWidth: '92vw',
              maxHeight: '90vh',
              zIndex: 4001,
              background: 'var(--card-bg)',
              backdropFilter: 'blur(32px)',
              borderRadius: 'var(--radius-lg)',
              border: 'var(--glass-border)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)'
            }}
          >
            {/* Modal Header */}
            <div className="assets-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className="assets-header-icon-box">
                  <Paperclip size={20} color="var(--primary)" />
                </div>
                <div>
                  <h2 style={{ marginBottom: 0, fontSize: '1.25rem' }}>{t('campaignAssets')}</h2>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {campaign.title}
                  </div>
                </div>
              </div>
              <button className="nav-action-btn" onClick={onClose} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="assets-modal-body" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
              
              {/* Section 1: Campaign Notes */}
              <div className="assets-card-section">
                <div className="assets-section-title-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FileText size={16} color="var(--primary)" />
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{t('campaignNotes')}</span>
                  </div>
                  <button
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="btn-primary"
                    style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    {savingNotes ? <Loader2 size={14} className="spin-icon" /> : <Save size={14} />}
                    {t('saveNotes')}
                  </button>
                </div>
                <textarea
                  className="input-field assets-notes-textarea"
                  placeholder={t('notesPlaceholder')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  style={{ width: '100%', resize: 'vertical', marginTop: '0.75rem' }}
                />
              </div>

              {/* Section 2: Upload New Asset */}
              <div className="assets-card-section">
                <div className="assets-section-title-row" style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <UploadCloud size={16} color="var(--primary)" />
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{t('uploadAttachment')}</span>
                  </div>
                </div>

                <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 2fr', gap: '0.75rem' }}>
                    {/* Category Select */}
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.3rem', display: 'block' }}>
                        {t('fileCategory')}
                      </label>
                      <select
                        className="input-field"
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        style={{ width: '100%' }}
                      >
                        {CATEGORIES.map(cat => (
                          <option key={cat.value} value={cat.value}>
                            {t(cat.labelKey)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* File Input */}
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.3rem', display: 'block' }}>
                        {t('chooseFile')} (Max 10MB)
                      </label>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="input-field"
                        style={{ width: '100%', padding: '0.4rem' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                    <button
                      type="submit"
                      disabled={!selectedFile || uploading}
                      className="btn-primary"
                      style={{ padding: '0.5rem 1.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      {uploading ? <Loader2 size={16} className="spin-icon" /> : <UploadCloud size={16} />}
                      {uploading ? t('uploading') : t('uploadFile')}
                    </button>
                  </div>
                </form>
              </div>

              {/* Section 3: Attached Files List */}
              <div className="assets-card-section">
                <div className="assets-section-title-row" style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Folder size={16} color="var(--primary)" />
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{t('attachedFiles')}</span>
                  </div>
                  <span className="assets-count-badge">{attachments.length}</span>
                </div>

                {attachments.length === 0 ? (
                  <div className="assets-empty-container">
                    <Folder size={32} opacity={0.3} />
                    <p style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {t('noAttachments')}
                    </p>
                  </div>
                ) : (
                  <div className="assets-files-grid">
                    {attachments.map((att) => {
                      const IconComponent = CATEGORY_ICONS[att.category] || Folder;
                      const catKey = `category_${att.category || 'other'}`;
                      const isDeleting = deletingId === att._id;

                      return (
                        <div key={att._id} className="assets-file-row">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                            <div className="assets-file-icon-box">
                              <IconComponent size={18} color="var(--primary)" />
                            </div>
                            <div style={{ overflow: 'hidden' }}>
                              <div className="assets-file-name" title={att.fileName}>
                                {att.fileName}
                              </div>
                              <div className="assets-file-meta">
                                <span className="assets-cat-tag">{t(catKey) || att.category}</span>
                                {att.fileSize ? <span>• {formatBytes(att.fileSize)}</span> : null}
                                <span>• {att.uploadedAt ? new Date(att.uploadedAt).toLocaleDateString() : ''}</span>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <a
                              href={att.fileUrl}
                              download={att.fileName}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-secondary"
                              style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                              title="Download"
                            >
                              <Download size={14} />
                            </a>

                            <button
                              onClick={() => handleDeleteAttachment(att._id)}
                              disabled={isDeleting}
                              className="btn-danger"
                              style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center' }}
                              title="Delete"
                            >
                              {isDeleting ? <Loader2 size={14} className="spin-icon" /> : <Trash2 size={14} />}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="assets-modal-footer">
              <button className="btn-secondary" onClick={onClose}>
                {t('close') || 'Close'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
