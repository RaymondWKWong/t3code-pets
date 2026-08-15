# Draft upstream extension hooks

T3 Code Pets currently uses exact, version-gated structural adapters because T3 Code does not expose UI extension points. Two small host APIs would remove most source codemods:

```ts
registerSettingsPage({
  id: "pets",
  label: "Pets",
  icon: PawPrintIcon,
  route: "/settings/pets",
  component: T3PetsSettingsPage,
});

registerAppOverlay({
  id: "pets",
  component: T3PetsHost,
});
```

Registrations should be local to the web process, deterministic by ID, and rejected on duplicate IDs. Settings pages should participate in the existing route, navigation, search, and error-boundary lifecycle. Overlays should mount once inside the app shell, receive a stable viewport container, and fail independently without taking down T3.

The host should define ordering and cleanup, expose no server authority by default, and require extensions to use the same React version as T3. An optional activity signal could later replace the remaining ChatView reporter adapter.

This is a proposal draft only. No upstream issue or pull request is created by this repository.
