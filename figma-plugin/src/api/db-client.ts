import type { uDOMSnapshot } from '../types/udom';

interface QueryFilters {
  artifact_id?: string;
  artifact_type?: string;
  timestamp_from?: number;
  timestamp_to?: number;
}

export class DBClient {
  private readonly apiUrl: string;

  constructor(apiUrl: string = 'http://localhost:3000') {
    this.apiUrl = apiUrl;
  }

  async storeSnapshot(snapshot: uDOMSnapshot): Promise<void> {
    try {
      const response = await this.post('/snapshots', snapshot);

      if (!response.ok) {
        throw new Error(`Failed to store snapshot: ${response.statusText}`);
      }

      const result = await response.json();
    } catch (error) {
      throw error;
    }
  }

  async querySnapshots(filters: QueryFilters): Promise<uDOMSnapshot[]> {
    const queryString = this.buildQueryString(filters);
    const endpoint = `/snapshots${queryString}`;

    try {
      const response = await this.get(endpoint);

      if (!response.ok) {
        throw new Error(`Failed to query snapshots: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  }

  private get(endpoint: string) {
    return fetch(`${this.apiUrl}${endpoint}`, {
      method: 'GET',
    });
  }

  private post(endpoint: string, data: any) {
    return fetch(`${this.apiUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
  }

  private buildQueryString(filters: QueryFilters): string {
    const params: string[] = [];

    if (filters.artifact_id) {
      params.push(`artifact_id=${encodeURIComponent(filters.artifact_id)}`);
    }
    if (filters.artifact_type) {
      params.push(`artifact_type=${encodeURIComponent(filters.artifact_type)}`);
    }
    if (filters.timestamp_from) {
      params.push(`timestamp_from=${filters.timestamp_from}`);
    }
    if (filters.timestamp_to) {
      params.push(`timestamp_to=${filters.timestamp_to}`);
    }

    return params.length > 0 ? `?${params.join('&')}` : '';
  }
}

export const dbClient = new DBClient();

