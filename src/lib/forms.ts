import { UserError } from "@/lib/action-result";
import { z } from "zod";

/** Hulpfuncties om FormData veilig te valideren met zod. */
export const optionalText = z
  .string()
  .trim()
  .max(10_000)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const requiredText = (max = 500) => z.string().trim().min(1, "Verplicht veld").max(max);

export const optionalId = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const optionalDate = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    const d = new Date(`${v}T00:00:00Z`);
    if (isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Ongeldige datum" });
      return z.NEVER;
    }
    return d;
  })
  .nullable()
  .optional();

export const optionalUrl = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.url({ protocol: /^https$/, error: "Gebruik een https-link" }).nullable())
  .nullable()
  .optional();

/** FormData → object; meerdere waarden met dezelfde naam worden een array (bij `multi`). */
export function formToObject(formData: FormData, multi: string[] = []): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    obj[key] = multi.includes(key) ? formData.getAll(key).map(String) : String(formData.get(key) ?? "");
  }
  for (const key of multi) if (!(key in obj)) obj[key] = [];
  return obj;
}

export function parseForm<T extends z.ZodType>(schema: T, formData: FormData, multi: string[] = []): z.infer<T> {
  const result = schema.safeParse(formToObject(formData, multi));
  if (!result.success) {
    // Eigen (Nederlandse) meldingen zonder technische veldnaam; standaardmeldingen mét veldnaam.
    // Eigen Nederlandse meldingen zonder technische veldnaam; Engelstalige zod-standaardmeldingen mét veldnaam.
    const isDefault = (m: string) => /^(Invalid|Too |Expected|Required)/.test(m);
    const msg = [...new Set(result.error.issues.map((i) => (isDefault(i.message) && i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)))].join(
      "; ",
    );
    throw new UserError(`Controleer de invoer — ${msg}`);
  }
  return result.data;
}
