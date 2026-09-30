// The layout records successful product use for the currently signed-in user.
export const USEFUL_ACTION_EVENT = 'attraccess:useful-action';

export function recordUsefulAction() {
  window.dispatchEvent(new Event(USEFUL_ACTION_EVENT));
}
