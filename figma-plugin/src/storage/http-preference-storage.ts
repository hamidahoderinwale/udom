/**
 * HTTP-based preference storage
 */

import type { PreferenceEvent } from '../types/preference-types';
import type { PreferenceStorage } from '../trackers/preference-tracker';

export class HttpPreferenceStorage implements PreferenceStorage {
  constructor(private apiUrl: string = 'http://localhost:3000') {}

  async save(event: PreferenceEvent): Promise<void> {
    const response = await fetch(`${this.apiUrl}/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      throw new Error(`Failed to save preference: ${response.statusText}`);
    }
  }
}



