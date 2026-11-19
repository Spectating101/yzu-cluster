# CKAN read-only catalog discovery

Run `python -m scripts.yzu_cluster.interop_ckan_discovery 'solar power' --limit 5` from the repository root, or call `InteropAPI.discover_ckan_candidates(query)` in the public reference runtime. For now, only the reviewed host `data.gov.au` is permitted, via the documented CKAN `/api/3/action/package_search` endpoint. Add further catalog hosts through reviewed code changes, never via unchecked user-supplied URLs.

Returned records remain **dataset discovery candidates**. Search results do not prove legal access, reproducibility, fitness for a query, availability of downloadable bytes or a durable identifier. Nothing calls Collect, Register, Query, workers, the private runtime or approval endpoints. The actual Research Drive procurement loop must still Probe → human Approve → Collect → Register.

API: https://docs.ckan.org/en/latest/api/ . Dataset licences vary per record; an API catalogue's own publication is not blanket permission to copy resource contents. No bulk sync or public release/RC2 promotion.
