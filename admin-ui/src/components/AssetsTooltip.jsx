import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { FileText, Paperclip, BarChart2, Presentation, Image, Code2, FileSpreadsheet, Folder } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

const CATEGORY_ICONS = {
  spss: BarChart2,
  word: FileText,
  ppt: Presentation,
  infographic: Image,
  coding_file: Code2,
  report: FileSpreadsheet,
  other: Folder,
};

export default function AssetsTooltip({ children, assets, campaignTitle }) {
  const { t, language } = useLanguage();
  const isRtl = language === 'ar';
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, placement: 'bottom' });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);

  const calculatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 280;
    const tooltipHeight = 180; // approximate estimation
    const gap = 8;

    let top = rect.bottom + gap;
    let placement = 'bottom';

    // Vertical boundary check: Flip above if overflowing bottom
    if (rect.bottom + tooltipHeight > window.innerHeight && rect.top - tooltipHeight > 0) {
      top = rect.top - tooltipHeight - gap;
      placement = 'top';
    }

    // Horizontal positioning
    let left;
    if (isRtl) {
      // In RTL, align right edge of tooltip with right edge of button
      left = rect.right - tooltipWidth;
      if (left < 10) left = 10;
    } else {
      // In LTR, align right edge with trigger button so it spreads leftwards, or align left
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
      if (left + tooltipWidth > window.innerWidth - 10) {
        left = window.innerWidth - tooltipWidth - 10;
      }
      if (left < 10) left = 10;
    }

    setCoords({ top, left, placement });
  };

  const handleMouseEnter = () => {
    calculatePosition();
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    setIsOpen(false);
  };

  useEffect(() => {
    if (isOpen) {
      const handleScrollOrResize = () => calculatePosition();
      window.addEventListener('scroll', handleScrollOrResize, true);
      window.addEventListener('resize', handleScrollOrResize);
      return () => {
        window.removeEventListener('scroll', handleScrollOrResize, true);
        window.removeEventListener('resize', handleScrollOrResize);
      };
    }
  }, [isOpen, isRtl]);

  const notes = assets?.notes?.trim();
  const attachments = Array.isArray(assets?.attachments) ? assets.attachments : [];
  const hasAssets = Boolean(notes) || attachments.length > 0;

  // Aggregate attachments by category
  const categoryCounts = attachments.reduce((acc, curr) => {
    const cat = curr.category || 'other';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'inline-flex', alignItems: 'center' }}
      >
        {children}
      </div>

      {isOpen &&
        ReactDOM.createPortal(
          <div
            ref={tooltipRef}
            className="assets-portal-tooltip"
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: '280px',
              maxWidth: 'calc(100vw - 20px)',
              zIndex: 99999,
              pointerEvents: 'none',
            }}
          >
            <div className="assets-tooltip-card">
              <div className="assets-tooltip-header">
                <Paperclip size={14} color="var(--primary)" />
                <span style={{ fontWeight: 800, fontSize: '0.8rem', color: 'var(--text-main)' }}>
                  {t('assetsTooltipTitle')}
                </span>
                {attachments.length > 0 && (
                  <span className="assets-count-badge">
                    {attachments.length}
                  </span>
                )}
              </div>

              {/* Notes Snippet */}
              <div className="assets-tooltip-section">
                <div className="assets-section-label">{t('campaignNotes')}</div>
                {notes ? (
                  <div className="assets-notes-preview">
                    "{notes.length > 90 ? `${notes.substring(0, 90)}...` : notes}"
                  </div>
                ) : (
                  <div className="assets-empty-text">{t('noNotes')}</div>
                )}
              </div>

              {/* Attachments Breakdown */}
              <div className="assets-tooltip-section" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.4rem' }}>
                <div className="assets-section-label">{t('attachedFiles')}</div>
                {attachments.length > 0 ? (
                  <div className="assets-categories-list">
                    {Object.entries(categoryCounts).map(([cat, count]) => {
                      const IconComponent = CATEGORY_ICONS[cat] || Folder;
                      const catLabelKey = `category_${cat}`;
                      const label = t(catLabelKey) || cat;
                      return (
                        <div key={cat} className="assets-category-item">
                          <IconComponent size={12} color="var(--primary)" />
                          <span className="assets-category-name">{label}</span>
                          <span className="assets-category-count">×{count}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="assets-empty-text">{t('noAttachments')}</div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
