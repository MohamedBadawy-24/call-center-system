/**
 * Diagnostic Answers:
 * 
 * In PrecallTab.jsx:
 * 1. Is ConditionBuilder.jsx rendered for each precall field? If yes, what onChange prop is passed to it?
 *    - Yes, it is rendered on line 851 (in SurveyBuilder.jsx) and line 298 (in PrecallTab.jsx).
 *    - The onChange prop passed is: onChange={(cond) => updateField(fIdx, { visibleWhen: cond })}.
 * 
 * 2. Does the onChange callback write back to the correct field in the precall state — or does it update a local copy that is never committed?
 *    - It writes back directly to surveyState.outboundConfig.fields via updateField(fIdx, { visibleWhen: cond }), which uses the provider's updateState to update the context state. It is fully committed.
 * 
 * 3. Does the field object in state have a logic or conditions array at all?
 *    - Currently, it only uses field.visibleWhen (which is a rule or a group condition tree) and does not have a logic or conditions array.
 * 
 * In SurveyBuilderContext.jsx or SurveyBuilder/index.jsx:
 * 4. Is outboundPrecall included in the save payload sent to PUT /survey/:id?
 *    - Yes, in publish() (and draft autosave) of SurveyBuilderContext.jsx.
 * 
 * 5. Are nested logic/conditions arrays on each field included in that payload or stripped by a .map() that only spreads known fields?
 *    - The context sends surveyState.outboundConfig as outboundPrecall as-is. However, normalizeField in outboundPrecallConfig.js is called to normalize/sanitize fields. Currently, normalizeField strips all non-whitelisted properties and only preserves visibleWhen, which completely strips logic or any custom conditions array.
 * 
 * In server.js or surveyController.js:
 * 6. Does the PUT /survey/:id handler accept and persist the full outboundPrecall field including nested logic arrays — or does it whitelist only certain fields?
 *    - It accepts and persists the full outboundPrecall field via Object.assign(survey, req.body) and survey.save(), so it will accept and persist nested logic/conditions arrays as-is.
 * 
 * In utils/outboundPrecallConfig.js:
 * 7. Are skip and terminate_call present in the action options list?
 *    - No, there is no action options list/array present in outboundPrecallConfig.js.
 * 
 * 8. Does the field schema include allowOther?
 *    - No, the schema in normalizeField does not copy or reference allowOther.
 * 
 * In PreCallChecklist.jsx:
 * 9. Is there a logic evaluation function that reads field.logic or field.conditions and applies skip/terminate behavior?
 *    - No, it only uses isFieldVisible (which checks visibleWhen and does not handle skip/terminate actions).
 * 
 * 10. For fields with allowOther: true, is an "Other" radio option and a text input rendered?
 *     - No, there is no support for allowOther or rendering of "Other" option or text input in PreCallChecklist.jsx.
 * 
 * 11. Are these features integrated inside the new card layout structure or missing entirely?
 *     - They are completely missing.
 */

export const PRECALL_ACTION_OPTIONS = [
  { value: 'show', labelEn: 'Show Field', labelAr: 'عرض الحقل' },
  { value: 'hide', labelEn: 'Hide Field', labelAr: 'إخفاء الحقل' },
  { value: 'skip', labelEn: 'Skip Field', labelAr: 'تخطي الحقل' },
  { value: 'terminate_call', labelEn: 'Terminate Call', labelAr: 'إنهاء المكالمة' },
];

export const SYSTEM_TAG_OPTIONS = [
  { value: '', label: 'None / لا شيء' },
  { value: 'Age', label: 'Age / العمر' },
  { value: 'Gender', label: 'Gender / النوع' },
  { value: 'Governorate', label: 'Governorate / المحافظة' },
  { value: 'Nationality', label: 'Nationality / الجنسية' },
  { value: 'Sector', label: 'Sector / القطاع' },
  { value: 'Researcher Name', label: 'Researcher Name / اسم الباحث' },
  { value: 'Researcher Code', label: 'Researcher Code / كود الباحث' },
  { value: 'Account ID', label: 'Account ID / رقم الحساب' },
];

export const OUTBOUND_FIELD_TYPES = [
  { value: 'readonly_date', label: 'Live date (read-only)' },
  { value: 'readonly_time', label: 'Live time (read-only)' },
  { value: 'text', label: 'Short text' },
  { value: 'number', label: 'Number' },
  { value: 'segment', label: 'Segmented buttons (2+)' },
  { value: 'select', label: 'Dropdown' },
  { value: 'year', label: 'Year (Dropdown)' },
];

