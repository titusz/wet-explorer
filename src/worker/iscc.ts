/** Initialize the bundled ISCC implementation and apply the plan's text input contract. */
import init, { gen_text_code_v0, type InitInput, text_clean } from "@iscc/wasm";

let initialization: Promise<unknown> | undefined;

/** Generate the planned 256-bit Text-Code from the full decoded record payload. */
function encodeText(text: string): string {
  return gen_text_code_v0(text_clean(text), 256);
}

/** Share initialization and permit an explicit retry after a failed asset load. */
export async function loadTextCoder(
  input: InitInput,
): Promise<(text: string) => string> {
  initialization ??= init({ module_or_path: input }).catch((error) => {
    initialization = undefined;
    throw error;
  });
  await initialization;
  return encodeText;
}
