export const getOtherPrefix = (q) => `${q?.otherValue || 'Other'}:`;

export const isOtherAnswer = (val, q) => {
  if (Array.isArray(val)) {
    return val.some(v => isOtherAnswer(v, q));
  }
  if (typeof val !== 'string') return false;
  return val.startsWith('other:') || (q && val.startsWith(getOtherPrefix(q)));
};

export const extractOtherText = (val, q) => {
  if (Array.isArray(val)) {
    const found = val.find(v => isOtherAnswer(v, q));
    return found ? extractOtherText(found, q) : '';
  }
  if (typeof val !== 'string') return '';
  const p = getOtherPrefix(q);
  if (q && val.startsWith(p)) return val.substring(p.length);
  if (val.startsWith('other:')) return val.substring(6);
  return '';
};

export const buildOtherAnswer = (text, q) => `${q?.otherValue || 'Other'}:${text}`;
