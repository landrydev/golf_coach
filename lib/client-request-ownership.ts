export type ClientRequestOwnershipState = {
  mounted: boolean;
  scope: string | null;
  scopeGeneration: number;
  requestGeneration: number;
};

export type ClientRequestOwner = Readonly<{
  scope: string;
  scopeGeneration: number;
  requestGeneration: number;
}>;

export function createClientRequestOwnershipState(): ClientRequestOwnershipState {
  return {
    mounted: false,
    scope: null,
    scopeGeneration: 0,
    requestGeneration: 0,
  };
}

export function activateClientRequestScope(
  state: ClientRequestOwnershipState,
  scope: string,
): number {
  state.mounted = true;
  state.scope = scope;
  state.scopeGeneration += 1;
  state.requestGeneration += 1;
  return state.scopeGeneration;
}

export function retireClientRequestScope(
  state: ClientRequestOwnershipState,
  scope: string,
  scopeGeneration: number,
): void {
  if (
    state.scope === scope &&
    state.scopeGeneration === scopeGeneration
  ) {
    state.mounted = false;
    state.scope = null;
    state.scopeGeneration += 1;
    state.requestGeneration += 1;
  }
}

export function isClientRequestScopeActive(
  state: ClientRequestOwnershipState,
  scope: string,
  scopeGeneration: number,
): boolean {
  return (
    state.mounted &&
    state.scope === scope &&
    state.scopeGeneration === scopeGeneration
  );
}

export function beginOwnedClientRequest(
  state: ClientRequestOwnershipState,
  scope: string,
): ClientRequestOwner | null {
  if (!state.mounted || state.scope !== scope) return null;
  state.requestGeneration += 1;
  return {
    scope,
    scopeGeneration: state.scopeGeneration,
    requestGeneration: state.requestGeneration,
  };
}

export function ownsClientRequest(
  state: ClientRequestOwnershipState,
  owner: ClientRequestOwner,
): boolean {
  return (
    state.mounted &&
    state.scope === owner.scope &&
    state.scopeGeneration === owner.scopeGeneration &&
    state.requestGeneration === owner.requestGeneration
  );
}
