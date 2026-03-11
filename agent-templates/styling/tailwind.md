---
template: styling/tailwind
description: Tailwind CSS styling patterns and utilities
applies_to:
  styling: [tailwind, tailwindcss]
generates: styling-guide.md
---

# {{AGENT_NAME}}: Tailwind CSS Styling Guide

This document defines Tailwind CSS patterns for **{{PROJECT_NAME}}**. All agents implementing UI should follow these conventions.

## Configuration

{{#if PROJECT.styling.version >= '4'}}
**Tailwind v4** — Uses CSS-first configuration.
{{else}}
**Tailwind v3.x** — Uses `tailwind.config.js` configuration.
{{/if}}

{{#if PROJECT.styling.darkMode}}
**Dark Mode:** Enabled using `{{PROJECT.styling.darkMode}}` strategy.
{{else}}
**Dark Mode:** Not configured. Do not use `dark:` variants.
{{/if}}

---

## Utility Class Patterns

### Spacing Scale

Use the standard Tailwind spacing scale consistently:

| Size | Value | Usage |
|------|-------|-------|
| `1` | 0.25rem (4px) | Tight spacing |
| `2` | 0.5rem (8px) | Small gaps |
| `3` | 0.75rem (12px) | Compact padding |
| `4` | 1rem (16px) | Standard padding |
| `6` | 1.5rem (24px) | Section padding |
| `8` | 2rem (32px) | Large spacing |
| `12` | 3rem (48px) | Section gaps |
| `16` | 4rem (64px) | Page sections |

**Examples:**
```html
<div class="p-4">Standard padding</div>
<div class="px-6 py-4">Horizontal/vertical padding</div>
<div class="space-y-4">Vertical stack spacing</div>
<div class="gap-2">Flex/grid gap</div>
```

### Typography

{{#if CONVENTIONS.typography}}
Follow typography conventions from CONVENTIONS.md.
{{else}}
| Element | Classes |
|---------|---------|
| Page title | `text-2xl font-bold` or `text-3xl font-bold` |
| Section heading | `text-xl font-semibold` |
| Subsection | `text-lg font-medium` |
| Body text | `text-base` (default) |
| Small text | `text-sm` |
| Caption | `text-xs text-gray-500` |
{{/if}}

### Color Palette

{{#if PROJECT.styling.colors}}
Use project-defined colors from `tailwind.config.js`:
```html
<div class="bg-primary text-primary-foreground">Primary</div>
<div class="bg-secondary text-secondary-foreground">Secondary</div>
<div class="bg-destructive text-destructive-foreground">Destructive</div>
```
{{else}}
Use semantic gray scale:
```html
<div class="bg-gray-50">Lightest background</div>
<div class="bg-gray-100">Light background</div>
<div class="bg-gray-200">Border/divider</div>
<div class="text-gray-500">Muted text</div>
<div class="text-gray-700">Secondary text</div>
<div class="text-gray-900">Primary text</div>
```

Accent colors:
```html
<div class="bg-blue-500 text-white">Primary action</div>
<div class="bg-green-500 text-white">Success</div>
<div class="bg-red-500 text-white">Error/destructive</div>
<div class="bg-yellow-500 text-black">Warning</div>
```
{{/if}}

---

## Component Patterns

### Buttons

```html
<!-- Primary button -->
<button class="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg 
               hover:bg-blue-700 focus:outline-none focus:ring-2 
               focus:ring-blue-500 focus:ring-offset-2
               disabled:opacity-50 disabled:cursor-not-allowed">
  Primary
</button>

<!-- Secondary button -->
<button class="px-4 py-2 bg-gray-100 text-gray-900 font-medium rounded-lg 
               hover:bg-gray-200 focus:outline-none focus:ring-2 
               focus:ring-gray-500 focus:ring-offset-2">
  Secondary
</button>

<!-- Ghost button -->
<button class="px-4 py-2 text-gray-700 font-medium rounded-lg 
               hover:bg-gray-100 focus:outline-none focus:ring-2 
               focus:ring-gray-500 focus:ring-offset-2">
  Ghost
</button>
```

### Cards

```html
<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
  <h3 class="text-lg font-semibold mb-2">Card Title</h3>
  <p class="text-gray-600">Card content goes here.</p>
</div>

<!-- Clickable card -->
<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6
            hover:shadow-md hover:border-gray-300 transition-all cursor-pointer">
  <h3 class="text-lg font-semibold">Interactive Card</h3>
</div>
```

### Forms

```html
<!-- Text input -->
<div>
  <label class="block text-sm font-medium text-gray-700 mb-1">
    Email
  </label>
  <input type="email" 
         class="w-full px-3 py-2 border border-gray-300 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                placeholder-gray-400" 
         placeholder="you@example.com" />
</div>

<!-- With error -->
<div>
  <label class="block text-sm font-medium text-gray-700 mb-1">
    Email
  </label>
  <input type="email" 
         class="w-full px-3 py-2 border border-red-500 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent" />
  <p class="mt-1 text-sm text-red-600">Please enter a valid email.</p>
</div>

<!-- Select -->
<select class="w-full px-3 py-2 border border-gray-300 rounded-lg
               focus:outline-none focus:ring-2 focus:ring-blue-500">
  <option>Option 1</option>
  <option>Option 2</option>
</select>
```

### Badges/Pills

```html
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
  Active
</span>
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
  Success
</span>
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
  Error
</span>
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
  Default
</span>
```

### Alerts

```html
<!-- Info -->
<div class="p-4 rounded-lg bg-blue-50 border border-blue-200">
  <p class="text-blue-800">Informational message.</p>
</div>

<!-- Success -->
<div class="p-4 rounded-lg bg-green-50 border border-green-200">
  <p class="text-green-800">Success message.</p>
</div>

<!-- Warning -->
<div class="p-4 rounded-lg bg-yellow-50 border border-yellow-200">
  <p class="text-yellow-800">Warning message.</p>
</div>

<!-- Error -->
<div class="p-4 rounded-lg bg-red-50 border border-red-200">
  <p class="text-red-800">Error message.</p>
</div>
```

---

## Layout Patterns

### Container

```html
<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
  <!-- Page content -->
</div>
```

### Flexbox

```html
<!-- Center content -->
<div class="flex items-center justify-center">...</div>

<!-- Space between -->
<div class="flex items-center justify-between">...</div>

<!-- Stack vertically -->
<div class="flex flex-col space-y-4">...</div>

<!-- Responsive row/column -->
<div class="flex flex-col md:flex-row md:items-center gap-4">...</div>
```

### Grid

```html
<!-- 3-column grid -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</div>

<!-- Sidebar layout -->
<div class="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
  <aside>Sidebar</aside>
  <main>Main content</main>
</div>
```

---

## Responsive Design

Use mobile-first breakpoints:

| Prefix | Min Width | Usage |
|--------|-----------|-------|
| (none) | 0px | Mobile default |
| `sm:` | 640px | Large phones |
| `md:` | 768px | Tablets |
| `lg:` | 1024px | Laptops |
| `xl:` | 1280px | Desktops |
| `2xl:` | 1536px | Large screens |

**Example:**
```html
<div class="p-4 md:p-6 lg:p-8">
  <!-- Padding increases with screen size -->
</div>

<div class="hidden md:block">
  <!-- Only visible on tablets and up -->
</div>

<div class="text-sm md:text-base lg:text-lg">
  <!-- Responsive text size -->
</div>
```

---

{{#if PROJECT.styling.darkMode}}
## Dark Mode

Use `dark:` prefix for dark mode variants:

```html
<div class="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  <!-- Adapts to dark mode -->
</div>

<div class="border-gray-200 dark:border-gray-700">
  <!-- Border adapts -->
</div>

<button class="bg-blue-600 hover:bg-blue-700 
               dark:bg-blue-500 dark:hover:bg-blue-600">
  Button
</button>
```

**Dark mode color mapping:**

| Light | Dark |
|-------|------|
| `bg-white` | `dark:bg-gray-900` |
| `bg-gray-50` | `dark:bg-gray-800` |
| `bg-gray-100` | `dark:bg-gray-700` |
| `text-gray-900` | `dark:text-gray-100` |
| `text-gray-700` | `dark:text-gray-300` |
| `text-gray-500` | `dark:text-gray-400` |
| `border-gray-200` | `dark:border-gray-700` |
{{/if}}

---

## Conditional Classes

Use `cn()` or `clsx()` for conditional class application:

```tsx
import { cn } from '@/lib/utils';

<button
  className={cn(
    'px-4 py-2 rounded-lg font-medium',
    variant === 'primary' && 'bg-blue-600 text-white',
    variant === 'secondary' && 'bg-gray-100 text-gray-900',
    disabled && 'opacity-50 cursor-not-allowed'
  )}
>
  Button
</button>
```

---

## State Variants

```html
<!-- Hover -->
<button class="bg-blue-600 hover:bg-blue-700">Hover me</button>

<!-- Focus -->
<input class="focus:ring-2 focus:ring-blue-500 focus:border-transparent" />

<!-- Active -->
<button class="active:scale-95">Press me</button>

<!-- Disabled -->
<button class="disabled:opacity-50 disabled:cursor-not-allowed" disabled>
  Disabled
</button>

<!-- Group hover (parent hover affects children) -->
<div class="group hover:bg-gray-100">
  <span class="text-gray-500 group-hover:text-gray-900">
    Changes when parent hovers
  </span>
</div>
```

---

## Transitions and Animation

```html
<!-- Basic transition -->
<div class="transition-colors duration-200">
  Smooth color change
</div>

<!-- Scale on hover -->
<div class="transition-transform duration-200 hover:scale-105">
  Grows on hover
</div>

<!-- Multiple properties -->
<div class="transition-all duration-300 ease-in-out">
  Transitions everything
</div>

<!-- Built-in animations -->
<div class="animate-spin">Spinning</div>
<div class="animate-pulse">Pulsing</div>
<div class="animate-bounce">Bouncing</div>
```

---

## Accessibility

- Use `sr-only` for screen-reader-only content
- Ensure sufficient color contrast
- Use `focus:ring` for keyboard navigation visibility
- Never remove focus outlines without alternatives

```html
<button class="focus:outline-none focus:ring-2 focus:ring-blue-500">
  Accessible focus
</button>

<span class="sr-only">Additional context for screen readers</span>
```

---

## Custom Theme Values

Check `tailwind.config.js` for project-specific values:

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {...},
        secondary: {...},
      },
      spacing: {
        '18': '4.5rem',
      },
      borderRadius: {
        'xl': '1rem',
      },
    },
  },
};
```

Use custom values: `bg-primary`, `p-18`, `rounded-xl`