export const DEFAULT_META = {
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

/** Full default checklist (matches previous product behavior). IDs are stable for payloads. */
export const DEFAULT_OUTBOUND_V2 = {
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
      systemTag: 'Researcher Name',
    },
    {
      id: 'researcher_code',
      label: 'Researcher code',
      type: 'text',
      required: true,
      section: 'agent',
      systemTag: 'Researcher Code',
    },
    {
      id: 'serial_number',
      label: 'Serial number',
      type: 'number',
      required: true,
      min: 1,
      section: 'agent',
      systemTag: '',
    },
    {
      id: 'interview_date',
      label: 'Interview date',
      type: 'readonly_date',
      required: false,
      section: 'agent',
      systemTag: '',
    },
    {
      id: 'interview_time',
      label: 'Interview start time',
      type: 'readonly_time',
      required: false,
      section: 'agent',
      systemTag: '',
    },
    {
      id: 'is_egyptian',
      label: 'Is the respondent Egyptian?',
      type: 'segment',
      required: true,
      section: 'agent',
      systemTag: 'Nationality',
      options: [
        { value: 'yes', label: 'Egyptian' },
        { value: 'no', label: 'Non-Egyptian' },
      ],
    },
    {
      id: 'nationality',
      label: 'Nationality',
      type: 'text',
      required: true,
      section: 'agent',
      placeholder: '',
      systemTag: '',
      visibleWhen: { fieldId: 'is_egyptian', value: 'no' },
    },
    {
      id: 'age_years',
      label: 'Age (full years)',
      type: 'number',
      required: true,
      min: 1,
      section: 'agent',
      systemTag: 'Age',
    },
    {
      id: 'phone',
      label: 'Phone number',
      type: 'text',
      required: true,
      section: 'phone',
      systemTag: '',
    },
    {
      id: 'phone_type',
      label: 'Phone type',
      type: 'segment',
      required: true,
      section: 'call',
      systemTag: '',
      options: [
        { value: 'landline', label: 'Landline' },
        { value: 'mobile', label: 'Mobile' },
      ],
    },
    {
      id: 'call_result',
      label: 'Call outcome',
      type: 'select',
      required: true,
      section: 'call',
      systemTag: '',
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
      label: 'Interview outcome',
      type: 'select',
      required: true,
      section: 'call',
      systemTag: '',
      options: [
        { value: 'completed', label: 'Completed' },
        { value: 'partial', label: 'Partially completed' },
        { value: 'refused', label: 'Refused' },
        { value: 'no_qualified', label: 'No qualified respondent' },
        { value: 'postponed', label: 'Postponed' },
        { value: 'not_contacted', label: 'Not contacted' },
      ],
    },
    {
      id: 'outcome_reason',
      label: 'Reason for outcome',
      type: 'text',
      required: false,
      section: 'call',
      systemTag: '',
      visibleWhen: { type: 'rule', fieldId: 'interview_result', operator: 'in', value: 'partial,refused,postponed' }
    },
  ],
};

const META_FALLBACK_T = {
  title: 'precallTitle',
  subtitle: 'precallSubtitle',
  scriptLabel: 'precallScriptLabel',
  script: 'precallScript',
  sectionAgent: 'precallSectionAgent',
  sectionCall: 'precallSectionCall',
  sectionPhone: 'precallSectionPhone',
  formsCountLabel: 'precallFormsCount',
  newFormLabel: 'precallNewForm',
  completeHint: 'precallCompleteHint',
};

function cloneDeep(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function pickString(val) {
  if (typeof val === 'string') return val;
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    return (typeof val.en === 'string' ? val.en : '') || (typeof val.ar === 'string' ? val.ar : '') || '';
  }
  return '';
}

