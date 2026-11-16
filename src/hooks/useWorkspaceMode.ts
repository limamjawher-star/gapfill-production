'use client';

import { useState, useCallback } from 'react';
import { WorkspaceDataMode } from '../types/gapfill';

export function useWorkspaceMode(initialMode: WorkspaceDataMode = 'demo') {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceDataMode>(initialMode);

  const toggleWorkspaceMode = useCallback(() => {
    setWorkspaceMode((prev) => (prev === 'demo' ? 'live_supabase' : 'demo'));
  }, []);

  return {
    workspaceMode,
    setWorkspaceMode,
    toggleWorkspaceMode,
    isDemo: workspaceMode === 'demo',
  };
}
