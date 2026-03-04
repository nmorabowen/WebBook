import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const tempRoot = ".tmp-user-store-test";

async function loadUserStore() {
  process.env.CONTENT_ROOT = tempRoot;
  process.env.ADMIN_PASSWORD = "bootstrap-secret";
  vi.resetModules();
  return import("./user-store");
}

afterEach(async () => {
  delete process.env.CONTENT_ROOT;
  delete process.env.ADMIN_PASSWORD;
  await fs.rm(path.join(process.cwd(), tempRoot), {
    recursive: true,
    force: true,
  });
});

describe("user store", () => {
  it("allows bootstrap admin login and user creation", async () => {
    const store = await loadUserStore();

    const admin = await store.verifyUserCredentials("admin", "bootstrap-secret");
    expect(admin?.role).toBe("admin");

    const created = await store.createUser({
      username: "editor-one",
      role: "editor",
      password: "editor-secret",
    });

    expect(created.username).toBe("editor-one");
    expect(created.role).toBe("editor");

    const editor = await store.verifyUserCredentials(
      "editor-one",
      "editor-secret",
    );
    expect(editor?.role).toBe("editor");
  });

  it("changes the admin password and invalidates the old one", async () => {
    const store = await loadUserStore();

    await store.changeOwnPassword("admin", "bootstrap-secret", "new-admin-pass");

    const oldLogin = await store.verifyUserCredentials("admin", "bootstrap-secret");
    const newLogin = await store.verifyUserCredentials("admin", "new-admin-pass");

    expect(oldLogin).toBeNull();
    expect(newLogin?.role).toBe("admin");
  });

  it("updates roles but keeps at least one admin account", async () => {
    const store = await loadUserStore();

    await store.createUser({
      username: "editor-one",
      role: "editor",
      password: "editor-secret",
    });

    const promoted = await store.updateUserRole("editor-one", "admin");
    expect(promoted.role).toBe("admin");

    const demoted = await store.updateUserRole("admin", "editor");
    expect(demoted.role).toBe("editor");

    await expect(store.updateUserRole("editor-one", "editor")).rejects.toThrow(
      "At least one admin account must remain",
    );
  });
});
