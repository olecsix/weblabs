import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from './ui';

export function DeleteButton({
  label,
  action,
  onDone,
}: {
  label: string;
  action: () => Promise<unknown>;
  onDone?: () => void;
}) {
  const mutation = useMutation({
    mutationFn: action,
    onSuccess: () => {
      toast.success('Запис видалено');
      onDone?.();
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Button
      className="button-danger"
      disabled={mutation.isPending}
      onClick={() => {
        if (window.confirm(`Видалити ${label}?`)) mutation.mutate();
      }}
    >
      {mutation.isPending ? 'Видаляємо…' : 'Видалити'}
    </Button>
  );
}
