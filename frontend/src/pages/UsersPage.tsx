import React, { useState } from "react";
import {
  Box,
  Paper,
  Title,
  Text,
  Group,
  Stack,
  Button,
  Table,
  Badge,
  ActionIcon,
  Tooltip,
  Modal,
  TextInput,
  PasswordInput,
  Select,
  Alert,
  Skeleton,
  Card,
  Menu,
  useMantineColorScheme,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconUserPlus,
  IconUserX,
  IconTrash,
  IconCheck,
  IconAlertCircle,
  IconAlertTriangle,
  IconMail,
  IconLock,
  IconUser,
  IconUsers,
  IconDotsVertical,
} from "@tabler/icons-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import {
  fetchUsersApi,
  createUserApi,
  deactivateUserApi,
  hardDeleteUserApi,
  type UserCreatePayload,
} from "../api/users";
import type { User } from "../api/auth";
import { formatDate } from "../utils/formatters";
import { useAuth } from "../context/AuthContext";

export const UsersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user: currentAdmin } = useAuth();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";

  // Create modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // Deactivate modal state
  const [userToDeactivate, setUserToDeactivate] = useState<User | null>(null);

  // Delete modal state
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState<{ message: string; is409: boolean } | null>(null);

  // Fetch users query
  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsersApi(0, 100),
  });

  // Create user mutation
  const createMutation = useMutation({
    mutationFn: async (payload: UserCreatePayload) => {
      return await createUserApi(payload);
    },
    onSuccess: (newUser) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
      notifications.show({
        title: "User Created",
        message: `Account for ${newUser.name} (${newUser.email}) created as ${newUser.role.toUpperCase()}.`,
        color: "green",
        icon: <IconCheck size={18} />,
      });
      handleCloseCreateModal();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || "Failed to create user.";
      setServerError(msg);
    },
  });

  // Deactivate user mutation
  const deactivateMutation = useMutation({
    mutationFn: async (userId: number) => {
      return await deactivateUserApi(userId);
    },
    onSuccess: (deactivated) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
      notifications.show({
        title: "User Deactivated",
        message: `Account ${deactivated.email} has been deactivated.`,
        color: "orange",
        icon: <IconCheck size={18} />,
      });
      setUserToDeactivate(null);
    },
    onError: (err: any) => {
      notifications.show({
        title: "Deactivation Failed",
        message: err?.response?.data?.detail || "Could not deactivate user.",
        color: "red",
        icon: <IconAlertCircle size={18} />,
      });
    },
  });

  // Hard delete user mutation
  const hardDeleteMutation = useMutation({
    mutationFn: async (userId: number) => {
      return await hardDeleteUserApi(userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
      notifications.show({
        title: "User Permanently Deleted",
        message: `Account for ${userToDelete?.name} (${userToDelete?.email}) has been permanently deleted.`,
        color: "green",
        icon: <IconCheck size={18} />,
      });
      setUserToDelete(null);
      setDeleteError(null);
    },
    onError: (err: any) => {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail || "Failed to delete user.";
      if (status === 409) {
        setDeleteError({ message: detail, is409: true });
      } else {
        setDeleteError({ message: detail, is409: false });
        notifications.show({
          title: "Delete Failed",
          message: detail,
          color: "red",
          icon: <IconAlertCircle size={18} />,
        });
      }
    },
  });

  const handleOpenCreateModal = () => {
    setName("");
    setEmail("");
    setPassword("");
    setRole("staff");
    setCreateErrors({});
    setServerError(null);
    setIsCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
  };

  const validateCreate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Full name is required";
    if (!email.trim()) {
      errs.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = "Enter a valid email address";
    }
    if (!password) {
      errs.password = "Password is required";
    } else if (password.length < 6) {
      errs.password = "Password must be at least 6 characters";
    }
    setCreateErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    if (validateCreate()) {
      createMutation.mutate({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
      });
    }
  };

  const handleOpenDeleteModal = (u: User) => {
    setUserToDelete(u);
    setDeleteError(null);
  };

  const cardBg = isDark ? "#1E293B" : "#FFFFFF";
  const cardBorder = isDark ? "#334155" : "#E2E8F0";
  const textPrimary = isDark ? "#F8FAFC" : "#0F172A";
  const textMuted = isDark ? "#94A3B8" : "#64748B";

  return (
    <Box py="sm">
      {/* Header Bar */}
      <Group justify="space-between" align="center" mb="sm" wrap="wrap" gap="xs">
        <Box>
          <Title order={1} size="h3" fw={800} c={textPrimary}>
            User Accounts
          </Title>
          <Text size="xs" c={textMuted}>
            Manage staff credentials, admin privileges, and account status
          </Text>
        </Box>

        <Button
          color="blue"
          size="sm"
          radius="md"
          leftSection={<IconUserPlus size={16} />}
          onClick={handleOpenCreateModal}
          style={{ boxShadow: "0 2px 8px rgba(37, 99, 235, 0.25)" }}
        >
          Add User
        </Button>
      </Group>

      {/* ── MOBILE CARD LIST VIEW (hiddenFrom="sm") ── */}
      <Box hiddenFrom="sm">
        {usersQuery.isLoading ? (
          <Stack gap="xs">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} withBorder radius="md" p="sm" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
                <Group justify="space-between" mb={6}>
                  <Skeleton height={20} width="40%" />
                  <Skeleton height={18} width="20%" />
                </Group>
                <Skeleton height={14} width="60%" mb={6} />
                <Skeleton height={14} width="35%" />
              </Card>
            ))}
          </Stack>
        ) : usersQuery.data?.items.length === 0 ? (
          <Paper withBorder radius="md" p="xl" ta="center" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
            <IconUsers size={44} color="#94A3B8" stroke={1.5} />
            <Text fw={700} size="sm" c={textPrimary} mt="sm">
              No users found
            </Text>
            <Button size="xs" color="blue" mt="sm" onClick={handleOpenCreateModal}>
              Create First User
            </Button>
          </Paper>
        ) : (
          <Stack gap="xs">
            {usersQuery.data?.items.map((u) => {
              const isSelf = u.id === currentAdmin?.id;
              return (
                <Card
                  key={u.id}
                  withBorder
                  radius="md"
                  p="sm"
                  style={{ backgroundColor: cardBg, borderColor: cardBorder }}
                >
                  {/* Line 1: Name + Role */}
                  <Group justify="space-between" align="flex-start" wrap="nowrap" mb={4}>
                    <Group gap={6} wrap="nowrap" style={{ flex: 1, overflow: "hidden" }}>
                      <Text fw={700} size="sm" c={textPrimary} lineClamp={1}>
                        {u.name}
                      </Text>
                      {isSelf && (
                        <Badge size="xs" color="gray" variant="light">
                          You
                        </Badge>
                      )}
                    </Group>

                    <Badge
                      color={u.role === "admin" ? "blue" : "teal"}
                      variant="light"
                      size="xs"
                      tt="uppercase"
                    >
                      {u.role}
                    </Badge>
                  </Group>

                  {/* Line 2: Email */}
                  <Text size="xs" c={textMuted} mb={6} style={{ wordBreak: "break-all" }}>
                    {u.email}
                  </Text>

                  {/* Line 3: Status, Date, Action Menu */}
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <Group gap={6} wrap="nowrap">
                      {u.is_active ? (
                        <Badge color="green" variant="light" size="xs">
                          Active
                        </Badge>
                      ) : (
                        <Badge color="gray" variant="light" size="xs">
                          Deactivated
                        </Badge>
                      )}
                      <Text size="xs" c={textMuted}>
                        • {formatDate(u.created_at)}
                      </Text>
                    </Group>

                    {/* Actions Menu */}
                    <Menu position="bottom-end" shadow="md" width={170} withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Actions">
                          <IconDotsVertical size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        {u.is_active && !isSelf && (
                          <Menu.Item
                            color="orange"
                            leftSection={<IconUserX size={14} />}
                            onClick={() => setUserToDeactivate(u)}
                          >
                            Deactivate Account
                          </Menu.Item>
                        )}
                        {!isSelf && (
                          <Menu.Item
                            color="red"
                            leftSection={<IconTrash size={14} />}
                            onClick={() => handleOpenDeleteModal(u)}
                          >
                            Delete Permanently
                          </Menu.Item>
                        )}
                        {isSelf && (
                          <Menu.Item disabled>
                            Current User (No Actions)
                          </Menu.Item>
                        )}
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                </Card>
              );
            })}
          </Stack>
        )}
      </Box>

      {/* ── DESKTOP TABLE VIEW (visibleFrom="sm") ── */}
      <Box visibleFrom="sm">
        <Paper withBorder radius="md" style={{ backgroundColor: cardBg, borderColor: cardBorder, overflow: "hidden" }}>
          <Box p="sm" style={{ borderBottom: `1px solid ${cardBorder}` }}>
            <Group justify="space-between">
              <Group gap="xs">
                <IconUsers size={18} color="#2563EB" />
                <Text fw={700} size="sm" c={textPrimary}>
                  System Users
                </Text>
              </Group>
              {usersQuery.data && (
                <Text size="xs" c={textMuted}>
                  Total: <b>{usersQuery.data.items.length}</b> registered users
                </Text>
              )}
            </Group>
          </Box>

          <Box style={{ overflowX: "auto" }}>
            <Table
              striped
              highlightOnHover
              verticalSpacing="sm"
              horizontalSpacing="md"
              style={{ minWidth: 700 }}
            >
              <Table.Thead style={{ backgroundColor: isDark ? "#0F172A" : "#F8FAFC" }}>
                <Table.Tr>
                  <Table.Th style={{ width: 70 }}>ID</Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Email Address</Table.Th>
                  <Table.Th style={{ width: 110 }}>Role</Table.Th>
                  <Table.Th style={{ width: 120 }}>Status</Table.Th>
                  <Table.Th style={{ width: 120 }}>Created</Table.Th>
                  <Table.Th style={{ width: 120, textAlign: "center" }}>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>

              <Table.Tbody>
                {usersQuery.isLoading ? (
                  Array.from({ length: 4 }).map((_, idx) => (
                    <Table.Tr key={`user-skel-${idx}`}>
                      <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                      <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                      <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                      <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                      <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                      <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                      <Table.Td><Skeleton height={20} radius="xs" /></Table.Td>
                    </Table.Tr>
                  ))
                ) : usersQuery.data?.items.map((u) => {
                  const isSelf = u.id === currentAdmin?.id;
                  return (
                    <Table.Tr key={u.id}>
                      <Table.Td>
                        <Text size="xs" c={textMuted}>
                          #{u.id}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text fw={600} size="sm" c={textPrimary}>
                          {u.name} {isSelf && <Badge size="xs" color="gray" variant="light">You</Badge>}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c={textMuted}>
                          {u.email}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          color={u.role === "admin" ? "blue" : "teal"}
                          variant="light"
                          size="sm"
                          tt="uppercase"
                        >
                          {u.role}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        {u.is_active ? (
                          <Badge color="green" variant="light" size="sm">
                            Active
                          </Badge>
                        ) : (
                          <Badge color="gray" variant="light" size="sm">
                            Deactivated
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c={textMuted}>
                          {formatDate(u.created_at)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={6} justify="center">
                          {/* Deactivate action */}
                          {isSelf ? (
                            <Tooltip label="You cannot deactivate your own account">
                              <ActionIcon variant="subtle" color="gray" size="sm" disabled>
                                <IconUserX size={16} />
                              </ActionIcon>
                            </Tooltip>
                          ) : !u.is_active ? (
                            <Tooltip label="Account is already deactivated">
                              <ActionIcon variant="subtle" color="gray" size="sm" disabled>
                                <IconUserX size={16} />
                              </ActionIcon>
                            </Tooltip>
                          ) : (
                            <Tooltip label="Deactivate account">
                              <ActionIcon
                                variant="subtle"
                                color="orange"
                                size="sm"
                                onClick={() => setUserToDeactivate(u)}
                              >
                                <IconUserX size={16} />
                              </ActionIcon>
                            </Tooltip>
                          )}

                          {/* Hard Delete action */}
                          {isSelf ? (
                            <Tooltip label="You cannot delete your own account">
                              <ActionIcon variant="subtle" color="gray" size="sm" disabled>
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Tooltip>
                          ) : (
                            <Tooltip label="Permanently delete user account">
                              <ActionIcon
                                variant="subtle"
                                color="red"
                                size="sm"
                                onClick={() => handleOpenDeleteModal(u)}
                              >
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Box>
        </Paper>
      </Box>

      {/* Create User Modal */}
      <Modal
        opened={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        title={
          <Text fw={700} size="lg" c={textPrimary}>
            Create System User
          </Text>
        }
        centered
        radius="md"
      >
        <form onSubmit={handleCreateSubmit}>
          <Stack gap="sm">
            {serverError && (
              <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
                {serverError}
              </Alert>
            )}

            <TextInput
              label="Full Name"
              placeholder="e.g. Priya Sharma"
              required
              leftSection={<IconUser size={16} color="#64748B" />}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              error={createErrors.name}
            />

            <TextInput
              label="Email Address"
              placeholder="name@challango.in"
              required
              leftSection={<IconMail size={16} color="#64748B" />}
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              error={createErrors.email}
            />

            <PasswordInput
              label="Initial Password"
              placeholder="Minimum 6 characters"
              required
              leftSection={<IconLock size={16} color="#64748B" />}
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              error={createErrors.password}
            />

            <Select
              label="Assigned Role"
              required
              value={role}
              data={[
                { value: "staff", label: "Staff (Create, view, export, import)" },
                { value: "admin", label: "Admin (Full access + delete + user management)" },
              ]}
              onChange={(val) => setRole((val as "admin" | "staff") || "staff")}
            />

            <Group justify="flex-end" mt="md" gap="sm">
              <Button variant="default" onClick={handleCloseCreateModal} disabled={createMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" color="blue" loading={createMutation.isPending}>
                Create User
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Deactivate User Confirmation Modal */}
      <Modal
        opened={Boolean(userToDeactivate)}
        onClose={() => setUserToDeactivate(null)}
        title={
          <Text fw={700} c="orange.8" size="md">
            Confirm Account Deactivation
          </Text>
        }
        centered
        radius="md"
      >
        <Stack gap="sm">
          <Alert icon={<IconAlertTriangle size={16} />} color="orange" variant="light">
            Deactivated accounts cannot sign in. Their historical entries and audit associations remain preserved.
          </Alert>

          <Text size="sm">
            Are you sure you want to deactivate <b>{userToDeactivate?.name}</b> (
            <b>{userToDeactivate?.email}</b>)?
          </Text>

          <Group justify="flex-end" mt="md" gap="xs">
            <Button
              variant="default"
              onClick={() => setUserToDeactivate(null)}
              disabled={deactivateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              color="orange"
              loading={deactivateMutation.isPending}
              onClick={() => userToDeactivate && deactivateMutation.mutate(userToDeactivate.id)}
            >
              Deactivate User
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Permanent Hard Delete User Confirmation Modal */}
      <Modal
        opened={Boolean(userToDelete)}
        onClose={() => {
          setUserToDelete(null);
          setDeleteError(null);
        }}
        title={
          <Text fw={700} c="red.7" size="md">
            Permanently Delete User Account
          </Text>
        }
        centered
        radius="md"
      >
        <Stack gap="sm">
          {deleteError ? (
            deleteError.is409 ? (
              <Alert icon={<IconAlertTriangle size={18} />} color="orange" variant="light" title="User Has Associated Records">
                <Text size="sm" mb="sm">
                  {deleteError.message}
                </Text>
                <Button
                  size="xs"
                  color="orange"
                  variant="filled"
                  loading={deactivateMutation.isPending}
                  onClick={() => {
                    if (userToDelete) {
                      deactivateMutation.mutate(userToDelete.id);
                      setUserToDelete(null);
                      setDeleteError(null);
                    }
                  }}
                >
                  Deactivate User Instead
                </Button>
              </Alert>
            ) : (
              <Alert icon={<IconAlertCircle size={18} />} color="red" variant="light" title="Cannot Delete User">
                {deleteError.message}
              </Alert>
            )
          ) : (
            <>
              <Alert icon={<IconAlertTriangle size={18} />} color="red" variant="light">
                This will permanently delete the user account from the database. This action CANNOT be undone.
                Users with associated delivery entries or audit logs cannot be permanently deleted and must be deactivated instead.
              </Alert>

              <Text size="sm">
                Are you sure you want to permanently delete <b>{userToDelete?.name}</b> (
                <b>{userToDelete?.email}</b>)?
              </Text>
            </>
          )}

          <Group justify="flex-end" mt="md" gap="xs">
            <Button
              variant="default"
              onClick={() => {
                setUserToDelete(null);
                setDeleteError(null);
              }}
              disabled={hardDeleteMutation.isPending}
            >
              Cancel
            </Button>
            {!deleteError?.is409 && (
              <Button
                color="red"
                loading={hardDeleteMutation.isPending}
                onClick={() => userToDelete && hardDeleteMutation.mutate(userToDelete.id)}
              >
                Permanently Delete
              </Button>
            )}
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
};
