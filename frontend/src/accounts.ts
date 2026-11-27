import type { Holding } from "./holdings";
import { NOTIFICATION_URL } from "./api";

export interface Account {
  id: string;
  email: string;
  lots: Holding[];
  revision: number;
}

export class AccountError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path = "", method = "GET", body?: object): Promise<T> {
  const res = await fetch(`${NOTIFICATION_URL}/account${path}`, {
    credentials: "include",
    method,
    ...(body && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new AccountError(detail?.error || "The account service is unavailable. Try again.", res.status);
  }
  return res.json() as Promise<T>;
}

export const accounts = {
  current: () => request<{ account: Account | null }>(),
  authenticate: (mode: "login" | "register", email: string, password: string) =>
    request<{ account: Account }>(`/${mode}`, "POST", { email, password }),
  logout: (accountId: string) => request("/logout", "POST", { accountId }),
  save: ({ id, revision }: Account, lots: Holding[]) =>
    request<Pick<Account, "lots" | "revision">>("/holdings", "PUT", { accountId: id, revision, lots }),
};
