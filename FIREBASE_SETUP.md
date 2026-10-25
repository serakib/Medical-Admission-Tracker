# Firebase setup

## 1) Authentication

Firebase is used for account sign-in, persistent login sessions, and identity verification. In Firebase Console → Authentication → Sign-in method, enable **Email/Password**. Guest mode remains available.

## 2) Firestore is not the leaderboard database

The client no longer reads or writes the leaderboard or quiz attempts in Firestore, and it no longer creates new students/{uid} profile documents there. Firebase Authentication remains the identity provider. Existing Firestore documents from earlier versions are left untouched but are not used by the new global leaderboard.

You do not need to create Firestore for leaderboard functionality.

## 3) Global leaderboard backend

The shared leaderboard, RP, League progression, weekly resets, and friend requests use a separate Google Apps Script + Google Sheets backend. Follow GLOBAL_LEADERBOARD_SETUP.md to deploy it and configure js/leaderboard-config.js.

The backend verifies Firebase ID tokens before accepting score, profile, and friend-request writes. Keep the backing Google spreadsheet private. Do not place service-account private keys or Admin SDK credentials in this repository.

## 4) Browser cache

LocalStorage stores the last fetched leaderboard view and pending result submissions for offline recovery. It is only a cache/queue; the shared Google Sheets backend is the global source of truth.
