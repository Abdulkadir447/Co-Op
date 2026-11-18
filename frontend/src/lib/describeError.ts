/**
 * Turning a thrown error into something a shop owner can act on.
 *
 * The modules used to render `e.message` straight into a toast, which put raw
 * API text like "Request failed with status code 500" or a traceback fragment
 * in front of the user. Every message here is one short sentence that names
 * what failed and what to do next; the raw error is logged for us instead.
 *
 * Rules:
 *   * never show a status code, an exception name or a JSON body;
 *   * always say what to do (retry, check the connection, sign in again);
 *   * auth failures get their own sentence, because retrying will not help.
 */
import { ApiError } from '../services/api/client';

export type ErrorAction =
  | 'save'
  | 'delete'
  | 'load'
  | 'update'
  | 'create'
  | 'adjust'
  | 'send';

const VERB: Record<ErrorAction, string> = {
  save: 'save your changes',
  delete: 'delete this',
  load: 'load this page',
  update: 'update this',
  create: 'create this',
  adjust: 'save the stock change',
  send: 'send this',
};

/** A sentence the user can act on. `subject` names the thing, e.g. "customer". */
export function describeError(
  error: unknown,
  action: ErrorAction,
  subject: string,
): string {
  // Keep the real error for the console/devtools; it never reaches the toast.
  if (import.meta.env.DEV) console.error(`[${action}] ${subject}`, error);

  if (error instanceof ApiError && error.isAuthError) {
    return 'Your session has expired. Sign in again, then retry.';
  }

  const status = error instanceof ApiError ? error.status : undefined;
  const verb = VERB[action];

  if (status === 404) return `This ${subject} no longer exists. Refresh the page.`;
  if (status === 409) {
    return `Co-op could not ${verb} because another change landed first. Refresh, then try again.`;
  }
  if (status === 422 || status === 400) {
    return `Co-op could not ${verb}: something in the form is not valid. Check the highlighted fields.`;
  }
  if (status === 429) return 'Too many attempts in a row. Wait a minute, then try again.';
  if (status !== undefined && status >= 500) {
    return `The server had a problem and could not ${verb}. Try again in a moment.`;
  }

  // No status at all is almost always the network: offline, DNS, or a timeout.
  if (error instanceof TypeError || status === undefined) {
    return `Could not reach Co-op to ${verb}. Check your connection and try again.`;
  }

  return `Could not ${verb}. Try again, and tell support if it keeps happening.`;
}
