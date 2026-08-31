-- ---------------------------------------------------------------------------
-- Fix the stale persisted "kpiLowFirstAid" ui_labels value.
--
-- src/constants.js's DEFAULT_LABELS.kpiLowFirstAid was renamed from
-- "مواد الإسعاف على الرف" to "مواد إسعاف قاربت على الانتهاء". Any clinic
-- that had never customized this label never had a row in ui_labels for it
-- (App.jsx's `{ ...DEFAULT_LABELS, ...state.uiLabels }` merge means those
-- clinics already pick up the new default automatically). But any clinic
-- whose ui_labels row was written back when the OLD text was still the
-- default (e.g. via SettingsPanel's "save" round-tripping the then-current
-- label unchanged) still has that exact old string persisted, which shadows
-- the new default forever.
--
-- This updates ONLY rows that exactly match the old default text (matched
-- after trimming incidental leading/trailing whitespace — the live data was
-- found to have a trailing space baked in from the original save), leaving
-- any genuinely custom value (anything that isn't that exact old string)
-- completely untouched — a real per-clinic customization must never be
-- silently overwritten.
-- ---------------------------------------------------------------------------
update ui_labels
set value = 'مواد إسعاف قاربت على الانتهاء'
where key = 'kpiLowFirstAid'
  and trim(value) = 'مواد الإسعاف على الرف';
