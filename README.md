# client-expo Library

A simple React Native Expo component library.

## Installation

```bash
npm install @basictech/expo

```

## Quick Start

### 1. Configure app.json

First, set up your OAuth redirect scheme in `app.json`:

```json
{
  "expo": {
    "scheme": "your-app-scheme",
    "name": "Your App Name"
  }
}
```

### 2. Define Your Database Schema

Create a schema file for your database tables:

```typescript
// src/basic.config.ts

export const schema = {
  project_id: 'YOUR_PROJECT_ID', // Replace with your actual project ID
  version: 1,
  tables: {
    // example table for a notes app
    notes: {
      type: 'collection',
      fields: {
        title: { type: 'string', indexed: true },
        content: { type: 'string' },
        createdAt: { type: 'number', indexed: true },
        completed: { type: 'boolean', indexed: true },
        priority: { type: 'number', indexed: true },
        tags: { type: 'json', indexed: true }
      },
    },
    // Add other tables here
  },
} as const;

```

### 3. Wrap Your App with BasicProvider

Wrap your root component with the `BasicProvider`:

```typescript
// App.tsx (or your root component)
import React from 'react';
import { BasicProvider } from '@basictech/expo';
import { schema } from './src/basic.config.ts';
import MainApp from './MainApp';

export default function App() {
  return (
    <BasicProvider schema={schema} project_id={schema.project_id}>
      <MainApp />
    </BasicProvider>
  );
}
```

## Authentication

### useBasic Hook

The `useBasic` hook provides access to authentication state and database operations:

```typescript
const { 
  user,          // User object: { id, email, username, name }
  isSignedIn,    // Boolean: authentication status
  isLoading,     // Boolean: initial loading state
  login,         // Function: initiate OAuth login flow
  signout,       // Function: sign out and clear tokens
  debugAuth,     // Function: log authentication debug info
  db             // Database SDK instance
} = useBasic();
```

### User Object

When signed in, the `user` object contains:

```typescript
{
  id: string;       // Unique user identifier
  email: string;    // User's email address
  username: string; // User's username
  name: string;     // User's display name
}
```

### Authentication Flow

The SDK handles OAuth2 authentication automatically:

1. **Login**: Redirects to OAuth provider
2. **Token Management**: Automatically refreshes expired access tokens
3. **Secure Storage**: Tokens stored securely (SecureStore on native, encrypted localStorage on web)
4. **Persistent Sessions**: Automatically restores authentication on app restart

### Example Component

```typescript
// ExampleComponent.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, Button, TextInput } from 'react-native';
import { useBasic } from '@basictech/expo';

function ExampleComponent() {
  const { user, login, signout, db, isLoading, isSignedIn } = useBasic();
  const [notes, setNotes] = useState<Array<{id: string, title: string, content: string, createdAt: number }>>([]);
  const [newNoteTitle, setNewNoteTitle] = useState('');

  // Fetch notes when signed in
  useEffect(() => {
    if (isSignedIn && db) {
      const fetchNotes = async () => {
        try {
          const fetchedNotes = await db.from('notes').getAll();
          setNotes(fetchedNotes || []);
        } catch (error) {
          console.error("Failed to fetch notes:", error);
          setNotes([]);
        }
      };
      fetchNotes();
    } else {
      setNotes([]);
    }
  }, [isSignedIn, db]);

  const handleAddNote = async () => {
    if (!db || !newNoteTitle.trim()) return;
    try {
      const newNoteData = {
        title: newNoteTitle,
        content: 'Default content',
        createdAt: Date.now(),
        completed: false,
        priority: 1,
        tags: ['new']
      };
      const addedNote = await db.from('notes').add(newNoteData);
      if (addedNote) {
        setNotes(prev => [...prev, addedNote]);
      }
      setNewNoteTitle('');
    } catch (error) {
      console.error("Failed to add note:", error);
    }
  };

  if (isLoading) {
    return <Text>Loading...</Text>;
  }

  return (
    <View>
      {user ? (
        <>
          <Text>Welcome, {user.name || user.email}!</Text>
          <Button title="Sign Out" onPress={signout} />

          <TextInput
            placeholder="New note title"
            value={newNoteTitle}
            onChangeText={setNewNoteTitle}
          />
          <Button title="Add Note" onPress={handleAddNote} disabled={!newNoteTitle} />

          <Text>Your Notes:</Text>
          {notes.map(note => (
            <Text key={note.id}>{note.title}</Text>
          ))}
        </>
      ) : (
        <Button title="Sign In" onPress={login} />
      )}
    </View>
  );
}

export default ExampleComponent;
```

