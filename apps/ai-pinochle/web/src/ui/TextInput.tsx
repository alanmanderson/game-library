import { forwardRef, type InputHTMLAttributes } from "react";
import styles from "./TextInput.module.css";

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  function TextInput({ className, ...rest }, ref) {
    const classes = [styles.input, className ?? ""].filter(Boolean).join(" ");
    return <input ref={ref} className={classes} {...rest} />;
  },
);
