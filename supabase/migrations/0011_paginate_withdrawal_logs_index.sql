-- Supports paginated withdrawal-log queries (see src/lib/pharmacyApi.js
-- fetchWithdrawalLogPage), which order by (clinic_id, created_at desc) and
-- page with limit/offset. The existing withdrawal_logs_clinic_id_idx and
-- withdrawal_logs_withdrawn_on_idx don't cover this access pattern, so a
-- clinic with a large history would otherwise need a sort of the whole
-- clinic's rows on every page.

create index if not exists withdrawal_logs_clinic_created_at_idx
  on withdrawal_logs (clinic_id, created_at desc);
