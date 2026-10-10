import type { ReactNode } from 'react';
import { Art, type ArtMotion, type ArtName } from './art/Art';
import { Icon, type IconName } from './Icon';

interface PageHeaderProps {
  overline?: string;
  title: string;
  /** Color art beside the title; it moves when the header is hovered. */
  art?: ArtName;
  artMotion?: ArtMotion;
  children?: ReactNode;
}

export function PageHeader({ overline, title, art, artMotion = 'bounce', children }: PageHeaderProps) {
  return (
    <header className="page-head">
      <div className="page-head__title-row art-host">
        {art && <Art name={art} size={44} motion={artMotion} />}
        <div>
          {overline && <p className="overline">{overline}</p>}
          <h1 className="page-head__title">{title}</h1>
        </div>
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
