// ─── Inline evaluateCondition (mirror of outboundPrecallConfig.js) ───────────
const NO_VALUE_OPS  = new Set(['is_empty', 'is_not_empty']);
const LIST_OPS      = new Set(['in', 'not_in']);

function evaluateCondition(condition, answers) {
  if (!condition) return true;
  if (condition.fieldId && !condition.type) {
    return String(answers[condition.fieldId] ?? '') === String(condition.value ?? '');
  }
  if (condition.type === 'rule') {
    const rawActual = answers[condition.fieldId];
    const actualStr = String(rawActual ?? '').trim();
    const targetStr = String(Array.isArray(condition.value) ? '' : (condition.value ?? '')).trim();
    switch (condition.operator) {
      case '==':          return actualStr === targetStr;
      case '!=':          return actualStr !== targetStr;
      case 'contains':    return actualStr.toLowerCase().includes(targetStr.toLowerCase());
      case 'not_contains': return !actualStr.toLowerCase().includes(targetStr.toLowerCase());
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
    if (!Array.isArray(condition.conditions) || condition.conditions.length === 0) return true;
    if (condition.operator === 'OR') return condition.conditions.some(c => evaluateCondition(c, answers));
    return condition.conditions.every(c => evaluateCondition(c, answers));
  }
  return true;
}

// ─── Tests ────────────────────────────────────────────────────────────────────
const tests = [
  // Legacy
  { name: 'Legacy format (match)',   condition: { fieldId: 'q1', value: 'Yes' }, answers: { q1: 'Yes' }, expected: true },
  { name: 'Legacy format (no match)',condition: { fieldId: 'q1', value: 'Yes' }, answers: { q1: 'No'  }, expected: false },

  // Equality
  { name: '== match',   condition: { type:'rule', fieldId:'q1', operator:'==',  value:'Yes' }, answers: { q1:'Yes' }, expected: true  },
  { name: '== no match',condition: { type:'rule', fieldId:'q1', operator:'==',  value:'Yes' }, answers: { q1:'No'  }, expected: false },
  { name: '!= match',   condition: { type:'rule', fieldId:'q1', operator:'!=',  value:'No'  }, answers: { q1:'Yes' }, expected: true  },
  { name: '!= no match',condition: { type:'rule', fieldId:'q1', operator:'!=',  value:'Yes' }, answers: { q1:'Yes' }, expected: false },

  // Text
  { name: 'contains match',      condition: { type:'rule', fieldId:'q1', operator:'contains',     value:'stud' }, answers: { q1:'Student' }, expected: true  },
  { name: 'contains no match',   condition: { type:'rule', fieldId:'q1', operator:'contains',     value:'work' }, answers: { q1:'Student' }, expected: false },
  { name: 'not_contains match',  condition: { type:'rule', fieldId:'q1', operator:'not_contains', value:'work' }, answers: { q1:'Student' }, expected: true  },
  { name: 'not_contains no match',condition:{ type:'rule', fieldId:'q1', operator:'not_contains', value:'stud' }, answers: { q1:'Student' }, expected: false },

  // Numeric
  { name: 'gt match',   condition: { type:'rule', fieldId:'age', operator:'gt',  value:'18' }, answers: { age:'25' }, expected: true  },
  { name: 'gt no match',condition: { type:'rule', fieldId:'age', operator:'gt',  value:'30' }, answers: { age:'25' }, expected: false },
  { name: 'lt match',   condition: { type:'rule', fieldId:'age', operator:'lt',  value:'30' }, answers: { age:'25' }, expected: true  },
  { name: 'lt no match',condition: { type:'rule', fieldId:'age', operator:'lt',  value:'18' }, answers: { age:'25' }, expected: false },
  { name: 'gte match (equal)',condition: { type:'rule', fieldId:'age', operator:'gte', value:'25' }, answers: { age:'25' }, expected: true  },
  { name: 'lte match (equal)',condition: { type:'rule', fieldId:'age', operator:'lte', value:'25' }, answers: { age:'25' }, expected: true  },

  // List - array value
  { name: 'in (array) match',    condition: { type:'rule', fieldId:'q1', operator:'in',     value:['Student','Worker'] }, answers: { q1:'Student' }, expected: true  },
  { name: 'in (array) no match', condition: { type:'rule', fieldId:'q1', operator:'in',     value:['Student','Worker'] }, answers: { q1:'Retired' }, expected: false },
  { name: 'not_in (array) match',condition: { type:'rule', fieldId:'q1', operator:'not_in', value:['Student','Worker'] }, answers: { q1:'Retired' }, expected: true  },
  // List - comma-string value
  { name: 'in (string) match',   condition: { type:'rule', fieldId:'q1', operator:'in',     value:'Student,Worker' }, answers: { q1:'Worker' }, expected: true  },

  // Presence
  { name: 'is_empty (null)',      condition: { type:'rule', fieldId:'q1', operator:'is_empty'     }, answers: { q1: null }, expected: true  },
  { name: 'is_empty (string)',    condition: { type:'rule', fieldId:'q1', operator:'is_empty'     }, answers: { q1: ''   }, expected: true  },
  { name: 'is_empty (filled)',    condition: { type:'rule', fieldId:'q1', operator:'is_empty'     }, answers: { q1: 'Hi' }, expected: false },
  { name: 'is_not_empty (filled)',condition: { type:'rule', fieldId:'q1', operator:'is_not_empty' }, answers: { q1: 'Hi' }, expected: true  },

  // Groups — AND
  { name: 'AND group (all pass)', condition: { type:'group', operator:'AND', conditions:[
    { type:'rule', fieldId:'q1', operator:'==', value:'Yes' },
    { type:'rule', fieldId:'q2', operator:'==', value:'18-25' },
  ]}, answers: { q1:'Yes', q2:'18-25' }, expected: true  },
  { name: 'AND group (one fails)', condition: { type:'group', operator:'AND', conditions:[
    { type:'rule', fieldId:'q1', operator:'==', value:'Yes' },
    { type:'rule', fieldId:'q2', operator:'==', value:'18-25' },
  ]}, answers: { q1:'Yes', q2:'26-35' }, expected: false },

  // Groups — OR
  { name: 'OR group (one passes)', condition: { type:'group', operator:'OR', conditions:[
    { type:'rule', fieldId:'q1', operator:'==', value:'Yes' },
    { type:'rule', fieldId:'q3', operator:'==', value:'Student' },
  ]}, answers: { q1:'No', q3:'Student' }, expected: true  },

  // Deep nesting — the exact user example:
  // (Q1 == Yes AND Q2 == 18-25) OR (Q3 contains Student AND (Q4 > 3 OR Q6 == Active))
  { name: 'Deep nested — complex example (branch 2)', condition: {
    type: 'group', operator: 'OR', conditions: [
      { type:'group', operator:'AND', conditions:[
        { type:'rule', fieldId:'q1', operator:'==',  value:'Yes'   },
        { type:'rule', fieldId:'q2', operator:'==',  value:'18-25' },
      ]},
      { type:'group', operator:'AND', conditions:[
        { type:'rule', fieldId:'q3', operator:'contains', value:'Student' },
        { type:'group', operator:'OR', conditions:[
          { type:'rule', fieldId:'q4', operator:'gt', value:'3'      },
          { type:'rule', fieldId:'q6', operator:'==', value:'Active' },
        ]},
      ]},
    ]},
    answers: { q1:'No', q2:'26-35', q3:'I am a Student', q4:'1', q6:'Active' },
    expected: true,
  },
  { name: 'Deep nested — complex example (neither branch)', condition: {
    type: 'group', operator: 'OR', conditions: [
      { type:'group', operator:'AND', conditions:[
        { type:'rule', fieldId:'q1', operator:'==',  value:'Yes'   },
        { type:'rule', fieldId:'q2', operator:'==',  value:'18-25' },
      ]},
      { type:'group', operator:'AND', conditions:[
        { type:'rule', fieldId:'q3', operator:'contains', value:'Student' },
        { type:'group', operator:'OR', conditions:[
          { type:'rule', fieldId:'q4', operator:'gt', value:'3'      },
          { type:'rule', fieldId:'q6', operator:'==', value:'Active' },
        ]},
      ]},
    ]},
    answers: { q1:'No', q2:'26-35', q3:'Worker', q4:'1', q6:'Inactive' },
    expected: false,
  },
];

let passed = 0;
tests.forEach(t => {
  const result = evaluateCondition(t.condition, t.answers);
  const ok = result === t.expected;
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${t.name}${ok ? '' : ` (expected ${t.expected}, got ${result})`}`);
  if (ok) passed++;
});

console.log(`\n${'─'.repeat(50)}`);
console.log(`Passed ${passed}/${tests.length} tests.`);
if (passed < tests.length) process.exit(1);
