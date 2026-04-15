import type { ReactNode } from "react";
import { Button } from "./Button.tsx";
import styles from "./BrandHeader.module.css";

interface BrandHeaderProps {
  userName?: string | null;
  onLogout?: () => void;
  onLogoClick?: () => void;
  /** Additional user-menu items rendered before the logout button (e.g. "My Games"). */
  extras?: ReactNode;
}

export function BrandHeader({
  userName,
  onLogout,
  onLogoClick,
  extras,
}: BrandHeaderProps) {
  return (
    <header className={styles.header}>
      <button
        type="button"
        className={styles.lockup}
        onClick={onLogoClick}
        aria-label="Pinochle — home"
      >
        <img
          className={styles.monogram}
          src="/logo-monogram.svg"
          alt=""
          width={40}
          height={40}
        />
        <span className={styles.wordmark}>Pinochle</span>
      </button>

      {(userName || extras || onLogout) && (
        <div className={styles.user}>
          {extras}
          {userName && (
            <span>
              Welcome,{" "}
              <span className={styles.userName}>{userName}</span>
            </span>
          )}
          {onLogout && (
            <Button variant="ghost" size="sm" onClick={onLogout}>
              Log out
            </Button>
          )}
        </div>
      )}
    </header>
  );
}
