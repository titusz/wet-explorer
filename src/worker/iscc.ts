/** Initialize ISCC and let its generator normalize the original decoded payload. */
import init, { gen_text_code_v0, type InitInput } from "@iscc/wasm";

let initialization: Promise<unknown> | undefined;

/** Generate a 256-bit Text-Code directly from the full decoded record payload. */
function encodeText(text: string): string {
  return gen_text_code_v0(text, 256);
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
