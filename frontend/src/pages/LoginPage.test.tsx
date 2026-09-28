import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MantineProvider } from "@mantine/core";
import { BrowserRouter } from "react-router-dom";
import { LoginPage } from "./LoginPage";

// Mock AuthContext
const mockLogin = vi.fn();
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    login: mockLogin,
    isLoading: false,
    isAdmin: false,
  }),
}));

const renderLoginPage = () => {
  return render(
    <MantineProvider>
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    </MantineProvider>
  );
};

describe("LoginPage", () => {
  it("renders email and password inputs and sign-in button", () => {
    renderLoginPage();

    expect(screen.getByLabelText(/Email address/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign In/i })).toBeInTheDocument();
  });

  it("validates empty email and empty password on submit", async () => {
    renderLoginPage();

    const form = document.querySelector("form")!;
    fireEvent.submit(form);

    expect(await screen.findByText("Email address is required")).toBeInTheDocument();
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("validates invalid email format", async () => {
    renderLoginPage();

    const emailInput = screen.getByLabelText(/Email address/i);
    const passwordInput = screen.getByPlaceholderText("••••••••");
    const form = document.querySelector("form")!;

    fireEvent.change(emailInput, { target: { value: "invalid-email" } });
    fireEvent.change(passwordInput, { target: { value: "Secret@123" } });
    fireEvent.submit(form);

    expect(await screen.findByText("Please enter a valid email address")).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("calls login with trimmed email and password when valid", async () => {
    renderLoginPage();

    const emailInput = screen.getByLabelText(/Email address/i);
    const passwordInput = screen.getByPlaceholderText("••••••••");
    const form = document.querySelector("form")!;

    fireEvent.change(emailInput, { target: { value: " admin@challango.in " } });
    fireEvent.change(passwordInput, { target: { value: "Admin@123456" } });
    fireEvent.submit(form);

    expect(mockLogin).toHaveBeenCalledWith("admin@challango.in", "Admin@123456");
  });
});
