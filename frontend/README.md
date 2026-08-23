# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Produção: API e sessão

Em produção, o cliente chama a API pelo prefixo same-origin `/api`. A primeira
regra de rewrite em `vercel.json` encaminha esse prefixo ao backend oficial
antes do fallback da SPA. O refresh pelo cookie HttpOnly é sempre a primeira
tentativa depois de reload. Como alguns navegadores não persistem esse cookie
quando ele retorna por rewrite externo, o access token também fica em
`sessionStorage` apenas na aba atual; ele nunca é gravado em `localStorage`.

Esse fallback permite reload na mesma aba, não é compartilhado entre abas e é
apagado em logout/limpeza de sessão. O tradeoff é que, durante a vida da aba,
o token permanece acessível ao JavaScript: a aplicação mantém CSP restritiva,
não registra tokens e prefere o refresh HttpOnly sempre que disponível. Quando
o refresh falha por ausência do cookie, a revogação baseada somente nele só
prevalece quando o access token expira ou é rejeitado pelo backend.

Após a publicação dessa mudança, usuários com cookie emitido no host anterior
precisam entrar uma vez. A validação de release deve confirmar no DevTools que
login e refresh usam `/api/auth/*` e que um reload em rota protegida mantém a
sessão. Não registrar nem copiar valores de cookies ou tokens durante essa
verificação.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
