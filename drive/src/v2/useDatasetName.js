import { useEffect, useState } from "react";
import { describeDataset } from "@/v2/api";

export function useDatasetName(datasetId) {
  const [named, setNamed] = useState({ id: "", name: "" });
  useEffect(() => {
    if (!datasetId) return undefined;
    let cancelled = false;
    describeDataset(datasetId)
      .then((payload) => {
        const ds = payload?.dataset || payload || {};
        if (!cancelled) setNamed({ id: datasetId, name: String(ds.name || ds.display_name || ds.title || "") });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [datasetId]);
  return named.id === datasetId ? named.name : "";
}
