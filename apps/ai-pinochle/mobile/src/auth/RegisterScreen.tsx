import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import type { AuthResponse, FieldErrors } from "@pinochle/shared";
import { validate } from "@pinochle/shared";
import { ApiError, post } from "../api/client";
import { useAuth } from "./AuthContext";

export function RegisterScreen() {
  const { login } = useAuth();

  const [mode, setMode] = useState<"register" | "login">("register");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === "register";

  async function handleSubmit() {
    setServerError("");

    const errors = validate(
      email,
      password,
      isRegister ? firstName : undefined,
    );
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const endpoint = mode === "register" ? "/auth/register" : "/auth/login";
      const body = isRegister
        ? { first_name: firstName, last_name: lastName, email, password }
        : { email, password };
      const res = await post<AuthResponse>(endpoint, body);
      login(res.access_token, {
        id: res.id,
        username: res.username,
        first_name: res.first_name,
        last_name: res.last_name,
        email: res.email,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.detail);
      } else {
        setServerError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode() {
    setMode(mode === "register" ? "login" : "register");
    setFieldErrors({});
    setServerError("");
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.form}>
          <Text style={styles.title}>
            {isRegister ? "Create Account" : "Sign In"}
          </Text>

          {isRegister && (
            <>
              <Text style={styles.label}>First Name</Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                autoCorrect={false}
                placeholder="First name"
                placeholderTextColor="#888"
              />
              {fieldErrors.first_name && (
                <Text style={styles.fieldError}>{fieldErrors.first_name}</Text>
              )}

              <Text style={styles.label}>Last Name</Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                autoCorrect={false}
                placeholder="Last name (optional)"
                placeholderTextColor="#888"
              />
            </>
          )}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="you@example.com"
            placeholderTextColor="#888"
          />
          {fieldErrors.email && (
            <Text style={styles.fieldError}>{fieldErrors.email}</Text>
          )}

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder={isRegister ? "Min 8 characters" : "Your password"}
            placeholderTextColor="#888"
          />
          {fieldErrors.password && (
            <Text style={styles.fieldError}>{fieldErrors.password}</Text>
          )}

          {serverError !== "" && (
            <Text style={styles.serverError}>{serverError}</Text>
          )}

          <TouchableOpacity
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Text style={styles.buttonText}>
              {submitting
                ? isRegister
                  ? "Creating account..."
                  : "Signing in..."
                : isRegister
                  ? "Register"
                  : "Sign In"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.switchButton} onPress={switchMode}>
            <Text style={styles.switchText}>
              {isRegister
                ? "Already have an account? Sign in"
                : "Need an account? Register"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fafafa",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  form: {
    width: "100%",
    maxWidth: 400,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#213547",
    marginBottom: 24,
    textAlign: "center",
  },
  label: {
    fontSize: 14,
    color: "#555",
    marginBottom: 4,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#fff",
    color: "#213547",
  },
  fieldError: {
    color: "#d32f2f",
    fontSize: 12,
    marginTop: 4,
  },
  serverError: {
    color: "#d32f2f",
    fontSize: 14,
    marginTop: 12,
    textAlign: "center",
    backgroundColor: "#fce4ec",
    padding: 8,
    borderRadius: 4,
  },
  button: {
    backgroundColor: "#4a90d9",
    borderRadius: 6,
    padding: 14,
    alignItems: "center",
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  switchButton: {
    marginTop: 16,
    alignItems: "center",
    padding: 8,
  },
  switchText: {
    color: "#4a90d9",
    fontSize: 14,
  },
});
