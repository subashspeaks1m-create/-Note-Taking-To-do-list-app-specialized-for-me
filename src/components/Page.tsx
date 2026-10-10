import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function PageHeader({ overline, title, children }: { overline?: string; title: string; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {overline && <p className="overline">{overline}</p>}
        <h1 className="page-head__title">{title}</h1>
      </div>
      {children && <div className="page-head__actions">{children}</div>}
    </header>
  );
}

export function EmptyState({ icon, title, body, children }: { icon: IconName; title: string; body: string; children?: ReactNode }) {
  return (
    <div className="empty empty--page">
      <div className="empty__art" aria-hidden="true">
        <Icon name={icon} size={26} />
      </div>
      <p className="empty__title">{title}</p>
      <p className="empty__body">{body}</p>
      {children}
    </div>
  );
}

export function StageNote({ stage, children }: { stage: number; children: ReactNode }) {
  return (
    <p className="stage-note">
      <span className="stage-note__tag">Stage {stage}</span>
      {children}
    </p>
  );
}
