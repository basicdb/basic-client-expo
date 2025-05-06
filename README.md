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
import { defineSchema } from '@basictech/expo/db'; // Adjust import path if needed

export const schema = defineSchema({
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
});

// Infer the type for use with the hook
export type AppSchema = typeof schema;

```

Next, wrap your application's root component (e.g., `App.tsx`) with the `BasicProvider`. Make sure to configure your redirect URI scheme in `app.json`.

```javascript
// App.tsx (or your root component)
import React from 'react';
import { BasicProvider } from '@basictech/expo'; // Adjust import path if needed
import { schema, AppSchema } from './schema'; // Import your schema
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

```json
// app.json (or app.config.js)
{
  "expo": {
    // ... other config
    "scheme": "your-app-scheme", // Make sure this matches redirectUri in BasicProvider
    "plugins": [
      // Add other plugins...
      "expo-router" // Example, if using expo-router
    ]
    // ... other config
  }
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
  const [notes, setNotes] = useState([]);
  const [newNoteTitle, setNewNoteTitle] = useState('');

  // Fetch notes when signed in
  useEffect(() => {
    if (isSignedIn && db) {
      const fetchNotes = async () => {
        try {
          // Access the 'notes' table
          const notesTable = db.from('notes');
          const fetchedNotes = await notesTable.select();
          setNotes(fetchedNotes);
        } catch (error) {
          console.error("Failed to fetch notes:", error);
        }
      };
      fetchNotes();
    } else {
      setNotes([]); // Clear notes if not signed in
    }
  }, [isSignedIn, db]);

  const handleAddNote = async () => {
    if (!db || !newNoteTitle) return;
    try {
      const notesTable = db.from('notes');
      const newNote = await notesTable.insert({
        title: newNoteTitle,
        content: 'Default content', // Add other fields as needed
        createdAt: Date.now(),
      });
      setNotes(prev => [...prev, newNote]);
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

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[ISC](https://opensource.org/licenses/ISC) 