/** Migrate legacy flat outboundPrecall (v1) into v2. */
function migrateLegacyFlatToV2(flat) {
  const v2 = cloneDeep(DEFAULT_OUTBOUND_V2);
  if (!flat || typeof flat !== 'object') return v2;
  const metaKeys = ['title', 'subtitle', 'scriptLabel', 'script', 'sectionAgent', 'sectionCall'];
  metaKeys.forEach((k) => {
    const s = pickString(flat[k]);
    if (s.trim()) v2.meta[k] = s.trim();
  });
  const legacyFieldMap = {
    researcherName: 'researcher_name',
    researcherCode: 'researcher_code',
    serial: 'serial_number',
    q1: 'is_egyptian',
    egyptianYes: null,
    egyptianNo: null,
    q2Age: 'age_years',
    phone: 'phone',
  };
  v2.fields.forEach((f) => {
    if (f.type === 'segment' && f.id === 'is_egyptian') {
      const q1 = pickString(flat.q1);
      if (q1.trim()) f.label = q1.trim();
      const a = pickString(flat.egyptianYes);
      const b = pickString(flat.egyptianNo);
      if (a.trim()) f.options[0].label = a.trim();
      if (b.trim()) f.options[1].label = b.trim();
    }
    Object.entries(legacyFieldMap).forEach(([legacyKey, newId]) => {
      if (!newId || f.id !== newId) return;
      const s = pickString(flat[legacyKey]);
      if (s.trim()) f.label = s.trim();
    });
  });
  return v2;
}

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
  // Determine section: honour field's own section but force phone field into 'phone' section always
  let section = 'agent';
  if (f.section === 'call') section = 'call';
  if (f.section === 'phone') section = 'phone';
  if (id === 'phone') section = 'phone'; // always override — prevents DB inconsistencies
  const out = {
    id,
    label: typeof f.label === 'string' ? f.label : d.label || 'Question',
    type,
    required: !!f.required,
    section,
    systemTag: typeof f.systemTag === 'string' ? f.systemTag : (d.systemTag || ''),
    options: Array.isArray(f.options) ? f.options.map((o) => ({ value: String(o.value ?? ''), label: String(o.label ?? '') })) : d.options,
    placeholder: typeof f.placeholder === 'string' ? f.placeholder : d.placeholder,
    min: typeof f.min === 'number' ? f.min : d.min,
    minValue: typeof f.minValue === 'number' ? f.minValue : (typeof f.min === 'number' ? f.min : undefined),
    maxValue: typeof f.maxValue === 'number' ? f.maxValue : undefined,
    minLength: typeof f.minLength === 'number' ? f.minLength : undefined,
    maxLength: typeof f.maxLength === 'number' ? f.maxLength : undefined,
    yearRange: f.yearRange ? {
      from: f.yearRange.from != null && f.yearRange.from !== '' ? Number(f.yearRange.from) : undefined,
      to: f.yearRange.to != null && f.yearRange.to !== '' ? Number(f.yearRange.to) : undefined
    } : (type === 'year' ? (d.yearRange || { from: 1900, to: new Date().getFullYear() }) : undefined),
    visibleWhen: normalizeCondition(f.visibleWhen),
    logic: f.logic ? {
      ...normalizeCondition(f.logic),
      action: f.logic.action || 'show'
    } : undefined,
    allowOther: f.allowOther !== undefined ? !!f.allowOther : false,
    otherLabel: typeof f.otherLabel === 'string' && f.otherLabel ? f.otherLabel : (d.otherLabel || 'Other'),
    otherValue: f.otherValue !== undefined ? f.otherValue : (d.otherValue || 'Other'),
    multipleOtherLabel: typeof f.multipleOtherLabel === 'string' && f.multipleOtherLabel ? f.multipleOtherLabel : (d.multipleOtherLabel || 'Other'),
    multipleOtherValue: f.multipleOtherValue !== undefined ? f.multipleOtherValue : (d.multipleOtherValue || 'Other'),
  };
  if (type !== 'segment' && type !== 'select') {
    delete out.options;
    delete out.allowOther;
    delete out.otherLabel;
    delete out.otherValue;
    delete out.multipleOtherLabel;
    delete out.multipleOtherValue;
  }
  if (type !== 'text') delete out.placeholder;
  if (type !== 'number') {
    delete out.min;
    delete out.minValue;
    delete out.maxValue;
    delete out.minLength;
    delete out.maxLength;
  }
  if (type !== 'year') {
    delete out.yearRange;
  }
  if (!out.visibleWhen) delete out.visibleWhen;
  if (!out.logic) delete out.logic;
  return out;
}

/** Normalize survey.outboundPrecall from API into v2 (for builder + agent). */
export function normalizeOutboundPrecall(raw) {
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
        systemTag: '',
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
  if (!raw.fields && (raw.title || raw.script || raw.researcherName)) {
    return migrateLegacyFlatToV2(raw);
  }
  return cloneDeep(DEFAULT_OUTBOUND_V2);
}

