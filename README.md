# client-expo Library

A simple React Native Expo component library.

## Installation

```bash
npm install @basictech/expo
# or
yarn add @basictech/expo
# or if published:
# npm install client-expo
```

## Usage

First, you need to define your database schema.

```typescript
// src/schema.ts

export const schema = {
  project_id: 'YOUR_PROJECT_ID', // Replace with your actual project ID
  version: 1,
  tables: {
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
};

// Infer the type for use with the hook
export type AppSchema = typeof schema;

```

Next, wrap your application's root component (e.g., `App.tsx`) with the `BasicProvider`. Make sure to configure your redirect URI scheme in `app.json`.

```javascript
// App.tsx (or your root component)
import React from 'react';
import { BasicProvider } from '@basictech/expo'; // Adjust import path if needed
import { schema } from './schema'; // Import your schema
import MainApp from './MainApp'; // Your main application component

export default function App() {
  // Ensure 'your-app-scheme' matches the scheme in your app.json
  // under expo.scheme
  return (
    <BasicProvider schema={schema} project_id={schema.project_id}>
      <MainApp />
    </BasicProvider>
  );
}
```

Then, you can use the `useBasic` hook within your components to access authentication status, user information, login/logout functions, and the database client.

```javascript
// ExampleComponent.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, Button, TextInput } from 'react-native';
import { useBasic } from '@basictech/expo'; // Adjust import path
import { AppSchema } from './schema'; // Import your schema type

function ExampleComponent() {
  const { user, login, signout, db, isLoading, isSignedIn } = useBasic<AppSchema>();
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

## Using the Database (`db`)

The `db` object provided by the `useBasic` hook is an instance of `BasicDBSDK` and allows you to interact with your database collections/tables defined in your schema.

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

The following fields are always available, even if not defined in your schema:
- `id` - The unique identifier for the record
- `created_at` - The timestamp when the record was created
