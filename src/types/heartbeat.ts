import * as vscode from 'vscode';

export type ActivityCategory = 
  | 'coding' 
  | 'debugging' 
  | 'building' 
  | 'designing'
  | 'writing tests'
  | 'writing docs'
  | 'code reviewing'
  | 'browsing';

export interface Heartbeat {
  entity: string;
  type: 'file' | 'app' | 'domain';
  category: ActivityCategory;
  time: number;
  project?: string;
  project_root_count: number;
  branch?: string;
  language?: string;
  dependencies?: string;
  machine_name_id: string;
  line_additions?: number;
  line_deletions?: number;
  lines: number;
  lineno?: number;
  cursorpos?: number;
  is_write: boolean;
}

export interface HeartbeatSummary {
  data: Heartbeat[];
  start: string;
  end: string;
  timezone: string;
}

export interface HeartbeatStore {
  heartbeats: Heartbeat[];
  lastHeartbeat?: Heartbeat;
  todayTotal: number;
  lastFileContent: string;
}

export interface SystemInfo {
  machineId: string;
  timezone: string;
}

export type StatusBarItem = vscode.StatusBarItem;
