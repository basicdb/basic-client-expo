# client-expo Library

A simple React Native Expo component library.

## Installation

```bash
npm install <path-to-client-expo> # or yarn add <path-to-client-expo>
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
        title: { type: 'string' },
        content: { type: 'string' },
        createdAt: { type: 'number', indexed: true },
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
    <BasicProvider<AppSchema> schema={schema} project_id={schema.project_id}>
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
  const [notes, setNotes] = useState<Array<{id: string, title: string, content: string, createdAt: number }>>([]); // Assuming structure
  const [newNoteTitle, setNewNoteTitle] = useState('');

  // Fetch notes when signed in
  useEffect(() => {
    if (isSignedIn && db) {
      const fetchNotes = async () => {
        try {
          // Access the 'notes' table and fetch all notes
          const fetchedNotes = await db.from('notes').getAll();
          setNotes(fetchedNotes || []); // Ensure fetchedNotes is not null/undefined
        } catch (error) {
          console.error("Failed to fetch notes:", error);
          setNotes([]); // Clear notes on error
        }
      };
      fetchNotes();
    } else {
      setNotes([]); // Clear notes if not signed in or db is not available
    }
  }, [isSignedIn, db]);

  const handleAddNote = async () => {
    if (!db || !newNoteTitle.trim()) return;
    try {
      const newNoteData = {
        title: newNoteTitle,
        content: 'Default content', // Add other fields as needed
        createdAt: Date.now(),
      };
      // Add the new note
      const addedNote = await db.from('notes').add(newNoteData);
      if (addedNote) {
        // @ts-ignore
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
            <Text key={note.id}>{note.title}</Text> // Assuming notes have an 'id' field
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

Here are some common operations:

### Using the hook

To work with a specific collection (or table), use the `from()` method with the name of the collection as defined in your schema:

```javascript
const notes = await db.from('notes').getAll()
```

### Fetching Records

**1. Get all records from a collection:**

To retrieve all records from a collection, use the `getAll()` method.

```javascript
try {
  const allNotes = await db.from('notes').getAll();
  console.log("All notes:", allNotes);
  // allNotes will be an array of note objects
} catch (error) {
  console.error("Error fetching all notes:", error);
  // Handle the error (e.g., show a message to the user)
}
```

**2. Get a specific record by ID:**

To retrieve a single record by its unique ID, use the `get(id)` method.

```javascript
try {
  const noteId = "some-unique-note-id"; // Replace with the actual ID of the note
  const note = await db.from('notes').get(noteId);
  if (note) {
    console.log("Fetched note:", note);
  } else {
    console.log("Note not found"); // Or handle as an error, depending on your API design
  }
} catch (error) {
  console.error("Error fetching note by ID:", error);
}
```

The `TableClient` currently supports fetching all records or a single record by its ID. For more complex queries (filtering by multiple fields, sorting, pagination), you would typically implement those on top of `getAll()` on the client-side or look for backend capabilities if available.

### Inserting Records

To add a new record to a collection, use the `add(value)` method. The `value` should be an object containing the fields for the new record.

```javascript
const newNoteData = {
  title: 'My New Note',
  content: 'This is the content of the note.',
  createdAt: Date.now(),
};

try {
  const createdNote = await db.from('notes').add(newNoteData);
  console.log("Inserted note:", createdNote);
  // createdNote will be the newly created note object, likely including an auto-generated ID
} catch (error) {
  console.error("Error inserting note:", error);
}
```
The `add()` method takes an object matching the structure of your collection's fields.

### Updating & Replacing Records

**1. Update specific fields of a record (Patch):**

To update specific fields of an existing record by its ID, use the `update(id, value)` method. The `value` object should contain only the fields you want to change.

```javascript
const noteIdToUpdate = "some-existing-note-id"; // Replace with the actual ID
const fieldsToUpdate = { content: 'Updated content for the note.' };

try {
  const updatedNote = await db
    .from('notes')
    .update(noteIdToUpdate, fieldsToUpdate);
  console.log("Updated note:", updatedNote);
  // updatedNote will be the note object with the applied changes.
} catch (error) {
  console.error("Error updating note:", error);
}
```

**2. Replace an entire record (Put):**

To completely replace an existing record by its ID, use the `replace(id, value)` method. The `value` object should represent the entire new state of the record. Any fields not included in `value` might be removed.

```javascript
const noteIdToReplace = "some-existing-note-id"; // Replace with the actual ID
const replacementData = {
  title: 'Completely Replaced Note',
  content: 'This note has been fully replaced.',
  createdAt: Date.now(), // Or keep the original, depending on needs
  // Any other fields defined in your schema should be included
};

try {
  const replacedNote = await db
    .from('notes')
    .replace(noteIdToReplace, replacementData);
  console.log("Replaced note:", replacedNote);
} catch (error) {
  console.error("Error replacing note:", error);
}
```

### Deleting Records

To delete a record by its ID, use the `delete(id)` method.

```javascript
const noteIdToDelete = "some-note-id-to-delete"; // Replace with the actual ID

try {
  const deletedRecord = await db.from('notes').delete(noteIdToDelete);
  console.log("Deletion result:", deletedRecord);
  // The backend might return the deleted record or a confirmation status.
  // Adjust based on your API's response for delete operations.
} catch (error) {
  console.error("Error deleting note:", error);
}
```
