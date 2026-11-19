/** Ids loaded into the engine as a side step (saving a model, reading a model file), whose import
 *  is not news to the user: no import toasts for them. */
export const quietImports = new Set<string>();
