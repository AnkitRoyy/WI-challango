import React, { useState, useEffect } from "react";
import {
  Paper,
  TextInput,
  PasswordInput,
  Button,
  Title,
  Text,
  Container,
  Group,
  Alert,
  Box,
  ActionIcon,
  useMantineColorScheme,
} from "@mantine/core";
import {
  IconMail,
  IconLock,
  IconAlertCircle,
  IconTruckDelivery,
  IconSun,
  IconMoon,
  IconShieldLock,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useDarkTokens } from "../utils/useDarkTokens";
import { useCapacitorNative } from "../utils/useCapacitorNative";

export const LoginPage: React.FC = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const { toggleColorScheme } = useMantineColorScheme();
  const t = useDarkTokens();

  // Native status bar & back button handling
  useCapacitorNative();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // If already logged in, redirect to /entries
  useEffect(() => {
    if (user) {
      navigate("/entries", { replace: true });
    }
  }, [user, navigate]);

  const validate = (): boolean => {
    let isValid = true;
    setEmailError(null);
    setPasswordError(null);

    const emailTrimmed = email.trim();
    if (!emailTrimmed) {
      setEmailError("Email address is required");
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      setEmailError("Please enter a valid email address");
      isValid = false;
    }

    if (!password) {
      setPasswordError("Password is required");
      isValid = false;
    }

    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validate()) {
      return;
    }

    setIsLoading(true);
    try {
      await login(email.trim(), password);
      navigate("/entries", { replace: true });
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        (err?.response?.status === 401
          ? "Incorrect email or password."
          : "An error occurred while signing in. Please check your connection.");
      setServerError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: t.isDark
          ? "radial-gradient(ellipse at 50% -10%, #1E3A8A 0%, #0B1329 45%, #000000 85%)"
          : "radial-gradient(ellipse at 50% -10%, #DBEAFE 0%, #EFF6FF 45%, #F8FAFC 85%)",
        padding: "1.5rem 1rem",
        position: "relative",
      }}
    >
      {/* Theme Toggle Button in top right */}
      <ActionIcon
        variant="default"
        size="lg"
        radius="md"
        onClick={() => toggleColorScheme()}
        aria-label="Toggle color scheme"
        style={{
          position: "absolute",
          top: "1rem",
          right: "1rem",
          borderColor: t.border,
          backgroundColor: t.surface,
          boxShadow: t.isDark ? "0 2px 8px rgba(0,0,0,0.5)" : "0 2px 8px rgba(0,0,0,0.06)",
        }}
      >
        {t.isDark ? <IconSun size={18} color="#FBBF24" /> : <IconMoon size={18} color={t.textSecondary} />}
      </ActionIcon>

      <Container size={420} w="100%">
        {/* Brand Header */}
        <Box ta="center" mb="xl">
          <Group justify="center" gap="xs" mb="sm">
            <Box
              style={{
                backgroundColor: t.accent,
                color: "#FFFFFF",
                padding: "12px",
                borderRadius: "14px",
                display: "inline-flex",
                boxShadow: "0 8px 24px rgba(37, 99, 235, 0.4)",
              }}
            >
              <IconTruckDelivery size={34} stroke={1.8} />
            </Box>
          </Group>
          <Title
            order={1}
            fw={800}
            fz={{ base: 26, sm: 30 }}
            c={t.textPrimary}
            style={{ letterSpacing: "-0.5px" }}
          >
            WI - ChallanGo
          </Title>
          <Text c={t.textSecondary} size="sm" mt={4} fw={500}>
            Challan Data Manager & Delivery Tracker
          </Text>
        </Box>

        {/* Login Card */}
        <Paper
          withBorder
          shadow="xl"
          p={{ base: "xl", sm: 32 }}
          radius="lg"
          style={{
            backgroundColor: t.surface,
            borderColor: t.border,
            boxShadow: t.isDark
              ? "0 20px 40px -15px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.06)"
              : "0 20px 40px -15px rgba(15, 23, 42, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.04)",
          }}
        >
          <Title order={2} size="h3" fw={700} c={t.textPrimary} ta="center" mb={6}>
            Welcome back
          </Title>
          <Text c={t.textSecondary} size="sm" ta="center" mb="xl">
            Enter your credentials to access delivery records
          </Text>

          {serverError && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              title="Authentication Failed"
              color="red"
              variant="light"
              mb="md"
              radius="md"
              styles={{
                root: {
                  backgroundColor: t.isDark ? "rgba(220, 38, 38, 0.15)" : "#FEF2F2",
                  borderColor: t.isDark ? "rgba(220, 38, 38, 0.3)" : "#FECACA",
                },
              }}
            >
              {serverError}
            </Alert>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <TextInput
              label="Email address"
              placeholder="name@challango.in"
              required
              size="md"
              leftSection={<IconMail size={18} color={t.textMuted} />}
              value={email}
              onChange={(e) => {
                setEmail(e.currentTarget.value);
                if (emailError) setEmailError(null);
              }}
              error={emailError}
              mb="md"
              autoComplete="email"
              disabled={isLoading}
              styles={{
                input: {
                  backgroundColor: t.isDark ? "#1A1A1A" : "#FFFFFF",
                  borderColor: t.border,
                  color: t.textPrimary,
                },
                label: {
                  color: t.textPrimary,
                  fontWeight: 600,
                  fontSize: 13,
                  marginBottom: 6,
                },
              }}
            />

            <PasswordInput
              label="Password"
              placeholder="••••••••"
              required
              size="md"
              leftSection={<IconLock size={18} color={t.textMuted} />}
              value={password}
              onChange={(e) => {
                setPassword(e.currentTarget.value);
                if (passwordError) setPasswordError(null);
              }}
              error={passwordError}
              mb="xl"
              autoComplete="current-password"
              disabled={isLoading}
              styles={{
                input: {
                  backgroundColor: t.isDark ? "#1A1A1A" : "#FFFFFF",
                  borderColor: t.border,
                  color: t.textPrimary,
                },
                label: {
                  color: t.textPrimary,
                  fontWeight: 600,
                  fontSize: 13,
                  marginBottom: 6,
                },
              }}
            />

            <Button
              type="submit"
              fullWidth
              size="md"
              radius="md"
              loading={isLoading}
              style={{
                backgroundColor: t.accent,
                boxShadow: "0 4px 14px rgba(37, 99, 235, 0.35)",
                fontWeight: 600,
                height: 44,
              }}
            >
              Sign In
            </Button>
          </form>

          {/* Secure badge footer */}
          <Group justify="center" gap={6} mt="xl" pt="xs">
            <IconShieldLock size={14} color={t.textMuted} />
            <Text size="xs" c={t.textMuted} fw={500}>
              Encrypted & secure connection
            </Text>
          </Group>
        </Paper>
      </Container>
    </Box>
  );
};
