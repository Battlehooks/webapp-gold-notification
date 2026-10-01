// Service worker: shows the Notification service's Web Push alerts, even
// when no tab of the web app is open, and focuses/opens the app on click.
// Plain JS in public/ so it's served as-is at /sw.js (no bundling).

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Gold notification", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Gold notification", {
      body: data.body || "",
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || "" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "", self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => w.url.startsWith(self.registration.scope));
      if (open) {
        await open.focus();
        if (open.url !== target) await open.navigate(target).catch(() => {});
        return;
      }
      await self.clients.openWindow(target);
    })()
  );
});
