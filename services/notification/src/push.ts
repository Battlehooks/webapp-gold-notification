/**
 * Web Push delivery. Each message is encrypted for one browser's
 * subscription and handed to that browser's push service (FCM for Chrome,
 * Mozilla's for Firefox, WNS for Edge, Apple's for Safari), which wakes the
 * frontend's service worker (frontend/public/sw.js) to show it -- even with
 * the web app's tab closed.
 */
import webpush from "web-push";
import { config } from "./config.js";
import * as db from "./db.js";

export const pushEnabled = Boolean(config.vapidPublicKey && config.vapidPrivateKey);
if (pushEnabled) {
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
}

export interface PushMessage {
  title: string;
  body: string;
  /** Web app path to open on click, e.g. "#/asset/btc". */
  url?: string;
  /** A newer notification with the same tag replaces the older one on screen. */
  tag?: string;
  /** How long the push service keeps trying an offline browser, seconds. */
  ttlSec?: number;
}

/** Returns whether the push service accepted the message. A subscription the
 * push service says is gone (404/410 -- the user revoked permission or the
 * browser rotated it) is deleted, so it isn't retried forever. */
export async function send(device: db.Device, msg: PushMessage): Promise<boolean> {
  if (!pushEnabled) return false;
  try {
    await webpush.sendNotification(
      device.subscription,
      JSON.stringify({ title: msg.title, body: msg.body, url: msg.url ?? "", tag: msg.tag ?? "" }),
      { TTL: msg.ttlSec ?? 3600, urgency: "high" }
    );
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await db.deleteDevice(device.deviceId);
      console.log(`push subscription for device ${device.deviceId.slice(0, 8)} expired (${status}) -- removed`);
    } else {
      console.error(`push to device ${device.deviceId.slice(0, 8)} failed`, status ?? err);
    }
    return false;
  }
}

/** Send one message to every device that opted into it. */
export async function broadcast(wants: (d: db.Device) => boolean, msg: PushMessage): Promise<number> {
  if (!pushEnabled) return 0;
  let sent = 0;
  for (const device of await db.listDevices()) {
    if (wants(device) && (await send(device, msg))) sent++;
  }
  return sent;
}
