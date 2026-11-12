import { Badge } from './ui';
import type { Status } from '@/types/api';
import { statusText } from '@/utils/format';

export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge variant={status === 'DONE' ? 'green' : status === 'IN_PROGRESS' ? 'blue' : 'neutral'}>
      {statusText[status]}
    </Badge>
  );
}
