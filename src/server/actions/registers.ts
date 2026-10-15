"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { RegisterField } from "@/lib/db/schema";
import {
  AppError,
  forbidden,
  getRegisterAccess,
  requireCapability,
  requireSessionOrThrow,
} from "@/lib/auth/guard";
import { canAssignRole } from "@/lib/auth/rbac";
import {
  addField,
  createRegister,
  deleteField,
  deleteRegister,
  duplicateRegister,
  fieldInputSchema,
  getFields,
  getRegisterOrThrow,
  registerInputSchema,
  reorderFields,
  setRegisterArchived,
  setRegisterGrant,
  updateField,
  updateRegister,
  type FieldInput,
} from "@/server/registers";
import { toActionState, type ActionState } from "@/server/actions/shared";

/* --------------------------------- helpers -------------------------------- */

async function loadRegisterSession(registerId: string) {
  const session = await requireSessionOrThrow();
  const access = await getRegisterAccess(registerId, session);
  if (!access) throw new AppError("Register not found.", 404, "not_found");
  return { session, access };
}

function revalidateRegister(registerId: string) {
  revalidatePath(`/registers/${registerId}`);
  revalidatePath("/registers");
  revalidatePath("/dashboard");
}

/* -------------------------------- registers ------------------------------- */

const createSchema = registerInputSchema.extend({
  fieldsJson: z.string().max(400_000).optional(),
});

export async function createRegisterAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireCapability("registers:create");

    const rawFields = formData.get("fieldsJson");
    let fields: FieldInput[] = [];
    if (typeof rawFields === "string" && rawFields.trim()) {
      const parsedFields = z.array(fieldPayloadSchema).max(120).safeParse(JSON.parse(rawFields));
      if (!parsedFields.success) {
        return {
          ok: false,
          message: "One of the field definitions is invalid.",
          errors: Object.fromEntries(
            parsedFields.error.issues.map((issue) => [
              `fields.${issue.path[0] ?? 0}`,
              issue.message,
            ]),
          ),
        };
      }
      fields = parsedFields.data;
    }

    const parsed = createSchema.safeParse({
      name: formData.get("name"),
      description: formData.get("description") || null,
      category: formData.get("category") || null,
      fields,
    });
    if (!parsed.success) {
      return {
        ok: false,
        errors: Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path[0] ?? "form"), issue.message]),
        ),
      };
    }

    const register = await createRegister(parsed.data, session);
    revalidatePath("/registers");
    redirect(`/registers/${register.id}`);
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    return toActionState(error);
  }
}

const fieldPayloadSchema = fieldInputSchema;

