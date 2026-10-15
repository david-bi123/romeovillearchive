import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  ROLE_CAPABILITIES,
  ROLE_LABELS,
  canAssignRole,
  canManageUser,
  isProtectedSuperAdmin,
  isRole,
  roleCapabilities,
  roleHasCapability,
} from "@/lib/auth/rbac";
import { ROLES } from "@/lib/db/schema";

describe("capability matrix", () => {
  it("grants super_admin every capability", () => {
    expect(ROLE_CAPABILITIES.super_admin).toEqual([...CAPABILITIES]);
    for (const capability of CAPABILITIES) {
      expect(roleHasCapability("super_admin", capability)).toBe(true);
    }
  });

  it("withholds system-level powers from admin", () => {
    expect(roleHasCapability("admin", "settings:manage")).toBe(false);
    expect(roleHasCapability("admin", "registers:delete")).toBe(false);
    expect(roleHasCapability("admin", "users:manage")).toBe(true);
    expect(roleHasCapability("admin", "registers:create")).toBe(true);
    expect(roleHasCapability("admin", "records:import")).toBe(true);
  });

  it("limits editors to activity plus record create/edit/view", () => {
    expect(ROLE_CAPABILITIES.editor).toEqual([
      "activity:read",
      "records:view",
      "records:create",
      "records:edit",
    ]);
    expect(roleHasCapability("editor", "records:delete")).toBe(false);
    expect(roleHasCapability("editor", "records:export")).toBe(false);
    expect(roleHasCapability("editor", "registers:create")).toBe(false);
    expect(roleHasCapability("editor", "users:read")).toBe(false);
  });

  it("limits viewers to read-only record access", () => {
    expect(ROLE_CAPABILITIES.viewer).toEqual(["records:view"]);
    expect(roleHasCapability("viewer", "records:view")).toBe(true);
    expect(roleHasCapability("viewer", "records:create")).toBe(false);
    expect(roleHasCapability("viewer", "activity:read")).toBe(false);
    expect(roleHasCapability("viewer", "records:export")).toBe(false);
  });

  it("returns a defensive copy of the capability list", () => {
    const list = roleCapabilities("editor");
    list.push("settings:manage");
    expect(roleCapabilities("editor")).not.toContain("settings:manage");
  });

  it("labels every role", () => {
    for (const role of ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
  });
});

describe("canAssignRole", () => {
  it("lets super_admin assign anything", () => {
    for (const role of ROLES) {
      expect(canAssignRole("super_admin", role)).toBe(true);
    }
  });

  it("lets admins assign admin/editor/viewer but never super_admin", () => {
    expect(canAssignRole("admin", "admin")).toBe(true);
    expect(canAssignRole("admin", "editor")).toBe(true);
    expect(canAssignRole("admin", "viewer")).toBe(true);
    expect(canAssignRole("admin", "super_admin")).toBe(false);
  });

  it("never lets non-privileged roles assign", () => {
    expect(canAssignRole("editor", "viewer")).toBe(false);
    expect(canAssignRole("viewer", "editor")).toBe(false);
    expect(canAssignRole("editor", "editor")).toBe(false);
  });
});

describe("canManageUser", () => {
  it("never allows managing yourself", () => {
    expect(canManageUser("super_admin", "super_admin", true)).toBe(false);
    expect(canManageUser("admin", "viewer", true)).toBe(false);
    expect(canManageUser("viewer", "viewer", true)).toBe(false);
  });

  it("lets super_admin manage anyone else", () => {
    expect(canManageUser("super_admin", "admin", false)).toBe(true);
    expect(canManageUser("super_admin", "super_admin", false)).toBe(true);
    expect(canManageUser("super_admin", "viewer", false)).toBe(true);
  });

  it("stops admins from managing super_admins", () => {
    expect(canManageUser("admin", "super_admin", false)).toBe(false);
    expect(canManageUser("admin", "editor", false)).toBe(true);
    expect(canManageUser("admin", "viewer", false)).toBe(true);
  });

  it("denies everyone else", () => {
    expect(canManageUser("editor", "viewer", false)).toBe(false);
    expect(canManageUser("viewer", "editor", false)).toBe(false);
  });
});

describe("isProtectedSuperAdmin", () => {
  it("protects the super admin from lower roles only", () => {
    expect(isProtectedSuperAdmin("admin", "super_admin")).toBe(true);
    expect(isProtectedSuperAdmin("editor", "super_admin")).toBe(true);
    expect(isProtectedSuperAdmin("viewer", "super_admin")).toBe(true);
    expect(isProtectedSuperAdmin("super_admin", "super_admin")).toBe(false);
    expect(isProtectedSuperAdmin("admin", "admin")).toBe(false);
  });
});

describe("isRole", () => {
  it("accepts the four known roles", () => {
    expect(isRole("super_admin")).toBe(true);
    expect(isRole("admin")).toBe(true);
    expect(isRole("editor")).toBe(true);
    expect(isRole("viewer")).toBe(true);
  });

  it("rejects unknown values, including Object.prototype keys", () => {
    expect(isRole("root")).toBe(false);
    expect(isRole("")).toBe(false);
    expect(isRole(null)).toBe(false);
    expect(isRole(undefined)).toBe(false);
    expect(isRole(42)).toBe(false);
    expect(isRole("__proto__")).toBe(false);
    expect(isRole("constructor")).toBe(false);
    expect(isRole(["viewer"])).toBe(false);
  });
});
