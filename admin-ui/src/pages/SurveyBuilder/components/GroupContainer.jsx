import React, { useContext, useState } from 'react';
import { SurveyBuilderContext } from '../SurveyBuilderContext';
import { Layers, Edit2, Trash2, Check, X } from 'lucide-react';

export default function GroupContainer({ group, children }) {
  const { isAdmin, renameQuestionGroup, deleteQuestionGroup } = useContext(SurveyBuilderContext);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(group.label || '');

  const handleSave = () => {
    if (editName.trim()) {
      renameQuestionGroup(group._id, editName.trim());
    }
    setIsEditing(false);
  };

  return (
    <div 
      className="group-container"
      style={{
        background: 'var(--surface-alt, rgba(59, 130, 246, 0.03))',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '1rem',
        marginBottom: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}
      data-testid={`group-container-${group._id}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px dashed var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Layers size={18} color="var(--primary)" />
          {isEditing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input 
                type="text" 
                className="input-field" 
                style={{ margin: 0, padding: '0.25rem 0.5rem', fontSize: '0.9rem' }} 
                value={editName}
                onChange={e => setEditName(e.target.value)}
                autoFocus
              />
              <button type="button" className="btn-secondary" style={{ padding: '0.25rem' }} onClick={handleSave}>
                <Check size={14} color="var(--success, #10b981)" />
              </button>
              <button type="button" className="btn-secondary" style={{ padding: '0.25rem' }} onClick={() => setIsEditing(false)}>
                <X size={14} color="var(--danger, #ef4444)" />
              </button>
            </div>
          ) : (
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }} data-testid={`group-label-${group._id}`}>
              {group.label}
            </span>
          )}
        </div>
        
        {isAdmin && !isEditing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button 
              type="button" 
              className="btn-secondary" 
              style={{ padding: '0.35rem', border: 'none' }} 
              onClick={() => setIsEditing(true)} 
              title="Edit Group Name"
            >
              <Edit2 size={14} />
            </button>
            <button 
              type="button" 
              className="btn-secondary" 
              style={{ padding: '0.35rem', border: 'none', color: '#ef4444' }} 
              onClick={() => deleteQuestionGroup(group._id)} 
              title="Ungroup (removes container)"
              data-testid={`ungroup-btn-${group._id}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {children}
      </div>
    </div>
  );
}
