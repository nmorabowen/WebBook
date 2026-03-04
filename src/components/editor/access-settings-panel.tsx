"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SessionPayload } from "@/lib/auth";
import type { PublicUserRecord, UserRole } from "@/lib/user-store";

type AccessSettingsPanelProps = {
  session: SessionPayload;
  initialUsers: PublicUserRecord[];
};

type PasswordMap = Record<string, string>;
type RoleDraftMap = Record<string, UserRole>;

function sortUsers(users: PublicUserRecord[]) {
  return [...users].sort((left, right) =>
    left.role === right.role
      ? left.username.localeCompare(right.username)
      : left.role === "admin"
        ? -1
        : 1,
  );
}

export function AccessSettingsPanel({
  session,
  initialUsers,
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
    "Admins can create users, edit roles, and reset passwords here.",
  );
  const [resetPasswords, setResetPasswords] = useState<PasswordMap>({});
  const [roleDrafts, setRoleDrafts] = useState<RoleDraftMap>(() =>
    Object.fromEntries(initialUsers.map((user) => [user.username, user.role])),
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

      setUsers((current) => sortUsers([...current, payload]));
      setRoleDrafts((current) => ({
        ...current,
        [payload.username]: payload.role,
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
        sortUsers(
          current.map((user) => (user.username === username ? payload : user)),
        ),
      );
      setRoleDrafts((current) => ({
        ...current,
        [username]: payload.role,
      }));
      setAdminMessage(`Updated role for ${username}.`);
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
              Create additional editor or admin accounts, change roles, and reset
              workspace passwords.
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
            {users.map((user) => (
              <div
                key={user.username}
                className="grid gap-4 rounded-[20px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.46)] p-4 md:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)_auto]"
              >
                <div>
                  <p className="text-base font-semibold text-[var(--paper-ink)]">
                    {user.username}
                  </p>
                  <p className="text-sm text-[var(--paper-muted)]">
                    Updated {new Date(user.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <div>
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
            ))}
          </div>

          <p className="mt-4 text-sm text-[var(--paper-muted)]">{adminMessage}</p>
        </section>
      ) : null}
    </div>
  );
}
