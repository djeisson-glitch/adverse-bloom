// Config mínima só pra as Regras dos Hooks — roda no build junto do tsc.
// O `npm run lint` completo tem centenas de erros de estilo (no-explicit-any
// etc.) e por isso ninguém roda; este aqui checa APENAS o que quebra em runtime
// e o tsc não pega: hook chamado condicionalmente / depois de early return
// (React #310). Mantém o build barato e o time protegido dessa classe de bug.
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["dist", "node_modules", "supabase"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    // Não reportar `// eslint-disable` de regras que este config não liga
    // (ex.: exhaustive-deps) — senão vira ruído de warning no build.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
    },
  },
];
