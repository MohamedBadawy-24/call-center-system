import React, { useState, useEffect, useRef, useContext } from 'react';
import { api } from '../api/client';
import { UIContext } from '../context/UIContext';
import { FLAG_CATEGORIES } from '../utils/flagCategories';
import { toast } from 'react-toastify';

export default function FlagPopover({
  responseId,
  serialNumber,
  isFlagged,
  existingFlagCategory,
  existingFlagNote,
  onFlagSuccess,
  onClose
}) {
  const { t, language } = useContext(UIContext);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [note, setNote] = useState('');
  const [showCategoryError, setShowCategoryError] = useState(false);
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef(null);

  // Outside click listener
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [onClose]);

  // Escape key listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCategory) {
      setShowCategoryError(true);
      return;
    }
    if (note.length > 500) {
      return;
    }

    try {
      setLoading(true);
      const res = await api.post(`/reviews/${responseId}/flag`, {
        flagCategory: selectedCategory,
        flagNote: note
      });
      toast.success(t('flaggedResponse'));
      onFlagSuccess(res.data);
    } catch (err) {
      console.error("[FLAG API ERROR]", err.response?.data || err.message);
      toast.error("Failed to flag response");
    } finally {
      setLoading(false);
    }
  };

  const getCategoryLabel = (catValue) => {
    const match = FLAG_CATEGORIES.find(c => c.value === catValue);
    if (!match) return catValue;
    return language === 'ar' ? match.labelAr : match.labelEn;
  };

  if (isFlagged) {
    return (
      <div ref={popoverRef} className="flag-popover-card" onClick={(e) => e.stopPropagation()}>
        <div className="flag-popover-header">
          {t('flagHeader') || "Flag Response"} · #{serialNumber}
        </div>
        
        <div className="flag-readonly-section">
          <div className="flag-readonly-label">{t('flagCategory') || "Category"}</div>
          <div className="flag-readonly-value">{getCategoryLabel(existingFlagCategory)}</div>
        </div>

        {existingFlagNote && (
          <div className="flag-readonly-section">
            <div className="flag-readonly-label">{t('flagNote') || "Note"}</div>
            <div className="flag-readonly-value" style={{ whiteSpace: 'pre-wrap', maxHeight: '120px', overflowY: 'auto' }}>
              {existingFlagNote}
            </div>
          </div>
        )}

        {/* TODO: unflag endpoint */}
        <button
          className="btn-danger flag-submit-btn"
          disabled
          title="Coming soon"
          style={{ cursor: 'not-allowed', opacity: 0.5 }}
        >
          {t('unflag') || "Unflag"}
        </button>

        <a className="flag-cancel-link" onClick={onClose}>
          {t('cancelFlag') || "Close"}
        </a>
      </div>
    );
  }

  const isNoteTooLong = note.length > 500;

  return (
    <div ref={popoverRef} className="flag-popover-card" onClick={(e) => e.stopPropagation()}>
      <div className="flag-popover-header">
        {t('flagHeader') || "Flag Response"} · #{serialNumber}
      </div>

      <div style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>
        {t('selectCategory') || "Select Category"} *
      </div>

      <div className={`flag-pills-container ${showCategoryError && !selectedCategory ? 'has-error' : ''}`}>
        {FLAG_CATEGORIES.map(cat => {
          const label = language === 'ar' ? cat.labelAr : cat.labelEn;
          const isActive = selectedCategory === cat.value;
          return (
            <button
              key={cat.value}
              type="button"
              className={`flag-pill-button ${isActive ? 'active' : ''}`}
              onClick={() => {
                setSelectedCategory(cat.value);
                setShowCategoryError(false);
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {showCategoryError && !selectedCategory && (
        <div style={{ fontSize: '0.7rem', color: 'var(--danger)', marginBottom: '0.5rem', fontWeight: 600 }}>
          {t('categoryRequired') || "Category selection is required"}
        </div>
      )}

      <textarea
        className={`flag-textarea ${isNoteTooLong ? 'has-error' : ''}`}
        placeholder={t('noteOptional') || "Add a note... (optional)"}
        value={note}
        onChange={e => setNote(e.target.value)}
      />

      <div className="flag-meta-row">
        <div>
          {isNoteTooLong && (
            <span className="flag-error-text">
              Limit 500 characters
            </span>
          )}
        </div>
        <div className={`flag-char-counter ${isNoteTooLong ? 'has-error' : ''}`}>
          {note.length} / 500
        </div>
      </div>

      <button
        type="button"
        className="btn-primary flag-submit-btn"
        disabled={!selectedCategory || isNoteTooLong || loading}
        onClick={handleSubmit}
      >
        {loading ? (t('loading') || "Submitting...") : (t('submitFlag') || "Submit Flag")}
      </button>

      <a className="flag-cancel-link" onClick={onClose}>
        {t('cancelFlag') || "Cancel"}
      </a>
    </div>
  );
}
