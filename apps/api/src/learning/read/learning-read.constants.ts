export const LEARNING_READ_MODEL_V2 = 'LEARNING_READ_MODEL_V2';

export const LEARNING_READ_MAX_UNITS = 500;
export const LEARNING_READ_MAX_ITEMS_PER_UNIT = 500;

export const LEARNING_READ_CLOCK = Symbol('LEARNING_READ_CLOCK');

export interface LearningReadClock {
  now(): Date;
}

export const systemLearningReadClock: LearningReadClock = Object.freeze({
  now: () => new Date(),
});
