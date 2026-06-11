import React, { useState, useContext } from 'react';
import { Plus, Trash2, Layers, X, ChevronDown, ChevronRight, GitBranch } from 'lucide-react';
import { UIContext } from '../context/UIContext';
import { PRECALL_ACTION_OPTIONS } from '../utils/outboundPrecallConfig';

// ─── Operator definitions ─────────────────────────────────────────────────────
const OPERATOR_GROUPS = [
  {
    label: 'Equality',
    ops: [
      { value: '==',  label: 'equals' },
      { value: '!=',  label: 'not equals' },
    ],
  },
  {
    label: 'Text',
    ops: [
      { value: 'contains',     label: 'contains' },
      { value: 'not_contains', label: 'does not contain' },
    ],
  },
  {
    label: 'Numeric',
    ops: [
      { value: 'gt',  label: '> greater than' },
      { value: 'lt',  label: '< less than' },
      { value: 'gte', label: '≥ greater or equal' },
      { value: 'lte', label: '≤ less or equal' },
    ],
  },
  {
    label: 'List',
    ops: [
      { value: 'in',     label: 'is one of' },
      { value: 'not_in', label: 'is not one of' },
    ],
  },
  {
    label: 'Presence',
    ops: [
      { value: 'is_empty',     label: 'is empty' },
      { value: 'is_not_empty', label: 'is not empty' },
    ],
  },
];

const ALL_OPS = OPERATOR_GROUPS.flatMap(g => g.ops);
const NO_VALUE_OPS  = new Set(['is_empty', 'is_not_empty']);
const NUMERIC_OPS   = new Set(['gt', 'lt', 'gte', 'lte']);
const LIST_OPS      = new Set(['in', 'not_in']);

// Depth-coded color palette
const DEPTH_COLORS = [
  { border: 'hsl(220,70%,55%)',  bg: 'hsla(220,70%,55%,0.05)',  badge: 'hsl(220,70%,55%)'  },
  { border: 'hsl(270,65%,58%)',  bg: 'hsla(270,65%,58%,0.05)',  badge: 'hsl(270,65%,58%)'  },
  { border: 'hsl(158,60%,42%)',  bg: 'hsla(158,60%,42%,0.05)',  badge: 'hsl(158,60%,42%)'  },
  { border: 'hsl(38,90%,50%)',   bg: 'hsla(38,90%,50%,0.05)',   badge: 'hsl(38,90%,50%)'   },
  { border: 'hsl(340,70%,52%)',  bg: 'hsla(340,70%,52%,0.05)',  badge: 'hsl(340,70%,52%)'  },
];
const dc = d => DEPTH_COLORS[d % DEPTH_COLORS.length];

// ─── Human-readable summary ───────────────────────────────────────────────────
function summarizeRule(rule, fields) {
  if (!rule.fieldId) return '…';
  const f   = fields.find(x => x.id === rule.fieldId);
  const lbl = f?.label || rule.fieldId;
  const op  = ALL_OPS.find(o => o.value === rule.operator)?.label || rule.operator || 'equals';
  if (NO_VALUE_OPS.has(rule.operator)) return `"${lbl}" ${op}`;
  if (LIST_OPS.has(rule.operator)) {
    const vals = Array.isArray(rule.value)
      ? rule.value
      : String(rule.value || '').split(',').map(v => v.trim()).filter(Boolean);
    return `"${lbl}" ${op} [${vals.join(', ')}]`;
  }
  return `"${lbl}" ${op} "${rule.value || '…'}"`;
}

function summarize(cond, fields) {
  if (!cond) return '';
  if (cond.type === 'rule' || (!cond.type && cond.fieldId)) return summarizeRule(cond, fields);
  if (cond.type === 'group') {
    if (!cond.conditions?.length) return '(empty)';
    const parts = cond.conditions.map(c => summarize(c, fields));
    const joined = parts.join(` ${cond.operator || 'AND'} `);
    return cond.conditions.length > 1 ? `(${joined})` : joined;
  }
  return '';
}