### Debug Authentication

The `debugAuth` function logs detailed authentication information to the console:

```typescript
const { debugAuth } = useBasic();

// Log authentication state
await debugAuth();

// Console output includes:
// - Authentication status
// - Token information (presence, expiration)
// - User information
// - SDK version
```

This is useful for troubleshooting authentication issues during development.

---

## Real-time Data with `useTable`

The `useTable` hook provides real-time data fetching with automatic polling every second. This is perfect for applications that need to stay synchronized with live data.

```javascript
import React from 'react';
import { View, Text } from 'react-native';
import { useTable } from '@basictech/expo';

function TaskList() {
  const { data: tasks, loading, error } = useTable("tasks");

  if (loading) {
    return <Text>Loading tasks...</Text>;
  }

  if (error) {
    return <Text>Error loading tasks: {error.message}</Text>;
  }

  return (
    <View>
      <Text>Tasks ({tasks.length}):</Text>
      {tasks.map(task => (
        <Text key={task.id}>{task.title}</Text>
      ))}
    </View>
  );
}
```

### Features

- **Automatic Polling**: Data is fetched every 1 second to keep your UI in sync
- **Type Safety**: Full TypeScript support with proper table schema types
- **Error Handling**: Built-in error state management
- **Loading States**: Loading indicator for initial data fetch
- **Automatic Cleanup**: Polling stops when component unmounts

### Usage Notes

- The hook will continue polling as long as the component is mounted
- Initial loading state is `true` until the first successful fetch
- Subsequent updates don't trigger loading state changes
- Use this hook when you need real-time updates; for one-time fetches, use `db.from(table).getAll()` directly

---

## Database Operations

The `db` object provided by the `useBasic` hook allows you to interact with your database tables defined in your schema.

### Basic Operations

#### 1. Fetching Records

**Get all records:**
```javascript
const allNotes = await db.from('notes').getAll();
```

**Get a specific record by ID:**
```javascript
const note = await db.from('notes').get('note-id-here');
```

#### 2. Adding Records

```javascript
const newNote = await db.from('notes').add({
  title: 'My Note',
  content: 'Note content',
  createdAt: Date.now(),
  completed: false,
  priority: 1,
  tags: ['work']
});
```

#### 3. Updating Records

**Update specific fields:**
```javascript
const updatedNote = await db.from('notes').update('note-id-here', {
  completed: true,
  priority: 2
});
```

**Replace entire record:**
```javascript
const replacedNote = await db.from('notes').replace('note-id-here', {
  title: 'Updated Title',
  content: 'New content',
  createdAt: Date.now(),
  completed: true,
  priority: 3,
  tags: ['updated']
});
```

#### 4. Deleting Records

```javascript
const deletedNote = await db.from('notes').delete('note-id-here');
```

### Advanced Querying

#### 1. Filtering

The SDK supports various filtering operations. Note that multiple conditions on different fields are not currently supported.

**Simple equality:**
```javascript
const completedNotes = await db.from('notes')
  .getAll()
  .filter({ completed: true });
```

**Comparison operators:**
```javascript
// Greater than
const highPriority = await db.from('notes')
  .getAll()
  .filter({ priority: { gt: 3 } });

// Less than
const lowPriority = await db.from('notes')
  .getAll()
  .filter({ priority: { lt: 2 } });
```

**Pattern matching:**
```javascript
// Case-sensitive pattern matching
const projectNotes = await db.from('notes')
  .getAll()
  .filter({ title: { like: "Project%" } });

// Case-insensitive pattern matching
const todoNotes = await db.from('notes')
  .getAll()
  .filter({ title: { ilike: "%todo%" } });
```

**IN operator:**
```javascript
const taggedNotes = await db.from('notes')
  .getAll()
  .filter({ tags: { in: ["work", "important"] } });
```

