import React from "react";
import { Modal, Text, Group, Button, Stack, Alert } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteEntryApi, type Entry } from "../api/entries";

interface DeleteConfirmModalProps {
  opened: boolean;
  onClose: () => void;
  entry: Entry | null;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  opened,
  onClose,
  entry,
}) => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!entry) return;
      return await deleteEntryApi(entry.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["entries-summary"] });
      notifications.show({
        title: "Entry Deleted",
        message: `Challan ${entry?.challan_no} (${entry?.product}) was soft-deleted.`,
        color: "green",
        icon: <IconCheck size={18} />,
      });
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || "Failed to delete entry.";
      notifications.show({
        title: "Delete Error",
        message: msg,
        color: "red",
        icon: <IconAlertTriangle size={18} />,
      });
    },
  });

  if (!entry) return null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text fw={700} c="red.7" size="md">
          Confirm Deletion
        </Text>
      }
      centered
      radius="md"
    >
      <Stack gap="sm">
        <Alert icon={<IconAlertTriangle size={16} />} color="red" variant="light">
          This record will be soft-deleted. It will no longer appear in active tables or exports.
        </Alert>

        <Text size="sm">
          Are you sure you want to delete Challan <b>{entry.challan_no}</b> for product{" "}
          <b>{entry.product}</b>?
        </Text>

        <Group justify="flex-end" mt="md" gap="xs">
          <Button variant="default" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            color="red"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
          >
            Delete Entry
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
