/**
 * Client GraphQL Linear MINIMAL (P18) — borné aux besoins email-first :
 * création d'issue, résolution d'identifiant pour l'Accept d'une suggestion,
 * listes de configuration (équipes/états/utilisateurs) pour les mappings
 * owner. `fetchImpl` injecté — les tests utilisent un fake, JAMAIS le réseau.
 */

export const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

/**
 * Erreur typée par CERTITUDE d'effet (adversarial-11) :
 * - 'proven_failed' : la réponse prouve EXPLICITEMENT qu'aucune issue n'a été
 *   créée (payload bien formé avec success:false, ou 4xx = requête refusée
 *   avant exécution) — un retry est sûr ;
 * - 'unauthorized' : 401 — le token a expiré/été révoqué, un refresh unique
 *   peut être tenté par l'appelant ;
 * - 'unknown' : réseau/5xx, mais AUSSI un 2xx avec `errors` GraphQL ou un
 *   JSON ambigu — une mutation GraphQL peut avoir un effet partiel malgré des
 *   erreurs : jamais de retry automatique (réconciliation manuelle).
 */
export class LinearApiError extends Error {
  constructor(
    message: string,
    public readonly kind: 'proven_failed' | 'unauthorized' | 'unknown',
  ) {
    super(message);
    this.name = 'LinearApiError';
  }
}

export type LinearIssueRef = { id: string; identifier: string; url: string };

export type LinearIssueClient = {
  issueCreate(input: {
    teamId: string;
    title: string;
    description?: string;
    stateId?: string;
    assigneeId?: string;
  }): Promise<LinearIssueRef>;
  findIssueByIdentifier(identifier: string): Promise<LinearIssueRef | null>;
  listTeams(): Promise<Array<{ id: string; name: string }>>;
  listWorkflowStates(teamId: string): Promise<Array<{ id: string; name: string; type: string }>>;
  listUsers(): Promise<Array<{ id: string; name: string; email: string }>>;
  organization(): Promise<{ id: string; name: string }>;
};

type GqlResponse<T> = { data?: T; errors?: Array<{ message?: string }> };

export function createLinearClient(deps: {
  fetchImpl: typeof fetch;
  accessToken: string;
}): LinearIssueClient {
  const gql = async <T>(query: string, variables: Record<string, unknown> = {}): Promise<T> => {
    let response: Response;
    try {
      response = await deps.fetchImpl(LINEAR_GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deps.accessToken}`,
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch {
      // Issue réseau : la requête a PU atteindre Linear — issue inconnue.
      throw new LinearApiError('linear_api_failed:network', 'unknown');
    }
    if (response.status === 401) throw new LinearApiError('linear_api_failed:401', 'unauthorized');
    if (!response.ok) {
      // 4xx = refus prouvé côté Linear ; 5xx = état inconnu.
      throw new LinearApiError(
        `linear_api_failed:${response.status}`,
        response.status < 500 ? 'proven_failed' : 'unknown',
      );
    }
    let json: GqlResponse<T>;
    try {
      json = (await response.json()) as GqlResponse<T>;
    } catch {
      throw new LinearApiError('linear_api_failed:body', 'unknown');
    }
    if (json.errors?.length || !json.data) {
      // 2xx avec erreurs GraphQL : l'exécution a PU avoir un effet partiel —
      // AMBIGU, jamais « prouvé sans création ».
      throw new LinearApiError('linear_api_failed:graphql', 'unknown');
    }
    return json.data;
  };

  return {
    async issueCreate(input) {
      const data = await gql<{
        issueCreate: { success: boolean; issue: LinearIssueRef | null };
      }>(
        `mutation IssueCreate($input: IssueCreateInput!) {
          issueCreate(input: $input) { success issue { id identifier url } }
        }`,
        {
          input: {
            teamId: input.teamId,
            title: input.title,
            ...(input.description ? { description: input.description } : {}),
            ...(input.stateId ? { stateId: input.stateId } : {}),
            ...(input.assigneeId ? { assigneeId: input.assigneeId } : {}),
          },
        },
      );
      if (!data.issueCreate.success || !data.issueCreate.issue) {
        // success:false explicite = refus prouvé.
        throw new LinearApiError('linear_api_failed:issue_create', 'proven_failed');
      }
      return data.issueCreate.issue;
    },

    async findIssueByIdentifier(identifier) {
      const data = await gql<{
        issueSearch: { nodes: Array<LinearIssueRef> };
      }>(
        `query IssueSearch($term: String!) {
          issueSearch(query: $term, first: 5) { nodes { id identifier url } }
        }`,
        { term: identifier },
      );
      const exact = data.issueSearch.nodes.find(
        (node) => node.identifier.toUpperCase() === identifier.toUpperCase(),
      );
      return exact ?? null;
    },

    async listTeams() {
      const data = await gql<{ teams: { nodes: Array<{ id: string; name: string }> } }>(
        `query { teams(first: 50) { nodes { id name } } }`,
      );
      return data.teams.nodes;
    },

    async listWorkflowStates(teamId) {
      const data = await gql<{
        team: { states: { nodes: Array<{ id: string; name: string; type: string }> } };
      }>(
        `query States($teamId: String!) {
          team(id: $teamId) { states(first: 50) { nodes { id name type } } }
        }`,
        { teamId },
      );
      return data.team.states.nodes;
    },

    async listUsers() {
      const data = await gql<{
        users: { nodes: Array<{ id: string; name: string; email: string }> };
      }>(`query { users(first: 100) { nodes { id name email } } }`);
      return data.users.nodes;
    },

    async organization() {
      const data = await gql<{ organization: { id: string; name: string } }>(
        `query { organization { id name } }`,
      );
      return data.organization;
    },
  };
}
