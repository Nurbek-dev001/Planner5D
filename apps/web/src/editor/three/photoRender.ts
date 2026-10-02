import { create } from 'zustand';

export type PhotoQuality = 'draft' | 'good' | 'best';

export const PHOTO_SAMPLES: Record<PhotoQuality, number> = { draft: 64, good: 256, best: 1024 };

interface PhotoRenderState {
  /** Path tracing is running or its result is shown */
  active: boolean;
  quality: PhotoQuality;
  samples: number;
  /** Bumps to restart accumulation (quality change, "render again") */
  run: number;
  error: string | null;
  start: (quality?: PhotoQuality) => void;
  stop: () => void;
  setSamples: (n: number) => void;
  fail: (message: string) => void;
}

/** State of the in-browser photoreal render, shared by the 3D canvas and its overlay UI */
export const usePhotoRender = create<PhotoRenderState>((set, get) => ({
  active: false,
  quality: 'good',
  samples: 0,
  run: 0,
  error: null,
  start: (quality) => set({ active: true, quality: quality ?? get().quality, samples: 0, run: get().run + 1, error: null }),
  stop: () => set({ active: false, samples: 0 }),
  setSamples: (samples) => set({ samples }),
  fail: (error) => set({ active: false, error }),
}));
