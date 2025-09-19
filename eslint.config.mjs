import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Override for generated database types file
    files: ["src/lib/database.types.ts"],
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-explicit-any": "off"
    }
  },
  {
    // Strict rules for application code
    files: ["**/*.tsx", "**/*.ts"],
    ignores: ["src/lib/database.types.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "react/no-unescaped-entities": "error"
    }
  }
];

export default eslintConfig;
