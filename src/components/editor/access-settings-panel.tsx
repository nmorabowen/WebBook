"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SessionPayload } from "@/lib/auth";
import type { ContentTree } from "@/lib/content/schemas";
import type {
  PublicUserRecord,
  UserAssignments,
  UserRole,
} from "@/lib/user-store";

type AccessSettingsPanelProps = {
  session: SessionPayload;
  initialUsers: PublicUserRecord[];
  assignmentTree: Pick<ContentTree, "books" | "notes">;
};

type PasswordMap = Record<string, string>;
type RoleDraftMap = Record<string, UserRole>;
type AssignmentDraftMap = Record<string, UserAssignments>;

function sortUsers(users: PublicUserRecord[]) {
  return [...users].sort((left, right) =>
    left.role === right.role
      ? left.username.localeCompare(right.username)
      : left.role === "admin"
        ? -1
        : 1,
  );
}

function normalizeAssignments(assignments?: Partial<UserAssignments>): UserAssignments {
  return {
    bookIds: Array.from(new Set(assignments?.bookIds ?? [])).sort((left, right) =>
      left.localeCompare(right),
    ),
    noteIds: Array.from(new Set(assignments?.noteIds ?? [])).sort((left, right) =>
      left.localeCompare(right),
    ),
  };
}

function assignmentsEqual(left: UserAssignments, right: UserAssignments) {
  return (
    JSON.stringify(left.bookIds) === JSON.stringify(right.bookIds) &&
    JSON.stringify(left.noteIds) === JSON.stringify(right.noteIds)
  );
}

function toggleId(ids: string[], id: string, checked: boolean) {
  if (checked) {
    return Array.from(new Set([...ids, id])).sort((left, right) =>
      left.localeCompare(right),
    );
  }
  return ids.filter((entry) => entry !== id);
}

