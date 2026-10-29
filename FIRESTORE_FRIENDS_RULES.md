# Firebase Firestore rules used by the current Medical Admission Tracker

## Current implementation

- **Friend requests and accepted friendships:** handled by the Medical Apps Script API and stored in the private `StudentFriends` tab. The old `studentFriendRequests` and `studentFriendships` Firestore matches below were for an earlier implementation and are not required by the current Friends UI. Do not replace existing Firestore rules with this document.
- **In-site activity notification state:** registered, signed-in users may sync private state at `studentActivityNotificationStates/{uid}`. Guest users use browser-local storage. This state is separate from Apps Script's Telegram activity queue and does not create OS/browser push notifications.

## Notification-state rule to merge

Open **Firebase Console → Firestore Database → Rules** and merge this match inside your existing `match /databases/{database}/documents` block. Keep existing rules for `students/{uid}` and all unrelated collections.

```javascript
match /studentActivityNotificationStates/{uid} {
  allow get: if request.auth != null && request.auth.uid == uid;
  allow list: if false;

  allow create, update: if request.auth != null
    && request.auth.uid == uid
    && request.resource.data.keys().hasOnly([
      'userId', 'version', 'state', 'updatedAt'
    ])
    && request.resource.data.userId == request.auth.uid
    && request.resource.data.version == 1
    && request.resource.data.state is map
    && request.resource.data.state.keys().hasOnly([
      'notifications', 'trash', 'deletedIds', 'restoredIds', 'purgedIds',
      'lastSnapshot', 'dayKey', 'dayBaseline', 'trophyEvents', 'stateUpdatedAt'
    ]);

  // Account deletion must be able to remove its own cross-device notification state.
  allow delete: if request.auth != null && request.auth.uid == uid;
}
```

The app falls back to browser-local storage if the rules are missing or reject a request, so cross-device state sync only works after the rule is merged and deployed. Deploy Firestore rules separately from GitHub Pages and the Google Apps Script Web App.
