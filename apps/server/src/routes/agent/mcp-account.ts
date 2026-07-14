export interface ManagedResource<T> {
  value: T;
  close: () => Promise<void>;
}

export async function withManagedResource<T, R>(
  open: () => Promise<ManagedResource<T>> | ManagedResource<T>,
  use: (value: T) => Promise<R>,
): Promise<R> {
  const resource = await open();
  try {
    return await use(resource.value);
  } finally {
    await resource.close();
  }
}

export interface OwnedConnection {
  id: string;
  email: string;
}

export interface ActiveAccountDependencies<TConnection extends OwnedConnection, TAgent> {
  findFirstOwnedConnection: (userId: string) => Promise<TConnection | undefined>;
  findOwnedConnectionById: (
    userId: string,
    connectionId: string,
  ) => Promise<TConnection | undefined>;
  findOwnedConnectionByEmail: (userId: string, email: string) => Promise<TConnection | undefined>;
  getAgent: (connectionId: string) => Promise<TAgent>;
}

export class ActiveAccountResolver<TConnection extends OwnedConnection, TAgent> {
  private activeConnectionId: string | undefined;

  constructor(
    private readonly userId: string,
    private readonly dependencies: ActiveAccountDependencies<TConnection, TAgent>,
  ) {}

  async initialize(): Promise<TConnection> {
    const connection = await this.dependencies.findFirstOwnedConnection(this.userId);
    if (!connection) throw new Error('Connection not found');
    this.activeConnectionId = connection.id;
    return connection;
  }

  async setActiveByEmail(email: string): Promise<TConnection> {
    const connection = await this.dependencies.findOwnedConnectionByEmail(this.userId, email);
    if (!connection) throw new Error('Connection not found');
    this.activeConnectionId = connection.id;
    return connection;
  }

  async getActiveConnection(): Promise<TConnection> {
    if (!this.activeConnectionId) throw new Error('No active connection');
    const connection = await this.dependencies.findOwnedConnectionById(
      this.userId,
      this.activeConnectionId,
    );
    if (!connection) throw new Error('Connection not found');
    return connection;
  }

  async getActiveAgent(): Promise<{ connection: TConnection; agent: TAgent }> {
    const connection = await this.getActiveConnection();
    const agent = await this.dependencies.getAgent(connection.id);
    return { connection, agent };
  }
}