// ─── Root export ─────────────────────────────────────────────────────────────
export default function ConditionBuilder({ condition, onChange, availableFields = [], readOnly = false }) {
  const summary = condition ? summarize(condition, availableFields) : '';

  if (!condition) {
    return (
      <div>
        {!readOnly ? (
          <button
            type="button"
            onClick={() => onChange({ type: 'group', operator: 'AND', action: 'show', conditions: [] })}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '0.5rem', padding: '0.65rem 1rem', borderRadius: '8px',
              border: '1.5px dashed hsl(220,70%,55%)', background: 'hsla(220,70%,55%,0.04)',
              color: 'hsl(220,70%,55%)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700,
              transition: 'all 0.2s',
            }}
          >
            <GitBranch size={15} /> Build Visibility Logic
          </button>
        ) : (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '0.4rem' }}>
            Always visible — no conditions set.
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ pointerEvents: readOnly ? 'none' : 'auto' }}>
      <ConditionGroup
        group={condition}
        onChange={onChange}
        availableFields={availableFields}
        readOnly={readOnly}
        isRoot
        depth={0}
      />
      {summary && (
        <div style={{
          marginTop: '0.65rem', padding: '0.5rem 0.85rem',
          background: 'hsla(220,70%,55%,0.05)', border: '1px solid hsla(220,70%,55%,0.18)',
          borderRadius: '7px', fontSize: '0.76rem', fontFamily: 'monospace',
          color: 'var(--text-secondary)', lineHeight: 1.7, overflowX: 'auto', whiteSpace: 'nowrap',
        }}>
          <span style={{ fontWeight: 800, color: 'hsl(220,70%,55%)', marginRight: '0.4rem' }}>Show if:</span>
          {summary}
        </div>
      )}
    </div>
  );
}