export function metaLine(meta, key, t) {
  const custom = meta?.[key];
  if (typeof custom === 'string' && custom.trim()) return custom.trim();
  const tk = META_FALLBACK_T[key];
  return tk ? t(tk) : '';
}

/**
 * Recursively evaluates a condition tree.
 * Supported operators: ==, !=, contains, not_contains, gt, lt, gte, lte, in, not_in, is_empty, is_not_empty
 */
export function evaluateCondition(condition, answers) {
  if (!condition) return true;

  // Legacy format: { fieldId, value }
  if (condition.fieldId && !condition.type) {
    return String(answers[condition.fieldId] ?? '') === String(condition.value ?? '');
  }

  if (condition.type === 'rule') {
    const rawActual = answers[condition.fieldId];

    if (Array.isArray(rawActual)) {
      const targetStr = String(condition.value ?? '').trim().toLowerCase();
      const actualList = rawActual.map(v => String(v).toLowerCase());

      switch (condition.operator) {
        case '==':
        case 'equals':
        case 'contains':
          return actualList.includes(targetStr);
        case '!=':
        case 'not equals':
        case 'not_contains':
        case 'does not contain':
          return !actualList.includes(targetStr);
        case 'is_empty':
          return rawActual.length === 0;
        case 'is_not_empty':
          return rawActual.length > 0;
        // fallback for any other operator on array
        default:
          return actualList.includes(targetStr);
      }
    }

    const actualStr = String(rawActual ?? '').trim();
    const targetStr = String(Array.isArray(condition.value) ? '' : (condition.value ?? '')).trim();

    switch (condition.operator) {
      case '==':
      case 'equals':      return actualStr === targetStr;
      case '!=':
      case 'not equals':  return actualStr !== targetStr;
      case 'contains':    return actualStr.toLowerCase().includes(targetStr.toLowerCase());
      case 'not_contains':
      case 'does not contain': return !actualStr.toLowerCase().includes(targetStr.toLowerCase());
      case 'gt':          return Number(actualStr) > Number(targetStr);
      case 'lt':          return Number(actualStr) < Number(targetStr);
      case 'gte':         return Number(actualStr) >= Number(targetStr);
      case 'lte':         return Number(actualStr) <= Number(targetStr);
      case 'is_empty':    return rawActual === null || rawActual === undefined || actualStr === '';
      case 'is_not_empty': return rawActual !== null && rawActual !== undefined && actualStr !== '';
      case 'in': {
        const list = Array.isArray(condition.value)
          ? condition.value.map(String)
          : String(condition.value ?? '').split(',').map(v => v.trim()).filter(Boolean);
        return list.includes(actualStr);
      }
      case 'not_in': {
        const list = Array.isArray(condition.value)
          ? condition.value.map(String)
          : String(condition.value ?? '').split(',').map(v => v.trim()).filter(Boolean);
        return !list.includes(actualStr);
      }
      default: return actualStr === targetStr;
    }
  }

  if (condition.type === 'group') {
    const safeAnswers = answers || {};
    if (!Array.isArray(condition.conditions) || condition.conditions.length === 0) return true;
    if (condition.operator === 'OR') {
      return condition.conditions.some(c => evaluateCondition(c, safeAnswers));
    }
    return condition.conditions.every(c => evaluateCondition(c, safeAnswers));
  }

  return true;
}

export function isFieldVisible(field, answers) {
  if (field.logic) {
    const matched = evaluateCondition(field.logic, answers);
    const act = field.logic.action || 'show';
    if (act === 'show') return matched;
    if (act === 'hide') return !matched;
    if (act === 'skip') return !matched;
    if (act === 'terminate_call') return true;
  }
  if (!field.visibleWhen) return true;
  return evaluateCondition(field.visibleWhen, answers);
}

function isEmptyValue(type, val) {
  if (val === undefined || val === null) return true;
  const str = String(val).trim();
  if (str === '') return true;
  if (str.startsWith('OFFLINE-') || str.startsWith('AUTO-')) return false;
  if (type === 'number') return Number.isNaN(Number(val));
  return false;
}

