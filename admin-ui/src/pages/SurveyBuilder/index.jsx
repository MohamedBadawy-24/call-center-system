import React, { useContext } from 'react';
import { useParams } from 'react-router-dom';
import { SurveyBuilderProvider, SurveyBuilderContext } from './SurveyBuilderContext';
import SurveyToolbar from './components/SurveyToolbar';
import SettingsTab from './tabs/SettingsTab';
import PrecallTab from './tabs/PrecallTab';
import BuilderTab from './tabs/BuilderTab';
import GroupsTab from './tabs/GroupsTab';
import PreviewTab from './tabs/PreviewTab';
import { Loader2 } from 'lucide-react';

function SurveyBuilderContent() {
  const { loading, activeTab, isAdmin, surveyId, surveyState } = useContext(SurveyBuilderContext);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
        <Loader2 className="spin-icon" size={40} color="var(--primary)" />
      </div>
    );
  }

  return (
    <div className="fade-enter-active survey-builder-layout">
      <SurveyToolbar />
      
      {!isAdmin && (
         <div style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.1)', color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
           <p dir="auto" style={{ margin: 0 }}><strong>Note:</strong> You are in Audit mode. Configuration is read-only.</p>
         </div>
      )}

      {isAdmin && surveyState?.isActive && (
         <div style={{ padding: '1rem', background: 'rgba(245, 158, 11, 0.05)', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.2)', color: 'var(--warning)', fontSize: '0.9rem', marginBottom: '1rem' }}>
           <p dir="auto" style={{ margin: 0 }}><strong>Warning:</strong> This campaign is Active. You cannot modify its questions. End the campaign to edit the questionnaire.</p>
         </div>
      )}

      <div className="survey-builder-content">
        {activeTab === 'settings' && <SettingsTab />}
        {activeTab === 'precall' && <PrecallTab />}
        {activeTab === 'builder' && <BuilderTab />}
        {activeTab === 'groups' && <GroupsTab />}
        {activeTab === 'preview' && <PreviewTab />}
      </div>
    </div>
  );
}

export default function SurveyBuilder() {
  const { id } = useParams();
  
  return (
    <SurveyBuilderProvider surveyId={id}>
      <SurveyBuilderContent />
    </SurveyBuilderProvider>
  );
}
