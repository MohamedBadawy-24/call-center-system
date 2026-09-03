import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Edit3, Eye, Download, Play, Pause, Trash2, Copy, Paperclip } from 'lucide-react';
import AssetsTooltip from '../AssetsTooltip';

export default function CampaignCard({
  survey,
  isAdmin,
  isRtl,
  t,
  onToggleStatus,
  onDelete,
  onClone,
  onExport,
  onOpenAssets,
  isExporting,
  variants
}) {
  const progress = survey.totalHandled > 0 ? (survey.completed / survey.totalHandled) * 100 : 0;
  const fulfillmentWidth = survey.goal > 0 ? Math.min((survey.completed / survey.goal) * 100, 100) : progress;
  const hasAssets = Boolean(survey.assets?.notes) || (survey.assets?.attachments?.length > 0);

  return (
    <motion.div
      layout
      key={survey._id}
      variants={variants}
      exit="hidden"
      className="glass-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
      style={{
        marginBottom: 0,
        position: 'relative',
        borderRadius: '16px',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        border: '1px solid var(--glass-border)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
      }}
    >
      {/* Top Header Row: Status Dot, Title, and Action Icons */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
            <div
              className={`status-dot ${survey.isActive ? 'active' : 'off-duty'}`}
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: survey.isActive ? '#10b981' : '#9ca3af',
                boxShadow: survey.isActive ? '0 0 0 3px rgba(16, 185, 129, 0.2)' : 'none',
                flexShrink: 0
              }}
            />
            <h3
              style={{
                margin: 0,
                fontSize: '1.15rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: 'var(--text-primary)'
              }}
              title={survey.title}
            >
              {survey.title}
            </h3>
          </div>

          {/* Top-Right Secondary Action Icons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
            {isAdmin && (
              <AssetsTooltip assets={survey.assets} campaignTitle={survey.title}>
                <button
                  type="button"
                  onClick={() => onOpenAssets(survey)}
                  className={`campaign-asset-btn ${hasAssets ? 'has-assets' : ''}`}
                  title={t('viewManageAssets')}
                  aria-label={t('viewManageAssets')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: hasAssets ? 'var(--primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '0.35rem',
                    borderRadius: '6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}
                >
                  <Paperclip size={16} />
                  {hasAssets && <div className="assets-active-dot" />}
                </button>
              </AssetsTooltip>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => onClone(survey._id, survey.title)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '0.35rem',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title={t('cloneCampaign') || 'Clone Campaign'}
                aria-label={t('cloneCampaign') || 'Clone Campaign'}
              >
                <Copy size={16} />
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => onDelete(survey._id, survey.isActive)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--danger)',
                  cursor: survey.isActive === false ? 'pointer' : 'not-allowed',
                  opacity: survey.isActive === false ? 0.75 : 0.25,
                  padding: '0.35rem',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title={t('deleteAccount') || 'Delete'}
                aria-label={t('deleteAccount') || 'Delete'}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Status Tag */}
        <div style={{ marginBottom: '1rem' }}>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '0.2rem 0.55rem',
              borderRadius: '9999px',
              backgroundColor: survey.isActive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(156, 163, 175, 0.15)',
              color: survey.isActive ? '#10b981' : 'var(--text-secondary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: survey.isActive ? '#10b981' : '#9ca3af'
              }}
            />
            {survey.isActive ? (t('active') || 'Active') : (t('paused') || 'Paused')}
          </span>
        </div>

        {/* Fulfillment Progress */}
        <div style={{ marginBottom: '1rem' }}>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: '0.8rem',
              fontWeight: 700,
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '0.4rem'
            }}
          >
            <span>{t('fulfillmentProgress')}</span>
            {survey.goal > 0 && (
              <span style={{ color: 'var(--primary)', fontWeight: 800 }}>
                {survey.completed || 0} / {survey.goal}
              </span>
            )}
          </p>
          <div className="fulfillment-container" style={{ height: '7px', borderRadius: '6px' }}>
            <div className="fulfillment-bar" style={{ width: `${fulfillmentWidth}%`, borderRadius: '6px' }} />
          </div>
        </div>

        {/* Stats Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            padding: '0.75rem 1rem',
            background: 'var(--bg-secondary)',
            borderRadius: '10px',
            margin: '1rem 0'
          }}
        >
          <div>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              {t('totalHandled')}
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
              {survey.totalHandled || 0}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--success)' }}>
              {t('completed')}
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--success)', marginTop: '0.15rem' }}>
              {survey.completed || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Primary Actions Bar */}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
        {isAdmin ? (
          <Link
            to={`/admin/builder/${survey._id}`}
            className="btn-secondary"
            style={{ flex: 1, padding: '0.5rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600 }}
          >
            <Edit3 size={14} />
            {t('edit')}
          </Link>
        ) : (
          <Link
            to={`/admin/builder/${survey._id}`}
            className="btn-secondary"
            style={{ flex: 1, padding: '0.5rem', opacity: 0.85, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600 }}
          >
            <Eye size={14} />
            {t('audit')}
          </Link>
        )}

        <button
          type="button"
          onClick={() => onExport(survey._id, survey.title)}
          className="btn-secondary"
          style={{ flex: 1, padding: '0.5rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600 }}
        >
          {isExporting ? (
            <div className="spinner" style={{ width: '12px', height: '12px' }} />
          ) : (
            <>
              <Download size={14} />
              {t('exportData')}
            </>
          )}
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={() => onToggleStatus(survey._id)}
            className="btn-primary"
            style={{
              padding: '0.5rem 0.85rem',
              background: survey.isActive ? 'var(--danger)' : undefined,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px'
            }}
            title={survey.isActive ? 'Pause Campaign' : 'Start Campaign'}
          >
            {survey.isActive ? <Pause size={16} /> : <Play size={16} />}
          </button>
        )}
      </div>
    </motion.div>
  );
}
