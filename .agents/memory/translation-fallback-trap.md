---
name: Translation key fallback trap
description: Why JSX `|| 'English fallback'` patterns after t() calls are dead code and never display
---

## Rule
`t(key)` in UIContext returns `translations[language][key] || key` — so a missing key returns the **key name string** (non-empty, truthy), not null/undefined. JSX patterns like `{t('missingKey') || 'Fallback text'}` always display `'missingKey'` — the fallback never fires.

## Why
The `||` operator only uses the right-hand side when the left side is falsy. A non-empty string is always truthy.

## How to apply
- When you see `t('foo') || 'Bar'` in JSX, treat it as a signal that `'foo'` might be missing from translations.
- Always add missing keys to **both** `en` and `ar` sections of `admin-ui/src/utils/translations.js`.
- Keys added in last audit: `qualityTools`, `agentStats`, `dropOffReport`, `liveAudit`, `useNavbarStatus`, `feedbackText`, `handover`, `editForm`, `serial`, `serialFound`, `serialNotFound`
