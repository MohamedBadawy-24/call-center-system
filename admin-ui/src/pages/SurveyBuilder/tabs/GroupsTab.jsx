import React, { useContext, useState } from 'react';
import { SurveyBuilderContext } from '../SurveyBuilderContext';
import { UIContext } from '../../../context/UIContext';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Edit2, Check, X, Layers, Plus } from 'lucide-react';
import { toast } from 'react-toastify';

function SortableQuestionRow({ question, onRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: question.questionId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: 'var(--surface-overlay, rgba(255,255,255,0.02))',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    padding: '0.65rem 0.85rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '0.4rem',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div {...attributes} {...listeners} style={{ cursor: 'grab', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
        <GripVertical size={16} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)', padding: '0.1rem 0.4rem', background: 'var(--primary-low)', borderRadius: '4px' }}>
        Q
      </span>
      <div style={{ flex: 1, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>
        {question.text || <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>Untitled Question</span>}
      </div>
      <button 
        type="button" 
        onClick={onRemove}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--danger, #ef4444)', display: 'flex', alignItems: 'center', padding: '0.25rem' }}
        title="Remove from group"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export default function GroupsTab() {
  const { 
    surveyState, 
    createQuestionGroup, 
    deleteQuestionGroup, 
    renameQuestionGroup, 
    removeQuestionFromGroup, 
    reorderGroupQuestions 
  } = useContext(SurveyBuilderContext);
  
  const { t } = useContext(UIContext);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const [newGroupName, setNewGroupName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const getGroupQuestions = (groupId) => {
    const qs = [];
    surveyState.sections.forEach(sec => {
      sec.questions.forEach(item => {
        if (item._groupId === groupId || String(item._groupId) === String(groupId)) {
          qs.push(item);
        }
      });
    });
    return qs;
  };

  const getGroupSections = (groupId) => {
    const secs = [];
    surveyState.sections.forEach(sec => {
      const hasGrp = sec.questions.some(item => item._groupId === groupId || String(item._groupId) === String(groupId));
      if (hasGrp) secs.push(sec.title || 'Untitled Section');
    });
    return secs;
  };

  const handleStartRename = (groupId, label) => {
    setEditingGroupId(groupId);
    setEditLabel(label);
  };

  const handleSaveRename = (groupId) => {
    if (!editLabel.trim()) return;
    renameQuestionGroup(groupId, editLabel.trim());
    setEditingGroupId(null);
    toast.success('Group renamed successfully');
  };

  const handleCreateGroup = (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    createQuestionGroup(newGroupName.trim());
    setNewGroupName('');
    toast.success('New group added to library');
  };

  const handleDragEnd = (event, groupId, groupQuestions) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    
    const oldIdx = groupQuestions.findIndex(q => q.questionId === active.id);
    const newIdx = groupQuestions.findIndex(q => q.questionId === over.id);
    
    if (oldIdx !== -1 && newIdx !== -1) {
      const newQs = [...groupQuestions];
      const [moved] = newQs.splice(oldIdx, 1);
      newQs.splice(newIdx, 0, moved);
      
      reorderGroupQuestions(groupId, newQs.map(q => q.questionId));
    }
  };

  return (
    <div style={{ display: 'flex', gap: '1.5rem', height: 'calc(100vh - 140px)', overflow: 'hidden' }}>
      
      {/* Groups List */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingRight: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--primary)' }}>
          <Layers size={22} />
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Campaign Group Library</h2>
        </div>

        {(!surveyState.groups || surveyState.groups.length === 0) ? (
          <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Layers size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
            <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>No question groups created yet.</p>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem' }}>You can create groups here, or assign questions to groups inside the Advanced Display Logic panel of any question.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem', alignItems: 'start' }}>
            {surveyState.groups.map(grp => {
              const groupQuestions = getGroupQuestions(grp._id);
              const groupSections = getGroupSections(grp._id);
              
              return (
                <div key={grp._id} className="glass-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative' }}>
                  
                  {/* Header & Editing */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    {editingGroupId === grp._id ? (
                      <div style={{ display: 'flex', gap: '0.25rem', flex: 1 }}>
                        <input
                          type="text"
                          className="input-field"
                          value={editLabel}
                          onChange={e => setEditLabel(e.target.value)}
                          style={{ margin: 0, padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                        />
                        <button type="button" className="btn-primary" onClick={() => handleSaveRename(grp._id)} style={{ padding: '0.25rem 0.5rem' }}>
                          <Check size={14} />
                        </button>
                        <button type="button" className="btn-secondary" onClick={() => setEditingGroupId(null)} style={{ padding: '0.25rem 0.5rem', color: 'var(--danger)' }}>
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {grp.label}
                        </h3>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button type="button" className="btn-secondary" onClick={() => handleStartRename(grp._id, grp.label)} style={{ padding: '0.3rem', border: 'none' }} title="Rename Group">
                            <Edit2 size={13} />
                          </button>
                          <button type="button" className="btn-secondary" onClick={() => { if (confirm('Are you sure you want to delete this group? All questions inside will become standalone.')) deleteQuestionGroup(grp._id); }} style={{ padding: '0.3rem', border: 'none', color: 'var(--danger)' }} title="Delete Group">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Section tag metadata */}
                  {groupSections.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Sections:</span>
                      {groupSections.map((secName, sIdx) => (
                        <span key={sIdx} style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                          {secName}
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{ borderTop: '1px solid var(--border-color)', margin: '0.25rem 0' }} />

                  {/* Drag and Drop list of Questions */}
                  {groupQuestions.length === 0 ? (
                    <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.78rem', fontStyle: 'italic', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
                      No questions in this group. Select questions in the Builder canvas and add them to this group.
                    </div>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => handleDragEnd(event, grp._id, groupQuestions)}>
                      <SortableContext items={groupQuestions.map(q => q.questionId)} strategy={verticalListSortingStrategy}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {groupQuestions.map(q => (
                            <SortableQuestionRow 
                              key={q.questionId} 
                              question={q} 
                              onRemove={() => removeQuestionFromGroup(q.questionId)} 
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sidebar - Create Group */}
      <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Plus size={16} /> Create Question Group
          </h3>
          <form onSubmit={handleCreateGroup} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label className="form-label" style={{ fontSize: '0.8rem', margin: 0 }}>Group Library Name</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Demographics Block"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                style={{ margin: 0 }}
                required
              />
            </div>
            <button type="submit" className="btn-primary" style={{ padding: '0.55rem', fontSize: '0.85rem', width: '100%' }}>
              Add to Library
            </button>
          </form>
        </div>
      </div>

    </div>
  );
}
