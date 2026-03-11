# React Coding Guidelines

These are guidelines, not rigid rules. Always defer to the project's existing patterns and conventions when they conflict with anything below.

## Components

- Use **functional components** with hooks. Do not use class components.
- Keep components small and focused on a single responsibility. If a component is doing too much, split it.
- One component per file. The filename must match the component name (`UserProfile.tsx` exports `UserProfile`).
- Use **PascalCase** for component names.
- Use **fragments** (`<>...</>`) to avoid unnecessary wrapper `<div>` elements.

## Props

- Define props with a **TypeScript interface** (or `PropTypes` in JS projects). Name it `Props`.
- Destructure props in the function signature.

```tsx
interface Props {
  name: string;
  email: string;
  onSelect: (id: string) => void;
}

function UserCard({ name, email, onSelect }: Props) {
  // ...
}
```

## State Management

- Manage state at the lowest component level that needs it. Lift state up only when sibling components must share it.
- Use `useState` for simple local state. Use `useReducer` when state transitions are complex or interdependent.
- Do not reach for global state (Context, Redux, Zustand, etc.) when local state or prop drilling through one or two levels is sufficient.

## Custom Hooks

- Extract reusable or complex logic into custom hooks (`use` prefix, e.g. `useAuth`, `usePagination`).
- A custom hook should have a single clear purpose.

## Performance

- Do **not** wrap components in `React.memo` or use `useMemo`/`useCallback` preemptively. Apply these only when you have identified a measured performance problem.
- Avoid creating new objects, arrays, or functions inside render when they are passed as props to memoized children — but only if memoization is already in use.

## Event Handlers

- Prefix event handler functions with `handle` (e.g. `handleClick`, `handleSubmit`, `handleInputChange`).
- Prefix callback props with `on` (e.g. `onClick`, `onSubmit`, `onChange`).

## Keys

- Use **stable, unique identifiers** for the `key` prop (database IDs, UUIDs, etc.).
- Do not use array indices as keys unless the list is static and will never be reordered, filtered, or modified.

## Forms

- Use **controlled components** for form inputs. Bind input values to state and update via `onChange`.
- Avoid uncontrolled components (`ref`-based access) unless there is a specific reason (e.g. integrating with a non-React library).

## UI States

- Handle **loading**, **error**, and **empty** states explicitly. Do not render components in an undefined or partially loaded state.

```tsx
if (isLoading) return <Spinner />;
if (error) return <ErrorMessage error={error} />;
if (items.length === 0) return <EmptyState />;
return <ItemList items={items} />;
```

## Styling

- Do not use inline styles. Use the project's established styling solution (CSS modules, Tailwind, styled-components, etc.).
- If no convention exists, prefer CSS modules or the approach closest to the rest of the codebase.

## Exports

- Prefer **named exports** over default exports for components.

## Visual Verification

**Any change that affects user-visible UI must be visually verified before committing.** Unit tests and TypeScript checks are not sufficient — they do not catch layout overflow, misalignment, clipping, or styling regressions.

### When Visual Verification Is Required

- Adding or modifying components that render to the DOM
- Changing styles, spacing, padding, or layout
- Adding icons, buttons, or interactive elements
- Modifying dropdowns, modals, tooltips, or popovers
- Dark mode styling changes
- Responsive layout changes

### How to Verify

1. **Take a screenshot** of the affected component(s) using the `qa-explorer` agent or the screenshot skill
2. **Review the screenshot** yourself — do not rely solely on the agent's report
3. **Check all states**: hover, active, disabled, loading, error, empty
4. **Check edge cases**: long text, many items, small viewports
5. **Check both themes** if dark mode is supported

### What to Look For

- Text truncation or overflow
- Elements bleeding outside containers
- Misaligned icons or buttons
- Broken spacing or padding
- Contrast issues in dark mode
- Clipped content at viewport edges

### Example Workflow

```
1. Make UI change
2. Run tests (they should pass, but this is not enough)
3. Run TypeScript check
4. Take screenshot with qa-explorer agent
5. VIEW THE SCREENSHOT yourself
6. If issues found, fix and repeat from step 1
7. Only commit when visual inspection passes
```

**Do not skip visual verification.** A screenshot takes seconds; fixing a bug reported by a user after deployment takes much longer.
