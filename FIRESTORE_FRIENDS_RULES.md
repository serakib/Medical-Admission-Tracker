# Firestore rules for Student Friends

The website's Friends feature stores only **friend requests** and accepted friend links in two Firestore collections:

- `studentFriendRequests`
- `studentFriendships`

Registered Firebase users can send, accept, reject, cancel, and remove friend links. Guest sessions can use All Time and Weekly ranking, but must sign in to use the Friends actions.

## Important deployment note

This repository does not deploy Firebase Security Rules. Open **Firebase Console → Firestore Database → Rules** and merge the following matches into your existing rules. **Do not replace existing rules wholesale**: your private `students/{uid}` data and any other app collections may have rules that must remain intact. Test with two registered test accounts before launch.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    match /studentFriendRequests/{requestId} {
      allow get, list: if signedIn()
        && (resource.data.fromUid == request.auth.uid
          || resource.data.toUid == request.auth.uid);

      allow create: if signedIn()
        && request.resource.data.keys().hasOnly([
          'fromUid', 'toUid', 'fromName', 'fromCollege', 'fromBatch',
          'toName', 'status', 'createdAt', 'updatedAt'
        ])
        && request.resource.data.fromUid == request.auth.uid
        && request.resource.data.toUid is string
        && request.resource.data.toUid.size() > 0
        && request.resource.data.toUid.size() <= 160
        && request.resource.data.toUid != request.auth.uid
        && request.resource.data.fromName is string
        && request.resource.data.fromName.size() >= 2
        && request.resource.data.fromName.size() <= 80
        && request.resource.data.toName is string
        && request.resource.data.toName.size() <= 80
        && request.resource.data.status == 'pending';

      allow update: if signedIn()
        && resource.data.status == 'pending'
        && request.resource.data.fromUid == resource.data.fromUid
        && request.resource.data.toUid == resource.data.toUid
        && request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['status', 'updatedAt'])
        && (
          (resource.data.toUid == request.auth.uid
            && request.resource.data.status in ['accepted', 'rejected'])
          || (resource.data.fromUid == request.auth.uid
            && request.resource.data.status == 'cancelled')
        );

      allow delete: if false;
    }

    match /studentFriendships/{friendshipId} {
      allow get, list: if signedIn()
        && (resource.data.userA == request.auth.uid
          || resource.data.userB == request.auth.uid);

      allow create: if signedIn()
        && request.resource.data.status == 'accepted'
        && request.resource.data.userA is string
        && request.resource.data.userB is string
        && request.resource.data.userA < request.resource.data.userB
        && request.resource.data.requestId is string
        && (
          request.resource.data.userA == request.auth.uid
          || request.resource.data.userB == request.auth.uid
        )
        && existsAfter(
          /databases/$(database)/documents/studentFriendRequests/$(request.resource.data.requestId)
        )
        && getAfter(
          /databases/$(database)/documents/studentFriendRequests/$(request.resource.data.requestId)
        ).data.status == 'accepted'
        && getAfter(
          /databases/$(database)/documents/studentFriendRequests/$(request.resource.data.requestId)
        ).data.toUid == request.auth.uid
        && getAfter(
          /databases/$(database)/documents/studentFriendRequests/$(request.resource.data.requestId)
        ).data.fromUid == (
          request.resource.data.userA == request.auth.uid
            ? request.resource.data.userB
            : request.resource.data.userA
        );

      allow update: if false;
      allow delete: if signedIn()
        && (resource.data.userA == request.auth.uid
          || resource.data.userB == request.auth.uid);
    }
  }
}
```

## Test before enabling for everyone

1. Use two registered test accounts (A and B).
2. From A, send B a friend request. Check that B sees it in the Friends tab.
3. Accept it as B. Both accounts should see each other in Friends.
4. Test reject, cancel, and remove. Confirm that unrelated users cannot read either student's request or friendship documents.
5. Verify all existing private student profile rules still behave as expected.

If the Friends panel reports a permission error, the deployed rules do not yet allow this collection flow, or another existing rule is conflicting. The website intentionally shows a failure message rather than pretending the request succeeded.
