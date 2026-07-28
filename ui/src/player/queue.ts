import type { Track } from "../types";

/** The time at which Previous restarts the current track instead of moving back. */
export const PREVIOUS_RESTART_THRESHOLD_SECONDS = 3;

/**
 * The canonical queue is never shuffled in place.  Shuffle bookkeeping is
 * stored as canonical indexes, which makes turning shuffle off deterministic.
 */
export interface QueueNavigationState {
  queue: Track[];
  currentIndex: number;
  shuffleEnabled: boolean;
  /** Every track visited in shuffle mode, in visit order. */
  shuffleHistory: number[];
  /** Position in shuffleHistory for Previous/Next history navigation. */
  shuffleHistoryIndex: number;
  /** A randomized list of tracks that have not yet been visited this cycle. */
  shuffleRemaining: number[];
}

export type RandomSource = () => number;

export const EMPTY_QUEUE_STATE: QueueNavigationState = Object.freeze({
  queue: [],
  currentIndex: -1,
  shuffleEnabled: false,
  shuffleHistory: [],
  shuffleHistoryIndex: -1,
  shuffleRemaining: [],
});

function isValidIndex(index: number, queue: readonly Track[]): boolean {
  return Number.isInteger(index) && index >= 0 && index < queue.length;
}

export function randomizeIndexes(
  indexes: readonly number[],
  random: RandomSource = Math.random,
): number[] {
  const shuffled = [...indexes];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

function remainingIndexes(queue: readonly Track[], currentIndex: number): number[] {
  return queue.flatMap((_, index) => (index === currentIndex ? [] : [index]));
}

export function createQueueState(
  queue: Track[],
  selectedIndex: number,
  shuffleEnabled: boolean,
  random: RandomSource = Math.random,
): QueueNavigationState {
  const currentIndex = isValidIndex(selectedIndex, queue) ? selectedIndex : -1;

  if (!shuffleEnabled || currentIndex === -1) {
    return {
      queue,
      currentIndex,
      shuffleEnabled,
      shuffleHistory: currentIndex === -1 ? [] : [currentIndex],
      shuffleHistoryIndex: currentIndex === -1 ? -1 : 0,
      shuffleRemaining: [],
    };
  }

  return {
    queue,
    currentIndex,
    shuffleEnabled: true,
    shuffleHistory: [currentIndex],
    shuffleHistoryIndex: 0,
    shuffleRemaining: randomizeIndexes(remainingIndexes(queue, currentIndex), random),
  };
}

export function getCurrentTrack(
  state: Pick<QueueNavigationState, "queue" | "currentIndex">,
): Track | null {
  return isValidIndex(state.currentIndex, state.queue)
    ? state.queue[state.currentIndex]
    : null;
}

/** Move forward in catalog order, or return null at the end. */
export function getNextQueueState(
  state: QueueNavigationState,
): QueueNavigationState | null {
  if (!getCurrentTrack(state)) {
    return null;
  }

  if (!state.shuffleEnabled) {
    const nextIndex = state.currentIndex + 1;
    if (!isValidIndex(nextIndex, state.queue)) {
      return null;
    }

    return {
      ...state,
      currentIndex: nextIndex,
      shuffleHistory: [nextIndex],
      shuffleHistoryIndex: 0,
      shuffleRemaining: [],
    };
  }

  // If Previous was used, replay the known forward history before consuming a
  // new random track. It keeps both directions meaningful and repeat-free.
  if (state.shuffleHistoryIndex < state.shuffleHistory.length - 1) {
    const nextHistoryIndex = state.shuffleHistoryIndex + 1;
    return {
      ...state,
      currentIndex: state.shuffleHistory[nextHistoryIndex],
      shuffleHistoryIndex: nextHistoryIndex,
    };
  }

  const [nextIndex, ...shuffleRemaining] = state.shuffleRemaining;
  if (!isValidIndex(nextIndex, state.queue)) {
    return null;
  }

  return {
    ...state,
    currentIndex: nextIndex,
    shuffleHistory: [...state.shuffleHistory, nextIndex],
    shuffleHistoryIndex: state.shuffleHistory.length,
    shuffleRemaining,
  };
}

/** Move backward in catalog order or shuffle history, or return null at the start. */
export function getPreviousQueueState(
  state: QueueNavigationState,
): QueueNavigationState | null {
  if (!getCurrentTrack(state)) {
    return null;
  }

  if (!state.shuffleEnabled) {
    const previousIndex = state.currentIndex - 1;
    if (!isValidIndex(previousIndex, state.queue)) {
      return null;
    }

    return {
      ...state,
      currentIndex: previousIndex,
      shuffleHistory: [previousIndex],
      shuffleHistoryIndex: 0,
      shuffleRemaining: [],
    };
  }

  if (state.shuffleHistoryIndex <= 0) {
    return null;
  }

  const previousHistoryIndex = state.shuffleHistoryIndex - 1;
  return {
    ...state,
    currentIndex: state.shuffleHistory[previousHistoryIndex],
    shuffleHistoryIndex: previousHistoryIndex,
  };
}

/**
 * Enable/disable shuffle without changing the selected track. Disabling it
 * simply exposes the preserved canonical queue around that track.
 */
export function withShuffleEnabled(
  state: QueueNavigationState,
  shuffleEnabled: boolean,
  random: RandomSource = Math.random,
): QueueNavigationState {
  if (state.shuffleEnabled === shuffleEnabled) {
    return state;
  }

  const currentIndex = isValidIndex(state.currentIndex, state.queue)
    ? state.currentIndex
    : -1;

  if (!shuffleEnabled || currentIndex === -1) {
    return {
      ...state,
      currentIndex,
      shuffleEnabled: false,
      shuffleHistory: currentIndex === -1 ? [] : [currentIndex],
      shuffleHistoryIndex: currentIndex === -1 ? -1 : 0,
      shuffleRemaining: [],
    };
  }

  return {
    ...state,
    currentIndex,
    shuffleEnabled: true,
    shuffleHistory: [currentIndex],
    shuffleHistoryIndex: 0,
    shuffleRemaining: randomizeIndexes(remainingIndexes(state.queue, currentIndex), random),
  };
}

