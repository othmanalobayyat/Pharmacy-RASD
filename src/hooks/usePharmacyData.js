import { useState, useEffect, useRef, useCallback } from "react";
import * as api from "../lib/pharmacyApi";
import { isSupabaseConfigured } from "../lib/supabase";

const REALTIME_REFETCH_DEBOUNCE_MS = 300;

// Supabase is now the source of truth (see supabase/migrations/). This hook
// loads the clinic's dataset, keeps it live-synced across devices via
// Realtime, and exposes the same mutation function names the components
// already call — withdrawals/first-aid-adjustments go through atomic RPCs
// (src/lib/pharmacyApi.js) instead of local reducer logic, since the actual
// stock math now has to happen in Postgres to be safe under concurrency.
export function usePharmacyData(clinicId) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  // Distinct from `error` below: this is specifically "the initial dataset
  // never loaded," so the UI can render an explicit failure screen instead
  // of quietly showing `state === null` (loading) or an empty pharmacy. It
  // is intentionally NEVER satisfied by substituting an empty dataset — a
  // failed load must never look identical to "this clinic has no inventory."
  const [loadError, setLoadError] = useState("");
  const [cloudStatus, setCloudStatus] = useState("idle"); // idle | saving | error
  const [error, setError] = useState("");

  // Global withdrawal-log pagination (Improvement #7). `state.log` only ever
  // holds the currently-loaded window (first page, plus whatever "Load more"
  // has appended) — never the whole table.
  const [logHasMore, setLogHasMore] = useState(false);
  const [loadingMoreLog, setLoadingMoreLog] = useState(false);
  const [logMoreError, setLogMoreError] = useState("");
  // Bumped on every successful loadInitial/refetch so MedHistory (which
  // fetches its own per-medication log directly from the DB, not from
  // state.log) knows to re-fetch and stay live-synced with Realtime, without
  // this hook having to hold a second copy of per-medication history.
  const [logRefreshTick, setLogRefreshTick] = useState(0);

  const refetchTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const stateRef = useRef(null);
  stateRef.current = state;

  // Double-refetch fix: a local mutation already does its own immediate
  // `refetch()` below (fast, certain feedback for the actor's own change).
  // Realtime then also delivers that same write back as a postgres_changes
  // event a moment later, which would otherwise trigger a SECOND, redundant
  // refetch of data we already just loaded. Each table a mutation touches
  // emits exactly one realtime event per write (e.g. withdrawStock's RPC
  // touches both `batches` and `withdrawal_logs`, so exactly two events are
  // expected), so runMutation "arms" this counter with that exact expected
  // count right before performing the write, and the realtime handler below
  // consumes (decrements) it one event at a time instead of scheduling a
  // refetch — silently dropping only precisely as many events as our own
  // mutation is known to produce. Any further event (a genuinely different
  // device's change, or our own next mutation) is NOT covered by this and
  // triggers a normal debounced refetch, so cross-device sync is unaffected.
  const suppressedEchoesRef = useRef(0);

  const refetch = useCallback(async () => {
    if (!clinicId) return;
    try {
      // Re-request the same-sized log window already loaded (e.g. after
      // "Load more"), so an unrelated change elsewhere doesn't collapse an
      // expanded log view back down to just the first page.
      const currentLogLength = stateRef.current?.log?.length;
      const next = await api.fetchClinicData(currentLogLength || undefined);
      if (mountedRef.current) {
        setState(next);
        setLogHasMore(next.logHasMore);
        setLogRefreshTick((t) => t + 1);
      }
    } catch (e) {
      if (mountedRef.current) setError(e.message);
    }
  }, [clinicId]);

  // Initial load. On failure, `state` is deliberately left as-is (null on a
  // fresh mount) rather than replaced with an empty-but-valid-looking
  // dataset — see `loadError` above.
  const loadInitial = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    setLoadError("");
    try {
      const data = await api.fetchClinicData();
      if (mountedRef.current) {
        setState(data);
        setLogHasMore(data.logHasMore);
        setLogRefreshTick((t) => t + 1);
      }
    } catch (e) {
      if (mountedRef.current) {
        setLoadError(e.message || "تعذر تحميل بيانات الصيدلية");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [clinicId]);

  // "تحميل المزيد" — appends the next page of older withdrawal-log rows to
  // the ones already loaded; never replaces or re-slices what's there.
  const loadMoreLog = useCallback(async () => {
    if (!clinicId || loadingMoreLog || !logHasMore) return;
    setLoadingMoreLog(true);
    setLogMoreError("");
    try {
      const offset = stateRef.current?.log?.length || 0;
      const { logs, hasMore } = await api.fetchWithdrawalLogPage(offset);
      if (mountedRef.current) {
        setState((prev) => (prev ? { ...prev, log: [...prev.log, ...logs] } : prev));
        setLogHasMore(hasMore);
      }
    } catch (e) {
      if (mountedRef.current) setLogMoreError(e.message);
    } finally {
      if (mountedRef.current) setLoadingMoreLog(false);
    }
  }, [clinicId, loadingMoreLog, logHasMore]);

  useEffect(() => {
    mountedRef.current = true;
    if (!clinicId) {
      setState(null);
      setLoading(false);
      setLoadError("");
      setLogHasMore(false);
      setLogMoreError("");
      suppressedEchoesRef.current = 0;
      return () => {
        mountedRef.current = false;
      };
    }
    loadInitial();
    return () => {
      mountedRef.current = false;
    };
  }, [clinicId, loadInitial]);

  // realtime: any insert/update/delete on the clinic's rows (from this
  // device or another one) triggers a debounced refetch so a single RPC
  // call that touches two tables (batches + withdrawal_logs) doesn't cause
  // two redundant refetches.
  useEffect(() => {
    if (!clinicId || !isSupabaseConfigured) return undefined;

    const scheduleRefetch = () => {
      if (suppressedEchoesRef.current > 0) {
        // This event is the expected realtime echo of a mutation this same
        // device just made (and already refetched for) — consume one
        // "credit" and skip scheduling a redundant refetch.
        suppressedEchoesRef.current -= 1;
        return;
      }
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      refetchTimerRef.current = setTimeout(() => {
        refetchTimerRef.current = null;
        refetch();
      }, REALTIME_REFETCH_DEBOUNCE_MS);
    };

    const unsubscribe = api.subscribeToClinicData(clinicId, {
      onCategoriesChange: scheduleRefetch,
      onMedicationsChange: scheduleRefetch,
      onBatchesChange: scheduleRefetch,
      onFirstAidChange: scheduleRefetch,
      onLogChange: scheduleRefetch,
    });

    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      unsubscribe();
    };
  }, [clinicId, refetch]);

  // Wrap every mutation with the same saving/error bookkeeping and an
  // immediate local refetch (don't wait for the realtime round-trip to
  // reflect the actor's own change). `echoTables` is how many distinct
  // tables this specific mutation writes to (default 1) — see
  // suppressedEchoesRef above. Armed BEFORE the write (not after) so there
  // is no window where a fast realtime echo could arrive and be treated as
  // a genuine external change before we've told this hook to expect it.
  const runMutation = useCallback(
    async (fn, echoTables = 1) => {
      setCloudStatus("saving");
      setError("");
      suppressedEchoesRef.current += echoTables;
      try {
        const result = await fn();
        await refetch();
        setCloudStatus("idle");
        return result;
      } catch (e) {
        // The write didn't (verifiably) commit, so no realtime echo for it
        // will arrive — release the credit again rather than leaving it to
        // wrongly swallow a later, unrelated change.
        suppressedEchoesRef.current = Math.max(0, suppressedEchoesRef.current - echoTables);
        setCloudStatus("error");
        setError(e.message);
        throw e;
      }
    },
    [refetch],
  );

  // ---- categories ----
  const addCategory = (name) =>
    runMutation(() => api.createCategory(clinicId, name));
  const editCategory = (id, name) =>
    runMutation(() => api.updateCategory(id, name));

  // ---- medications ----
  const addMedication = ({ name, categoryId }) =>
    runMutation(() => api.createMedication(clinicId, { name, categoryId }));
  const editMedication = (id, { name, categoryId }) =>
    runMutation(() => api.updateMedication(id, { name, categoryId }));
  const deleteMedication = (medId) =>
    runMutation(() => api.deleteMedication(medId));

  // ---- batches ----
  const addBatch = (medId, { expiry, qty }) =>
    runMutation(() => api.createBatch(clinicId, medId, { expiry, qty }));
  const deleteBatch = (_medId, batchId) =>
    runMutation(() => api.deleteBatch(batchId));
  // Quantity correction with an audit trail (see
  // supabase/migrations/0014_batch_quantity_adjustments.sql) — only writes
  // to `batches` (the audit table itself isn't realtime-subscribed), so the
  // default echoTables=1 is correct here.
  const adjustBatchQty = (batchId, newQty, reason) =>
    runMutation(() => api.adjustBatchQty(batchId, newQty, reason));

  // ---- withdrawals (FEFO happens inside the withdraw_stock RPC) ----
  // withdraw_stock() writes to both `batches` and `withdrawal_logs` in one
  // transaction (see supabase/migrations/0003/0010), so realtime emits two
  // separate change events for this one mutation — echoTables=2.
  const withdrawStock = (medId, batchId, qty, date) =>
    runMutation(
      () =>
        api.withdrawStock({
          medicationId: medId,
          qty,
          withdrawnOn: date,
          batchId: batchId || null,
        }),
      2,
    );

  // batchId is intentionally not resolved client-side anymore: passing
  // batchId=null lets the withdraw_stock RPC pick the earliest-expiry batch
  // with available stock itself, inside the same row-locked transaction that
  // decrements it — this is what makes FEFO selection race-safe under
  // concurrent withdrawals from two devices (see migration 0003).
  const quickWithdrawOne = (med, sessionDate) =>
    withdrawStock(med.id, null, 1, sessionDate);

  // ---- first aid ----
  const addFirstAid = ({ name, qty, threshold }) =>
    runMutation(() => api.createFirstAid(clinicId, { name, qty, threshold }));
  const editFirstAid = (id, { name, threshold }) =>
    runMutation(() => api.updateFirstAid(id, { name, threshold }));
  const adjustFirstAid = (id, delta) =>
    runMutation(() => api.adjustFirstAid(id, delta));
  const deleteFirstAid = (id) => runMutation(() => api.deleteFirstAid(id));

  // ---- labels ----
  // `ui_labels` is deliberately NOT in the realtime publication (see
  // supabase/migrations/0005_realtime.sql) — no echo will ever arrive for
  // this write, so echoTables=0 (otherwise the un-consumed credit would sit
  // around and wrongly swallow a later, unrelated realtime event).
  const saveUiLabels = (nextLabels) =>
    runMutation(() => api.saveUiLabels(clinicId, nextLabels), 0);

  return {
    state,
    loading,
    loadError,
    retryLoad: loadInitial,
    cloudStatus,
    error,
    refetch,
    logHasMore,
    loadingMoreLog,
    logMoreError,
    loadMoreLog,
    logRefreshTick,
    addCategory,
    editCategory,
    addMedication,
    editMedication,
    deleteMedication,
    addBatch,
    deleteBatch,
    adjustBatchQty,
    withdrawStock,
    quickWithdrawOne,
    addFirstAid,
    editFirstAid,
    adjustFirstAid,
    deleteFirstAid,
    saveUiLabels,
  };
}
