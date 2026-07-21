const DETAIL_QUERY_BUDGET_BYTES = 8 * 1024 * 1024;
const SINGLE_DETAIL_QUERY_LIMIT_BYTES = 3 * 1024 * 1024;

export type PersistableQuery = {
  queryKey: readonly unknown[];
  state: {
    data: unknown;
    dataUpdatedAt?: number;
    status: string;
  };
};

function getTRPCProcedurePath(queryKey: readonly unknown[]) {
  const path = queryKey[0];
  return Array.isArray(path) ? path.join('.') : '';
}

function getSerializedSize(value: unknown) {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? 0 : new Blob([serialized]).size;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function isDetailQuery(query: PersistableQuery) {
  return (
    query.queryKey[0] === 'email-content' || getTRPCProcedurePath(query.queryKey) === 'mail.get'
  );
}

export function shouldPersistQuery(query: PersistableQuery) {
  if (query.state.status !== 'success' || query.state.data == null) return false;

  if (getTRPCProcedurePath(query.queryKey) === 'mail.getMessageAttachments') return false;

  return (
    !isDetailQuery(query) || getSerializedSize(query.state.data) <= SINGLE_DETAIL_QUERY_LIMIT_BYTES
  );
}

export function selectQueriesForPersistence<T extends PersistableQuery>(queries: T[]) {
  let detailBytes = 0;

  return [...queries]
    .sort((left, right) => (right.state.dataUpdatedAt ?? 0) - (left.state.dataUpdatedAt ?? 0))
    .filter((query) => {
      if (!shouldPersistQuery(query)) return false;
      if (!isDetailQuery(query)) return true;

      const queryBytes = getSerializedSize(query.state.data);
      if (detailBytes + queryBytes > DETAIL_QUERY_BUDGET_BYTES) return false;

      detailBytes += queryBytes;
      return true;
    });
}
