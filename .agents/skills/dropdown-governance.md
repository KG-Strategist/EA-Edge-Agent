---
description: How to implement consistent dropdown inputs across forms
---

# Dropdown UI Governance Standard

All category-based form dropdown fields in the EA Edge Agent MUST follow the centralized governance pattern. **No hardcoded static arrays** are permitted for dropdown options.

## Required Pattern

### 1. Register the category type in `src/lib/constants.ts`
```typescript
export const MASTER_CATEGORY_TYPES = {
  // ... existing types
  'Your New Category': 'Your New Category'
} as const;
```

### 2. Seed default values in `src/lib/seedData.ts`
```typescript
{ type: 'Your New Category', name: 'Option A', isActive: true },
{ type: 'Your New Category', name: 'Option B', isActive: true },
```

### 3. Use `useMasterData()` hook + `CreatableDropdown` in the form component
```tsx
import CreatableDropdown from '../ui/CreatableDropdown';
import { useMasterData } from '../../hooks/useMasterData';

// Inside the component:
const myOptions = useMasterData('Your New Category');

// In the JSX form:
<CreatableDropdown
  value={selectedValue || null}
  onChange={(val) => setSelectedValue(val)}
  options={myOptions.map(o => ({ label: o.name, value: o.name }))}
  categoryType="Your New Category"
  placeholder="Select or create..."
/>
```

### 4. Use `hidden input` for form data submission
```tsx
<input type="hidden" name="fieldName" value={selectedValue} />
```

## Why This Matters
- Users can create new dropdown values inline without leaving the form
- All values are persisted in the centralized `master_categories` Dexie table
- The Master Categories admin tab provides a single pane of glass for all reference data
- Dark mode consistency is maintained through the shared `reactSelectClassNames`
- New categories automatically appear in all forms that reference them

## Anti-Patterns (DO NOT)
- ❌ Hardcoded `<option>` tags inside `<select>` elements
- ❌ Static arrays like `const OPTIONS = [{ label: 'X', value: 'X' }]`
- ❌ Direct `react-select` with inline `styles={{}}` objects
- ❌ Using `Select` from `react-select` when the field represents a Master Category
