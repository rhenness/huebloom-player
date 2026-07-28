import { type FormEvent, type ReactNode, useState } from 'react';

const UNLOCK_STORAGE_KEY = 'huebloom.library-access.unlocked';

interface AccessGateProps {
    /**
     * The password supplied by the deployment's runtime configuration. An empty
     * value deliberately leaves the library open, which keeps local development
     * usable until a password is configured.
     */
    password: string | undefined;
    children: ReactNode;
}

function isUnlockedForSession(): boolean {
    try {
        return window.sessionStorage.getItem(UNLOCK_STORAGE_KEY) === 'true';
    } catch {
        // Private browsing or restrictive browser settings can disable storage.
        // The gate can still work for the lifetime of the current page.
        return false;
    }
}

function persistUnlockForSession(): void {
    try {
        window.sessionStorage.setItem(UNLOCK_STORAGE_KEY, 'true');
    } catch {
        // Keeping the unlocked React state is still preferable to rejecting a
        // correct password solely because sessionStorage is unavailable.
    }
}

/**
 * A lightweight, client-side gate for the private library route. This is a
 * convenience screen rather than server-side access control: the configured
 * password and static assets remain visible to anyone who can inspect them.
 */
export default function AccessGate({ password, children }: AccessGateProps) {
    const hasPassword = password !== undefined && password.length > 0;
    const [isUnlocked, setIsUnlocked] = useState(() =>
        hasPassword ? isUnlockedForSession() : true,
    );
    const [enteredPassword, setEnteredPassword] = useState('');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (enteredPassword !== password) {
            setErrorMessage('That password is not correct. Please try again.');
            return;
        }

        persistUnlockForSession();
        setErrorMessage(null);
        setIsUnlocked(true);
    }

    if (isUnlocked) {
        return <>{children}</>;
    }

    return (
        <main className="access-gate" aria-labelledby="access-gate-title">
            <section className="access-gate__card">
                <p className="access-gate__brand">huebloom</p>
                <h1 id="access-gate-title">Private library</h1>
                <p className="access-gate__description">
                    Enter the library password to continue.
                </p>

                <form className="access-gate__form" onSubmit={handleSubmit}>
                    <label htmlFor="library-password">Password</label>
                    <input
                        autoComplete="current-password"
                        autoFocus
                        id="library-password"
                        name="password"
                        onChange={(event) => {
                            setEnteredPassword(event.target.value);
                            if (errorMessage) {
                                setErrorMessage(null);
                            }
                        }}
                        required
                        type="password"
                        value={enteredPassword}
                        aria-describedby={
                            errorMessage ? 'library-password-error' : undefined
                        }
                        aria-invalid={errorMessage ? true : undefined}
                    />
                    {errorMessage ? (
                        <p
                            className="access-gate__error"
                            id="library-password-error"
                            role="alert">
                            {errorMessage}
                        </p>
                    ) : null}
                    <button className="access-gate__submit" type="submit">
                        Open library
                    </button>
                </form>
            </section>
        </main>
    );
}
