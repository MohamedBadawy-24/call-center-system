const mongoose = require('mongoose');
require('dotenv').config();

// We will copy the normalize logic here since it might have es6 exports
const OUTBOUND_FIELD_TYPES = [
  { value: 'readonly_date', label: 'Live date (read-only)' },
  { value: 'readonly_time', label: 'Live time (read-only)' },
  { value: 'text', label: 'Short text' },
  { value: 'number', label: 'Number' },
  { value: 'segment', label: 'Segmented buttons (2+)' },
  { value: 'select', label: 'Dropdown' },
  { value: 'year', label: 'Year (Dropdown)' },
];

const DEFAULT_META = {
  title: 'Outbound call checklist',
  subtitle: 'Complete all required fields to continue.',
  scriptLabel: 'Read-aloud script',
  script:
    'Good morning/evening — this is {{name}} from the Egyptian Center for Public Opinion Research (Baseera). We are conducting a short public opinion survey (about two minutes). May I continue?',
  sectionAgent: 'Researcher & respondent',
  sectionCall: 'Call logistics',
  sectionPhone: 'Phone distribution',
  formsCountLabel: 'Forms count',
  newFormLabel: 'New form',
  completeHint: '',
};

const DEFAULT_OUTBOUND_V2 = {
  version: 2,
  sectionOrder: ['agent', 'call', 'phone'],
  meta: { ...DEFAULT_META },
  fields: [
    {
      id: 'researcher_name',
      label: 'Researcher name',
      type: 'text',
      required: true,
      section: 'agent',
    },
    {
      id: 'researcher_code',
      label: 'Researcher code',
      type: 'text',
      required: true,
      section: 'agent',
    },
    {
      id: 'serial_number',
      label: 'Serial number',
      type: 'number',
      required: true,
      min: 1,
      section: 'agent',
    },
    {
      id: 'phone',
      label: 'Respondent phone number',
      type: 'text',
      required: true,
      section: 'phone',
    },
    {
      id: 'call_result',
      label: 'Call outcome',
      type: 'select',
      required: true,
      section: 'call',
      options: [
        { value: 'contacted', label: 'Contacted' },
        { value: 'wrong_number', label: 'Wrong number' },
        { value: 'out_of_service', label: 'Out of service' },
        { value: 'no_answer', label: 'No answer' },
        { value: 'busy', label: 'Busy' },
        { value: 'closed', label: 'Closed / off' },
      ],
    },
    {
      id: 'interview_result',
      label: 'Interview result',
      type: 'select',
      required: false,
      section: 'call',
      visibleWhen: { type: 'rule', fieldId: 'call_result', operator: '==', value: 'contacted' },
      options: [
        { value: 'completed', label: 'Completed' },
        { value: 'partial', label: 'Partially completed' },
        { value: 'refused', label: 'Refused' },
        { value: 'no_qualified', label: 'No qualified respondent' },
        { value: 'postponed', label: 'Postponed' },
        { value: 'not_contacted', label: 'Not contacted' },
      ],
    },
  ],
};

function cloneDeep(obj) { return JSON.parse(JSON.stringify(obj)); }

function mergeMeta(base, incoming) {
  if (!incoming || typeof incoming !== 'object') return base;
  const out = { ...base };
  Object.keys(DEFAULT_META).forEach((k) => {
    if (typeof incoming[k] === 'string') out[k] = incoming[k];
  });
  return out;
}

function normalizeCondition(c) {
  if (!c) return undefined;
  if (c.fieldId && !c.type) {
    return { type: 'rule', fieldId: String(c.fieldId), operator: '==', value: String(c.value ?? '') };
  }
  if (c.type === 'rule') {
    return { type: 'rule', fieldId: String(c.fieldId), operator: c.operator || '==', value: String(c.value ?? '') };
  }
  if (c.type === 'group') {
    return {
      type: 'group',
      operator: c.operator === 'OR' ? 'OR' : 'AND',
      conditions: Array.isArray(c.conditions) ? c.conditions.map(normalizeCondition).filter(Boolean) : []
    };
  }
  return undefined;
}

function normalizeField(f, i) {
  const d = DEFAULT_OUTBOUND_V2.fields[i] || {};
  const id = typeof f.id === 'string' && f.id.trim() ? f.id.trim() : d.id || `field_${i}`;
  const type = OUTBOUND_FIELD_TYPES.some((x) => x.value === f.type) ? f.type : d.type || 'text';
  let section = 'agent';
  if (f.section === 'call') section = 'call';
  if (f.section === 'phone') section = 'phone';
  if (id === 'phone') section = 'phone';
  const out = {
    id,
    label: typeof f.label === 'string' ? f.label : d.label || 'Question',
    type,
    required: !!f.required,
    section,
    options: Array.isArray(f.options) ? f.options.map((o) => ({ value: String(o.value ?? ''), label: String(o.label ?? '') })) : d.options,
    placeholder: typeof f.placeholder === 'string' ? f.placeholder : d.placeholder,
    min: typeof f.min === 'number' ? f.min : d.min,
    visibleWhen: normalizeCondition(f.visibleWhen),
    logic: f.logic ? {
      ...normalizeCondition(f.logic),
      action: f.logic.action || 'show'
    } : undefined,
  };
  if (type !== 'segment' && type !== 'select') {
    delete out.options;
  }
  if (type !== 'text') delete out.placeholder;
  if (type !== 'number') {
    delete out.min;
  }
  if (!out.visibleWhen) delete out.visibleWhen;
  if (!out.logic) delete out.logic;
  return out;
}

function normalizeOutboundPrecall(raw) {
  if (!raw || typeof raw !== 'object') return cloneDeep(DEFAULT_OUTBOUND_V2);
  if (raw.version === 2 && Array.isArray(raw.fields)) {
    if (raw.fields.length === 0) return cloneDeep(DEFAULT_OUTBOUND_V2);
    const base = cloneDeep(DEFAULT_OUTBOUND_V2);
    base.meta = mergeMeta(base.meta, raw.meta);
    if (Array.isArray(raw.sectionOrder)) {
      base.sectionOrder = raw.sectionOrder;
    }
    base.fields = raw.fields
      .map((f, i) => normalizeField(f, i))
      .map((f) => {
        if (f.visibleWhen && !String(f.visibleWhen.fieldId || '').trim()) {
          const { visibleWhen, ...rest } = f;
          return rest;
        }
        return f;
      });

    const hasOutcomeReason = base.fields.some(f => f.id === 'outcome_reason');
    if (!hasOutcomeReason) {
      const interviewResultIdx = base.fields.findIndex(f => f.id === 'interview_result');
      const reasonField = {
        id: 'outcome_reason',
        label: 'Reason for outcome',
        type: 'text',
        required: false,
        section: 'call',
        visibleWhen: { type: 'rule', fieldId: 'interview_result', operator: 'in', value: 'partial,refused,postponed' }
      };
      if (interviewResultIdx !== -1) {
        base.fields.splice(interviewResultIdx + 1, 0, reasonField);
      } else {
        base.fields.push(reasonField);
      }
    }
    return base;
  }
  return cloneDeep(DEFAULT_OUTBOUND_V2);
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const Survey = require('./models/Survey');
  const survey = await Survey.findById('6a54a538977eed630cdd09df').lean();
  const norm = normalizeOutboundPrecall(survey.outboundPrecall);
  console.log(JSON.stringify(norm.fields, null, 2));
  await mongoose.disconnect();
}
run();
