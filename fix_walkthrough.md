# Bug Fix: Agent Pre-Call Checklist Showing Default Configuration

## Root Cause
When an agent navigated to the Pre-Call Checklist, the system correctly fetched the custom 14-field survey configuration you built from the backend.
However, immediately after fetching it, the frontend attempted to cache this configuration into the browser's local `IndexedDB` for offline support using `offlineDb.savePrecallConfig()`. 
Because of browser restrictions (e.g. Incognito mode, privacy settings, or storage quotas), this `IndexedDB` operation was throwing a JavaScript Error. 
This error crashed the setup process, triggering a master `catch (e)` block that intentionally fell back to a hardcoded `DEFAULT_OUTBOUND_V2` configuration (which contains the old default fields like "Is the respondent Egyptian?"). 
This caused the UI to display the wrong fields, despite successfully downloading your custom survey fields.

## Fix
Wrapped the `offlineDb.savePrecallConfig()` call in a fail-safe `try/catch` block. Now, if the browser blocks the local offline cache save, it will simply log a warning in the console but **continue** rendering the correct live custom configuration from the server.
