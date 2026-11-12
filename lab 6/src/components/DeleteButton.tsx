import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from './ui';
import { ConfirmDialog } from './Interactive';

export function DeleteButton({
  label,
  action,
  onDone,
}: {
  label: string;
  action: () => Promise<unknown>;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: action,
    onSuccess: () => {
      setOpen(false);
      toast.success('Запис видалено');
      onDone?.();
    },
  });
  return (
    <>
      <Button
        className="button-danger"
        onClick={() => {
          mutation.reset();
          setOpen(true);
        }}
      >
        Видалити
      </Button>
      {open && (
        <ConfirmDialog
          label={label}
          pending={mutation.isPending}
          error={mutation.error?.message}
          onClose={() => setOpen(false)}
          onConfirm={() => mutation.mutate()}
        />
      )}
    </>
  );
}
