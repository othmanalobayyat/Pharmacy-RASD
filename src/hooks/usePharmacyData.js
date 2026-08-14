import { useState, useEffect, useRef, useCallback } from "react";
import * as api from "../lib/pharmacyApi";
import { isSupabaseConfigured } from "../lib/supabase";

const REALTIME_REFETCH_DEBOUNCE_MS = 300;

function emptyState() {
  return { categories: [], medications: [], firstAid: [], log: [], uiLabels: {} };
}

// Supabase is now the source of truth (see supabase/migrations/). This hook
// loads the clinic's dataset, keeps it live-synced across devices via
// Realtime, and exposes the same mutation function names the components
// already call — withdrawals/first-aid-adjustments go through atomic RPCs
// (src/lib/pharmacyApi.js) instead of local reducer logic, since the actual
// stock math now has to happen in Postgres to be safe under concurrency.
export function usePharmacyData(clinicId) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
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

  // initial load
  useEffect(() => {
    mountedRef.current = true;
    if (!clinicId) {
      setState(null);
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }
    setLoading(true);
    (async () => {
      try {
        const data = await api.fetchClinicData();
        if (mountedRef.current) setState(data);
      } catch (e) {
        if (mountedRef.current) {
          setState(emptyState());
          setError(e.message);
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
    return () => {
      mountedRef.current = false;
    };
  }, [clinicId]);

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