// ─── Group ────────────────────────────────────────────────────────────────────
function ConditionGroup({ group, onChange, onRemove, availableFields, readOnly, isRoot, depth }) {
  const { language } = useContext(UIContext) || { language: 'en' };
  const [collapsed, setCollapsed] = useState(false);
  const col = dc(depth);
  const kids = group.conditions || [];

  const upd = (patch) => onChange({ ...group, ...patch });
  const addRule  = () => upd({ conditions: [...kids, { type: 'rule', fieldId: availableFields[0]?.id || '', operator: '==', value: '' }] });
  const addGroup = () => upd({ conditions: [...kids, { type: 'group', operator: 'AND', conditions: [] }] });
  const updChild = (i, v) => { const n = [...kids]; n[i] = v; upd({ conditions: n }); };
  const rmChild  = (i)    => upd({ conditions: kids.filter((_, idx) => idx !== i) });

  return (
    <div style={{
      border: `1.5px solid ${col.border}`, borderRadius: '10px',
      background: col.bg, marginBottom: '0.4rem', overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap',
        padding: '0.5rem 0.75rem',
        borderBottom: collapsed ? 'none' : `1px solid ${col.border}`,
      }}>
        {isRoot && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: '0.5rem', marginLeft: '0.5rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>Action:</span>
            <select
              value={group.action || 'show'}
              onChange={(e) => upd({ action: e.target.value })}
              disabled={readOnly}
              className="input-field"
              style={{
                padding: '0.2rem 0.5rem',
                fontSize: '0.72rem',
                height: 'auto',
                width: 'auto',
                minWidth: '130px',
                margin: 0
              }}
            >
              {PRECALL_ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {language === 'ar' ? opt.labelAr : opt.labelEn}
                </option>
              ))}
            </select>
          </div>
        )}

        {!isRoot && (
          <span style={{
            fontSize: '0.62rem', fontWeight: 800, padding: '0.1rem 0.38rem',
            borderRadius: '4px', background: col.badge, color: '#fff',
            textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0,
          }}>Nested Group</span>
        )}

        {/* AND / OR toggle */}
        <div style={{
          display: 'flex', background: 'var(--bg-color, #fff)',
          border: '1px solid var(--border-color)', borderRadius: '6px', padding: '2px', gap: '2px',
        }}>
          {['AND', 'OR'].map(op => (
            <button key={op} type="button"
              onClick={() => !readOnly && upd({ operator: op })}
              style={{
                padding: '0.18rem 0.55rem', fontSize: '0.7rem', fontWeight: 800, border: 'none',
                borderRadius: '4px', cursor: readOnly ? 'default' : 'pointer',
                background: group.operator === op ? col.badge : 'transparent',
                color:      group.operator === op ? '#fff'     : 'var(--text-secondary)',
                transition: 'all 0.15s',
              }}
            >{op}</button>
          ))}
        </div>

        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
          {kids.length} condition{kids.length !== 1 ? 's' : ''}
        </span>

        <div style={{ flex: 1 }} />

        {!readOnly && (
          <>
            <button type="button" onClick={addRule}
              style={miniBtn(col.badge)}>
              <Plus size={11} /> Rule
            </button>
            <button type="button" onClick={addGroup}
              style={miniBtn(col.badge)}>
              <Layers size={11} /> Group
            </button>
            {!isRoot && (
              <button type="button" onClick={onRemove}
                style={{ ...miniBtn('#ef4444'), background: 'none', border: 'none' }}>
                <Trash2 size={12} />
              </button>
            )}
            {isRoot && (
              <button type="button" onClick={() => onChange(undefined)}
                style={{ ...miniBtn('#ef4444'), border: '1px solid #ef4444', background: 'transparent' }}>
                <X size={11} /> Clear all
              </button>
            )}
          </>
        )}

        <button type="button" onClick={() => setCollapsed(!collapsed)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', padding: '0.2rem' }}>
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* ── Children ── */}
      {!collapsed && (
        <div style={{ padding: '0.6rem' }}>
          {kids.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '0.85rem',
              fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic',
              border: '1px dashed var(--border-color)', borderRadius: '7px',
            }}>
              Empty — add a <strong>Rule</strong> or <strong>Group</strong> above.
            </div>
          )}
          {kids.map((child, i) => (
            <div key={i}>
              {child.type === 'group'
                ? <ConditionGroup group={child} onChange={v => updChild(i, v)} onRemove={() => rmChild(i)}
                    availableFields={availableFields} readOnly={readOnly} depth={depth + 1} />
                : <ConditionRule  rule={child}  onChange={v => updChild(i, v)} onRemove={() => rmChild(i)}
                    availableFields={availableFields} readOnly={readOnly} />
              }
              {i < kids.length - 1 && (
                <div style={{ textAlign: 'center', margin: '0.2rem 0' }}>
                  <span style={{
                    display: 'inline-block', padding: '0.08rem 0.55rem',
                    fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.08em',
                    background: col.badge, color: '#fff', borderRadius: '10px',
                  }}>{group.operator || 'AND'}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Rule ─────────────────────────────────────────────────────────────────────
function ConditionRule({ rule, onChange, onRemove, availableFields, readOnly }) {
  const upd = patch => onChange({ ...rule, ...patch });

  const selField   = availableFields.find(f => f.id === rule.fieldId) || availableFields[0];
  const hasOptions = (selField?.options?.length || 0) > 0;
  const isNumField = selField?.type === 'number';
  const op         = rule.operator || '==';

  const handleFieldChange = fid => upd({ fieldId: fid, value: '', operator: '==' });

  // Operator groups filtered by field type
  const opGroups = () => {
    if (isNumField)  return OPERATOR_GROUPS.filter(g => ['Equality', 'Numeric', 'Presence'].includes(g.label));
    if (hasOptions)  return OPERATOR_GROUPS.filter(g => ['Equality', 'List', 'Presence'].includes(g.label));
    return OPERATOR_GROUPS.filter(g => ['Equality', 'Text', 'Presence'].includes(g.label));
  };

  // Current selected values for list ops
  const listVals = LIST_OPS.has(op)
    ? (Array.isArray(rule.value) ? rule.value.map(String) : String(rule.value || '').split(',').map(v => v.trim()).filter(Boolean))
    : [];
  const toggleVal = val => {
    const next = listVals.includes(val) ? listVals.filter(v => v !== val) : [...listVals, val];
    upd({ value: next });
  };

  const renderValue = () => {
    if (NO_VALUE_OPS.has(op))  return null;

    if (LIST_OPS.has(op) && hasOptions) {
      return (
        <div style={{
          flex: '1 1 200px', display: 'flex', flexWrap: 'wrap', gap: '0.3rem',
          padding: '0.4rem 0.6rem', border: '1px solid var(--border-color)',
          borderRadius: '7px', background: 'var(--bg-color, #fff)', minWidth: '160px',
        }}>
          {selField.options.map(opt => {
            const checked = listVals.includes(String(opt.value));
            return (
              <button key={opt.value} type="button" onClick={() => !readOnly && toggleVal(String(opt.value))}
                style={{
                  padding: '0.18rem 0.5rem', fontSize: '0.73rem', borderRadius: '10px', cursor: 'pointer',
                  border: `1px solid ${checked ? 'hsl(220,70%,55%)' : 'var(--border-color)'}`,
                  background: checked ? 'hsl(220,70%,55%)' : 'transparent',
                  color:      checked ? '#fff'              : 'var(--text-primary)',
                  fontWeight: checked ? 700 : 400, transition: 'all 0.15s',
                }}>
                {opt.label || opt.value}
              </button>
            );
          })}
          {selField.options.length === 0 && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No options</span>}
        </div>
      );
    }

    if (LIST_OPS.has(op)) {
      return (
        <input className="input-field" readOnly={readOnly}
          style={{ flex: '1 1 180px', minWidth: '140px', padding: '0.35rem 0.65rem', fontSize: '0.82rem' }}
          value={Array.isArray(rule.value) ? rule.value.join(', ') : (rule.value || '')}
          onChange={e => upd({ value: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })}
          placeholder="value1, value2, …"
        />
      );
    }

    if (NUMERIC_OPS.has(op) || isNumField) {
      return (
        <input type="number" className="input-field" readOnly={readOnly}
          style={{ flex: '1 1 120px', minWidth: '100px', padding: '0.35rem 0.65rem', fontSize: '0.82rem' }}
          value={rule.value || ''}
          onChange={e => upd({ value: e.target.value })}
          placeholder="0"
        />
      );
    }

    if (hasOptions) {
      return (
        <select className="input-field" disabled={readOnly}
          style={{ flex: '1 1 160px', minWidth: '140px', padding: '0.35rem 0.65rem', fontSize: '0.82rem' }}
          value={typeof rule.value === 'string' ? rule.value : ''}
          onChange={e => upd({ value: e.target.value })}>
          <option value="">— select —</option>
          {selField.options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label || opt.value}</option>
          ))}
        </select>
      );
    }

    return (
      <input className="input-field" readOnly={readOnly}
        style={{ flex: '1 1 160px', minWidth: '140px', padding: '0.35rem 0.65rem', fontSize: '0.82rem' }}
        value={typeof rule.value === 'string' ? rule.value : ''}
        onChange={e => upd({ value: e.target.value })}
        placeholder="type a value…"
      />
    );
  };

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '0.45rem',
      padding: '0.6rem 0.65rem', background: 'var(--surface, #fff)',
      border: '1px solid var(--border-color)', borderRadius: '8px',
      marginBottom: '0.3rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {/* Field */}
      <select className="input-field" disabled={readOnly}
        style={{ flex: '1 1 170px', minWidth: '150px', padding: '0.35rem 0.65rem', fontSize: '0.82rem' }}
        value={rule.fieldId || ''}
        onChange={e => handleFieldChange(e.target.value)}>
        {availableFields.length === 0 && <option value="">No fields yet</option>}
        {availableFields.map(f => <option key={f.id} value={f.id}>{f.label || f.id}</option>)}
      </select>

      {/* Operator */}
      <select className="input-field" disabled={readOnly}
        style={{ flex: '0 0 auto', minWidth: '155px', padding: '0.35rem 0.65rem', fontSize: '0.82rem' }}
        value={op}
        onChange={e => upd({ operator: e.target.value, value: '' })}>
        {opGroups().map(g => (
          <optgroup key={g.label} label={g.label}>
            {g.ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </optgroup>
        ))}
      </select>

      {/* Value */}
      {renderValue()}

      {/* Remove */}
      {!readOnly && (
        <button type="button" onClick={onRemove}
          style={{ padding: '0.3rem', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', marginTop: '0.15rem' }}>
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const miniBtn = (color) => ({
  padding: '0.22rem 0.5rem', fontSize: '0.7rem', fontWeight: 700,
  display: 'flex', alignItems: 'center', gap: '0.22rem', height: 'auto',
  border: `1px solid ${color}`, borderRadius: '5px',
  background: 'transparent', color, cursor: 'pointer',
  transition: 'all 0.15s',
});