/** Whether this field passes validation (only when visible). */
export function isFieldSatisfied(field, value) {
  const t = field.type;
  if (t === 'readonly_date' || t === 'readonly_time') return true;
  if (!field.required) {
    if (isEmptyValue(t, value)) return true;
  }
  if (field.required && isEmptyValue(t, value)) return false;
  if (field.id === 'phone') {
    const str = String(value ?? '').trim();
    if (str.startsWith('AUTO-') || str.startsWith('OFFLINE-')) return true;
    const digits = str.replace(/\D/g, '');
    if (field.required) return digits.length >= 8 && digits.length <= 15;
    return digits.length === 0 || (digits.length >= 8 && digits.length <= 15);
  }
  if (field.id === 'serial_number' || field.id === 'serial') {
    const str = String(value ?? '').trim();
    if (str.startsWith('OFFLINE-') || str.startsWith('AUTO-')) return true;
    if (field.required && str.length === 0) return false;
    if (str.length === 0) return true;
    const num = Number(str);
    if (!Number.isNaN(num)) {
      if (field.min != null && num < field.min) return false;
      return true;
    }
    return str.length > 0;
  }
  if (t === 'number') {
    const rawStr = String(value ?? '').trim();
    if (rawStr.startsWith('OFFLINE-') || rawStr.startsWith('AUTO-')) return true;
    if (rawStr === '') return !field.required;
    const digitsOnly = rawStr.replace(/\D/g, '');
    if (field.minLength != null && digitsOnly.length < field.minLength) return false;
    if (field.maxLength != null && digitsOnly.length > field.maxLength) return false;
    const numVal = Number(rawStr);
    if (!Number.isNaN(numVal)) {
      if (field.minValue != null && numVal < field.minValue) return false;
      if (field.maxValue != null && numVal > field.maxValue) return false;
      // Legacy fallback: support old min property for backward compat
      if (field.min != null && numVal < field.min) return false;
    } else if (field.required) {
      return false;
    }
    return true;
  }
  if (t === 'segment' || t === 'select') {
    return String(value ?? '').length > 0;
  }
  return String(value ?? '').trim().length > 0;
}


export function validateOutboundAnswers(fields, answers) {
  for (const field of fields) {
    if (!isFieldVisible(field, answers)) continue;
    if (!isFieldSatisfied(field, answers[field.id])) return false;
  }
  return true;
}

export function buildInitialAnswers(fields = [], userName = '', userCode = '', extraData = {}) {
  const answers = {};
  fields.forEach((f) => {
    if (f.type === 'readonly_date' || f.type === 'readonly_time') return;
    answers[f.id] = '';
  });

  fields.forEach((f) => {
    const tag = (f.systemTag || '').trim().toLowerCase();
    if (tag === 'researcher name' || tag === 'researcher_name' || f.id === 'researcher_name') {
      answers[f.id] = userName || '';
    } else if (tag === 'researcher code' || tag === 'researcher_code' || f.id === 'researcher_code') {
      answers[f.id] = userCode || '';
    } else if ((tag === 'governorate' || f.id === 'governorate') && extraData?.governorate) {
      answers[f.id] = extraData.governorate;
    }
  });

  return answers;
}

export function nextSequentialPrecallId(fields = []) {
  let maxNum = 0;
  let maxPrefix = 'pre_';
  let foundNumeric = false;

  for (const field of fields) {
    if (!field || !field.id) continue;
    const match = String(field.id).match(/^(.*?)(\d+)$/);
    if (match) {
      const prefix = match[1];
      const num = parseInt(match[2], 10);
      if (!foundNumeric || num > maxNum) {
        maxNum = num;
        maxPrefix = prefix;
        foundNumeric = true;
      }
    }
  }

  if (!foundNumeric) {
    return 'pre_1';
  }

  return `${maxPrefix}${maxNum + 1}`;
}

export function newFieldTemplate(existingFields = []) {
  return {
    id: nextSequentialPrecallId(existingFields),
    label: 'New question',
    type: 'text',
    required: false,
    section: 'agent',
    systemTag: '',
    options: [
      { value: 'a', label: 'Option A' },
      { value: 'b', label: 'Option B' },
    ],
  };
}

export function getDefaultOutboundClone() {
  return JSON.parse(JSON.stringify(DEFAULT_OUTBOUND_V2));
}

export function hasStoredOutboundCustom(raw) {
  if (raw == null || typeof raw !== 'object') return false;
  if (raw.version === 2 && Array.isArray(raw.fields) && raw.fields.length > 0) return true;
  return !!(pickString(raw.title) || pickString(raw.script) || pickString(raw.researcherName));
}

