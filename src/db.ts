// --- Type Definitions ---
type FieldType = "string" | "boolean" | "number";

interface SchemaField {
  type: FieldType;
  indexed?: boolean;
}

interface TableSchema {
  type: "collection";
  fields: Record<string, SchemaField>;
}

export interface DBSchema {
  project_id: string;
  version: number;
  tables: Record<string, TableSchema>;
}

type FieldTypeToTS<T extends FieldType> =
  T extends "string" ? string :
  T extends "boolean" ? boolean :
  T extends "number" ? number : never;

type TableData<T extends TableSchema> = {
  [K in keyof T["fields"]]: T["fields"][K] extends { type: FieldType } ? FieldTypeToTS<T["fields"][K]["type"]> : never;
};

// --- Schema Helper ---
export function defineSchema<S extends DBSchema>(schema: S): S {
  return schema;
}

interface SDKConfig<S extends DBSchema> {
  project_id: string;
  token: string;
  baseUrl?: string;
  schema: S;
}

// Add custom error class at the top of the file
class DBError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: any,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'DBError';
  }
}

// --- Table Client ---
class TableClient<T> {
  constructor(
    private baseUrl: string,
    private projectId: string,
    private token: string,
    private table: string
  ) {}

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json"
    };
  }

  private async handleRequest<T>(request: Promise<Response>): Promise<T> {
    try {
      console.log('Making request to:', this.baseUrl);
      console.log('Headers:', this.headers());
      console.log('Project ID:', this.projectId);
      console.log('Table:', this.table);
      
      const res = await request;
      
      console.log("Response status:", res.status);
      console.log("Response headers:", res.headers);
      
      // First check if the response is OK
      if (!res.ok) {
        let errorMessage = `Request failed with status ${res.status}`;
        let errorData;
        
        try {
          const json = await res.json();
          errorData = json;
          // Format the error message more clearly
          if (json.error || json.message) {
            const errorDetails = typeof json.error === 'object' ? JSON.stringify(json.error) : json.error;
            const messageDetails = typeof json.message === 'object' ? JSON.stringify(json.message) : json.message;
            errorMessage = `${res.status} ${res.statusText}: ${messageDetails || errorDetails || 'Unknown error'}`;
          }
        } catch (e) {
          console.log("Failed to parse error response:", e);
          // If we can't parse JSON, use the status text
          errorMessage = `${res.status} ${res.statusText}`;
        }

        throw new DBError(
          errorMessage,
          res.status,
          errorData
        );
      }

      // If response is OK, parse and return the data
      const json = await res.json();
      return json.data;
    } catch (error) {
      console.log("Caught error:", error);
      if (error instanceof Error) {
        console.log("Error type:", error.constructor.name);
        console.log("Error stack:", error.stack);
      }
      
      if (error instanceof DBError) {
        throw error;
      }
      
      if (error instanceof TypeError && error.message === 'Network request failed') {
        throw new DBError(
          'Network request failed. Please check your internet connection and try again.',
          undefined,
          undefined,
          error
        );
      }

      throw new DBError(
        `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  async select(query?: { id?: string }): Promise<T[]> {
    const params = query?.id ? `?id=${query.id}` : "";
    console.log(this.headers())
    return this.handleRequest(
      fetch(`${this.baseUrl}/account/${this.projectId}/db/${this.table}${params}`, {
        headers: this.headers()
      })
    );
  }

  async insert(value: T): Promise<T> {
    return this.handleRequest(
      fetch(`${this.baseUrl}/account/${this.projectId}/db/${this.table}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ value })
      })
    );
  }

  async update(id: string, value: Partial<T>): Promise<T> {
    return this.handleRequest(
      fetch(`${this.baseUrl}/account/${this.projectId}/db/${this.table}/${id}`, {
        method: "PATCH",
        headers: this.headers(),
        body: JSON.stringify({ value })
      })
    );
  }

  async upsert(id: string, value: T): Promise<T> {
    return this.handleRequest(
      fetch(`${this.baseUrl}/account/${this.projectId}/db/${this.table}/${id}`, {
        method: "PUT",
        headers: this.headers(),
        body: JSON.stringify({ value })
      })
    );
  }

  async delete(id: string): Promise<T> {
    return this.handleRequest(
      fetch(`${this.baseUrl}/account/${this.projectId}/db/${this.table}/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.token}`
        }
      })
    );
  }

  async get(id: string): Promise<T> {
    return this.handleRequest(
      fetch(`${this.baseUrl}/account/${this.projectId}/db/${this.table}/${id}`, {
        headers: this.headers()
      })
    );
  }
}

// --- Main SDK ---
export class BasicDBSDK<S extends DBSchema> {
  private projectId: string;
  private token: string;
  private baseUrl: string;
  private schema: S;

  constructor(config: SDKConfig<S>) {
    this.projectId = config.project_id;
    this.token = config.token;
    this.baseUrl = config.baseUrl || "https://api.basic.tech";
    this.schema = config.schema;
  }

  from<K extends keyof S["tables"] & string>(
    table: K
  ): TableClient<TableData<S["tables"][K]>> {
    return new TableClient(
      this.baseUrl,
      this.projectId,
      this.token,
      table
    );
  }

  get tables(): {
    [K in keyof S["tables"]]: TableData<S["tables"][K]>;
  } {
    return {} as any;
  }

  fields<K extends keyof S["tables"] & string>(
    table: K
  ): (keyof S["tables"][K]["fields"] & string)[] {
    return Object.keys(this.schema.tables[table].fields) as (keyof S["tables"][K]["fields"] & string)[];
  }
}
