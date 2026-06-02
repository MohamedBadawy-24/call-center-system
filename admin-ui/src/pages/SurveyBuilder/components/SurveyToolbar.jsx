import React, { useContext, useEffect } from 'react';
import { SurveyBuilderContext } from '../SurveyBuilderContext';
import { Save, Eye, LayoutTemplate, Undo, Redo, CheckCircle2, ClipboardList, Settings } from 'lucide-react';
import { UIContext } from '../../../context/UIContext';

export default function SurveyToolbar() {
  const { 
    surveyId, isAdmin, activeTab, setActiveTab, 
    surveyState, undo, redo, history, future, 
    publish, isSaving, hasDraft 
  } = useContext(SurveyBuilderContext);
  const { t } = useContext(UIContext);

  const isLocked = surveyState?.isActive === true;

  // Beforeunload warning if hasDraft
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasDraft) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasDraft]);

  return (
    <div className="glass-card" style={{ 
      position: 'sticky', top: '1rem', zIndex: 100, marginBottom: '1.5rem', 
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.5rem' 
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {surveyId ? (isAdmin ? 'Edit Campaign' : 'Audit Campaign') : 'Create Campaign'}
          {hasDraft && <span style={{ fontSize: '0.7rem', backgroundColor: 'var(--primary)', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '1rem', fontWeight: 'bold' }}>Unsaved Draft</span>}
        </h2>
        
        <div style={{ display: 'flex', background: 'var(--bg-color)', borderRadius: '8px', padding: '0.25rem', border: '1px solid var(--border-color)', marginLeft: '1rem' }}>
          <button 
            type="button"
            className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', border: 'none', background: activeTab === 'settings' ? 'var(--surface)' : 'transparent', borderRadius: '6px', fontWeight: activeTab === 'settings' ? 700 : 500, boxShadow: activeTab === 'settings' ? 'var(--shadow-sm)' : 'none' }}
          >
            <Settings size={16} /> Settings
          </button>
          <button 
            type="button"
            className={`tab-btn ${activeTab === 'precall' ? 'active' : ''}`}
            onClick={() => setActiveTab('precall')}
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', border: 'none', background: activeTab === 'precall' ? 'var(--surface)' : 'transparent', borderRadius: '6px', fontWeight: activeTab === 'precall' ? 700 : 500, boxShadow: activeTab === 'precall' ? 'var(--shadow-sm)' : 'none' }}
          >
            <ClipboardList size={16} /> Pre-Call
          </button>
          <button 
            type="button"
            className={`tab-btn ${activeTab === 'builder' ? 'active' : ''}`}
            onClick={() => setActiveTab('builder')}
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', border: 'none', background: activeTab === 'builder' ? 'var(--surface)' : 'transparent', borderRadius: '6px', fontWeight: activeTab === 'builder' ? 700 : 500, boxShadow: activeTab === 'builder' ? 'var(--shadow-sm)' : 'none' }}
          >
            <LayoutTemplate size={16} /> Builder
          </button>
          <button 
            type="button"
            className={`tab-btn ${activeTab === 'preview' ? 'active' : ''}`}
            onClick={() => setActiveTab('preview')}
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', border: 'none', background: activeTab === 'preview' ? 'var(--surface)' : 'transparent', borderRadius: '6px', fontWeight: activeTab === 'preview' ? 700 : 500, boxShadow: activeTab === 'preview' ? 'var(--shadow-sm)' : 'none' }}
          >
            <Eye size={16} /> Preview
          </button>
        </div>
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.25rem', borderRight: '1px solid var(--border-color)', paddingRight: '0.75rem' }}>
            <button type="button" className="btn-secondary" onClick={undo} disabled={history.length === 0} title="Undo" style={{ padding: '0.4rem' }}>
              <Undo size={18} />
            </button>
            <button type="button" className="btn-secondary" onClick={redo} disabled={future.length === 0} title="Redo" style={{ padding: '0.4rem' }}>
              <Redo size={18} />
            </button>
          </div>
          
          {isLocked && (
            <span style={{ fontSize: '0.85rem', color: 'var(--warning)', fontWeight: 600, marginRight: '0.5rem' }}>
              {t('activeCampaignWarning')}
            </span>
          )}
          
          <button type="button" className="btn-primary" onClick={() => publish()} disabled={isSaving || isLocked} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {isSaving ? <span className="spin-icon">↻</span> : <Save size={18} />}
            Publish / Save
          </button>
        </div>
      )}
    </div>
  );
}
