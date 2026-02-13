import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useApiQuery(key, queryFn, options = {}) {
  return useQuery({ queryKey: Array.isArray(key) ? key : [key], queryFn, ...options });
}

export function useApiMutation(mutationFn, { invalidateKeys = [], onSuccess, ...opts } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (...args) => {
      invalidateKeys.forEach(k => qc.invalidateQueries({ queryKey: Array.isArray(k) ? k : [k] }));
      onSuccess?.(...args);
    },
    ...opts,
  });
}
