import { useEffect, useRef, useState, type FormEvent } from "react";
import { accounts, type Account } from "../accounts";

interface Props {
  account: Account | null;
  onChange: (account: Account | null) => void;
  onClose: () => void;
  refresh: () => void;
}

export function AccountDialog({ account, onChange, onClose, refresh }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const registering = mode === "register";

  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      if (account) {
        await accounts.logout(account.id);
        onChange(null);
      } else {
        const { account: signedIn } = await accounts.authenticate(
          mode, String(fields.get("email")), String(fields.get("password"))
        );
        onChange(signedIn);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reach the account service.");
      if (account) refresh();
    } finally {
      setPending(false);
    }
  }

  const title = account ? "Account" : registering ? "Create account" : "Sign in";
  return (
    <dialog ref={dialog} className="dialog account-dialog" aria-labelledby="account-title"
      onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}>
      <h2 className="dialog-title" id="account-title">{title}</h2>
      <form className="account-form" onSubmit={submit}>
        {account ? <p className="dialog-body">{account.email}</p> : (
          <>
            <p className="dialog-body">Save your holdings and access them from another device.</p>
            <div className="field">
              <label htmlFor="account-email">Email</label>
              <input className="input" id="account-email" name="email" type="email" autoComplete="email" maxLength={254} required />
            </div>
            <div className="field">
              <label htmlFor="account-password">Password</label>
              <input className="input" id="account-password" name="password" type="password"
                autoComplete={registering ? "new-password" : "current-password"} required
                minLength={registering ? 12 : undefined} maxLength={128}
                aria-describedby={registering ? "account-password-help" : undefined} />
              {registering && <small id="account-password-help" className="meta-text">Use at least 12 characters.</small>}
            </div>
            <button type="button" className="btn btn-ghost account-switch" disabled={pending} onClick={() => {
              setMode(registering ? "login" : "register");
              setError("");
            }}>
              {registering ? "Already have an account? Sign in" : "Create an account"}
            </button>
          </>
        )}
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={onClose}>Close</button>
          <button className="btn btn-primary" disabled={pending}>
            {pending ? "Please wait…" : account ? "Sign out" : title}
          </button>
        </div>
      </form>
    </dialog>
  );
}
