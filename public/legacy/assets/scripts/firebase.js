/* Firebase services for the legacy FloodGuard dashboard. */
window.FloodGuardFirebase = (() => {
  const firebaseConfig = {
    apiKey: 'AIzaSyAIQ0rvsF_jdqXS_9NHwKv90Csk8WprQgM',
    authDomain: 'floodguard-6b832.firebaseapp.com',
    projectId: 'floodguard-6b832',
    databaseURL: 'https://floodguard-6b832-default-rtdb.asia-southeast1.firebasedatabase.app',
    storageBucket: 'floodguard-6b832.firebasestorage.app',
    messagingSenderId: '639930735863',
    appId: '1:639930735863:web:02fc4294d44f8e049787f2'
  };

  const ready = Promise.all([
    import('https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js'),
    import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js')
  ]).then(([appSdk, authSdk, firestoreSdk, realtimeDbSdk]) => {
    const app = appSdk.initializeApp(firebaseConfig);
    return {
      auth: authSdk.getAuth(app),
      db: firestoreSdk.getFirestore(app),
      rtdb: realtimeDbSdk.getDatabase(app),
      ...authSdk,
      ...firestoreSdk,
      ...realtimeDbSdk
    };
  });

  return { ready };
})();