export function AccessSettingsPanel({
  session,
  initialUsers,
  assignmentTree,
}: AccessSettingsPanelProps) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selfMessage, setSelfMessage] = useState(
    "Use a strong password with at least 8 characters.",
  );
  const [newUsername, setNewUsername] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("editor");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [adminMessage, setAdminMessage] = useState(
    "Admins can create users, assign books and notes, edit roles, and reset passwords here.",
  );
  const [resetPasswords, setResetPasswords] = useState<PasswordMap>({});
  const [roleDrafts, setRoleDrafts] = useState<RoleDraftMap>(() =>
    Object.fromEntries(initialUsers.map((user) => [user.username, user.role])),
  );
  const [assignmentDrafts, setAssignmentDrafts] = useState<AssignmentDraftMap>(() =>
    Object.fromEntries(
      initialUsers.map((user) => [user.username, normalizeAssignments(user.assignments)]),
    ),
  );
  const [isPasswordPending, startPasswordTransition] = useTransition();
  const [isAdminPending, startAdminTransition] = useTransition();

  const saveOwnPassword = () => {
    setSelfMessage("");
    startPasswordTransition(async () => {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword,
          nextPassword,
          confirmPassword,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setSelfMessage(payload.error ?? "Could not update password.");
        return;
      }

      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
      setSelfMessage("Password updated.");
    });
  };

  const createWorkspaceUser = () => {
    setAdminMessage("");
    startAdminTransition(async () => {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: newUsername,
          role: newUserRole,
          password: newUserPassword,
        }),
      });

      const payload = (await response.json()) as PublicUserRecord & { error?: string };
      if (!response.ok) {
        setAdminMessage(payload.error ?? "Could not create user.");
        return;
      }

      const normalizedAssignments = normalizeAssignments(payload.assignments);
      setUsers((current) => sortUsers([...current, payload]));
      setRoleDrafts((current) => ({
        ...current,
        [payload.username]: payload.role,
      }));
      setAssignmentDrafts((current) => ({
        ...current,
        [payload.username]: normalizedAssignments,
      }));
      setNewUsername("");
      setNewUserPassword("");
      setNewUserRole("editor");
      setAdminMessage(`Created user ${payload.username}.`);
    });
  };

  const updateWorkspaceUserRole = (username: string) => {
    const role = roleDrafts[username];
    const currentUser = users.find((user) => user.username === username);
    if (!role || !currentUser || currentUser.role === role) {
      return;
    }

    setAdminMessage("");
    startAdminTransition(async () => {
      const response = await fetch(`/api/users/${username}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role }),
      });

      const payload = (await response.json()) as PublicUserRecord & { error?: string };
      if (!response.ok) {
        setAdminMessage(payload.error ?? `Could not update ${username}.`);
        setRoleDrafts((current) => ({
          ...current,
          [username]: currentUser.role,
        }));
        return;
      }

      setUsers((current) =>
        sortUsers(current.map((user) => (user.username === username ? payload : user))),
      );
      setRoleDrafts((current) => ({
        ...current,
        [username]: payload.role,
      }));
      setAssignmentDrafts((current) => ({
        ...current,
        [username]: normalizeAssignments(payload.assignments),
      }));
      setAdminMessage(`Updated role for ${username}.`);
      router.refresh();
    });
  };

  const saveAssignments = (username: string) => {
    const currentUser = users.find((user) => user.username === username);
    if (!currentUser) {
      return;
    }

    const nextAssignments = normalizeAssignments(assignmentDrafts[username]);
    const currentAssignments = normalizeAssignments(currentUser.assignments);
    if (assignmentsEqual(nextAssignments, currentAssignments)) {
      return;
    }

    setAdminMessage("");
    startAdminTransition(async () => {
      const response = await fetch(`/api/users/${username}/assignments`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(nextAssignments),
      });

      const payload = (await response.json()) as PublicUserRecord & { error?: string };
      if (!response.ok) {
        setAdminMessage(payload.error ?? `Could not update assignments for ${username}.`);
        setAssignmentDrafts((current) => ({
          ...current,
          [username]: currentAssignments,
        }));
        return;
      }

      const normalizedAssignments = normalizeAssignments(payload.assignments);
      setUsers((current) =>
        sortUsers(current.map((user) => (user.username === username ? payload : user))),
      );
      setAssignmentDrafts((current) => ({
        ...current,
        [username]: normalizedAssignments,
      }));
      setAdminMessage(`Updated assignments for ${username}.`);
      router.refresh();
    });
  };

  const resetUserPassword = (username: string) => {
    const password = resetPasswords[username]?.trim() ?? "";
    if (!password) {
      setAdminMessage("Enter a password before resetting.");
      return;
    }

    setAdminMessage("");
    startAdminTransition(async () => {
      const response = await fetch(`/api/users/${username}/password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setAdminMessage(payload.error ?? `Could not reset ${username}.`);
        return;
      }

      setResetPasswords((current) => ({
        ...current,
        [username]: "",
      }));
      setAdminMessage(`Password reset for ${username}.`);
    });
  };

  const books = assignmentTree.books.map((book) => ({
    id: book.meta.id,
    slug: book.meta.slug,
    title: book.meta.title,
  }));
  const notes = assignmentTree.notes.map((note) => ({
    id: note.meta.id,
    slug: note.meta.slug,
    title: note.meta.title,
  }));

  return (
    <div className="grid gap-6">
      <section className="dashboard-card p-6">
        <div className="grid gap-2">
          <p className="paper-label">Your password</p>
          <p className="text-sm leading-7 text-[var(--paper-muted)]">
            Signed in as <span className="font-semibold">{session.username}</span>.
            Update your workspace password here.
          </p>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div>
            <label className="paper-label" htmlFor="current-password">
              Current password
            </label>
            <input
              id="current-password"
              type="password"
              className="paper-input"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
          <div>
            <label className="paper-label" htmlFor="next-password">
              New password
            </label>
            <input
              id="next-password"
              type="password"
              className="paper-input"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
            />
          </div>
          <div>
            <label className="paper-label" htmlFor="confirm-password">
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              className="paper-input"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm text-[var(--paper-muted)]">{selfMessage}</p>
          <button
            type="button"
            className="paper-button"
            disabled={isPasswordPending}
            onClick={saveOwnPassword}
          >
            {isPasswordPending ? "Saving..." : "Change password"}
          </button>
        </div>
      </section>

      {session.role === "admin" ? (
        <section className="dashboard-card p-6">
          <div className="grid gap-2">
            <p className="paper-label">Workspace users</p>
            <p className="text-sm leading-7 text-[var(--paper-muted)]">
              Create additional editor or admin accounts, assign books and notes,
              change roles, and reset workspace passwords.
            </p>
          </div>

          <div className="mt-5 grid gap-4 rounded-[20px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.46)] p-4 md:grid-cols-[minmax(0,1fr)_160px_minmax(0,1fr)_auto]">
            <div>
              <label className="paper-label" htmlFor="new-username">
                Username
              </label>
              <input
                id="new-username"
                className="paper-input"
                value={newUsername}
                onChange={(event) => setNewUsername(event.target.value)}
              />
            </div>
            <div>
              <label className="paper-label" htmlFor="new-role">
                Role
              </label>
              <select
                id="new-role"
                className="paper-select"
                value={newUserRole}
                onChange={(event) => setNewUserRole(event.target.value as UserRole)}
              >
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="paper-label" htmlFor="new-user-password">
                Temporary password
              </label>
              <input
                id="new-user-password"
                type="password"
                className="paper-input"
                value={newUserPassword}
                onChange={(event) => setNewUserPassword(event.target.value)}
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                className="paper-button"
                disabled={isAdminPending}
                onClick={createWorkspaceUser}
              >
                {isAdminPending ? "Saving..." : "Create user"}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {users.map((user) => {
              const currentAssignments = normalizeAssignments(user.assignments);
              const draftAssignments = normalizeAssignments(
                assignmentDrafts[user.username] ?? currentAssignments,
              );
              const assignmentsChanged = !assignmentsEqual(
                draftAssignments,
                currentAssignments,
              );

              return (
                <div
                  key={user.username}
                  className="grid gap-4 rounded-[20px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.46)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-[var(--paper-ink)]">
                        {user.username}
                      </p>
                      <p className="text-sm text-[var(--paper-muted)]">
                        Updated {new Date(user.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="min-w-[180px]">
                      <label className="paper-label" htmlFor={`user-role-${user.username}`}>
                        Role
                      </label>
                      <select
                        id={`user-role-${user.username}`}
                        className="paper-select"
                        value={roleDrafts[user.username] ?? user.role}
                        onChange={(event) =>
                          setRoleDrafts((current) => ({
                            ...current,
                            [user.username]: event.target.value as UserRole,
                          }))
                        }
                        disabled={isAdminPending}
                      >
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        type="button"
                        className="paper-button paper-button-secondary mt-3"
                        disabled={
                          isAdminPending ||
                          (roleDrafts[user.username] ?? user.role) === user.role
                        }
                        onClick={() => updateWorkspaceUserRole(user.username)}
                      >
                        Save role
                      </button>
                    </div>
                  </div>

                  {user.role === "editor" || roleDrafts[user.username] === "editor" ? (
                    <div className="grid gap-4 rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,252,247,0.84)] p-4 lg:grid-cols-2">
                      <div>
                        <p className="paper-label mb-2">Assigned books</p>
                        <div className="grid gap-2">
                          {books.length ? (
                            books.map((book) => (
                              <label
                                key={book.id}
                                className="flex items-start gap-3 rounded-[14px] border border-[var(--paper-border)] px-3 py-2 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  className="mt-1"
                                  checked={draftAssignments.bookIds.includes(book.id)}
                                  onChange={(event) =>
                                    setAssignmentDrafts((current) => ({
                                      ...current,
                                      [user.username]: {
                                        ...draftAssignments,
                                        bookIds: toggleId(
                                          draftAssignments.bookIds,
                                          book.id,
                                          event.target.checked,
                                        ),
                                      },
                                    }))
                                  }
                                  disabled={isAdminPending}
                                />
                                <span>
                                  <span className="block font-semibold text-[var(--paper-ink)]">
                                    {book.title}
                                  </span>
                                  <span className="text-[var(--paper-muted)]">
                                    {book.slug}
                                  </span>
                                </span>
                              </label>
                            ))
                          ) : (
                            <p className="text-sm text-[var(--paper-muted)]">No books yet.</p>
                          )}
                        </div>
                      </div>

                      <div>
                        <p className="paper-label mb-2">Assigned notes</p>
                        <div className="grid gap-2">
                          {notes.length ? (
                            notes.map((note) => (
                              <label
                                key={note.id}
                                className="flex items-start gap-3 rounded-[14px] border border-[var(--paper-border)] px-3 py-2 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  className="mt-1"
                                  checked={draftAssignments.noteIds.includes(note.id)}
                                  onChange={(event) =>
                                    setAssignmentDrafts((current) => ({
                                      ...current,
                                      [user.username]: {
                                        ...draftAssignments,
                                        noteIds: toggleId(
                                          draftAssignments.noteIds,
                                          note.id,
                                          event.target.checked,
                                        ),
                                      },
                                    }))
                                  }
                                  disabled={isAdminPending}
                                />
                                <span>
                                  <span className="block font-semibold text-[var(--paper-ink)]">
                                    {note.title}
                                  </span>
                                  <span className="text-[var(--paper-muted)]">
                                    {note.slug}
                                  </span>
                                </span>
                              </label>
                            ))
                          ) : (
                            <p className="text-sm text-[var(--paper-muted)]">No notes yet.</p>
                          )}
                        </div>
                      </div>

                      <div className="lg:col-span-2 flex items-center justify-between gap-3">
                        <p className="text-sm text-[var(--paper-muted)]">
                          Assigned books include all chapters inside those books.
                        </p>
                        <button
                          type="button"
                          className="paper-button"
                          disabled={isAdminPending || !assignmentsChanged}
                          onClick={() => saveAssignments(user.username)}
                        >
                          Save assignments
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,252,247,0.84)] px-4 py-3 text-sm text-[var(--paper-muted)]">
                      Admins can access every book and note without explicit assignments.
                    </div>
                  )}

                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                    <div>
                      <label
                        className="paper-label"
                        htmlFor={`reset-password-${user.username}`}
                      >
                        Reset password
                      </label>
                      <input
                        id={`reset-password-${user.username}`}
                        type="password"
                        className="paper-input"
                        value={resetPasswords[user.username] ?? ""}
                        onChange={(event) =>
                          setResetPasswords((current) => ({
                            ...current,
                            [user.username]: event.target.value,
                          }))
                        }
                        disabled={user.username === session.username}
                        placeholder={
                          user.username === session.username
                            ? "Use the form above for your own password"
                            : "New password"
                        }
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        className="paper-button paper-button-secondary"
                        disabled={isAdminPending || user.username === session.username}
                        onClick={() => resetUserPassword(user.username)}
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-sm text-[var(--paper-muted)]">{adminMessage}</p>
        </section>
      ) : null}
    </div>
  );
}
