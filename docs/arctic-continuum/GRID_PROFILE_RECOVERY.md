# Grid view and connected profile recovery

Column visibility is ephemeral and restricted to known columns, with incident identifier, unit and status mandatory. Existing data, filter, export and mutation contracts are unchanged. Shared view helper is tested with 10,000 synthetic records, but actual browser paging remains client-side and does not prove large-dataset server performance. Browser test checks visibility/reset and data parity. Synthetic screenshots and test report are retained by CI for seven days; no production capture.

Existing staff cross-module profile now aborts obsolete requests, checks returned staff ID and collection shape, resets on identity change, and allows read-only retry. No new edges, RPC, or access grant. Actual RPC authorization and all per-role denial cases remain open. This increment addresses portions of P3/P5/T04/T15/T16, not complete gates.
