import { invoke } from '@tauri-apps/api/core';

export interface ProcessIntegrityStatus {
  level: string;
  rid: number;
  isMedium: boolean;
  isAboveMedium: boolean;
  message: string;
}

export async function getProcessIntegrityStatus() {
  return invoke<ProcessIntegrityStatus>('get_process_integrity_status');
}
