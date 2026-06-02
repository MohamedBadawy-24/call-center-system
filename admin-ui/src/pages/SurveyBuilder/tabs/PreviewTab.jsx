import React, { useContext, useState } from 'react';
import { SurveyBuilderContext } from '../SurveyBuilderContext';
import TakeSurvey from '../../TakeSurvey';
import { Monitor, Smartphone, Tablet } from 'lucide-react';

export default function PreviewTab() {
  const { surveyState } = useContext(SurveyBuilderContext);
  const [device, setDevice] = useState('desktop');

  const widthMap = {
    desktop: '100%',
    tablet: '768px',
    mobile: '375px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', minHeight: '80vh' }}>
      <div className="glass-card" style={{ display: 'flex', justifyContent: 'center', gap: '1rem', padding: '0.75rem' }}>
        <button 
          className={`btn-secondary ${device === 'desktop' ? 'active' : ''}`}
          onClick={() => setDevice('desktop')}
          style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: device === 'desktop' ? 'var(--primary)' : '', color: device === 'desktop' ? 'white' : '' }}
        >
          <Monitor size={18} /> Desktop
        </button>
        <button 
          className={`btn-secondary ${device === 'tablet' ? 'active' : ''}`}
          onClick={() => setDevice('tablet')}
          style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: device === 'tablet' ? 'var(--primary)' : '', color: device === 'tablet' ? 'white' : '' }}
        >
          <Tablet size={18} /> Tablet
        </button>
        <button 
          className={`btn-secondary ${device === 'mobile' ? 'active' : ''}`}
          onClick={() => setDevice('mobile')}
          style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: device === 'mobile' ? 'var(--primary)' : '', color: device === 'mobile' ? 'white' : '' }}
        >
          <Smartphone size={18} /> Mobile
        </button>
      </div>

      <div style={{ 
        flex: 1, 
        display: 'flex', 
        justifyContent: 'center', 
        background: 'repeating-conic-gradient(#f3f4f6 0% 25%, transparent 0% 50%) 50% / 20px 20px',
        border: '1px solid var(--border-color)', 
        borderRadius: '8px', 
        overflow: 'hidden',
        padding: '2rem 0'
      }}>
        <div style={{ 
          width: widthMap[device], 
          height: '100%', 
          maxHeight: '800px',
          overflowY: 'auto',
          background: 'var(--bg-color)',
          boxShadow: 'var(--shadow-lg)',
          transition: 'width 0.3s ease',
          borderRadius: device !== 'desktop' ? '32px' : '0px',
          border: device !== 'desktop' ? '12px solid #1f2937' : 'none',
          position: 'relative'
        }}>
          {/* We wrap it in a mock router context if TakeSurvey uses useLocation, but it's already inside App's router. */}
          <TakeSurvey mockSurvey={surveyState} />
        </div>
      </div>
    </div>
  );
}
