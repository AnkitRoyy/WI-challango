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
  Divider,
  Badge,
} from "@mantine/core";
import { IconMail, IconLock, IconAlertCircle, IconTruckDelivery } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export const LoginPage: React.FC = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();

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
      // Backend returns 401 with generic "Incorrect email or password"
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

  const handleFillCredentials = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setEmailError(null);
    setPasswordError(null);
    setServerError(null);
  };

  return (
    <Box
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)",
        padding: "1rem",
      }}
    >
      <Container size={440} w="100%">
        {/* Brand Header */}
        <Box ta="center" mb="xl">
          <Group justify="center" gap="xs" mb="xs">
            <Box
              style={{
                backgroundColor: "#2563EB",
                color: "white",
                padding: "10px",
                borderRadius: "12px",
                display: "inline-flex",
                boxShadow: "0 4px 14px rgba(37, 99, 235, 0.4)",
              }}
            >
              <IconTruckDelivery size={32} />
            </Box>
          </Group>
          <Title order={1} c="white" fw={800} fz={{ base: 26, sm: 30 }} style={{ letterSpacing: "-0.5px" }}>
            ChallanGo
          </Title>
          <Text c="#94A3B8" size="sm" mt={4}>
            Challan Data Manager & Delivery Tracker
          </Text>
        </Box>

        {/* Login Card */}
        <Paper
          withBorder
          shadow="xl"
          p={{ base: "lg", sm: "xl" }}
          radius="lg"
          style={{
            backgroundColor: "#FFFFFF",
            borderColor: "#E2E8F0",
          }}
        >
          <Title order={2} size="h3" fw={700} c="#0F172A" ta="center" mb="xs">
            Welcome back
          </Title>
          <Text c="#64748B" size="sm" ta="center" mb="lg">
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
              leftSection={<IconMail size={18} color="#64748B" />}
              value={email}
              onChange={(e) => {
                setEmail(e.currentTarget.value);
                if (emailError) setEmailError(null);
              }}
              error={emailError}
              mb="md"
              autoComplete="email"
              disabled={isLoading}
            />

            <PasswordInput
              label="Password"
              placeholder="••••••••"
              required
              size="md"
              leftSection={<IconLock size={18} color="#64748B" />}
              value={password}
              onChange={(e) => {
                setPassword(e.currentTarget.value);
                if (passwordError) setPasswordError(null);
              }}
              error={passwordError}
              mb="xl"
              autoComplete="current-password"
              disabled={isLoading}
            />

            <Button
              type="submit"
              fullWidth
              size="md"
              radius="md"
              color="blue"
              loading={isLoading}
              style={{
                boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
              }}
            >
              Sign In
            </Button>
          </form>

          <Divider my="lg" label="Quick Demo Fill" labelPosition="center" />

          {/* Quick Demo Credentials for Evaluation */}
          <Group justify="center" gap="xs">
            <Button
              variant="light"
              color="blue"
              size="xs"
              radius="md"
              onClick={() => handleFillCredentials("admin@challango.in", "Admin@123456")}
              disabled={isLoading}
            >
              Admin Demo
            </Button>
            <Button
              variant="light"
              color="teal"
              size="xs"
              radius="md"
              onClick={() => handleFillCredentials("staff@challango.in", "Staff@123456")}
              disabled={isLoading}
            >
              Staff Demo
            </Button>
          </Group>

          <Group justify="center" gap={6} mt="md">
            <Text size="xs" c="#64748B">
              Default password:
            </Text>
            <Badge size="xs" variant="outline" color="gray">Admin@123456</Badge>
          </Group>
        </Paper>
      </Container>
    </Box>
  );
};