export async function updateRegisterSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const registerId = String(formData.get("registerId") ?? "");
    const { session, access } = await loadRegisterSession(registerId);
    if (!access.permissions.edit && session.user.role !== "super_admin") {
      throw forbidden("You cannot change this register's settings.");
    }

    const parsed = z
      .object({
        name: z.string().trim().min(2).max(160),
        description: z.string().trim().max(2000).nullable().or(z.literal("")).transform((v) => v || null),
        category: z.string().trim().max(120).nullable().or(z.literal("")).transform((v) => v || null),
      })
      .safeParse({
        name: formData.get("name"),
        description: formData.get("description"),
        category: formData.get("category"),
      });
    if (!parsed.success) {
      return {
        ok: false,
        errors: Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path[0] ?? "form"), issue.message]),
        ),
      };
    }

    await updateRegister(registerId, parsed.data, session);
    revalidateRegister(registerId);
    return { ok: true, message: "Register settings saved." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function setRegisterArchivedAction(
  registerId: string,
  archived: boolean,
): Promise<ActionState> {
  try {
    const session = await requireCapability(archived ? "registers:archive" : "registers:update");
    await setRegisterArchived(registerId, archived, session);
    revalidateRegister(registerId);
    return {
      ok: true,
      message: archived ? "Register archived." : "Register restored.",
    };
  } catch (error) {
    return toActionState(error);
  }
}

export async function deleteRegisterAction(registerId: string): Promise<ActionState> {
  try {
    const session = await requireCapability("registers:delete");
    await deleteRegister(registerId, session, { force: false });
    revalidatePath("/registers");
    revalidatePath("/dashboard");
    return { ok: true, redirectTo: "/registers" };
  } catch (error) {
    return toActionState(error);
  }
}

export async function duplicateRegisterAction(registerId: string): Promise<ActionState> {
  try {
    const session = await requireCapability("registers:create");
    const copy = await duplicateRegister(registerId, session);
    revalidatePath("/registers");
    return { ok: true, message: `Copied to "${copy.name}".`, redirectTo: `/registers/${copy.id}` };
  } catch (error) {
    return toActionState(error);
  }
}

/* ---------------------------------- fields -------------------------------- */

export async function addFieldAction(input: {
  registerId: string;
  field: FieldInput;
}): Promise<ActionState> {
  try {
    const { session, access } = await loadRegisterSession(input.registerId);
    if (!access.permissions.edit && session.user.role !== "super_admin") {
      throw forbidden("You cannot change this register's fields.");
    }
    await addField(input.registerId, input.field, session);
    revalidateRegister(input.registerId);
    return { ok: true, message: `Field "${input.field.name}" added.` };
  } catch (error) {
    return toActionState(error);
  }
}

export async function updateFieldAction(input: {
  registerId: string;
  fieldId: string;
  field: FieldInput;
  allowTypeChange?: boolean;
}): Promise<ActionState> {
  try {
    const { session, access } = await loadRegisterSession(input.registerId);
    if (!access.permissions.edit && session.user.role !== "super_admin") {
      throw forbidden("You cannot change this register's fields.");
    }
    const result = await updateField(input.registerId, input.fieldId, input.field, session, {
      allowTypeChange: input.allowTypeChange,
    });
    revalidateRegister(input.registerId);
    return result.dataLossRisk
      ? { ok: true, message: "Field updated. Existing values were converted to the new type." }
      : { ok: true, message: "Field updated." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function deleteFieldAction(
  registerId: string,
  fieldId: string,
): Promise<ActionState> {
  try {
    const { session, access } = await loadRegisterSession(registerId);
    if (!access.permissions.edit && session.user.role !== "super_admin") {
      throw forbidden("You cannot change this register's fields.");
    }
    await deleteField(registerId, fieldId, session);
    revalidateRegister(registerId);
    return { ok: true, message: "Field removed." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function reorderFieldsAction(
  registerId: string,
  orderedFieldIds: string[],
): Promise<ActionState> {
  try {
    const { session, access } = await loadRegisterSession(registerId);
    if (!access.permissions.edit && session.user.role !== "super_admin") {
      throw forbidden("You cannot change this register's fields.");
    }
    await reorderFields(registerId, orderedFieldIds, session);
    revalidateRegister(registerId);
    return { ok: true };
  } catch (error) {
    return toActionState(error);
  }
}

/* ---------------------------------- grants -------------------------------- */

const grantSchema = z.object({
  registerId: z.string().min(1),
  targetType: z.enum(["role", "user"]),
  targetId: z.string().min(1),
  canView: z.boolean(),
  canCreate: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  canImport: z.boolean(),
  canExport: z.boolean(),
});

export async function setRegisterGrantAction(input: {
  registerId: string;
  grant: Omit<z.infer<typeof grantSchema>, "registerId">;
}): Promise<ActionState> {
  try {
    const session = await requireSessionOrThrow();
    if (session.user.role !== "super_admin" && session.user.role !== "admin") {
      throw forbidden("Only administrators manage register access.");
    }
    if (
      input.grant.targetType === "role" &&
      !canAssignRole(session.user.role, input.grant.targetId as never)
    ) {
      throw forbidden("You cannot grant access for that role.");
    }

    const parsed = grantSchema.safeParse({ registerId: input.registerId, ...input.grant });
    if (!parsed.success) return { ok: false, message: "The access grant is invalid." };

    await setRegisterGrant(
      parsed.data.registerId,
      {
        targetType: parsed.data.targetType,
        targetId: parsed.data.targetId,
        permissions: {
          view: parsed.data.canView,
          create: parsed.data.canCreate,
          edit: parsed.data.canEdit,
          delete: parsed.data.canDelete,
          import: parsed.data.canImport,
          export: parsed.data.canExport,
        },
      },
      session,
    );
    revalidateRegister(parsed.data.registerId);
    return { ok: true, message: "Access updated." };
  } catch (error) {
    return toActionState(error);
  }
}

/* --------------------------------- loading -------------------------------- */

export async function loadRegisterForEdit(registerId: string) {
  const { access } = await loadRegisterSession(registerId);
  const fields = await getFields(registerId);
  return { register: access.register, fields: fields as RegisterField[], permissions: access.permissions };
}

export { getRegisterOrThrow };