/** Same age resolution as server (empty string must not become 0). */
export function parseAgeYearsFromAnswers(answers, fields = []) {
  if (!answers || typeof answers !== 'object') return NaN;
  if (Array.isArray(fields) && fields.length > 0) {
    const ageField = fields.find((f) => (f.systemTag || '').trim().toLowerCase() === 'age');
    if (ageField && Object.prototype.hasOwnProperty.call(answers, ageField.id)) {
      const raw = answers[ageField.id];
      if (raw !== '' && raw != null) {
        const n = Number(raw);
        if (Number.isFinite(n)) return n;
      }
    }
  }
  const preferred = ['age_years', 'age', 'respondent_age'];
  for (const k of preferred) {
    if (!Object.prototype.hasOwnProperty.call(answers, k)) continue;
    const raw = answers[k];
    if (raw === '' && raw != null) continue;
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

/**
 * "Next" button — agent proceeds to the survey questionnaire.
 * Rules:
 *  - All required fields EXCEPT interview_result must be filled.
 *  - call_result must be 'contacted' (only contacted calls go to the questionnaire).
 *  - Age must be >= 18 (under-18 cannot be interviewed; use New Form with no_qualified instead).
 */
export function precallNextValidation(fields, answers) {
  const fieldsForNext = fields.filter((f) => f.id !== 'interview_result');
  if (!validateOutboundAnswers(fieldsForNext, answers)) return false;
  if (String(answers.call_result) !== 'contacted') return false;
  const age = parseAgeYearsFromAnswers(answers, fields);
  if (Number.isFinite(age) && age < 18) return false;
  return true;
}

/**
 * "New Form" button — agent logs a result and gets the next number.
 * Rules:
 *  - ALL required fields including interview_result must be filled.
 *  - Under-18 must have interview_result = 'no_qualified'.
 */
export function precallNewFormValidation(fields, answers) {
  if (!validateOutboundAnswers(fields, answers)) return false;
  const age = parseAgeYearsFromAnswers(answers, fields);
  if (Number.isFinite(age) && age < 18) {
    if (String(answers.interview_result) !== 'no_qualified') return false;
  }
  return true;
}


/** Final survey step — same value keys as precall interview_result. */
export const INTERVIEW_OUTCOME_OPTIONS = [
  'completed',
  'partial',
  'refused',
  'no_qualified',
  'postponed',
  'not_contacted',
];

/** Minimal older template (fewer fields). */
const MINIMAL_OUTBOUND_V2 = {
  version: 2,
  meta: {
    ...DEFAULT_META,
    title: 'Quick outbound checklist',
    subtitle: 'Record essentials before the questionnaire.',
  },
  fields: [
    {
      id: 'researcher_name',
      label: 'Researcher name',
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
      id: 'age_years',
      label: 'Age (full years)',
      type: 'number',
      required: true,
      min: 1,
      section: 'agent',
    },
    {
      id: 'phone',
      label: 'Phone number',
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
      label: 'Interview outcome',
      type: 'select',
      required: true,
      section: 'call',
      options: [
        { value: 'completed', label: 'Completed' },
        { value: 'partial', label: 'Partially completed' },
        { value: 'refused', label: 'Refused' },
        { value: 'no_qualified', label: 'No qualified respondent' },
        { value: 'postponed', label: 'Postponed' },
        { value: 'not_contacted', label: 'Not contacted' },
      ],
    },
    {
      id: 'outcome_reason',
      label: 'Reason for outcome',
      type: 'text',
      required: false,
      section: 'call',
      visibleWhen: { type: 'rule', fieldId: 'interview_result', operator: 'in', value: 'partial,refused,postponed' }
    },
  ],
};

/** "Classic" older layout label — same structure as default with different headings copy. */
const CLASSIC_OUTBOUND_V2 = (() => {
  const c = JSON.parse(JSON.stringify(DEFAULT_OUTBOUND_V2));
  c.meta.title = 'Outbound call checklist (classic)';
  c.meta.sectionAgent = 'Respondent details';
  c.meta.sectionCall = 'Line & outcomes';
  return c;
})();

export const OUTBOUND_TEMPLATE_PRESETS = [
  { id: 'default', name: 'Default — full checklist', factory: () => JSON.parse(JSON.stringify(DEFAULT_OUTBOUND_V2)) },
  { id: 'classic', name: 'Older — classic headings', factory: () => JSON.parse(JSON.stringify(CLASSIC_OUTBOUND_V2)) },
  { id: 'minimal', name: 'Older — minimal fields', factory: () => JSON.parse(JSON.stringify(MINIMAL_OUTBOUND_V2)) },
];
