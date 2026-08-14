-- Enable Realtime (postgres_changes) on the tables the UI needs to live-sync
-- across devices. Deliberately excluded: profiles, clinics, ui_labels — low
-- change frequency, not worth a live subscription each. withdrawal_logs IS
-- included since the Log tab and per-medication history benefit from
-- updating live when another device dispenses stock.
--
-- Realtime respects each table's RLS SELECT policy, so a client only
-- receives change events for rows it's already allowed to read (its own
-- clinic) — this list does not widen access beyond section 0002.

alter publication supabase_realtime add table categories;
alter publication supabase_realtime add table medications;
alter publication supabase_realtime add table batches;
alter publication supabase_realtime add table first_aid_items;
alter publication supabase_realtime add table withdrawal_logs;
