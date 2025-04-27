/**
 * Updates an object with new properties
 * @param obj - The original object
 * @param updates - The updates to apply
 * @returns A new object with the updates applied
 */
export const updateObject = <T extends object>(obj: T, updates: Partial<T>): T => {
  return { ...obj, ...updates }
}

/**
 * Appends an item to an array
 * @param arr - The original array
 * @param item - The item to append
 * @returns A new array with the item appended
 */
export const appendToArray = <T>(arr: ReadonlyArray<T>, item: T): ReadonlyArray<T> => {
  return [...arr, item];
}

/**
 * Pipes a value through a series of functions
 * @param value - The initial value
 * @param fns - The functions to pipe through
 * @returns The final value
 */
export const pipe = <T>(value: T, ...fns: Array<(value: T) => T>): T => {
  return fns.reduce((acc, fn) => fn(acc), value)
}

/**
 * Conditionally applies a function
 * @param condition - The condition to check
 * @param fn - The function to apply if the condition is true
 * @returns A function that applies fn if condition is true, otherwise returns the value unchanged
 */
export const when = <T>(condition: (value: T) => boolean, fn: (value: T) => T) => (value: T): T => {
  return condition(value) ? fn(value) : value
}
