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

  const refetchTimerRef = useRef(null);
  const mountedRef = useRef(true);

  const refetch = useCallback(async () => {
    if (!clinicId) return;
    try {
      const next = await api.fetchClinicData();
      if (mountedRef.current) setState(next);
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
      if (mountedRef.current) setState(data);
    } catch (e) {
      if (mountedRef.current) {
        setLoadError(e.message || "تعذر تحميل بيانات الصيدلية");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    mountedRef.current = true;
    if (!clinicId) {
      setState(null);
      setLoading(false);
      setLoadError("");
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
  // reflect the actor's own change).
  const runMutation = useCallback(
    async (fn) => {
      setCloudStatus("saving");
      setError("");
      try {
        const result = await fn();
        await refetch();
        setCloudStatus("idle");
        return result;
      } catch (e) {
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

  // ---- withdrawals (FEFO happens inside the withdraw_stock RPC) ----
  const withdrawStock = (medId, batchId, qty, date) =>
    runMutation(() =>
      api.withdrawStock({
        medicationId: medId,
        qty,
        withdrawnOn: date,
        batchId: batchId || null,
      }),
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
  const saveUiLabels = (nextLabels) =>
    runMutation(() => api.saveUiLabels(clinicId, nextLabels));

  return {
    state,
    loading,
    loadError,
    retryLoad: loadInitial,
    cloudStatus,
    error,
    refetch,
    addCategory,
    editCategory,
    addMedication,
    editMedication,
    deleteMedication,
    addBatch,
    deleteBatch,
    withdrawStock,
    quickWithdrawOne,
    addFirstAid,
    editFirstAid,
    adjustFirstAid,
    deleteFirstAid,
    saveUiLabels,
  };
}
