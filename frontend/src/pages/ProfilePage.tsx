import React, { useState, useEffect } from "react";
import {
  Container,
  Paper,
  Title,
  Text,
  Group,
  Stack,
  TextInput,
  Button,
  Badge,
  Box,
  Divider,
  SimpleGrid,
  ThemeIcon,
  Card,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconUser,
  IconPhone,
  IconCheck,
  IconAlertCircle,
  IconShield,
  IconBuildingSkyscraper,
  IconDeviceFloppy,
  IconHash,
} from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { useDarkTokens } from "../utils/useDarkTokens";
import { getCompanyPhoneApi, updateCompanyPhoneApi } from "../api/parties";
import { fetchChallanSettingsApi, updateChallanSettingsApi } from "../api/entries";

export const ProfilePage: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const t = useDarkTokens();
  const queryClient = useQueryClient();

  // Company Phone Setting
  const { data: companyPhoneData, isLoading: isLoadingPhone } = useQuery({
    queryKey: ["company-phone"],
    queryFn: () => getCompanyPhoneApi(),
  });

  // Challan Sequence Setting
  const { data: challanSettings, isLoading: isLoadingChallan } = useQuery({
    queryKey: ["challan-settings"],
    queryFn: () => fetchChallanSettingsApi(),
  });

  const [companyPhone, setCompanyPhone] = useState("9034218483");
  const [startingChallanNo, setStartingChallanNo] = useState("1");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (companyPhoneData !== undefined) {
      setCompanyPhone(companyPhoneData || "9034218483");
    }
  }, [companyPhoneData]);

  useEffect(() => {
    if (challanSettings?.wi_initial_challan_no !== undefined) {
      setStartingChallanNo(challanSettings.wi_initial_challan_no || "1");
    }
  }, [challanSettings]);

  const handleSaveCompanySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyPhone.trim()) {
      notifications.show({
        title: "Validation Error",
        message: "Company phone number cannot be empty.",
        color: "red",
        icon: <IconAlertCircle size={18} />,
      });
      return;
    }

    setIsSaving(true);
    try {
      await updateCompanyPhoneApi(companyPhone.trim());
      if (startingChallanNo.trim()) {
        await updateChallanSettingsApi(startingChallanNo.trim());
      }

      queryClient.invalidateQueries({ queryKey: ["company-phone"] });
      queryClient.invalidateQueries({ queryKey: ["challan-settings"] });

      notifications.show({
        title: "Settings Saved",
        message: "Company contact phone and starting challan sequence updated successfully.",
        color: "green",
        icon: <IconCheck size={18} />,
      });
    } catch (err: any) {
      notifications.show({
        title: "Update Failed",
        message: err?.response?.data?.detail || "Could not save company settings.",
        color: "red",
        icon: <IconAlertCircle size={18} />,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Box>
          <Group gap="xs" align="center">
            <ThemeIcon size={38} radius="md" color="blue" variant="light">
              <IconUser size={22} />
            </ThemeIcon>
            <Box>
              <Title order={2} c={t.textPrimary}>
                My Profile &amp; Settings
              </Title>
              <Text size="xs" c={t.textSecondary}>
                Manage your user account credentials and company challan configurations
              </Text>
            </Box>
          </Group>
        </Box>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {/* User Account Details */}
          <div>
            <Paper
              p="lg"
              radius="md"
              withBorder
              style={{
                backgroundColor: t.surface,
                borderColor: t.border,
                height: "100%",
              }}
            >
              <Stack gap="md">
                <Group gap="sm" align="center">
                  <ThemeIcon size={46} radius="50%" color="blue" variant="filled">
                    <IconUser size={24} />
                  </ThemeIcon>
                  <Box style={{ overflow: "hidden" }}>
                    <Text fw={700} size="md" c={t.textPrimary} lineClamp={1}>
                      {user?.name || "User"}
                    </Text>
                    <Text size="xs" c={t.textSecondary} lineClamp={1}>
                      {user?.email || "user@challango.com"}
                    </Text>
                  </Box>
                </Group>

                <Divider color={t.border} />

                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text size="xs" c={t.textSecondary} fw={500}>
                      Role
                    </Text>
                    <Badge color={isAdmin ? "blue" : "teal"} size="sm" tt="uppercase">
                      {user?.role || "STAFF"}
                    </Badge>
                  </Group>

                  <Group justify="space-between">
                    <Text size="xs" c={t.textSecondary} fw={500}>
                      Account Status
                    </Text>
                    <Badge color="green" variant="light" size="sm">
                      Active
                    </Badge>
                  </Group>

                  <Group justify="space-between">
                    <Text size="xs" c={t.textSecondary} fw={500}>
                      User ID
                    </Text>
                    <Text size="xs" ff="monospace" c={t.textPrimary}>
                      #{user?.id ?? "—"}
                    </Text>
                  </Group>
                </Stack>

                <Card
                  p="xs"
                  radius="sm"
                  style={{
                    backgroundColor: t.surfaceRaised,
                    border: `1px solid ${t.border}`,
                  }}
                  mt="sm"
                >
                  <Group gap="xs" wrap="nowrap" align="flex-start">
                    <IconShield size={16} color="#3B82F6" style={{ marginTop: 2, flexShrink: 0 }} />
                    <Text size="11px" c={t.textSecondary} style={{ lineHeight: 1.4 }}>
                      {isAdmin
                        ? "You are logged in with Administrator privileges. You have full access to company phone configuration, audit logs, and catalog settings."
                        : "You are logged in with Staff privileges. You can view, create, and print delivery challans."}
                    </Text>
                  </Group>
                </Card>
              </Stack>
            </Paper>
          </div>

          {/* Company & Challan Settings */}
          <div>
            <Paper
              p="lg"
              radius="md"
              withBorder
              style={{
                backgroundColor: t.surface,
                borderColor: t.border,
              }}
            >
              <Stack gap="md">
                <Group gap="xs" align="center">
                  <ThemeIcon size={32} radius="md" color="teal" variant="light">
                    <IconBuildingSkyscraper size={18} />
                  </ThemeIcon>
                  <Box>
                    <Text fw={700} size="sm" c={t.textPrimary}>
                      Company Challan Configuration
                    </Text>
                    <Text size="xs" c={t.textSecondary}>
                      Variable settings printed on all delivery challans
                    </Text>
                  </Box>
                </Group>

                <Divider color={t.border} />

                {isAdmin ? (
                  <form onSubmit={handleSaveCompanySettings}>
                    <Stack gap="sm">
                      <TextInput
                        label="Company Phone Number"
                        description="This phone number is printed on all delivery challans as the company contact phone."
                        placeholder="e.g. 9034218483"
                        leftSection={<IconPhone size={16} />}
                        value={companyPhone}
                        onChange={(e) => setCompanyPhone(e.currentTarget.value)}
                        disabled={isLoadingPhone || isSaving}
                        required
                      />

                      <TextInput
                        label="Base Starting Challan Sequence"
                        description="Starting variable for company series increments (e.g. 1 or WI-001)."
                        placeholder="e.g. 1"
                        leftSection={<IconHash size={16} />}
                        value={startingChallanNo}
                        onChange={(e) => setStartingChallanNo(e.currentTarget.value)}
                        disabled={isLoadingChallan || isSaving}
                      />

                      <Group justify="flex-end" mt="xs">
                        <Button
                          type="submit"
                          color="blue"
                          leftSection={<IconDeviceFloppy size={16} />}
                          loading={isSaving}
                        >
                          Save Profile Settings
                        </Button>
                      </Group>
                    </Stack>
                  </form>
                ) : (
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <Text size="xs" c={t.textSecondary}>
                        Company Contact Phone:
                      </Text>
                      <Text size="xs" fw={600} ff="monospace" c={t.textPrimary}>
                        {companyPhoneData || "9034218483"}
                      </Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="xs" c={t.textSecondary}>
                        Starting Challan No:
                      </Text>
                      <Text size="xs" fw={600} ff="monospace" c={t.textPrimary}>
                        {challanSettings?.wi_initial_challan_no || "1"}
                      </Text>
                    </Group>
                    <Text size="11px" c="dimmed" mt="xs">
                      Contact an administrator to change company profile settings.
                    </Text>
                  </Stack>
                )}
              </Stack>
            </Paper>

            {/* Static Company Identity Information */}
            <Paper
              p="md"
              mt="md"
              radius="md"
              withBorder
              style={{
                backgroundColor: t.surface,
                borderColor: t.border,
              }}
            >
              <Stack gap="xs">
                <Text fw={700} size="xs" c={t.textSecondary} tt="uppercase">
                  Registered Business Entity
                </Text>
                <Group justify="space-between">
                  <Text size="xs" c={t.textSecondary}>Name:</Text>
                  <Text size="xs" fw={600} c={t.textPrimary}>WEST Industries</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="xs" c={t.textSecondary}>Address:</Text>
                  <Text size="xs" c={t.textPrimary}>ASHRAWAD KHURD K NO 39 INDORE INDORE</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="xs" c={t.textSecondary}>GSTIN:</Text>
                  <Text size="xs" fw={600} ff="monospace" c="#2563EB">23ACAPY4180D1ZS</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="xs" c={t.textSecondary}>Email:</Text>
                  <Text size="xs" c={t.textPrimary}>rishi.west@hotmail.com</Text>
                </Group>
              </Stack>
            </Paper>
          </div>
        </SimpleGrid>
      </Stack>
    </Container>
  );
};
