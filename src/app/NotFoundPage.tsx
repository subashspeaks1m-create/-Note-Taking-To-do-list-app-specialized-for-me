import { Link } from 'react-router-dom';
import { EmptyState } from '../components/Page';

export function NotFoundPage() {
  return (
    <div className="page page--narrow">
      <EmptyState icon="orbit" title="This page doesn't exist." body="The link may be old or mistyped. Your data is untouched.">
        <Link to="/" className="btn btn--primary">
          Go to Today
        </Link>
      </EmptyState>
    </div>
  );
}