**NOT operator:**
```javascript
const nonWorkNotes = await db.from('notes')
  .getAll()
  .filter({ tags: { not: { eq: "work" } } });
```

#### 2. Ordering

```javascript
// Order by creation date (newest first)
const newestFirst = await db.from('notes')
  .getAll()
  .order("created_at", "desc");

// Order by title (alphabetical)
const alphabetical = await db.from('notes')
  .getAll()
  .order("title");
```

#### 3. Pagination

```javascript
// Get first 10 notes
const firstPage = await db.from('notes')
  .getAll()
  .limit(10);

// Get second page
const secondPage = await db.from('notes')
  .getAll()
  .limit(10)
  .offset(10);
```

### Supported Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equality | `.filter({ status: { eq: "active" } })` |
| `neq` | Not equal | `.filter({ status: { neq: "deleted" } })` |
| `gt` | Greater than | `.filter({ priority: { gt: 3 } })` |
| `gte` | Greater than or equal | `.filter({ priority: { gte: 3 } })` |
| `lt` | Less than | `.filter({ priority: { lt: 3 } })` |
| `lte` | Less than or equal | `.filter({ priority: { lte: 3 } })` |
| `like` | Pattern matching (case sensitive) | `.filter({ title: { like: "%project%" } })` |
| `ilike` | Pattern matching (case insensitive) | `.filter({ title: { ilike: "%todo%" } })` |
| `in` | Value in set | `.filter({ tags: { in: ["work", "important"] } })` |
| `not` | Negation | `.filter({ tags: { not: { eq: "work" } } })` |

### Limitations

1. Multiple conditions on different fields are not currently supported in filters
2. Range filters (e.g., `{ gte: x, lte: y }`) are not supported
3. The order of chaining methods doesn't matter, but all operations must be chained after `getAll()`

### Reserved Fields

The following fields are always available on all records, even if not defined in your schema:
- `id` (string) - The unique identifier for the record
- `created_at` (string) - ISO 8601 timestamp when the record was created

---

## Troubleshooting

### Authentication Issues

**Problem**: "User not authenticated" errors
```typescript
// Check authentication state
const { isSignedIn, debugAuth } = useBasic();
await debugAuth(); // Logs detailed auth info
```

**Problem**: OAuth redirect not working
- Ensure `scheme` in `app.json` matches your configuration
- For web: ensure callback URL is correctly configured
- For native: ensure deep linking is properly set up

### Database Issues

**Problem**: "Table not found" errors
- Verify table name matches schema definition exactly
- Check that schema is properly passed to BasicProvider

**Problem**: Type errors with TypeScript
```typescript
// Use 'as const' in schema definition
export const schema = {
  // ...
} as const;
```

---

## API Reference

### BasicProvider Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `schema` | `DBSchema` | Yes | Your database schema definition |
| `project_id` | `string` | Yes | Your Basic project ID |
| `children` | `ReactNode` | Yes | Your app components |
| `scheme` | `string` | No | Custom OAuth redirect scheme |

### useBasic Hook Returns

| Property | Type | Description |
|----------|------|-------------|
| `user` | `User \| null` | Current user object or null if not signed in |
| `isSignedIn` | `boolean` | Whether user is authenticated |
| `isLoading` | `boolean` | Initial loading state |
| `login` | `() => Promise<void>` | Initiate OAuth login flow |
| `signout` | `() => Promise<void>` | Sign out and clear all tokens |
| `debugAuth` | `() => Promise<void>` | Log authentication debug information |
| `db` | `BasicDBSDK` | Database operations interface |
| `accessToken` | `string \| null` | Current access token (advanced use) |
| `refreshToken` | `string \| null` | Current refresh token (advanced use) |

### useTable Hook Returns

| Property | Type | Description |
|----------|------|-------------|
| `data` | `TableData[]` | Array of records from the table |
| `loading` | `boolean` | Loading state (true until first fetch) |
| `error` | `Error \| null` | Error object if fetch failed |

---

## Support & Resources

- **Documentation**: Full OAuth2 specification available in repository
- **Issues**: Report bugs on GitHub
- **Updates**: Check for new versions regularly (`npm outdated @basictech/expo`)

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history and updates.
