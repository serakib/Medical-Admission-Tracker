import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

// Preserve the legacy global API expected by the existing application modules.
window.firebase = firebase;
