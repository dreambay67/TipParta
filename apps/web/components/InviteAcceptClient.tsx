'use client';

import { FormEvent, useEffect, useState } from "react";
import { FirebaseError } from "firebase/app";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from "firebase/auth";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import {
  acceptPlayerInvite,
  getInvitePreview,
  type InvitePreview
} from "@/features/players/playerRepository";
import { auth } from "@/lib/firebase/client";

type InviteAcceptClientProps = {
  token: string;
};

function inviteErrorText(error: unknown): string {
  if (error instanceof FirebaseError) {
    if (error.code === "auth/weak-password") {
      return "Heslo musí mať aspoň 6 znakov.";
    }

    if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") {
      return "Tento e-mail už existuje, ale heslo nesedí.";
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Pozvánku sa nepodarilo prijať. Skús to znova.";
}

async function waitForSignedInUser(uid: string): Promise<void> {
  if (auth.currentUser?.uid === uid) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let unsubscribe: () => void = () => undefined;
    const timeout = window.setTimeout(() => {
      unsubscribe();
      reject(new Error("Prihlasenie sa nestihlo dokoncit. Skus to znova."));
    }, 10_000);

    unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user?.uid !== uid) {
        return;
      }

      window.clearTimeout(timeout);
      unsubscribe();
      resolve();
    });
  });
}

export function InviteAcceptClient({ token }: InviteAcceptClientProps) {
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadInvite() {
      setLoadingInvite(true);
      setError(null);

      try {
        const preview = await getInvitePreview(token);
        if (!active) {
          return;
        }

        if (!preview || preview.status !== "pending") {
          setError("Pozvánka neexistuje, vypršala alebo už bola použitá.");
          setInvite(null);
          return;
        }

        setInvite(preview);
      } catch {
        if (active) {
          setError("Pozvánka neexistuje, vypršala alebo už bola použitá.");
        }
      } finally {
        if (active) {
          setLoadingInvite(false);
        }
      }
    }

    void loadInvite();

    return () => {
      active = false;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!invite) {
      setError("Pozvánka nie je pripravená.");
      return;
    }

    if (password.length < 6) {
      setError("Heslo musí mať aspoň 6 znakov.");
      return;
    }

    if (password !== passwordAgain) {
      setError("Heslá sa nezhodujú.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const email = invite.email.trim().toLowerCase();
      const currentUser = auth.currentUser;
      const credential =
        currentUser?.email?.trim().toLowerCase() === email
          ? { user: currentUser }
          : await createUserWithEmailAndPassword(auth, email, password).catch(async (createError) => {
              if (createError instanceof FirebaseError && createError.code === "auth/email-already-in-use") {
                return signInWithEmailAndPassword(auth, email, password);
              }

              throw createError;
            });

      await updateProfile(credential.user, { displayName: invite.displayName });
      await waitForSignedInUser(credential.user.uid);
      await credential.user.getIdToken(true);
      await acceptPlayerInvite({ token });
      window.location.assign("/");
    } catch (submitError) {
      setError(inviteErrorText(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="px-4 py-8 text-white sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-14rem)] w-full max-w-2xl flex-col justify-center">
        <a
          className="mb-6 inline-flex w-fit items-center gap-2 font-mono text-xs font-black uppercase text-yellow-300 hover:text-white"
          href="/prihlasenie"
        >
          <ArrowRight aria-hidden className="h-4 w-4 rotate-180" />
          Prihlásenie
        </a>

        <section className="border-4 border-cyan-300 bg-[#172331] p-5 shadow-[8px_8px_0_#facc15] sm:p-7">
          <p className="flex items-center gap-2 font-mono text-xs font-black uppercase tracking-wider text-cyan-200">
            <ShieldCheck aria-hidden className="h-4 w-4" />
            Súkromná pozvánka
          </p>
          <h1 className="mt-2 text-4xl font-black uppercase leading-none sm:text-5xl">
            Vytvoriť účet
          </h1>

          {loadingInvite ? (
            <div className="mt-8 flex items-center gap-3 font-mono text-sm font-bold uppercase text-slate-200">
              <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
              Kontrolujem pozvánku
            </div>
          ) : null}

          {invite ? (
            <form className="mt-7 grid gap-5" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block font-mono text-xs font-black uppercase text-slate-200">
                  E-mail z pozvánky
                </span>
                <input
                  className="w-full border-4 border-slate-700 bg-slate-100 px-3 py-3 text-base font-bold text-slate-950 outline-none"
                  readOnly
                  type="email"
                  value={invite.email}
                />
              </label>

              <label className="block">
                <span className="mb-2 block font-mono text-xs font-black uppercase text-slate-200">
                  Meno
                </span>
                <input
                  className="w-full border-4 border-slate-700 bg-slate-100 px-3 py-3 text-base font-bold text-slate-950 outline-none"
                  readOnly
                  value={invite.firstName}
                />
              </label>

              <label className="block">
                <span className="mb-2 block font-mono text-xs font-black uppercase text-slate-200">
                  Priezvisko
                </span>
                <input
                  className="w-full border-4 border-slate-700 bg-slate-100 px-3 py-3 text-base font-bold text-slate-950 outline-none"
                  readOnly
                  value={invite.lastName}
                />
              </label>

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block font-mono text-xs font-black uppercase text-slate-200">
                    Heslo
                  </span>
                  <input
                    autoComplete="new-password"
                    className="w-full border-4 border-slate-700 bg-white px-3 py-3 text-base font-bold text-slate-950 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/25"
                    minLength={6}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    type="password"
                    value={password}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block font-mono text-xs font-black uppercase text-slate-200">
                    Heslo znova
                  </span>
                  <input
                    autoComplete="new-password"
                    className="w-full border-4 border-slate-700 bg-white px-3 py-3 text-base font-bold text-slate-950 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/25"
                    minLength={6}
                    onChange={(event) => setPasswordAgain(event.target.value)}
                    required
                    type="password"
                    value={passwordAgain}
                  />
                </label>
              </div>

              <button
                className="inline-flex w-full items-center justify-center gap-2 border-4 border-yellow-300 bg-yellow-300 px-4 py-3 font-black uppercase text-slate-950 shadow-[5px_5px_0_#020617] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={submitting}
                type="submit"
              >
                {submitting ? "Vytváram účet..." : "Vytvoriť účet"}
                <ArrowRight aria-hidden className="h-5 w-5" />
              </button>
            </form>
          ) : null}

          {error ? (
            <p className="mt-5 border-2 border-red-300 bg-red-700 px-3 py-2 text-sm font-bold text-white">
              {error}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
