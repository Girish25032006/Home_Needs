
importScripts(
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"
);

importScripts(
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "AIzaSyA1v8C1gP7cuBr8I9CJBBeVoRzZJ8SRLgw",
  authDomain: "home-needs-9e084.firebaseapp.com",
  projectId: "home-needs-9e084",
  storageBucket: "home-needs-9e084.firebasestorage.app",
  messagingSenderId: "919293265857",
  appId: "1:919293265857:web:e927ba167d01854b111140",
  measurementId: "G-YE7FHELHC1"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("Background FCM message:", payload);

  const title =
    payload.notification?.title ||
    payload.data?.title ||
    "Home Needs";

  const options = {
    body:
      payload.notification?.body ||
      payload.data?.body ||
      "You have a new household reminder.",
    icon: "/favicon.ico",
    data: {
      url: "/"
    }
  };

  self.registration.showNotification(title, options);
});

// Open Home Needs when the notification is clicked.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification.data?.url || "/",
    self.location.origin
  ).href;

  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin)) {
          return client.focus();
        }
      }

      return clients.openWindow(targetUrl);
    })
  );
});
