// --- Type Definitions ---
type FieldType = "string" | "boolean" | "number";

interface SchemaField {
  type: FieldType;
  indexed?: boolean;
}

interface TableSchema {
  fields: Record<string, SchemaField>;
  [key: string]: any; // Allow additional properties
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
// Constraint for the input schema to ensure it has the basic shape.
// T_SpecificSchema itself will be more specific due to 'as const'.
type ValidSchemaInput = {
  project_id: string;
  version: number;
  tables: Record<string, TableSchema>; // This means T_SpecificSchema.tables must be assignable to this
};

export function createSchema<T_SpecificSchema extends ValidSchemaInput>(
  schema: T_SpecificSchema
): T_SpecificSchema {
  // Detailed runtime validation
  if (typeof schema.project_id !== 'string' || schema.project_id.trim() === '') {
    throw new Error('Invalid schema: project_id must be a non-empty string.');
  }
  if (typeof schema.version !== 'number') {
    throw new Error('Invalid schema: version must be a number.');
  }
  if (typeof schema.tables !== 'object' || schema.tables === null || Object.keys(schema.tables).length === 0) {
    throw new Error('Invalid schema: tables must be a non-empty object.');
  }

  for (const tableName in schema.tables) {
    const table = schema.tables[tableName];
    if (typeof table !== 'object' || table === null) {
        throw new Error(`Invalid schema: table '${tableName}' is not an object.`);
    }
    if (typeof table.fields !== 'object' || table.fields === null || Object.keys(table.fields).length === 0) {
      throw new Error(`Invalid schema for table '${tableName}': fields must be a non-empty object.`);
    }
    for (const fieldName in table.fields) {
      const field = table.fields[fieldName];
      if (typeof field !== 'object' || field === null) {
        throw new Error(`Invalid schema for table '${tableName}', field '${fieldName}': is not an object.`);
      }
      const validTypes: FieldType[] = ["string", "boolean", "number"];
      if (typeof field.type !== 'string' || !validTypes.includes(field.type as FieldType)) {
        throw new Error(`Invalid schema for table '${tableName}', field '${fieldName}': type must be one of "string", "boolean", "number".`);
      }
      if (field.indexed !== undefined && typeof field.indexed !== 'boolean') {
         throw new Error(`Invalid schema for table '${tableName}', field '${fieldName}': optional 'indexed' property must be a boolean.`);
      }
    }
  }
  return schema;
}

interface SDKConfig<S extends DBSchema> {
  project_id: string;
  token?: string;
  getToken?: () => Promise<string>;
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
    private table: string,
    private getToken: () => Promise<string>
  ) {}

  private async headers() {
    const token = await this.getToken();
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    };
  }

  private async handleRequest<T>(request: Promise<Response>): Promise<T> {
    try {
      console.log('Making request to:', this.baseUrl);
      console.log('Headers:', await this.headers());
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

  async getAll(query?: { id?: string }): Promise<T[]> {
    const params = query?.id ? `?id=${query.id}` : "";
    const headers = await this.headers();
    console.log(headers);
    return this.handleRequest(
      fetch(`${this.baseUrl}/account/${this.projectId}/db/${this.table}${params}`, {
        headers
      })
    );
  }

  async add(value: Partial<T>): Promise<T> {
    const headers = await this.headers();
    return this.handleRequest(
      fetch(`${this.baseUrl}/account/${this.projectId}/db/${this.table}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ value })
      })
    );
  }

  async update(id: string, value: Partial<T>): Promise<T> {
    const headers = await this.headers();
    return this.handleRequest(
      fetch(`${this.baseUrl}/account/${this.projectId}/db/${this.table}/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ value })
      })
    );
  }

  async replace(id: string, value: Partial<T>): Promise<T> {
    const headers = await this.headers();
    return this.handleRequest(
      fetch(`${this.baseUrl}/account/${this.projectId}/db/${this.table}/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ value })
      })
    );
  }

  async delete(id: string): Promise<T> {
    const token = await this.getToken();
    const headers = {
      Authorization: `Bearer ${token}`
    };
    return this.handleRequest(
      fetch(`${this.baseUrl}/account/${this.projectId}/db/${this.table}/${id}`, {
        method: "DELETE",
        headers
      })
    );
  }

  async get(id: string): Promise<T> {
    const headers = await this.headers();
    return this.handleRequest(
      fetch(`${this.baseUrl}/account/${this.projectId}/db/${this.table}/${id}`, {
        headers
      })
    );
  }
}

// --- Main SDK ---
export class BasicDBSDK<S extends DBSchema> {
  private projectId: string;
  private getToken: () => Promise<string>;
  private baseUrl: string;
  private schema: S;
  private tableNames: (keyof S["tables"] & string)[];

  constructor(config: SDKConfig<S>) {
    this.projectId = config.project_id;
    
    // Handle either static token or token getter function
    if (config.getToken) {
      this.getToken = config.getToken;
    } else if (config.token) {
      this.getToken = async () => config.token!;
    } else {
      throw new Error('Either token or getToken must be provided');
    }
    
    this.baseUrl = config.baseUrl || "https://api.basic.tech";
    this.schema = config.schema;
    this.tableNames = Object.keys(this.schema.tables) as (keyof S["tables"] & string)[];
  }

  from<K extends keyof S["tables"] & string>(
    table: K
  ): TableClient<TableData<S["tables"][K]>> {
    // Validate table name at runtime
    if (!this.tableNames.includes(table)) {
      throw new Error(`Table '${table}' not found in schema. Available tables: ${this.tableNames.join(', ')}`);
    }
    
    // Create a wrapped client that will get a fresh token for each request
    return new TableClient(
      this.baseUrl,
      this.projectId,
      "",  // Empty placeholder, will be replaced in headers() method
      table,
      this.getToken
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
