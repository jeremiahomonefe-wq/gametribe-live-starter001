// Phone number rules shared by the join form and the server. Pure, no imports.
// Nigerian mobile numbers are the common case (0803 123 4567, +234 803 123 4567, 2348031234567);
// any other country is accepted in international form (+ and 8 to 15 digits).
export const PHONE_MODES = ['off', 'optional', 'required'];
export const PHONE_HELP = 'Enter a valid mobile number, like 0803 123 4567 or +234 803 123 4567.';

// Returns { ok: true, phone: '+2348031234567' }, { ok: false, empty: true }, or { ok: false, error }.
export function normalizePhone(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { ok: false, empty: true };
  if (!/^\+?[\d\s().-]+$/.test(raw)) return { ok: false, error: PHONE_HELP };
  const digits = raw.replace(/\D/g, '');
  let e164;
  if (raw.startsWith('+')) e164 = `+${digits}`;
  else if (digits.startsWith('00')) e164 = `+${digits.slice(2)}`;
  else if (/^0[789]\d{9}$/.test(digits)) e164 = `+234${digits.slice(1)}`;
  else if (/^234[789]\d{9}$/.test(digits)) e164 = `+${digits}`;
  else if (/^[789]\d{9}$/.test(digits)) e164 = `+234${digits}`; // typed without the leading 0
  else return { ok: false, error: PHONE_HELP };
  if (/^\+2340\d{10}$/.test(e164)) e164 = `+234${e164.slice(5)}`; // "+234 0803..." typed with both
  const valid = e164.startsWith('+234') ? /^\+234[789]\d{9}$/.test(e164) : /^\+[1-9]\d{7,14}$/.test(e164);
  return valid ? { ok: true, phone: e164 } : { ok: false, error: PHONE_HELP };
}
