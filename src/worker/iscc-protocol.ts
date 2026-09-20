/** Keep record identity attached to every asynchronous Text-Code request and result. */
export interface IsccCommand {
  requestId: number;
  text: string;
}

export type IsccEvent =
  | { requestId: number; code: string }
  | { requestId: number; error: true };
