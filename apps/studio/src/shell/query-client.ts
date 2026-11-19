import { QueryClient } from "@tanstack/react-query";

// Binding results are immutable per handle and refreshes come from explicit invalidateQueries
// (see EngineEvents / flatten-ocel), so don't re-run expensive bindings on staleness or window focus.
export const queryClient = new QueryClient({
  defaultOptions: {
    // Engine errors are deterministic: a retry repeats the same work and fails the same way.
    queries: { staleTime: Infinity, refetchOnWindowFocus: false, retry: false },
  },
});
