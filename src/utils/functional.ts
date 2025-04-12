/* eslint-disable eqeqeq */
/**
 * Creates a new object with updated properties
 * @param obj - The original object
 * @param updates - The properties to update
 * @returns A new object with updated properties
 */
export const updateObject = <T extends object>(obj: T, updates: Partial<T>): T => ({
  ...obj,
  ...updates,
});

/**
 * Creates a new array with an item appended
 * @param arr - The original array
 * @param item - The item to append
 * @returns A new array with the item appended
 */
export const appendToArray = <T>(arr: ReadonlyArray<T>, item: T): ReadonlyArray<T> => [...arr, item];

/**
 * Creates a new array with items filtered
 * @param arr - The original array
 * @param predicate - The filter function
 * @returns A new filtered array
 */
export const filterArray = <T>(arr: ReadonlyArray<T>, predicate: (item: T) => boolean): ReadonlyArray<T> => 
  arr.filter(predicate);

/**
 * Applies a series of functions to an initial value
 * @param initial - The initial value
 * @param fns - The functions to apply
 * @returns The result after applying all functions
 */
export const pipe = <T>(initial: T, ...fns: Array<(arg: T) => T>): T => 
  fns.reduce((result, fn) => fn(result), initial);

/**
 * Creates a function that only executes if a condition is met
 * @param condition - The condition function
 * @param fn - The function to execute
 * @returns A function that conditionally executes
 */
export const when = <T>(
  condition: (value: T) => boolean,
  fn: (value: T) => T,
): ((value: T) => T) => 
  (value: T) => condition(value) ? fn(value) : value;

/**
 * Creates a function that executes only if the value is defined
 * @param fn - The function to execute
 * @returns A function that conditionally executes
 */
export const ifDefined = <T, R>(
  fn: (value: T) => R,
): ((value: T | undefined | null) => R | undefined) => 
  (value: T | undefined | null) => value != null ? fn(value) : undefined;

/**
 * Creates a function that returns a default value if the result is undefined
 * @param defaultValue - The default value
 * @returns A function that provides a default value
 */
export const withDefault = <T>(defaultValue: T) => 
  (value: T | undefined | null): T => value != null ? value : defaultValue;
